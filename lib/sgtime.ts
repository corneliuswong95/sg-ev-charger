import { formatTime } from './format';

// Singapore-time helpers for the history charts (Trends, popular times).

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first order for display. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 0 → "12am", 13 → "1pm" */
export const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);

const PARTS = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', hourCycle: 'h23',
});

function parts(d: Date): Record<string, string> {
  return Object.fromEntries(PARTS.formatToParts(d).map(p => [p.type, p.value]));
}

/** Day of week (0 = Sunday) and hour, in Singapore. */
export function sgtSlot(d: Date): { dow: number; hour: number } {
  const p = parts(d);
  return { dow: DAY_SHORT.indexOf(p.weekday), hour: Number(p.hour) % 24 };
}

/** "17 Oct" */
export function formatDay(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.day} ${p.month}`;
}

/** "Sat 17 Oct, 10:40 pm" */
export function formatWhen(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday} ${p.day} ${p.month}, ${formatTime(iso)}`;
}
