import type { Charger, Current, ParkingKind } from './types';
import { FAST_KW } from './chargers';
import { resolveOperator } from './operators';
import { districtOf, type District } from './districts';
import { tariffFor, timeFeeTag } from './tariffs';
import { distanceKm } from './geo';

/*
  Figures for the Stats tab, all derived from the latest LTA snapshot: this
  is a picture of right now, not a history. The assumptions behind the
  conversions (km of range, cost of a full charge, kopi) are exported so the
  UI can state them beside the numbers.
*/

/** Energy use of a typical EV, for "km of range" conversions. */
export const KWH_PER_100KM = 15;
/** Battery size for "cost of a full charge". */
export const FULL_KWH = 60;
/** A cup of kopi at a hawker centre, for the kopi index. */
export const KOPI_PRICE = 1.8;
/** Radius for the hotspot record. */
export const HOTSPOT_KM = 0.5;
/** Radius for the "near you" counts. */
export const NEAR_KM = 1;
/** A district needs this many plugs reporting a status before its busy share is ranked. */
export const MIN_REPORTING = 20;

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ─── Right now ───

export interface Live {
  plugs: number;
  free: number;
  inUse: number;
  noStatus: number;
  /** Rated kW of the plugs in use: an upper bound, since cars rarely draw a plug's full rating. */
  kwInUse: number;
  /** Rated kW of every plug. */
  kwInstalled: number;
}

export interface DistrictRow extends District {
  stations: number;
  plugs: number;
  free: number;
  inUse: number;
  /** Share of status-reporting plugs that are in use; `null` when too few report. */
  busy: number | null;
}

// ─── Records ───

export interface Records {
  biggest: Charger;
  fastest: Charger;
  /** Stations sharing the top power rating. */
  fastestTies: number;
  /** Median power of an AC plug, to compare the fastest against. */
  typicalAcKw: number | null;
  loner: { charger: Charger; km: number } | null;
  hotspot: { charger: Charger; plugs: number; stations: number };
  corners: Record<'north' | 'south' | 'east' | 'west', Charger>;
}

// ─── Costs ───

export interface PriceSpread {
  current: Current;
  /** Stations listing a paid price for this current. */
  stations: number;
  min: { price: number; charger: Charger };
  median: number;
  max: { price: number; charger: Charger };
}

export interface FeeStats {
  stations: number;
  /** A time-based fee (idle fee etc.) definitely applies here. */
  feeDefinite: number;
  /** The operator has time-based fees that may apply here. */
  feeMaybe: number;
  /** Listed as free by the operator. */
  free: number;
  hdb: number;
  /** At HDB car parks with free parking on Sundays and public holidays. */
  freeSunday: number;
}

// ─── Who's who ───

export interface ShareRow {
  key: string;
  label: string;
  /** A raw operator name, for the logo. */
  sample?: string;
  plugs: number;
  stations: number;
}

export interface CurrentSplit {
  acPlugs: number;
  dcPlugs: number;
  acKw: number;
  dcKw: number;
}

export type CarParkMixKey = ParkingKind | 'none';

export interface Stats {
  live: Live;
  districts: DistrictRow[];
  records: Records | null;
  prices: Record<Current, PriceSpread | null>;
  fees: FeeStats;
  operators: ShareRow[];
  plugTypes: ShareRow[];
  split: CurrentSplit;
  carParks: Record<CarParkMixKey, number>;
}

export function snapshotStats(chargers: Charger[]): Stats {
  return {
    live: liveStats(chargers),
    districts: districtStats(chargers),
    records: records(chargers),
    prices: { AC: priceSpread(chargers, 'AC'), DC: priceSpread(chargers, 'DC') },
    fees: feeStats(chargers),
    operators: operatorShare(chargers),
    plugTypes: plugTypeShare(chargers),
    split: currentSplit(chargers),
    carParks: carParkMix(chargers),
  };
}

export function liveStats(chargers: Charger[]): Live {
  const s: Live = { plugs: 0, free: 0, inUse: 0, noStatus: 0, kwInUse: 0, kwInstalled: 0 };
  for (const c of chargers) {
    s.plugs += c.total;
    s.free += c.available;
    s.inUse += c.occupied;
    s.noStatus += c.offline;
    for (const k of c.connectors) {
      s.kwInUse += k.kw * (k.count - k.available - k.offline);
      s.kwInstalled += k.kw * k.count;
    }
  }
  return s;
}

function districtStats(chargers: Charger[]): DistrictRow[] {
  const rows = new Map<number, DistrictRow>();
  for (const c of chargers) {
    const d = districtOf(c.postalCode);
    if (!d) continue;
    const r = rows.get(d.no) ?? { ...d, stations: 0, plugs: 0, free: 0, inUse: 0, busy: null };
    r.stations++;
    r.plugs += c.total;
    r.free += c.available;
    r.inUse += c.occupied;
    rows.set(d.no, r);
  }
  for (const r of rows.values()) {
    const reporting = r.free + r.inUse;
    r.busy = reporting >= MIN_REPORTING ? r.inUse / reporting : null;
  }
  return [...rows.values()].sort((a, b) => a.no - b.no);
}

// Over Singapore's ~50 km a flat projection is well within 0.1% of the
// great-circle distance, and much cheaper for the all-pairs pass below.
const KM_PER_DEG_LAT = 110.57;
const KM_PER_DEG_LNG = 111.32 * Math.cos((1.35 * Math.PI) / 180);

function records(chargers: Charger[]): Records | null {
  const n = chargers.length;
  if (n === 0) return null;

  // One pass over every pair: nearest neighbour (for the loner) and plugs
  // within HOTSPOT_KM (for the hotspot).
  const ys = chargers.map(c => c.lat * KM_PER_DEG_LAT);
  const xs = chargers.map(c => c.lng * KM_PER_DEG_LNG);
  const nearest = new Float64Array(n).fill(Infinity);
  const plugsNear = chargers.map(c => c.total);
  const stationsNear = new Array<number>(n).fill(1);
  const r2 = HOTSPOT_KM ** 2;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dy = ys[i] - ys[j];
      const dx = xs[i] - xs[j];
      const d2 = dx * dx + dy * dy;
      if (d2 < nearest[i]) nearest[i] = d2;
      if (d2 < nearest[j]) nearest[j] = d2;
      if (d2 <= r2) {
        plugsNear[i] += chargers[j].total;
        plugsNear[j] += chargers[i].total;
        stationsNear[i]++;
        stationsNear[j]++;
      }
    }
  }

  let loner = -1;
  let hotspot = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(nearest[i]) && (loner < 0 || nearest[i] > nearest[loner])) loner = i;
    if (plugsNear[i] > plugsNear[hotspot] ||
        (plugsNear[i] === plugsNear[hotspot] && stationsNear[i] > stationsNear[hotspot])) hotspot = i;
  }

  const biggest = chargers.reduce((a, b) => (b.total > a.total || (b.total === a.total && b.maxKw > a.maxKw) ? b : a));
  const fastest = chargers.reduce((a, b) => (b.maxKw > a.maxKw || (b.maxKw === a.maxKw && b.total > a.total) ? b : a));
  const acKws: number[] = [];
  for (const c of chargers) {
    for (const k of c.connectors) if (k.current === 'AC') for (let i = 0; i < k.count; i++) acKws.push(k.kw);
  }

  return {
    biggest,
    fastest,
    fastestTies: chargers.filter(c => c.maxKw === fastest.maxKw).length,
    typicalAcKw: median(acKws),
    loner: loner >= 0 ? { charger: chargers[loner], km: Math.sqrt(nearest[loner]) } : null,
    hotspot: { charger: chargers[hotspot], plugs: plugsNear[hotspot], stations: stationsNear[hotspot] },
    corners: {
      north: chargers.reduce((a, b) => (b.lat > a.lat ? b : a)),
      south: chargers.reduce((a, b) => (b.lat < a.lat ? b : a)),
      east:  chargers.reduce((a, b) => (b.lng > a.lng ? b : a)),
      west:  chargers.reduce((a, b) => (b.lng < a.lng ? b : a)),
    },
  };
}

/** Uses each station's cheapest listed price, like the Prices tab. */
function priceSpread(chargers: Charger[], current: Current): PriceSpread | null {
  const priced = chargers
    .map(charger => ({ charger, price: charger.minPrice[current] }))
    .filter((r): r is { charger: Charger; price: number } => r.price != null && r.price > 0)
    .sort((a, b) => a.price - b.price);
  if (priced.length === 0) return null;
  return {
    current,
    stations: priced.length,
    min: priced[0],
    median: median(priced.map(r => r.price))!,
    max: priced[priced.length - 1],
  };
}

/** The station's listed price may be stale because the operator prices live in its app. */
export function hasPriceCaveat(c: Charger): boolean {
  return Boolean(tariffFor(c.operator)?.priceCaveat);
}

function feeStats(chargers: Charger[]): FeeStats {
  const s: FeeStats = { stations: chargers.length, feeDefinite: 0, feeMaybe: 0, free: 0, hdb: 0, freeSunday: 0 };
  for (const c of chargers) {
    const tag = timeFeeTag(c);
    if (tag?.confirmed) s.feeDefinite++;
    else if (tag) s.feeMaybe++;
    if (c.minPrice.AC === 0 || c.minPrice.DC === 0) s.free++;
    if (c.carPark?.kind === 'hdb') {
      s.hdb++;
      if (c.carPark.freeSunday) s.freeSunday++;
    }
  }
  return s;
}

function operatorShare(chargers: Charger[]): ShareRow[] {
  const rows = new Map<string, ShareRow>();
  for (const c of chargers) {
    const op = resolveOperator(c.operator);
    const r = rows.get(op.key) ?? { key: op.key, label: op.label, sample: c.operator, plugs: 0, stations: 0 };
    r.plugs += c.total;
    r.stations++;
    rows.set(op.key, r);
  }
  return [...rows.values()].sort((a, b) => b.plugs - a.plugs || a.label.localeCompare(b.label));
}

function plugTypeShare(chargers: Charger[]): ShareRow[] {
  const rows = new Map<string, ShareRow>();
  for (const c of chargers) {
    for (const k of c.connectors) {
      const key = k.plugType.toLowerCase();
      const r = rows.get(key) ?? { key, label: k.plugType, plugs: 0, stations: 0 };
      r.plugs += k.count;
      rows.set(key, r);
    }
    // Count each station once per plug type it has.
    for (const key of new Set(c.connectors.map(k => k.plugType.toLowerCase()))) rows.get(key)!.stations++;
  }
  return [...rows.values()].sort((a, b) => b.plugs - a.plugs);
}

function currentSplit(chargers: Charger[]): CurrentSplit {
  const s: CurrentSplit = { acPlugs: 0, dcPlugs: 0, acKw: 0, dcKw: 0 };
  for (const c of chargers) {
    for (const k of c.connectors) {
      if (k.current === 'DC') {
        s.dcPlugs += k.count;
        s.dcKw += k.kw * k.count;
      } else {
        s.acPlugs += k.count;
        s.acKw += k.kw * k.count;
      }
    }
  }
  return s;
}

function carParkMix(chargers: Charger[]): Record<CarParkMixKey, number> {
  const mix: Record<CarParkMixKey, number> = { hdb: 0, mall: 0, ura: 0, jtc: 0, none: 0 };
  for (const c of chargers) mix[c.carPark?.kind ?? 'none']++;
  return mix;
}

// ─── Just for you ───

export interface Nearby {
  /** Distance to the closest station of any kind. */
  nearestKm: number | null;
  stations: number;
  plugs: number;
  free: number;
  nearestFast: { charger: Charger; km: number } | null;
  nearestFree: { charger: Charger; km: number } | null;
  /** The district of the nearest station, ranked by number of plugs. */
  district: { row: DistrictRow; rank: number; of: number } | null;
}

export function nearbyStats(chargers: Charger[], pos: [number, number], districts: DistrictRow[]): Nearby {
  const s: Nearby = {
    nearestKm: null, stations: 0, plugs: 0, free: 0, nearestFast: null, nearestFree: null, district: null,
  };
  let nearest: { charger: Charger; km: number } | null = null;
  for (const c of chargers) {
    const km = distanceKm(pos[0], pos[1], c.lat, c.lng);
    if (km <= NEAR_KM) {
      s.stations++;
      s.plugs += c.total;
      s.free += c.available;
    }
    if (!nearest || km < nearest.km) nearest = { charger: c, km };
    if (c.maxKw >= FAST_KW && (!s.nearestFast || km < s.nearestFast.km)) s.nearestFast = { charger: c, km };
    if (c.available > 0 && (!s.nearestFree || km < s.nearestFree.km)) s.nearestFree = { charger: c, km };
  }
  s.nearestKm = nearest?.km ?? null;
  const home = nearest ? districtOf(nearest.charger.postalCode) : null;
  if (home) {
    const ranked = [...districts].sort((a, b) => b.plugs - a.plugs);
    const i = ranked.findIndex(r => r.no === home.no);
    if (i >= 0) s.district = { row: ranked[i], rank: i + 1, of: ranked.length };
  }
  return s;
}
