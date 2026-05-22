import type { Charger, ChargingPoint, Status, FilterKey } from './types';

export function getStatus(c: Charger): Status {
  if (c.available > 0) return 'available';
  if (c.total > 0)     return 'occupied';
  return 'unknown';
}

export function getMaxKw(c: Charger): number {
  let max = 0;
  for (const cp of c.chargingPoints) {
    for (const pt of cp.plugTypes ?? []) {
      const n = Number(pt.powerRating);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

export function hasDC(c: Charger): boolean {
  return c.chargingPoints.some(cp =>
    (cp.plugTypes ?? []).some(pt => (pt.current ?? '').toUpperCase() === 'DC'),
  );
}

export interface PlugSummary {
  plugType: string;
  current: string;
  kw: number;
  count: number;
  price?: number;
  priceType?: string;
}

export function uniquePlugSummary(cps: ChargingPoint[]): PlugSummary[] {
  const map = new Map<string, PlugSummary>();
  for (const cp of cps) {
    for (const pt of cp.plugTypes ?? []) {
      const kw = Number(pt.powerRating);
      const key = `${pt.plugType}|${pt.current}|${kw}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const priceNum = pt.price != null ? Number(pt.price) : undefined;
        map.set(key, {
          plugType: pt.plugType,
          current: pt.current,
          kw: Number.isFinite(kw) ? kw : 0,
          count: 1,
          price: priceNum != null && Number.isFinite(priceNum) ? priceNum : undefined,
          priceType: pt.priceType,
        });
      }
    }
  }
  return [...map.values()].sort((a, b) => b.kw - a.kw);
}

export function matchesFilter(c: Charger, filter: FilterKey): boolean {
  switch (filter) {
    case 'available': return getStatus(c) === 'available';
    case 'fast':      return getMaxKw(c) >= 50;
    case 'dc':        return hasDC(c);
    default:          return true;
  }
}

export const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  occupied:  'In Use',
  unknown:   'Status Unknown',
};
