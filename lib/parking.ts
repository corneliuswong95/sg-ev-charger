import type { HdbCarPark, RateLine } from './types';

// HDB short-term parking charges for cars. Source:
// https://www.hdb.gov.sg/car-parks/shortterm-parking/short-term-parking-charges
export const HDB_RATES_SOURCE =
  'https://www.hdb.gov.sg/car-parks/shortterm-parking/short-term-parking-charges';

/** Car parks HDB lists as inside the Central Area (higher daytime rate). */
export const HDB_CENTRAL_CODES = new Set([
  'ACB', 'BBB', 'BRB1', 'CY', 'DUXM', 'HLM', 'KAB', 'KAM',
  'KAS', 'PRM', 'SLS', 'SR1', 'SR2', 'TPM', 'UCS', 'WCB',
]);

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

// ─── URA public car parks ───

// "URA/HDB car parks that charge either $0.60 or $1.20 per half-hour" — URA, updated 20 Aug 2026.
export const URA_COUPONS_SOURCE = 'https://www.ura.gov.sg/car-parks/short-term-parking/parking-coupons/';

interface Band {
  start: string;
  end: string;
  weekday: { rate: string; per: string };
  saturday: { rate: string; per: string };
  sundayPH: { rate: string; per: string };
}

/** "08.30 AM" → "8.30am", "12.00 PM" → "12pm" */
function uraTime(t: string): string {
  const m = t.match(/^(\d{1,2})\.(\d{2})\s*([AP]M)$/i);
  if (!m) return t.toLowerCase();
  const h = String(Number(m[1]));
  return `${h}${m[2] === '00' ? '' : `.${m[2]}`}${m[3].toLowerCase()}`;
}

/** ("$0.50", "30 mins") → "$0.50 per 30 min"; "$0.00" → "Free" */
function uraRate({ rate, per }: { rate: string; per: string }): string {
  if (!rate || rate === '-') return 'No parking';
  const n = Number(rate.replace(/[^0-9.]/g, ''));
  if (Number.isFinite(n) && n === 0) return 'Free';
  const unit = per.replace(/\s*mins?\b/i, ' min').replace(/\s*hrs?\b/i, ' hr').replace(/\s+/g, ' ').trim();
  return unit ? `${rate} per ${unit}` : rate;
}

export function uraRateLines(bands: Band[]): RateLine[] {
  const lines: RateLine[] = [];
  const sorted = [...bands].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  for (const b of sorted) {
    const hours = `${uraTime(b.start)} to ${uraTime(b.end)}`;
    const wk = uraRate(b.weekday);
    const sat = uraRate(b.saturday);
    const sun = uraRate(b.sundayPH);
    if (wk === sat && sat === sun) {
      lines.push({ label: `Daily, ${hours}`, value: wk });
    } else if (wk === sat) {
      lines.push({ label: `Mon–Sat, ${hours}`, value: wk });
      lines.push({ label: `Sun and PH, ${hours}`, value: sun });
    } else if (sat === sun) {
      lines.push({ label: `Mon–Fri, ${hours}`, value: wk });
      lines.push({ label: `Sat, Sun and PH, ${hours}`, value: sat });
    } else {
      lines.push({ label: `Mon–Fri, ${hours}`, value: wk });
      lines.push({ label: `Sat, ${hours}`, value: sat });
      lines.push({ label: `Sun and PH, ${hours}`, value: sun });
    }
  }
  return lines;
}

function toMinutes(t: string): number {
  const m = t.match(/^(\d{1,2})\.(\d{2})\s*([AP]M)$/i);
  if (!m) return 0;
  const h = Number(m[1]) % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  return h * 60 + Number(m[2]);
}
