import type { HdbCarPark } from './types';

// HDB short-term parking charges for cars. Source:
// https://www.hdb.gov.sg/car-parks/shortterm-parking/short-term-parking-charges
export const HDB_RATES_SOURCE =
  'https://www.hdb.gov.sg/car-parks/shortterm-parking/short-term-parking-charges';

/** Car parks HDB lists as inside the Central Area (higher daytime rate). */
export const HDB_CENTRAL_CODES = new Set([
  'ACB', 'BBB', 'BRB1', 'CY', 'DUXM', 'HLM', 'KAB', 'KAM',
  'KAS', 'PRM', 'SLS', 'SR1', 'SR2', 'TPM', 'UCS', 'WCB',
]);

/** One-line rate shown in lists. */
export function hdbRateShort(central: boolean): string {
  return central ? 'HDB parking from $0.60 / 30 min' : 'HDB parking $0.60 / 30 min';
}

export interface RateLine {
  label: string;
  value: string;
}

function freeParkingText(raw: string): string {
  const s = raw.toUpperCase();
  if (s === 'NO' || !s) return 'None';
  const m = s.match(/FR\s+(\S+)-(\S+)/);
  const hours = m ? `${m[1].toLowerCase()} to ${m[2].toLowerCase()}` : '';
  return `Sundays and public holidays${hours ? `, ${hours}` : ''}`;
}

function shortTermText(raw: string): string {
  const s = raw.toUpperCase();
  if (s === 'WHOLE DAY') return 'Whole day';
  if (s === 'NO') return 'Not allowed (season parking only)';
  return s.toLowerCase().replace('-', ' to ');
}

export function hdbRateLines(cp: HdbCarPark): RateLine[] {
  // Season-parking-only car parks have no short-term rate to show.
  if (cp.shortTermParking.toUpperCase() === 'NO') {
    return [{ label: 'Short-term parking', value: 'Not allowed (season parking only)' }];
  }
  const lines: RateLine[] = [];
  if (cp.central) {
    lines.push({ label: 'Mon–Sat, 7am to 5pm', value: '$1.20 per 30 min' });
    lines.push({ label: 'Other times', value: '$0.60 per 30 min' });
    lines.push({ label: 'Day cap (7am to 10.30pm)', value: '$20' });
  } else {
    lines.push({ label: 'Rate', value: '$0.60 per 30 min' });
    lines.push({ label: 'Day cap (7am to 10.30pm)', value: '$12' });
  }
  lines.push({
    label: 'Night parking (10.30pm to 7am)',
    value: cp.nightParking ? 'Capped at $5' : 'Not offered',
  });
  lines.push({ label: 'Free parking', value: freeParkingText(cp.freeParking) });
  lines.push({ label: 'Short-term parking', value: shortTermText(cp.shortTermParking) });
  return lines;
}

export function paymentText(system: string): string {
  return /COUPON/i.test(system)
    ? 'Parking.sg app or coupons'
    : 'Electronic gantry';
}
