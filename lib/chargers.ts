import type { Charger, Status, FilterKey } from './types';

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

export const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  occupied:  'In Use',
  unknown:   'Status Unknown',
};
