'use client';

import { useEffect, useState } from 'react';
import type { Charger, StationHistory as Data } from '@/lib/types';
import { formatKw, formatPrice } from '@/lib/format';
import { DAY_SHORT, addDays, formatDay, sgDate, sgtSlot } from '@/lib/sgtime';

/*
  Station sheet → "History": how often this station was full on each of the
  last 28 days, how reliably it reports a live status, and changes to its
  listed prices. From station_days and price_changes (db/history.sql).
*/

const DAYS = 28;
/** A day needs about an hour of snapshots before it gets a bar. */
const MIN_BAR = 4;
/** …and about three hours before it can be the "busiest day". */
const MIN_BUSIEST = 12;
const MAX_PRICE_ROWS = 10;

type State = { status: 'loading' } | { status: 'off' } | { status: 'error' } | { status: 'ready'; data: Data };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const price = (p: number | null) => (p == null ? 'not listed' : p === 0 ? 'free' : formatPrice(p));

/** "Fri 23 Oct" for a YYYY-MM-DD Singapore date. */
function dayLabel(day: string): string {
  const noon = new Date(`${day}T12:00:00+08:00`);
  return `${DAY_SHORT[sgtSlot(noon).dow]} ${formatDay(noon.toISOString())}`;
}

export default function StationHistory({ charger }: { charger: Charger }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetch(`/api/history/station/${encodeURIComponent(charger.id)}`)
      .then(async r => {
        if (!alive) return;
        if (r.status === 503) return setState({ status: 'off' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setState({ status: 'ready', data: (await r.json()) as Data });
      })
      .catch(err => {
        console.error('[station history]', err);
        if (alive) setState({ status: 'error' });
      });
    return () => { alive = false; };
  }, [charger.id]);

  if (state.status === 'off') return null;

  return (
    <section className="section">
      <h3 className="section-title">History</h3>
      {state.status === 'loading' && <p className="section-note">Loading…</p>}
      {state.status === 'error' && <p className="section-note">Couldn’t load this station’s history right now.</p>}
      {state.status === 'ready' && <Body data={state.data} hover={hover} onHover={setHover} />}
    </section>
  );
}

function Body({ data, hover, onHover }: { data: Data; hover: number | null; onHover: (i: number | null) => void }) {
  const today = sgDate(new Date());
  const first = data.since ? sgDate(new Date(data.since)) : today;
  const byDay = new Map(data.days.map(d => [d[0], d]));
  // Always 28 slots ending today, so the chart keeps its shape as days fill in.
  const slots = Array.from({ length: DAYS }, (_, i) => {
    const day = addDays(today, i - (DAYS - 1));
    const d = byDay.get(day);
    return {
      day,
      collected: day >= first,
      samples: d?.[1] ?? 0,
      reporting: d?.[2] ?? 0,
      full: d?.[3] ?? 0,
    };
  });

  const samples = slots.reduce((n, s) => n + s.samples, 0);
  const reporting = slots.reduce((n, s) => n + s.reporting, 0);
  const full = slots.reduce((n, s) => n + s.full, 0);
  const daysWithData = slots.filter(s => s.samples > 0).length;
  const busiest = slots
    .filter(s => s.reporting >= MIN_BUSIEST)
    .reduce<(typeof slots)[number] | null>((b, s) => (!b || s.full / s.reporting > b.full / b.reporting ? s : b), null);

  const shown = hover != null ? slots[hover] : null;
  const since = data.since ? formatDay(data.since) : null;

  return (
    <>
      {samples === 0 ? (
        <p className="section-note">
          Collecting{since ? ` since ${since}` : ''}. Each day’s bar appears once there’s about an hour of data.
        </p>
      ) : reporting === 0 ? (
        <p className="popular-readout">This station hasn’t reported a live status since {since}, so there’s no usage history.</p>
      ) : (
        <>
          <p className="popular-readout" aria-live="polite">
            {shown ? (
              shown.reporting >= MIN_BAR
                ? <><strong>{shown.day === today ? 'Today so far' : dayLabel(shown.day)}</strong>: full {pct(shown.full / shown.reporting)} of the time</>
                : <><strong>{dayLabel(shown.day)}</strong>: {shown.collected ? 'not enough data' : 'before collecting started'}</>
            ) : (
              <>
                Full <strong>{pct(full / reporting)}</strong> of the time over the last {daysWithData === 1 ? 'day' : `${daysWithData} days`}
                {busiest && busiest.full > 0 ? <>; busiest {dayLabel(busiest.day)} ({pct(busiest.full / busiest.reporting)})</> : null}.
              </>
            )}
          </p>
          <div
            className="day-bars"
            role="img"
            aria-label={`Full ${pct(full / reporting)} of the time over the last ${daysWithData} days.`}
            onPointerLeave={() => onHover(null)}
          >
            {slots.map((s, i) => (
              <span
                key={s.day}
                className={`day-bar${!s.collected ? ' before' : s.reporting < MIN_BAR ? ' empty' : ''}${hover === i ? ' active' : ''}`}
                onPointerEnter={() => onHover(i)}
              >
                {s.reporting >= MIN_BAR && s.full > 0 && <i style={{ height: `${Math.max(3, (s.full / s.reporting) * 100)}%` }} />}
              </span>
            ))}
          </div>
          <div className="day-axis" aria-hidden>
            <span>{dayLabel(slots[0].day)}</span>
            <span>Today</span>
          </div>
          <p className="section-note">
            “Full” means every plug reporting a status was in use. It reported a live status{' '}
            {pct(reporting / samples)} of the time.
          </p>
        </>
      )}

      <h4 className="history-subtitle">Price changes</h4>
      {data.prices.length === 0 ? (
        <p className="section-note">
          None{since ? ` since ${since}` : ''}. Listed prices are checked once a day.
        </p>
      ) : (
        <ul className="price-history">
          {data.prices.slice(0, MAX_PRICE_ROWS).map((p, i) => (
            <li key={i}>
              <span className="ph-day">{formatDay(`${p[0]}T12:00:00+08:00`)}</span>
              <span className="ph-what">
                {p[1]} · {formatKw(p[3])} kW {p[2]}{p[6] > 1 ? ` · ${p[6]} plugs` : ''}
              </span>
              <span className="ph-change">{price(p[4])} → <strong>{price(p[5])}</strong></span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
