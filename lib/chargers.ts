import type { Charger, Status, FilterKey } from './types';
import { resolveOperator } from './operators';

export function getStatus(c: Charger): Status {
  if (c.available > 0) return 'available';
  if (c.total > 0)     return 'occupied';
  return 'unknown';
}

export function matchesFilter(c: Charger, filter: FilterKey): boolean {
  switch (filter) {
    case 'available': return getStatus(c) === 'available';
    case 'fast':      return c.maxKw >= 50;
    case 'dc':        return c.hasDC;
    default:          return true;
  }
}

export function matchesOperator(c: Charger, operatorKey: string | null): boolean {
  if (!operatorKey) return true;
  return resolveOperator(c.operator).key === operatorKey;
}

export const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  occupied:  'In Use',
  unknown:   'Status Unknown',
};

export function distanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
