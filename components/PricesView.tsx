'use client';

import { useMemo, useState } from 'react';
import type { Charger, Current } from '@/lib/types';
import { availabilityShort, cheapestConnector, getStatus } from '@/lib/chargers';
import { resolveOperator } from '@/lib/operators';
import { distanceKm } from '@/lib/geo';
import { formatDistance, formatKw, formatPrice, formatTime } from '@/lib/format';
import { timeFeeTag, TARIFFS, TARIFFS_CHECKED } from '@/lib/tariffs';
import OperatorIcon from './OperatorIcon';
import { CaretIcon, LocateIcon } from './Icons';

interface Props {
  chargers: Charger[];
  updatedAt: string | null;
  userPos: [number, number] | null;
  locationDenied: boolean;
  onRequestLocation: () => void;
  onOpenStation: (c: Charger) => void;
}

type View = 'stations' | 'operators';

const PAGE = 50;
const NEAR_KM = 5;

interface Ranked {
  charger: Charger;
  price: number;
  kw: number;
  distance: number | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function PricesView({
  chargers, updatedAt, userPos, locationDenied, onRequestLocation, onOpenStation,
}: Props) {
  const [current, setCurrent] = useState<Current>('AC');
  const [view, setView] = useState<View>('stations');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const near = nearMe && userPos != null;

  const { ranked, free, unpriced, typical } = useMemo(() => {
    const ranked: Ranked[] = [];
    const free: Ranked[] = [];
    let unpriced = 0;
    for (const c of chargers) {
      if (!c.connectors.some(k => k.current === current)) continue;
      const distance = userPos ? distanceKm(userPos[0], userPos[1], c.lat, c.lng) : null;
      if (near && (distance == null || distance > NEAR_KM)) continue;
      if (availableOnly && getStatus(c) !== 'available') continue;
      const price = c.minPrice[current];
      if (price == null) {
        unpriced++;
        continue;
      }
      const row = { charger: c, price, kw: cheapestConnector(c, current)?.kw ?? c.maxKw, distance };
      if (price === 0) free.push(row);
      else ranked.push(row);
    }
    ranked.sort((a, b) =>
      a.price - b.price ||
      (b.charger.available > 0 ? 1 : 0) - (a.charger.available > 0 ? 1 : 0) ||
      b.kw - a.kw ||
      (a.distance ?? 0) - (b.distance ?? 0),
    );
    return { ranked, free, unpriced, typical: median(ranked.map(r => r.price)) };
  }, [chargers, current, availableOnly, near, userPos]);

  const operators = useMemo(() => {
    const groups = new Map<string, { key: string; sample: string; label: string; prices: number[]; stations: number }>();
    for (const c of chargers) {
      if (!c.connectors.some(k => k.current === current)) continue;
      const op = resolveOperator(c.operator);
      const g = groups.get(op.key) ?? { key: op.key, sample: c.operator, label: op.label, prices: [], stations: 0 };
      g.stations++;
      const p = c.minPrice[current];
      if (p != null && p > 0) g.prices.push(p);
      groups.set(op.key, g);
    }
    return [...groups.values()]
      .map(g => ({
        ...g,
        usual: median(g.prices),
        min: g.prices.length ? Math.min(...g.prices) : null,
        max: g.prices.length ? Math.max(...g.prices) : null,
      }))
      .sort((a, b) => (a.usual ?? 99) - (b.usual ?? 99) || b.stations - a.stations);
  }, [chargers, current]);

  function switchCurrent(c: Current) {
    setCurrent(c);
    setLimit(PAGE);
  }

  function toggleNear() {
    if (!nearMe && !userPos) onRequestLocation();
    setNearMe(v => !v);
    setLimit(PAGE);
  }

  const best = ranked[0];
  const time = formatTime(updatedAt);
  const kind = current;

  return (
    <main className="prices-view" aria-label="Charging prices">
      <div className="prices-inner">
        <header className="prices-head">
          <h1>Charging prices</h1>
          <p>
            Every public charger in Singapore, cheapest first. Prices per kWh come from LTA
            {time ? ` (updated ${time})` : ''}; idle and time-based fees come from each operator’s published terms.
          </p>
        </header>

        <div className="prices-controls">
          <div className="segmented" role="group" aria-label="Charger type">
            <button aria-pressed={current === 'AC'} onClick={() => switchCurrent('AC')}>AC</button>
            <button aria-pressed={current === 'DC'} onClick={() => switchCurrent('DC')}>DC</button>
          </div>
          <div className="segmented segmented-sm" role="group" aria-label="Compare by">
            <button aria-pressed={view === 'stations'} onClick={() => setView('stations')}>By station</button>
            <button aria-pressed={view === 'operators'} onClick={() => setView('operators')}>By operator</button>
          </div>
          {view === 'stations' && (
            <div className="chips chips-wrap">
              <button className="chip" aria-pressed={availableOnly} onClick={() => { setAvailableOnly(v => !v); setLimit(PAGE); }}>
                <span className="chip-dot" />
                Available now
              </button>
              <button className="chip" aria-pressed={nearMe} onClick={toggleNear}>
                <LocateIcon size={14} />
                Within {NEAR_KM} km
              </button>
            </div>
          )}
        </div>

        {view === 'stations' ? (
          <>
            {best ? (
              <button className="cheapest-plate" onClick={() => onOpenStation(best.charger)}>
                <span className="plate-label">
                  Cheapest {kind} {near ? `within ${NEAR_KM} km` : 'in Singapore'}
                  {availableOnly ? ', available now' : ''}
                </span>
                <span className="plate-price">
                  {formatPrice(best.price)}
                  <small>/kWh</small>
                </span>
                {typical != null && (
                  <span className="plate-stat">
                    <span className="num">{formatPrice(typical)}</span>
                    typical {kind}
                  </span>
                )}
                <span className="plate-where">
                  <strong>{best.charger.name}</strong>
                  {resolveOperator(best.charger.operator).label}, {formatKw(best.kw)} kW
                  {best.distance != null ? `, ${formatDistance(best.distance)} away` : ''}
                </span>
              </button>
            ) : null}

            {nearMe && !userPos && (
              <p className="prices-footnote">
                {locationDenied
                  ? 'Location is off, so all of Singapore is shown. Allow location access in your browser to filter by distance.'
                  : 'Finding your location…'}
              </p>
            )}

            {free.length > 0 && (
              <>
                <h2 className="prices-footnote" style={{ fontWeight: 700, color: 'var(--ink)' }}>
                  Listed as free by the operator
                </h2>
                <div className="price-card" style={{ marginBottom: 16 }}>
                  {free.map(r => (
                    <PriceRow key={r.charger.id} row={r} rank={null} onOpen={onOpenStation} />
                  ))}
                </div>
              </>
            )}

            {ranked.length > 0 ? (
              <div className="price-card">
                {ranked.slice(0, limit).map((r, i) => (
                  <PriceRow key={r.charger.id} row={r} rank={i + 1} onOpen={onOpenStation} />
                ))}
              </div>
            ) : (
              <div className="list-empty">
                <strong>No priced {kind} chargers match</strong>
                {near ? `Try turning off “Within ${NEAR_KM} km”.` : 'Try turning off a filter.'}
              </div>
            )}
            {ranked.length > limit && (
              <button className="show-more" onClick={() => setLimit(l => l + PAGE)}>
                Show more ({(ranked.length - limit).toLocaleString()} left)
              </button>
            )}

            <p className="prices-footnote">
              {unpriced > 0 && `${unpriced} ${kind} station${unpriced === 1 ? ' doesn’t' : 's don’t'} list a price and ${unpriced === 1 ? 'isn’t' : 'aren’t'} ranked. `}
              Ties are ordered by free connectors, then power. Parking is charged separately at most car parks.
            </p>
          </>
        ) : (
          <OperatorTable rows={operators} kind={kind} />
        )}
      </div>
    </main>
  );
}

function PriceRow({ row, rank, onOpen }: { row: Ranked; rank: number | null; onOpen: (c: Charger) => void }) {
  const c = row.charger;
  const status = getStatus(c);
  const feeTag = timeFeeTag(c);
  return (
    <button className="price-row" onClick={() => onOpen(c)}>
      <span className="rank" aria-label={rank ? `Rank ${rank}` : undefined}>{rank ?? ''}</span>
      <span className="row-body">
        <span className="row-name" style={{ display: 'block' }}>{c.name}</span>
        <span className="row-op">
          <OperatorIcon operator={c.operator} size={18} />
          {resolveOperator(c.operator).label}
        </span>
        <span className="row-meta">
          <span className={`status-pill ${status}`}>{availabilityShort(c)}</span>
          <span><span className="num">{formatKw(row.kw)}</span> kW</span>
          {row.distance != null && <span className="num">{formatDistance(row.distance)}</span>}
          {feeTag && <span className={`fee-tag${feeTag.confirmed ? '' : ' muted'}`}>{feeTag.text}</span>}
        </span>
      </span>
      <span className="price-cell">
        {row.price === 0 ? (
          <span className="price-big">Free</span>
        ) : (
          <>
            <span className="price-big">{formatPrice(row.price)}</span>
            <span className="price-unit">per kWh</span>
          </>
        )}
      </span>
    </button>
  );
}

interface OpRow {
  key: string;
  sample: string;
  label: string;
  stations: number;
  usual: number | null;
  min: number | null;
  max: number | null;
}

function OperatorTable({ rows, kind }: { rows: OpRow[]; kind: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="price-card">
        <div className="op-col-head" aria-hidden>
          <span />
          <span>Operator</span>
          <span>Median {kind}</span>
          <span />
        </div>
        {rows.map(r => {
          const t = TARIFFS[r.key];
          const timeFees = t?.fees.filter(f => f.timeBased) ?? [];
          const isOpen = open === r.key;
          return (
            <div key={r.key} className={`op-row${isOpen ? ' open' : ''}`}>
              <button
                className="op-summary"
                onClick={() => setOpen(isOpen ? null : r.key)}
                aria-expanded={isOpen}
              >
                <OperatorIcon operator={r.sample} size={36} />
                <span>
                  <span className="op-name" style={{ display: 'block' }}>{r.label}</span>
                  <span className="op-count">
                    {r.stations} station{r.stations === 1 ? '' : 's'}
                    {t?.tag && <span className="fee-tag">{t.tag}</span>}
                    {!t?.tag && timeFees.length > 0 && <span className="fee-tag">Time-based fees</span>}
                  </span>
                </span>
                <span className="op-price">
                  {r.usual != null ? (
                    <>
                      <span className="price-big">{formatPrice(r.usual)}</span>
                      <span className="price-unit">
                        {r.min != null && r.max != null && r.min !== r.max
                          ? `${formatPrice(r.min)}–${formatPrice(r.max)}`
                          : 'per kWh'}
                      </span>
                    </>
                  ) : (
                    <span className="price-missing">Not listed</span>
                  )}
                </span>
                <span className="op-chevron"><CaretIcon size={16} /></span>
              </button>
              {isOpen && (
                <div className="op-details">
                  <table className="rate-table">
                    <tbody>
                      <tr>
                        <th scope="row">Median {kind} price per kWh</th>
                        <td>{r.usual != null ? formatPrice(r.usual) : '—'}</td>
                      </tr>
                      <tr>
                        <th scope="row">Range across stations</th>
                        <td>
                          {r.min != null && r.max != null
                            ? r.min === r.max ? formatPrice(r.min) : `${formatPrice(r.min)} to ${formatPrice(r.max)}`
                            : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {t && t.fees.length > 0 ? (
                    t.fees.map(f => (
                      <div key={f.title} className={`fee-box${f.timeBased ? '' : ' plain'}`}>
                        <ul className="fee-list">
                          <li><strong>{f.title}</strong>{f.detail}</li>
                        </ul>
                      </div>
                    ))
                  ) : (
                    <div className="fee-box plain">
                      No idle or time-based fees published. Check the operator’s app before leaving your car.
                    </div>
                  )}
                  {t?.notes?.map(n => <p key={n} className="section-note">{n}</p>)}
                  {t && (
                    <p className="section-note">
                      Checked {TARIFFS_CHECKED}.{' '}
                      {t.sources.map((s, i) => (
                        <span key={s.url}>
                          {i > 0 && ', '}
                          <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="prices-footnote">
        Median is the middle per-kWh {kind} price across an operator’s stations, with the cheapest and most expensive below it. All stations are included here, whatever their availability.
        Idle fees are charged per minute after charging finishes, so move your car once you’re done.
      </p>
    </>
  );
}
