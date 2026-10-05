import type { Charger, Connector, Current, HdbCarPark } from '@/lib/types';
import { formatAddress, titleCase } from '@/lib/format';
import type { RawChargingPoint, RawPlug, RawStation } from './lta';

type CarParkMatcher = (lat: number, lng: number, address: string, name: string) => HdbCarPark | null;

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * LTA reports `priceType: "kWh"` with a price, `"free"`, or empty strings when
 * the operator didn't submit one. A "0.0000" price with type kWh is treated
 * as missing rather than free — only an explicit "free" counts as free.
 */
function parsePrice(p: RawPlug): { price: number | null; free: boolean } {
  const type = (p.priceType ?? '').trim().toLowerCase();
  if (type === 'free') return { price: 0, free: true };
  const n = toNumber(p.price);
  if (n == null || n <= 0) return { price: null, free: false };
  return { price: n, free: false };
}

interface Counts { count: number; available: number; occupied: number; offline: number }

/**
 * Status lives on each connector (`evIds[].status`): "1" free, "0" in use,
 * "" no live status. If a plug has no evIds, fall back to the charging point
 * status ("1"/"0"; "100" means not reporting).
 */
function countConnectors(plug: RawPlug, cp: RawChargingPoint): Counts {
  const evIds = plug.evIds ?? [];
  const statuses = evIds.length > 0 ? evIds.map(e => String(e.status ?? '')) : [String(cp.status ?? '')];
  const c: Counts = { count: statuses.length, available: 0, occupied: 0, offline: 0 };
  for (const s of statuses) {
    if (s === '1') c.available++;
    else if (s === '0') c.occupied++;
    else c.offline++;
  }
  return c;
}

const GENERIC_NAME = /^(multi[- ]?storey car ?park|car ?park|mscp|basement car ?park)?$/i;

function displayName(rawName: string, rawAddress: string, hdb: HdbCarPark | null): string {
  const name = rawName.trim();
  if (!GENERIC_NAME.test(name)) return titleCase(name);
  const street = rawAddress.replace(/\s*SINGAPORE\s+\d{6}\s*$/i, '').trim();
  if (street) return titleCase(hdb ? `BLK ${street} car park` : street);
  if (hdb) return titleCase(hdb.address);
  return 'EV charger';
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * LTA's name for a station drifts between snapshots (it seems to take any one
 * charge point's name). Pick the most common charge point name, ties broken
 * alphabetically, so the label is stable across refreshes.
 */
function stableName(s: RawStation, cps: RawChargingPoint[]): string {
  const counts = new Map<string, number>();
  for (const cp of cps) {
    const n = (cp.name ?? '').trim();
    if (n && !GENERIC_NAME.test(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return best?.[0] ?? s.name ?? '';
}

export function normalizeStations(stations: RawStation[], matchCarPark: CarParkMatcher | null): Charger[] {
  const out: Charger[] = [];
  const seenIds = new Map<string, number>();

  for (const s of stations) {
    const lat0 = toNumber(s.latitude);
    const lng0 = toNumber(s.longtitude);
    if (lat0 == null || lng0 == null) continue;

    const rawAddress = s.address ?? '';

    // Some sites host several operators. Each gets its own entry so the
    // operator, its prices and its fees stay together.
    const byOperator = new Map<string, RawChargingPoint[]>();
    for (const cp of s.chargingPoints ?? []) {
      const op = cp.operator?.trim() || 'Unknown operator';
      const list = byOperator.get(op);
      if (list) list.push(cp);
      else byOperator.set(op, [cp]);
    }
    const groups = [...byOperator.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    groups.forEach(([operator, cps], gi) => {
      // Nudge co-located operators ~8 m apart so their pins don't stack.
      const lat = lat0;
      const lng = lng0 + gi * 0.00007;
      const rawName = stableName(s, cps);
      const hdb = matchCarPark ? matchCarPark(lat0, lng0, rawAddress, rawName) : null;

      const connectors = new Map<string, Connector>();
      let available = 0, occupied = 0, offline = 0, total = 0;
      let maxKw = 0;
      const minPrice: Record<Current, number | null> = { AC: null, DC: null };
      const evIds: string[] = [];

      for (const cp of cps) {
        for (const plug of cp.plugTypes ?? []) {
          const current: Current = (plug.current ?? '').toUpperCase() === 'DC' ? 'DC' : 'AC';
          const kw = toNumber(plug.powerRating) ?? 0;
          const { price, free } = parsePrice(plug);
          const counts = countConnectors(plug, cp);
          for (const e of plug.evIds ?? []) if (e.evCpId) evIds.push(e.evCpId);

          available += counts.available;
          occupied += counts.occupied;
          offline += counts.offline;
          total += counts.count;
          if (kw > maxKw) maxKw = kw;
          if (price != null && (minPrice[current] == null || price < minPrice[current]!)) {
            minPrice[current] = price;
          }

          const plugType = plug.plugType?.trim() || 'Unknown';
          const key = `${plugType}|${current}|${kw}|${price}|${free}`;
          const existing = connectors.get(key);
          if (existing) {
            existing.count += counts.count;
            existing.available += counts.available;
            existing.offline += counts.offline;
          } else {
            connectors.set(key, {
              plugType, current, kw, price, free,
              count: counts.count,
              available: counts.available,
              offline: counts.offline,
            });
          }
        }
      }

      // Stable across snapshots: LTA's charge point ids don't change, unlike
      // the station's name and coordinates.
      const idSource = evIds.length ? evIds.sort().join(',') : `${rawName}|${operator}|${lat0}|${lng0}`;
      const baseId = `${s.postalCode || 'sg'}-${hash(idSource)}`;
      const n = (seenIds.get(baseId) ?? 0) + 1;
      seenIds.set(baseId, n);

      out.push({
        id: n === 1 ? baseId : `${baseId}-${n}`,
        name: displayName(rawName, rawAddress, hdb),
        address: formatAddress(rawAddress),
        postalCode: s.postalCode ?? '',
        lat,
        lng,
        operator,
        available,
        occupied,
        offline,
        total,
        maxKw,
        hasDC: [...connectors.values()].some(c => c.current === 'DC'),
        connectors: [...connectors.values()].sort((a, b) => b.kw - a.kw || (a.price ?? 99) - (b.price ?? 99)),
        minPrice,
        carPark: hdb ? { code: hdb.code, central: hdb.central } : null,
      });
    });
  }
  return out;
}
