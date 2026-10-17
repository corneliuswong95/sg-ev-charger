'use client';

import { useEffect, useState } from 'react';
import type { Charger, PopularTimes as Data } from '@/lib/types';
import { siteKey } from '@/lib/chargers';
import { DAY_SHORT, WEEK_ORDER, formatDay, hourLabel, sgtSlot } from '@/lib/sgtime';

/*
  Station sheet → "Popular times": how busy this site usually is at each hour,
  from the history collector's per-site totals (site_hours). Starts as a
  typical day (all days combined); a weekday picker appears once each weekday
  has enough snapshots.
*/

/** Snapshots an hour needs before it gets a bar: one day's worth (every 15 minutes). */
const MIN_HOUR = 4;
/** A weekday gets its own view once most of its hours have about two weeks of snapshots. */
const MIN_WEEKDAY_HOUR = 8;
const MIN_WEEKDAY_HOURS = 18;

type State = { status: 'loading' } | { status: 'off' } | { status: 'error' } | { status: 'ready'; data: Data };

interface Hour {
  share: number | null;
  samples: number;
}

function hoursFor(d: Data, day: number | 'all'): Hour[] {
  return Array.from({ length: 24 }, (_, h) => {
    let inUse = 0, plugs = 0, samples = 0;
    for (const dow of day === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [day]) {
      const i = dow * 24 + h;
      inUse += d.inUse[i];
      plugs += d.plugs[i];
      samples += d.reporting[i];
    }
    return { share: samples >= MIN_HOUR && plugs > 0 ? inUse / plugs : null, samples };
  });
}

function weekdayReady(d: Data, dow: number): boolean {
  let ok = 0;
  for (let h = 0; h < 24; h++) if (d.reporting[dow * 24 + h] >= MIN_WEEKDAY_HOUR) ok++;
  return ok >= MIN_WEEKDAY_HOURS;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function PopularTimes({ charger }: { charger: Charger }) {
  const key = siteKey(charger);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [day, setDay] = useState<number | 'all'>('all');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    setDay('all');
    fetch(`/api/history/site/${encodeURIComponent(key)}`)
      .then(async r => {
        if (!alive) return;
        if (r.status === 503) return setState({ status: 'off' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setState({ status: 'ready', data: (await r.json()) as Data });
      })
      .catch(err => {
        console.error('[popular times]', err);
        if (alive) setState({ status: 'error' });
      });
    return () => { alive = false; };
  }, [key]);

  // History not set up on this deployment: leave the section out entirely.
  if (state.status === 'off') return null;

  return (
    <section className="section">
      <h3 className="section-title">Popular times</h3>
      {state.status === 'loading' && <p className="section-note">Loading…</p>}
      {state.status === 'error' && <p className="section-note">Couldn’t load popular times right now.</p>}
      {state.status === 'ready' && (
        <Chart data={state.data} charger={charger} day={day} onDay={setDay} hover={hover} onHover={setHover} />
      )}
    </section>
  );
}

function Chart({
  data, charger, day, onDay, hover, onHover,
}: {
  data: Data;
  charger: Charger;
  day: number | 'all';
  onDay: (d: number | 'all') => void;
  hover: number | null;
  onHover: (h: number | null) => void;
}) {
  const since = data.since ? formatDay(data.since) : null;
  const total = data.reporting.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <p className="section-note">
        {charger.offline === charger.total && charger.total > 0
          ? 'This site doesn’t report a live status, so there are no popular times for it.'
          : `Collecting since ${since ?? 'today'}. Popular times appear here after about a day of data.`}
      </p>
    );
  }

  const now = sgtSlot(new Date());
  const hours = hoursFor(data, day);
  const weekdays = WEEK_ORDER.filter(d => weekdayReady(data, d));
  const showsToday = day === 'all' || day === now.dow;
  const busiest = hours.reduce<number | null>((best, h, i) =>
    h.share != null && (best == null || h.share > (hours[best].share ?? -1)) ? i : best, null);
  const reporting = charger.available + charger.occupied;
  const liveShare = reporting > 0 ? charger.occupied / reporting : null;
  const usualNow = hours[now.hour].share;
  const days = data.since ? Math.max(1, Math.ceil((Date.now() - Date.parse(data.since)) / 86_400_000)) : 1;

  const readout = (() => {
    if (hover != null) {
      const h = hours[hover];
      return h.share != null
        ? <><strong>{hourLabel(hover)}</strong>: usually {pct(h.share)} of plugs in use ({h.samples} snapshots)</>
        : <><strong>{hourLabel(hover)}</strong>: not enough data yet</>;
    }
    if (showsToday && liveShare != null && usualNow != null) {
      return <>Now <strong>{pct(liveShare)}</strong> in use; usually <strong>{pct(usualNow)}</strong> at this hour.</>;
    }
    if (busiest != null) {
      return <>Usually busiest around <strong>{hourLabel(busiest)}</strong> ({pct(hours[busiest].share!)} in use).</>;
    }
    return 'Not enough data for any hour yet.';
  })();

  return (
    <>
      {weekdays.length > 0 && (
        <div className="chips popular-days" role="group" aria-label="Day">
          <button className="chip" aria-pressed={day === 'all'} onClick={() => onDay('all')}>Typical day</button>
          {weekdays.map(d => (
            <button key={d} className="chip" aria-pressed={day === d} onClick={() => onDay(d)}>{DAY_SHORT[d]}</button>
          ))}
        </div>
      )}
      <div
        className="popular-chart"
        role="img"
        aria-label={busiest != null ? `Usually busiest around ${hourLabel(busiest)}, ${pct(hours[busiest].share!)} of plugs in use.` : 'Not enough data yet.'}
        onPointerLeave={() => onHover(null)}
      >
        {hours.map((h, i) => (
          <span
            key={i}
            className={`popular-bar${h.share == null ? ' empty' : ''}${showsToday && i === now.hour ? ' now' : ''}${hover === i ? ' active' : ''}`}
            onPointerEnter={() => onHover(i)}
          >
            {h.share != null && <i style={{ height: `${Math.max(2, h.share * 100)}%` }} />}
          </span>
        ))}
      </div>
      <div className="popular-hours" aria-hidden>
        {[0, 6, 12, 18].map(h => <span key={h}>{hourLabel(h)}</span>)}
      </div>
      <p className="popular-readout" aria-live="polite">{readout}</p>
      <p className="section-note">
        Share of this site’s plugs in use, from LTA’s live status every 15 minutes
        {since ? ` since ${since}` : ''} (about {days === 1 ? '1 day' : `${days} days`} of data).
        {weekdays.length < 7 && ' Each weekday gets its own view after about two weeks.'}
      </p>
    </>
  );
}
