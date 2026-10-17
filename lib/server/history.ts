import { resolveOperator } from '@/lib/operators';
import { districtOf } from '@/lib/districts';
import { liveStats } from '@/lib/stats';
import type { EvBatch } from './lta';
import { normalizeStations } from './normalize';
import { rpc, select } from './supabase';

/*
  History collector. Turns one LTA EVCBatch snapshot into the rows described
  in db/history.sql. /api/cron/snapshot calls it every 15 minutes, triggered by
  GitHub Actions (.github/workflows/history-snapshot.yml).

  - snapshots: national, per-district and per-operator plug counts. Keyed by
    LTA's own timestamp, so recording the same LTA update twice is a no-op.
  - station_days: per station per Singapore day, how many snapshots it was in,
    had a live status, and was full.
  - stations / plugs / price_changes: a catalogue refreshed once a day. Prices
    are recorded as LTA lists them, before lib/priceCorrections.ts.
*/

type Counts = [plugs: number, free: number, inUse: number, noStatus: number];

/** [id, name, operator key, postal code, district, lat, lng] */
type CatalogueStation = [string, string, string, string, number | null, number, number];
/** [evCpId, station id, operator key, plug type, 'AC' | 'DC', kW, LTA $/kWh] */
type CataloguePlug = [string, string, string, string, string, number, number | null];

export interface SnapshotPayload {
  snapshot: {
    taken_at: string;
    stations: number;
    plugs: number;
    free: number;
    in_use: number;
    no_status: number;
    kw_in_use: number;
    districts: [number, ...Counts][];
    operators: [string, ...Counts][];
  };
  /** [station id, had a live status (0/1), every reporting plug in use (0/1)] */
  stationSamples: [string, number, number][];
  catalogue: { stations: CatalogueStation[]; plugs: CataloguePlug[] };
}

export interface RecordResult {
  takenAt: string;
  /** False when this LTA update had already been recorded. */
  recorded: boolean;
  stations: number;
  plugs: number;
  catalogue: 'updated' | 'not due';
  priceChanges?: number;
}

const FIVE_MIN = 5 * 60 * 1000;
/** Plugs per record_catalogue call, keeping each request well under 500 KB. */
const CATALOGUE_CHUNK = 3000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function add<K>(map: Map<K, Counts>, key: K, c: Counts) {
  const t = map.get(key);
  if (t) for (let i = 0; i < 4; i++) t[i] += c[i];
  else map.set(key, [...c]);
}

/** Singapore calendar date, YYYY-MM-DD. */
export function sgDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function buildPayload(batch: EvBatch, now = new Date()): SnapshotPayload {
  const stations: CatalogueStation[] = [];
  const plugs = new Map<string, CataloguePlug>();
  const chargers = normalizeStations(batch.stations, null, (c, records) => {
    const op = resolveOperator(c.operator).key;
    stations.push([c.id, c.name, op, c.postalCode, districtOf(c.postalCode)?.no ?? null, round6(c.lat), round6(c.lng)]);
    for (const p of records) {
      // LTA occasionally repeats a charge point; keep the first listing.
      if (!plugs.has(p.evCpId)) plugs.set(p.evCpId, [p.evCpId, c.id, op, p.plugType, p.current, p.kw, p.ltaPrice]);
    }
  });

  const live = liveStats(chargers);
  const districts = new Map<number, Counts>();
  const operators = new Map<string, Counts>();
  const stationSamples: [string, number, number][] = [];
  for (const c of chargers) {
    const counts: Counts = [c.total, c.available, c.occupied, c.offline];
    const district = districtOf(c.postalCode);
    if (district) add(districts, district.no, counts);
    add(operators, resolveOperator(c.operator).key, counts);
    const reporting = c.available + c.occupied > 0;
    stationSamples.push([c.id, reporting ? 1 : 0, reporting && c.available === 0 ? 1 : 0]);
  }

  // LTA's timestamp is the dedupe key; without one, fall back to the current 5-minute slot.
  const takenAt = batch.updatedAt ?? new Date(Math.floor(now.getTime() / FIVE_MIN) * FIVE_MIN).toISOString();

  return {
    snapshot: {
      taken_at: takenAt,
      stations: chargers.length,
      plugs: live.plugs,
      free: live.free,
      in_use: live.inUse,
      no_status: live.noStatus,
      kw_in_use: Math.round(live.kwInUse * 10) / 10,
      districts: [...districts].sort((a, b) => a[0] - b[0]).map(([no, c]) => [no, ...c]),
      operators: [...operators].sort((a, b) => b[1][0] - a[1][0]).map(([key, c]) => [key, ...c]),
    },
    stationSamples,
    catalogue: { stations, plugs: [...plugs.values()] },
  };
}

export async function recordSnapshot(batch: EvBatch, now = new Date()): Promise<RecordResult> {
  const p = buildPayload(batch, now);
  if (p.stationSamples.length === 0) throw new Error('LTA returned no stations; nothing recorded.');

  const recorded = await rpc<boolean>('record_snapshot', {
    snapshot: p.snapshot,
    station_samples: p.stationSamples,
  });
  const result: RecordResult = {
    takenAt: p.snapshot.taken_at,
    recorded,
    stations: p.snapshot.stations,
    plugs: p.snapshot.plugs,
    catalogue: 'not due',
  };

  // Refresh the catalogue once per Singapore day. Checking the newest station
  // row (rather than a fixed hour) means a missed run is caught up by the next.
  const day = sgDate(new Date(p.snapshot.taken_at));
  const [latest] = await select<{ last_seen: string }>('stations', 'select=last_seen&order=last_seen.desc&limit=1');
  if (!latest || latest.last_seen < day) {
    // ~12k plugs is ~1 MB of JSON, so send them in chunks. Stations go last:
    // their last_seen marks the day as done, so a failed chunk is retried.
    let changes = 0;
    for (let i = 0; i < p.catalogue.plugs.length; i += CATALOGUE_CHUNK) {
      changes += await rpc<number>('record_catalogue', {
        p_day: day,
        p_stations: [],
        p_plugs: p.catalogue.plugs.slice(i, i + CATALOGUE_CHUNK),
      });
    }
    await rpc<number>('record_catalogue', { p_day: day, p_stations: p.catalogue.stations, p_plugs: [] });
    result.priceChanges = changes;
    result.catalogue = 'updated';
  }
  return result;
}
