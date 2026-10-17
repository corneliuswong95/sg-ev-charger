'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { HistoryTrends } from '@/lib/types';
import { formatTime } from '@/lib/format';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER, formatDay, formatWhen, hourLabel, sgtSlot } from '@/lib/sgtime';

/*
  Stats tab → Trends, from the history collector (docs/history-stats.md).
  Every chart fills in as snapshots arrive; anything that needs more data says
  when it will be ready instead of showing a misleading number.
*/

interface Props {
  /** All of Singapore, fetched by StatsView. */
  national: HistoryTrends;
  /** Districts that have chargers, for the scope menu. */
  districts: { no: number; name: string }[];
}

/** Break the line where snapshots are missing for longer than this. */
const GAP_MS = 45 * 60 * 1000;

const LICENCE_URL = 'https://datamall.lta.gov.sg/content/datamall/en/SingaporeOpenDataLicence.html';

const int = (n: number) => n.toLocaleString('en-SG');
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** "14% busier than a usual Saturday at 10pm", or null until there's enough history. */
export function busierThanUsual(t: HistoryTrends, liveShare: number | null): string | null {
  if (liveShare == null || t.latest == null || t.usualNow.share == null || t.usualNow.days < 3 || t.usualNow.share <= 0) {
    return null;
  }
  const { dow, hour } = sgtSlot(new Date(t.latest));
  const when = `a usual ${DAY_LONG[dow]} at ${hourLabel(hour)}`;
  const diff = liveShare / t.usualNow.share - 1;
  if (Math.abs(diff) < 0.05) return `About as busy as ${when}`;
  return `${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? 'busier' : 'quieter'} than ${when}`;
}

export default function TrendsSection({ national, districts }: Props) {
  const [scope, setScope] = useState<number | null>(null);
  const [scoped, setScoped] = useState<HistoryTrends | null>(null);
  const [loadingScope, setLoadingScope] = useState(false);

  useEffect(() => {
    if (scope == null) return;
    let alive = true;
    setLoadingScope(true);
    fetch(`/api/history/trends?district=${scope}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: HistoryTrends) => alive && setScoped(body))
      .catch(err => console.error('[trends] district failed:', err))
      .finally(() => alive && setLoadingScope(false));
    return () => { alive = false; };
  }, [scope]);

  // Hold the previous chart (dimmed) while a new district loads.
  const data = scope == null ? national : scoped ?? national;
  const scopeName = scope == null ? 'Singapore' : districts.find(d => d.no === scope)?.name ?? `District ${scope}`;

  return (
    <>
      <p className="trends-intro">
        {national.since
          ? <>Collecting since {formatDay(national.since)}: {national.days === 1 ? '1 day' : `${national.days} days`} of data so far. The charts fill in as a snapshot arrives every 15 minutes.</>
          : 'Collecting has just started. The charts fill in as a snapshot arrives every 15 minutes.'}
      </p>

      <div className="trends-scope">
        <label htmlFor="trends-scope">Showing</label>
        <select
          id="trends-scope"
          value={scope ?? ''}
          onChange={e => setScope(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">All of Singapore</option>
          {districts.map(d => (
            <option key={d.no} value={d.no}>D{d.no} {d.name}</option>
          ))}
        </select>
      </div>

      <div className={`trends-body${loadingScope ? ' is-loading' : ''}`} aria-busy={loadingScope}>
        <div className="stats-card">
          <h3 className="card-title">Plugs in use, last 24 hours</h3>
          <p className="card-sub">{scopeName}, every 15 minutes.</p>
          <LineChart points={data.last24h} />
        </div>

        <div className="stats-card">
          <h3 className="card-title">Busiest times</h3>
          <Heatmap cells={data.cells} />
        </div>

        <div className="stats-tiles">
          <RecordTile t={data} />
          <NightTile t={data} />
          <SundayTile t={data} />
        </div>
      </div>

      <p className="trends-credit">
        Contains information from LTA DataMall accessed since {national.since ? formatDay(national.since) : 'Oct 2026'}, made
        available under the terms of the{' '}
        <a href={LICENCE_URL} target="_blank" rel="noreferrer">Singapore Open Data Licence version 1.0</a>.
        Shares are of plugs reporting a live status.
      </p>
    </>
  );
}

// ─── Line chart ───

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function niceMax(v: number): number {
  if (v <= 0) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : String(n));

function LineChart({ points }: { points: [string, number, number][] }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 168;
  const pad = { top: 12, right: 14, bottom: 22, left: 34 };

  const parsed = useMemo(() => points.map(([t, inUse]) => ({ t: Date.parse(t), inUse })), [points]);
  // Keep the measured wrapper mounted in every state, so the width is known when data arrives.
  if (parsed.length < 2) {
    return (
      <div className="line-chart" ref={wrapRef}>
        <p className="chart-empty">The line starts once a couple of snapshots are in. Check back in half an hour.</p>
      </div>
    );
  }

  const end = parsed[parsed.length - 1].t;
  const start = end - 24 * 60 * 60 * 1000;
  const yMax = niceMax(Math.max(...parsed.map(p => p.inUse)));
  const w = Math.max(width, 200);
  const x = (t: number) => pad.left + ((t - start) / (end - start)) * (w - pad.left - pad.right);
  const y = (v: number) => pad.top + (1 - v / yMax) * (H - pad.top - pad.bottom);

  // Split into runs so gaps in collection show as gaps.
  const runs: { t: number; inUse: number }[][] = [];
  for (const p of parsed) {
    const run = runs[runs.length - 1];
    if (run && p.t - run[run.length - 1].t <= GAP_MS) run.push(p);
    else runs.push([p]);
  }
  const path = (run: typeof parsed) => run.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.inUse).toFixed(1)}`).join('');
  const area = (run: typeof parsed) =>
    `${path(run)}L${x(run[run.length - 1].t).toFixed(1)},${y(0)}L${x(run[0].t).toFixed(1)},${y(0)}Z`;

  // Clock labels every 6 hours, Singapore time.
  const ticks: number[] = [];
  const firstHour = Math.ceil(start / 3_600_000) * 3_600_000;
  for (let t = firstHour; t <= end; t += 3_600_000) {
    if (sgtSlot(new Date(t)).hour % 6 === 0) ticks.push(t);
  }

  const last = parsed[parsed.length - 1];
  const peak = parsed.reduce((a, b) => (b.inUse > a.inUse ? b : a));
  const shown = hover != null ? parsed[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < parsed.length; i++) {
      if (Math.abs(x(parsed[i].t) - px) < Math.abs(x(parsed[best].t) - px)) best = i;
    }
    setHover(best);
  }

  return (
    <div className="line-chart" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Plugs in use over the last 24 hours: ${int(last.inUse)} now, peak ${int(peak.inUse)} at ${formatTime(new Date(peak.t).toISOString())}.`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {[0, yMax / 2, yMax].map(v => (
            <g key={v}>
              <line className="chart-grid" x1={pad.left} x2={w - pad.right} y1={y(v)} y2={y(v)} />
              <text className="chart-tick" x={pad.left - 6} y={y(v) + 4} textAnchor="end">{compact(v)}</text>
            </g>
          ))}
          {ticks.map(t => (
            <text key={t} className="chart-tick" x={x(t)} y={H - 6} textAnchor="middle">
              {hourLabel(sgtSlot(new Date(t)).hour)}
            </text>
          ))}
          {runs.map((run, i) => run.length > 1 && <path key={`a${i}`} className="chart-area" d={area(run)} />)}
          {runs.map((run, i) => run.length > 1 && <path key={`l${i}`} className="chart-line" d={path(run)} />)}
          <circle className="chart-dot" cx={x(last.t)} cy={y(last.inUse)} r={4} />
          {shown && (
            <>
              <line className="chart-cross" x1={x(shown.t)} x2={x(shown.t)} y1={pad.top} y2={y(0)} />
              <circle className="chart-dot" cx={x(shown.t)} cy={y(shown.inUse)} r={4} />
            </>
          )}
        </svg>
      )}
      <div className="chart-readout" aria-live="polite">
        {shown ? (
          <><strong>{int(shown.inUse)}</strong> in use at {formatTime(new Date(shown.t).toISOString())}</>
        ) : (
          <><strong>{int(last.inUse)}</strong> in use now · peak <strong>{int(peak.inUse)}</strong> at {formatTime(new Date(peak.t).toISOString())}</>
        )}
      </div>
    </div>
  );
}

// ─── Heatmap ───

function Heatmap({ cells }: { cells: HistoryTrends['cells'] }) {
  const [hover, setHover] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(cells.map(c => [`${c[0]}-${c[1]}`, c])), [cells]);
  const maxShare = Math.max(0.01, ...cells.map(c => c[2]));
  const ranked = [...cells].sort((a, b) => b[2] - a[2]);
  const busiest = ranked[0];
  const quietest = ranked[ranked.length - 1];
  const filled = cells.length;

  const label = (c: HistoryTrends['cells'][number]) => `${DAY_SHORT[c[0]]} ${hourLabel(c[1])}`;
  const hovered = hover ? byKey.get(hover) : null;
  const [hDow, hHour] = hover?.split('-').map(Number) ?? [];

  return (
    <>
      <p className="card-sub">
        Share of plugs in use for each day and hour, averaged over every week so far.
        {filled < 168 ? ` ${168 - filled} of 168 hours still to collect.` : ''}
      </p>
      <div
        className="heatmap"
        role="img"
        aria-label={busiest ? `Busiest so far ${label(busiest)} at ${pct(busiest[2])}; quietest ${label(quietest)} at ${pct(quietest[2])}.` : 'No data yet.'}
        onPointerLeave={() => setHover(null)}
      >
        {WEEK_ORDER.map(dow => (
          <div className="heatmap-row" key={dow}>
            <span className="heatmap-day">{DAY_SHORT[dow]}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const c = byKey.get(`${dow}-${hour}`);
              const k = `${dow}-${hour}`;
              return (
                <span
                  key={hour}
                  className={`heatmap-cell${c ? '' : ' empty'}${hover === k ? ' active' : ''}`}
                  style={c ? { background: `color-mix(in oklab, var(--sign) ${Math.round(12 + 88 * (c[2] / maxShare))}%, var(--sign-soft))` } : undefined}
                  onPointerEnter={() => setHover(k)}
                />
              );
            })}
          </div>
        ))}
        <div className="heatmap-row heatmap-hours" aria-hidden>
          <span className="heatmap-day" />
          {[0, 6, 12, 18].map(h => (
            <span key={h} style={{ gridColumn: `${h + 2} / span 6` }}>{hourLabel(h)}</span>
          ))}
        </div>
      </div>
      <div className="heatmap-legend" aria-hidden>
        <span>Quieter</span>
        <span className="heatmap-scale" />
        <span>Busier</span>
        <span className="heatmap-cell empty" />
        <span>Not collected yet</span>
      </div>
      <p className="chart-readout" aria-live="polite">
        {hover != null ? (
          hovered
            ? <><strong>{pct(hovered[2])}</strong> in use, {DAY_SHORT[hovered[0]]} {hourLabel(hovered[1])} ({hovered[4] === 1 ? '1 day' : `${hovered[4]} days`} so far)</>
            : <>{DAY_SHORT[hDow]} {hourLabel(hHour)}: not collected yet</>
        ) : busiest ? (
          <>Busiest so far <strong>{label(busiest)}</strong> ({pct(busiest[2])}). Quietest <strong>{label(quietest)}</strong> ({pct(quietest[2])}).</>
        ) : (
          'No hours collected yet.'
        )}
      </p>
    </>
  );
}

// ─── Tiles ───

function RecordTile({ t }: { t: HistoryTrends }) {
  if (!t.record) return null;
  return (
    <div className="stats-tile">
      <span className="tile-label">Busiest moment so far</span>
      <span className="tile-value">{int(t.record.inUse)}<small>in use</small></span>
      <span className="tile-note">
        {formatWhen(t.record.t)}
        {t.record.reporting > 0 ? `, ${pct(t.record.inUse / t.record.reporting)} of plugs reporting.` : '.'}
      </span>
    </div>
  );
}

function NightTile({ t }: { t: HistoryTrends }) {
  const ready = t.days >= 2 && t.night.all != null && t.night.all > 0;
  return (
    <div className="stats-tile">
      <span className="tile-label">Night owls</span>
      <span className="tile-value">{ready ? pct((t.night.night ?? 0) / t.night.all!) : '–'}</span>
      <span className="tile-note">
        {ready ? 'of charging happens overnight, 10.30pm to 7am.' : 'Ready after the first full day of data.'}
      </span>
    </div>
  );
}

function SundayTile({ t }: { t: HistoryTrends }) {
  const r = t.restVsWork;
  const ready = r.rest != null && r.work != null && r.work > 0 && r.restDays >= 1 && r.workDays >= 2;
  const diff = ready ? r.rest! / r.work! - 1 : 0;
  return (
    <div className="stats-tile">
      <span className="tile-label">Sundays</span>
      <span className="tile-value">
        {ready ? `${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff) * 100)}%` : '–'}
      </span>
      <span className="tile-note">
        {ready
          ? `${diff >= 0 ? 'busier' : 'quieter'} than a weekday, counting public holidays as Sundays (${r.restDays} vs ${r.workDays} days so far).`
          : 'Ready after the first Sunday and two weekdays of data.'}
      </span>
    </div>
  );
}
