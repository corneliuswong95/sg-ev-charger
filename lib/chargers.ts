import type { Charger, Current, FilterKey, Status } from './types';
import { resolveOperator } from './operators';

export const FAST_KW = 50;

export function getStatus(c: Charger): Status {
  if (c.available > 0) return 'available';
  if (c.occupied > 0) return 'occupied';
  return 'offline';
}

export const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  occupied: 'Fully occupied',
  offline: 'No live status',
};

/** Short label for lists, e.g. "3 free", "Full", "Offline". */
export function availabilityShort(c: Charger): string {
  const s = getStatus(c);
  if (s === 'available') return `${c.available} free`;
  if (s === 'occupied') return 'Full';
  return 'No status';
}

export function matchesFilters(c: Charger, filters: FilterKey[]): boolean {
  for (const f of filters) {
    if (f === 'available' && getStatus(c) !== 'available') return false;
    if (f === 'fast' && c.maxKw < FAST_KW) return false;
    if (f === 'dc' && !c.hasDC) return false;
  }
  return true;
}

export function matchesOperator(c: Charger, operatorKey: string | null): boolean {
  if (!operatorKey) return true;
  return resolveOperator(c.operator).key === operatorKey;
}

export function matchesQuery(c: Charger, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${c.name} ${c.address} ${c.postalCode} ${resolveOperator(c.operator).label}`.toLowerCase();
  return q.split(/\s+/).every(t => hay.includes(t));
}

/** Most powerful connector of a current type with the station's cheapest price for it. */
export function cheapestConnector(c: Charger, current: Current) {
  const price = c.minPrice[current];
  if (price == null) return null;
  return c.connectors
    .filter(k => k.current === current && k.price === price)
    .sort((a, b) => b.kw - a.kw)[0] ?? null;
}
