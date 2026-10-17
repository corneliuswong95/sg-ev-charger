'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { Charger } from '@/lib/types';
import { FAST_KW } from '@/lib/chargers';
import { resolveOperator } from '@/lib/operators';
import { formatDistance, formatKw, formatPrice, formatTime } from '@/lib/format';
import {
  FULL_KWH, HOTSPOT_KM, KOPI_PRICE, KWH_PER_100KM, MIN_REPORTING, NEAR_KM,
  hasPriceCaveat, nearbyStats, snapshotStats,
  type CarParkMixKey, type DistrictRow, type PriceSpread, type ShareRow,
} from '@/lib/stats';
import OperatorIcon from './OperatorIcon';
import { LocateIcon } from './Icons';

interface Props {
  chargers: Charger[];
  updatedAt: string | null;
  userPos: [number, number] | null;
  locationDenied: boolean;
  onRequestLocation: () => void;
  onOpenStation: (c: Charger) => void;
  /** Show all of one operator's stations on the map. */
  onShowOperator: (operatorKey: string) => void;
}

const SECTIONS = [
  { id: 'stats-now', label: 'Right now' },
  { id: 'stats-records', label: 'Records' },
  { id: 'stats-costs', label: 'Costs' },
  { id: 'stats-who', label: 'Who’s who' },
  { id: 'stats-you', label: 'Near you' },
];

const TOP_OPERATORS = 8;
const TOP_PLUG_TYPES = 5;
const LEAGUE_ROWS = 8;
/** Further than this from every charger, the user is probably not in Singapore. */
const OUTSIDE_KM = 30;

const CAR_PARK_LABEL: Record<CarParkMixKey, { label: string; sub?: string }> = {
  hdb:  { label: 'HDB car parks' },
  mall: { label: 'Malls, hotels and offices', sub: 'Also hospitals and attractions' },
  ura:  { label: 'URA car parks' },
  jtc:  { label: 'JTC industrial estates' },
  none: { label: 'Somewhere else', sub: 'Petrol stations, condos and car parks we couldn’t match' },
};

const CORNERS = [
  { key: 'north', label: 'Northernmost', arrow: '↑' },
  { key: 'east',  label: 'Easternmost',  arrow: '→' },
  { key: 'south', label: 'Southernmost', arrow: '↓' },
  { key: 'west',  label: 'Westernmost',  arrow: '←' },
] as const;

const int = (n: number) => n.toLocaleString('en-SG');
function pct(part: number, whole: number): string {
  if (whole <= 0) return '–';
  const p = Math.round((part / whole) * 100);
  return p === 0 && part > 0 ? '<1%' : `${p}%`;
}
const mw = (kw: number) => (kw / 1000).toFixed(kw < 10_000 ? 1 : 0);
const money = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${int(n)} ${n === 1 ? one : many}`;
const opLabel = (c: Charger) => resolveOperator(c.operator).label;

/** Minutes to add 100 km of range at a given power. */
const minutesPer100Km = (kw: number) => (KWH_PER_100KM / kw) * 60;
/** km of range bought for a given amount at a price per kWh. */
const kmFor = (dollars: number, perKwh: number) => (dollars / perKwh / KWH_PER_100KM) * 100;

function duration(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const total = Math.round(min / 5) * 5;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export default function StatsView({
  chargers, updatedAt, userPos, locationDenied, onRequestLocation, onOpenStation, onShowOperator,
}: Props) {
  const stats = useMemo(() => snapshotStats(chargers), [chargers]);
  const near = useMemo(
    () => (userPos ? nearbyStats(chargers, userPos, stats.districts) : null),
    [chargers, userPos, stats.districts],
  );
  const time = formatTime(updatedAt);

  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const { live, records: rec, prices, fees, split } = stats;
  const reporting = live.free + live.inUse;
  const plugsTotal = split.acPlugs + split.dcPlugs;
  const kwTotal = split.acKw + split.dcKw;

  return (
    <main className="stats-view" aria-label="Charging stats">
      <div className="prices-inner">
        <header className="prices-head">
          <h1>Charging stats</h1>
          <p>
            Fun facts about Singapore’s public chargers, worked out from LTA’s live feed
            {time ? ` (updated ${time})` : ''}. It’s a snapshot of right now, so the numbers move.
          </p>
        </header>

        <nav className="prices-controls" aria-label="Jump to section">
          <div className="chips">
            {SECTIONS.map(s => (
              <button key={s.id} className="chip" onClick={() => jump(s.id)}>{s.label}</button>
            ))}
          </div>
        </nav>

        {chargers.length === 0 ? (
          <div className="list-empty">
            <strong>No charger data yet</strong>
            The stats appear once LTA’s live feed has loaded.
          </div>
        ) : (
          <>
            {/* ─── Right now ─── */}
            <Section id="stats-now" title="Right now">
              <div className="cheapest-plate stats-plate">
                <span className="plate-label">Plugs in use right now</span>
                <span className="plate-price">{int(live.inUse)}</span>
                <span className="plate-stat">
                  <span className="num">{pct(live.inUse, reporting)}</span>
                  of plugs that report
                </span>
                <span className="plate-where">
                  Out of {int(live.plugs)} public plugs at {int(chargers.length)} stations.
                </span>
              </div>

              <div className="stats-card">
                <h3 className="card-title">Every plug, by status</h3>
                <StatusBar free={live.free} noStatus={live.noStatus} inUse={live.inUse} />
              </div>

              <div className="stats-tiles">
                <Tile label="Power flowing into cars" pre="up to" value={mw(live.kwInUse)} unit="MW">
                  {pct(live.kwInUse, live.kwInstalled)} of the {mw(live.kwInstalled)} MW installed. That’s every busy
                  plug at full power; cars usually draw less.
                </Tile>
                <Tile label="Ghost plugs" value={int(live.noStatus)}>
                  {pct(live.noStatus, live.plugs)} of plugs aren’t saying whether they’re free. They may work fine;
                  they just don’t report to LTA.
                </Tile>
              </div>

              <DistrictLeague rows={stats.districts} />
            </Section>

            {/* ─── Hall of fame ─── */}
            {rec && (
              <Section id="stats-records" title="Hall of fame">
                <div className="stats-tiles">
                  <Tile label="The Big One" value={int(rec.biggest.total)} unit="plugs" onClick={() => onOpenStation(rec.biggest)}>
                    <strong>{rec.biggest.name}</strong> ({opLabel(rec.biggest)}) has the most plugs of any station.
                  </Tile>
                  <Tile label="Fastest plug" value={formatKw(rec.fastest.maxKw)} unit="kW" onClick={() => onOpenStation(rec.fastest)}>
                    <strong>{rec.fastest.name}</strong>
                    {rec.fastestTies > 1 ? ` and ${rec.fastestTies - 1} more` : ''}. 100 km of range in{' '}
                    {duration(minutesPer100Km(rec.fastest.maxKw))}, if your car can take it
                    {rec.typicalAcKw != null && rec.typicalAcKw > 0
                      ? ` (a typical ${formatKw(rec.typicalAcKw)} kW AC plug needs ${duration(minutesPer100Km(rec.typicalAcKw))})`
                      : ''}.
                  </Tile>
                  {rec.loner && (
                    <Tile label="The Loner" value={formatDistance(rec.loner.km)} onClick={() => onOpenStation(rec.loner!.charger)}>
                      from <strong>{rec.loner.charger.name}</strong> to the next charger. No station is further from
                      its nearest neighbour.
                    </Tile>
                  )}
                  <Tile label="Charger hotspot" value={int(rec.hotspot.plugs)} unit="plugs" onClick={() => onOpenStation(rec.hotspot.charger)}>
                    within {HOTSPOT_KM * 1000} m of <strong>{rec.hotspot.charger.name}</strong>, across{' '}
                    {plural(rec.hotspot.stations, 'station')}. The most plugs in one walkable patch.
                  </Tile>
                </div>

                <div className="stats-card">
                  <h3 className="card-title">Four corners</h3>
                  <p className="card-sub">The chargers at the edges of the map.</p>
                  <ul className="corner-list">
                    {CORNERS.map(k => {
                      const c = rec.corners[k.key];
                      return (
                        <li key={k.key}>
                          <button className="corner-row" onClick={() => onOpenStation(c)}>
                            <span className="corner-dir" aria-hidden>{k.arrow}</span>
                            <span className="corner-label">{k.label}</span>
                            <span className="corner-name">{c.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Section>
            )}

            {/* ─── What it costs ─── */}
            <Section id="stats-costs" title="What it costs">
              <div className="stats-card">
                <h3 className="card-title">Cheapest to priciest</h3>
                <p className="card-sub">Each station’s lowest listed price per kWh, as reported to LTA.</p>
                <PriceRanges ac={prices.AC} dc={prices.DC} onOpen={onOpenStation} />
              </div>

              <div className="stats-tiles">
                {prices.AC && (
                  <Tile label="Kopi index" value={String(Math.round(kmFor(KOPI_PRICE, prices.AC.median)))} unit="km">
                    for the price of a {money(KOPI_PRICE)} kopi, at the typical AC price. At the cheapest,{' '}
                    {Math.round(kmFor(KOPI_PRICE, prices.AC.min.price))} km.
                  </Tile>
                )}
                <Tile label="Free charging" value={int(fees.free)} unit={fees.free === 1 ? 'station' : 'stations'}>
                  listed as free by the operator. Parking may still cost.
                </Tile>
                <Tile label="Overstay trap" value={pct(fees.feeDefinite, fees.stations)}>
                  of stations charge an idle fee once you’re done
                  {fees.feeMaybe > 0 ? `; at another ${pct(fees.feeMaybe, fees.stations)} one may apply` : ''}.
                </Tile>
                {fees.hdb > 0 && (
                  <Tile label="Free Sunday parking" value={int(fees.freeSunday)} unit={fees.freeSunday === 1 ? 'station' : 'stations'}>
                    in HDB car parks with free parking on Sundays and public holidays. You still pay to charge.
                  </Tile>
                )}
              </div>
            </Section>

            {/* ─── Who's who ─── */}
            <Section id="stats-who" title="Who’s who">
              <OperatorShare rows={stats.operators} total={live.plugs} onShow={onShowOperator} />
              <PlugTypes rows={stats.plugTypes} total={plugsTotal} />

              <div className="stats-card">
                <h3 className="card-title">AC vs DC</h3>
                <p className="card-sub">
                  DC fast chargers are {pct(split.dcPlugs, plugsTotal)} of plugs but {pct(split.dcKw, kwTotal)} of the power.
                </p>
                <Meter label="DC share of plugs" part={split.dcPlugs} whole={plugsTotal}
                  detail={`${int(split.dcPlugs)} of ${int(plugsTotal)} plugs`} />
                <Meter label="DC share of power" part={split.dcKw} whole={kwTotal}
                  detail={`${mw(split.dcKw)} of ${mw(kwTotal)} MW, at each plug’s rated power`} />
              </div>

              <CarParkMix mix={stats.carParks} total={chargers.length} />
            </Section>

            {/* ─── Near you ─── */}
            <Section id="stats-you" title="Near you">
              {!userPos || !near ? (
                <div className="stats-card stats-ask">
                  <p>
                    {locationDenied
                      ? 'Location is off. Allow location access in your browser to see how well served your area is.'
                      : 'Share your location to see how many chargers are around you and how your district ranks.'}
                  </p>
                  <button className="op-show" onClick={onRequestLocation}>
                    <LocateIcon size={16} /> Use my location
                  </button>
                </div>
              ) : near.nearestKm != null && near.nearestKm > OUTSIDE_KM ? (
                <div className="stats-card stats-ask">
                  <p>You seem to be outside Singapore, so there’s nothing nearby to count.</p>
                </div>
              ) : (
                <div className="stats-tiles">
                  <Tile label={`Within ${NEAR_KM} km`} value={int(near.stations)} unit={near.stations === 1 ? 'station' : 'stations'}>
                    {plural(near.plugs, 'plug')}, {int(near.free)} free right now.
                  </Tile>
                  {near.nearestFree && (
                    <Tile label="Nearest free plug" value={formatDistance(near.nearestFree.km)} onClick={() => onOpenStation(near.nearestFree!.charger)}>
                      at <strong>{near.nearestFree.charger.name}</strong>.
                    </Tile>
                  )}
                  {near.nearestFast && (
                    <Tile label={`Nearest ${FAST_KW} kW+ charger`} value={formatDistance(near.nearestFast.km)} onClick={() => onOpenStation(near.nearestFast!.charger)}>
                      at <strong>{near.nearestFast.charger.name}</strong>, up to {formatKw(near.nearestFast.charger.maxKw)} kW.
                    </Tile>
                  )}
                  {near.district && (
                    <Tile label="Your district" value={`#${near.district.rank}`} unit={`of ${near.district.of}`}>
                      for number of plugs: <strong>{near.district.row.name}</strong> (D{near.district.row.no}) has{' '}
                      {plural(near.district.row.plugs, 'plug')} at {plural(near.district.row.stations, 'station')}.
                    </Tile>
                  )}
                </div>
              )}
            </Section>

            <ul className="stats-notes">
              <li>Plug counts and status come from LTA. “No live status” means a plug isn’t reporting, not that it’s broken.</li>
              <li>Power figures use each plug’s rated maximum. Cars charge slower than that most of the time.</li>
              <li>
                Range assumes {KWH_PER_100KM} kWh per 100 km, a full charge is {FULL_KWH} kWh, and a kopi is{' '}
                {money(KOPI_PRICE)}. Your car and your kopi will vary.
              </li>
              <li>Districts are Singapore’s 28 postal districts, from the first two digits of each station’s postcode.</li>
              <li>Prices are as listed with LTA by each operator. Parking is charged separately at most car parks.</li>
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

// ─── Building blocks ───

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="stats-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="stats-h2">{title}</h2>
      {children}
    </section>
  );
}

interface TileProps {
  label: string;
  value: string;
  pre?: string;
  unit?: string;
  onClick?: () => void;
  children?: ReactNode;
}

function Tile({ label, value, pre, unit, onClick, children }: TileProps) {
  const body = (
    <>
      <span className="tile-label">{label}</span>
      <span className="tile-value">
        {pre && <small className="tile-pre">{pre}</small>}
        {value}
        {unit && <small>{unit}</small>}
      </span>
      {children && <span className="tile-note">{children}</span>}
    </>
  );
  return onClick ? (
    <button className="stats-tile" onClick={onClick}>{body}</button>
  ) : (
    <div className="stats-tile">{body}</div>
  );
}

/** Free | no status | in use: grey sits between green and red so the two never touch. */
function StatusBar({ free, noStatus, inUse }: { free: number; noStatus: number; inUse: number }) {
  const total = free + noStatus + inUse;
  const parts = [
    { key: 'available', label: 'Free', n: free },
    { key: 'offline', label: 'No live status', n: noStatus },
    { key: 'occupied', label: 'In use', n: inUse },
  ];
  return (
    <>
      <div className="stack-bar" role="img" aria-label={parts.map(p => `${p.label}: ${int(p.n)}`).join(', ')}>
        {parts.filter(p => p.n > 0).map(p => (
          <span key={p.key} className={`stack-seg ${p.key}`} style={{ flexGrow: p.n }} />
        ))}
      </div>
      <ul className="stack-legend">
        {parts.map(p => (
          <li key={p.key}>
            <span className="legend-label"><span className={`legend-key ${p.key}`} aria-hidden />{p.label}</span>
            <span className="legend-value">{int(p.n)}</span>
            <span className="legend-pct">{pct(p.n, total)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

interface BarRow {
  key: string;
  label: string;
  sub?: string;
  /** Rank number or icon, shown to the left. */
  lead?: ReactNode;
  value: number;
  display: string;
  onClick?: () => void;
}

/**
 * Single-series horizontal bars, every value labelled. `track` draws the
 * 0–100% rail, for shares whose bars are scaled to the whole rather than the largest row.
 */
function BarList({ rows, max, track = false }: { rows: BarRow[]; max: number; track?: boolean }) {
  const hasLead = rows.some(r => r.lead != null);
  return (
    <ul className={`bar-list${hasLead ? '' : ' no-lead'}${track ? ' has-track' : ''}`}>
      {rows.map(r => {
        const body = (
          <>
            {hasLead && <span className="bar-lead">{r.lead}</span>}
            <span className="bar-name">
              {r.label}
              {r.sub && <small>{r.sub}</small>}
            </span>
            <span className="bar-value">{r.display}</span>
            <span className="bar-track" aria-hidden>
              <span className="bar-fill" style={{ width: `${max > 0 ? (r.value / max) * 100 : 0}%` }} />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button className="bar-row" onClick={r.onClick}>{body}</button>
            ) : (
              <div className="bar-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Meter({ label, part, whole, detail }: { label: string; part: number; whole: number; detail: string }) {
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <span className="meter-value">{pct(part, whole)}</span>
      <span className="meter-track" aria-hidden>
        <span className="meter-fill" style={{ width: `${whole > 0 ? (part / whole) * 100 : 0}%` }} />
      </span>
      <span className="meter-detail">{detail}</span>
    </div>
  );
}

function DistrictLeague({ rows }: { rows: DistrictRow[] }) {
  const [all, setAll] = useState(false);
  const ranked = rows
    .filter(r => r.busy != null)
    .sort((a, b) => b.busy! - a.busy! || b.plugs - a.plugs);
  if (ranked.length === 0) return null;
  const busiest = ranked[0];
  const quietest = ranked[ranked.length - 1];
  const unranked = rows.length - ranked.length;
  const shown = all ? ranked : ranked.slice(0, LEAGUE_ROWS);
  return (
    <div className="stats-card">
      <h3 className="card-title">Neighbourhood league</h3>
      <p className="card-sub">
        Share of plugs in use, by postal district. {busiest.name} is the busiest
        {ranked.length > 1 ? <>; {quietest.name} is the quietest</> : null}.
      </p>
      <BarList
        track
        max={1}
        rows={shown.map((r, i) => ({
          key: String(r.no),
          lead: <span className="bar-rank">{i + 1}</span>,
          label: r.name,
          sub: `D${r.no} · ${int(r.inUse)} of ${int(r.inUse + r.free)} plugs in use`,
          value: r.busy!,
          display: pct(r.busy!, 1),
        }))}
      />
      {ranked.length > LEAGUE_ROWS && (
        <button className="card-more" onClick={() => setAll(v => !v)} aria-expanded={all}>
          {all ? 'Show top 8' : `Show all ${ranked.length} districts`}
        </button>
      )}
      {unranked > 0 && (
        <p className="card-foot">
          {plural(unranked, 'district')} with fewer than {MIN_REPORTING} plugs reporting {unranked === 1 ? 'isn’t' : 'aren’t'} ranked.
        </p>
      )}
    </div>
  );
}

function PriceRanges({ ac, dc, onOpen }: { ac: PriceSpread | null; dc: PriceSpread | null; onOpen: (c: Charger) => void }) {
  // One shared scale from $0, so AC and DC can be compared at a glance.
  const top = Math.max(ac?.max.price ?? 0, dc?.max.price ?? 0);
  const scaleMax = Math.max(0.1, Math.ceil(top * 10) / 10);
  return (
    <>
      {[{ kind: 'AC', s: ac }, { kind: 'DC', s: dc }].map(({ kind, s }) => (
        <div key={kind} className="range-row">
          <div className="range-head">
            <strong>{kind}</strong>
            {s && <span>{plural(s.stations, 'station')} with a listed price</span>}
          </div>
          {s ? (
            <>
              <div
                className="range-plot"
                role="img"
                aria-label={`${kind}: cheapest ${formatPrice(s.min.price)}, typical ${formatPrice(s.median)}, priciest ${formatPrice(s.max.price)} per kWh`}
              >
                <span
                  className="range-line"
                  style={{ left: `${(s.min.price / scaleMax) * 100}%`, width: `${((s.max.price - s.min.price) / scaleMax) * 100}%` }}
                />
                <span className="range-dot" style={{ left: `${(s.min.price / scaleMax) * 100}%` }} />
                <span className="range-dot median" style={{ left: `${(s.median / scaleMax) * 100}%` }} />
                <span className="range-dot" style={{ left: `${(s.max.price / scaleMax) * 100}%` }} />
              </div>
              <div className="range-axis" aria-hidden>
                <span>$0</span>
                <span>{money(scaleMax)}</span>
              </div>
              <dl className="range-figures">
                <div><dt>Cheapest</dt><dd>{formatPrice(s.min.price)}</dd></div>
                <div><dt>Typical</dt><dd>{formatPrice(s.median)}</dd></div>
                <div><dt>Priciest</dt><dd>{formatPrice(s.max.price)}</dd></div>
              </dl>
              <p className="range-note">
                A full {FULL_KWH} kWh charge costs {money(s.min.price * FULL_KWH)} at the cheapest and{' '}
                {money(s.max.price * FULL_KWH)} at the priciest,{' '}
                <button className="link-btn" onClick={() => onOpen(s.max.charger)}>{s.max.charger.name}</button>
                {' '}({opLabel(s.max.charger)}
                {hasPriceCaveat(s.max.charger) ? '; its app price may differ' : ''}).
              </p>
            </>
          ) : (
            <p className="range-note">No {kind} prices listed.</p>
          )}
        </div>
      ))}
    </>
  );
}

function OperatorShare({ rows, total, onShow }: { rows: ShareRow[]; total: number; onShow: (key: string) => void }) {
  if (rows.length === 0) return null;
  const top = rows.slice(0, TOP_OPERATORS);
  const rest = rows.slice(TOP_OPERATORS);
  const restPlugs = rest.reduce((n, r) => n + r.plugs, 0);
  const leader = rows[0];
  const bars: BarRow[] = top.map(r => ({
    key: r.key,
    lead: r.sample ? <OperatorIcon operator={r.sample} size={28} /> : null,
    label: r.label,
    sub: `${plural(r.plugs, 'plug')} · ${plural(r.stations, 'station')}`,
    value: r.plugs,
    display: pct(r.plugs, total),
    onClick: () => onShow(r.key),
  }));
  if (rest.length > 0) {
    bars.push({
      key: 'others',
      lead: <span className="bar-rank">+{rest.length}</span>,
      label: plural(rest.length, 'smaller operator'),
      sub: plural(restPlugs, 'plug'),
      value: restPlugs,
      display: pct(restPlugs, total),
    });
  }
  return (
    <div className="stats-card">
      <h3 className="card-title">Who owns the plugs</h3>
      <p className="card-sub">
        {leader.label} runs {pct(leader.plugs, total)} of public plugs. Tap an operator to see its stations on the map.
      </p>
      <BarList rows={bars} max={Math.max(leader.plugs, restPlugs)} />
    </div>
  );
}

function PlugTypes({ rows, total }: { rows: ShareRow[]; total: number }) {
  if (rows.length === 0) return null;
  const top = rows.slice(0, TOP_PLUG_TYPES);
  const rest = rows.slice(TOP_PLUG_TYPES);
  const restPlugs = rest.reduce((n, r) => n + r.plugs, 0);
  const chademo = rows.find(r => /chademo/i.test(r.label));
  const bars: BarRow[] = top.map(r => ({
    key: r.key,
    label: r.label,
    sub: `${plural(r.plugs, 'plug')} at ${plural(r.stations, 'station')}`,
    value: r.plugs,
    display: pct(r.plugs, total),
  }));
  if (rest.length > 0) {
    bars.push({ key: 'others', label: 'Other types', sub: plural(restPlugs, 'plug'), value: restPlugs, display: pct(restPlugs, total) });
  }
  return (
    <div className="stats-card">
      <h3 className="card-title">Plug types</h3>
      <p className="card-sub">
        {chademo
          ? `CHAdeMO’s last stand: ${plural(chademo.plugs, 'plug')} left, at ${plural(chademo.stations, 'station')}.`
          : `${rows[0].label} is the most common plug.`}
      </p>
      <BarList rows={bars} max={Math.max(rows[0].plugs, restPlugs)} />
    </div>
  );
}

function CarParkMix({ mix, total }: { mix: Record<CarParkMixKey, number>; total: number }) {
  const keys = (Object.keys(CAR_PARK_LABEL) as CarParkMixKey[]).filter(k => mix[k] > 0).sort((a, b) => mix[b] - mix[a]);
  if (keys.length === 0) return null;
  return (
    <div className="stats-card">
      <h3 className="card-title">Where they are</h3>
      <p className="card-sub">{pct(mix.hdb, total)} of stations are in HDB car parks, the heartland’s charging network.</p>
      <BarList
        max={mix[keys[0]]}
        rows={keys.map(k => ({
          key: k,
          label: CAR_PARK_LABEL[k].label,
          sub: [plural(mix[k], 'station'), CAR_PARK_LABEL[k].sub].filter(Boolean).join(' · '),
          value: mix[k],
          display: pct(mix[k], total),
        }))}
      />
    </div>
  );
}
