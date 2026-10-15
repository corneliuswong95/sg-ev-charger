// LTA OneMotoring "Parking Rates" — the maintained successor of the 2018
// data.gov.sg "Carpark Rates" snapshot. ~420 malls, offices, hotels and
// attractions, as free text, by name only (no coordinates).
//
// Licence: OneMotoring's terms of use (clause 6) don't allow reproducing its
// contents without LTA's written permission. LTA agreed in Oct 2026 to the
// app showing these rates for 12 months (renewable), on the terms we asked
// for: only the car park a charger is in, rate text as published, credited
// "LTA OneMotoring" with its last-updated date, a link back and LTA's GST
// note, fetched at most daily. Keep to those terms.
//
// Set ONEMOTORING_INLINE=0 to go back to link-only (e.g. if permission
// lapses or is withdrawn).

const BASE = 'https://onemotoring.lta.gov.sg/content/onemotoring/home/owning/ongoing-car-costs/parking';
const AREAS: Record<string, string> = {
  '1': 'Orchard',
  '2': 'Central, North and North East',
  '3': 'East',
  '4': 'South and CBD',
  '5': 'West',
  '6': 'Hotels',
  '8': 'Attractions',
};
const UA = 'Mozilla/5.0 (compatible; sg-ev-charger/1.0)';

export interface OmCarPark {
  id: string;
  name: string;
  area: string;
  url: string;
  weekdayDay: string;
  weekdayEvening: string;
  saturday: string;
  sundayPH: string;
}

export interface OmIndex {
  updated: string | null;
  byId: Map<string, OmCarPark>;
  match: (rawName: string, rawAddress: string) => OmCarPark | null;
}

export const omInline = () => process.env.ONEMOTORING_INLINE !== '0';

const decode = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ─── Name matching ───
// OneMotoring has names only, so matching is deliberately strict: the
// station's core words must all appear in the car park name, and the car park
// name may only add generic words. "TAMPINES PARKVIEW" ≠ "Tampines Mall".
const DROP = new Set(['THE', 'SINGAPORE', 'AND', 'OF', 'AT', 'PTE', 'LTD']);
const LEADING = new Set(['DBS', 'CITIBANK', 'ATM', 'POSB']);
const OM_EXTRA = new Set(['HOTEL', 'BUILDING', 'SHOPPING', 'MALL', 'CENTRE', 'CENTER', 'COMPLEX']);
const GENERIC_PAREN = /^(FORMERLY\b|[A-Z]{2,5}$|BASEMENT|CAR ?PARK$)/;

function words(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/@/g, ' ')
    .replace(/\+/g, 'PLUS')
    .split(/[^A-Z0-9]+/)
    .filter(w => w && !DROP.has(w));
}

function core(s: string, station: boolean): Set<string> {
  const w = words(s.replace(/\(.*?\)/g, ' '));
  if (station) while (w.length > 1 && LEADING.has(w[0])) w.shift();
  return new Set(w);
}

/** Bracketed qualifiers like "(Tampines)" or "(Carpark G)" must also appear in the station. */
function qualifierOk(omName: string, station: string): boolean {
  for (const m of omName.matchAll(/\(([^)]*)\)?/g)) {
    const q = m[1].trim().toUpperCase();
    if (!q || GENERIC_PAREN.test(q)) continue;
    if (!words(q).every(w => station.includes(w))) return false;
  }
  return true;
}

function sameCarPark(stationCore: Set<string>, omCore: Set<string>): boolean {
  // Needs at least one real name word of 3+ characters ("THE M" is too weak).
  let distinctive = 0;
  for (const w of stationCore) {
    if (!omCore.has(w)) return false;
    if (!OM_EXTRA.has(w) && w.length >= 3) distinctive++;
  }
  if (distinctive === 0) return false;
  for (const w of omCore) if (!stationCore.has(w) && !OM_EXTRA.has(w)) return false;
  return true;
}

export async function fetchOmIndex(): Promise<OmIndex> {
  const rows: OmCarPark[] = [];
  let updated: string | null = null;
  for (const [page, area] of Object.entries(AREAS)) {
    const url = `${BASE}/parking_rates.${page}.html`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
    if (!res.ok) throw new Error(`OneMotoring ${page} ${res.status}`);
    const html = await res.text();
    updated ??= html.match(/Last updated\s+(\d{1,2} \w+ \d{4})/)?.[1] ?? null;
    for (const tr of html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td data-label="[^"]*">([\s\S]*?)<\/td>/g)].map(m => decode(m[1]));
      if (cells.length < 5 || !cells[0]) continue;
      rows.push({
        id: `om-${page}-${slug(cells[0])}`,
        name: cells[0],
        area,
        url,
        weekdayDay: cells[1],
        weekdayEvening: cells[2],
        saturday: cells[3],
        sundayPH: cells[4],
      });
    }
  }
  if (rows.length === 0) throw new Error('OneMotoring: no rows parsed');

  const byId = new Map(rows.map(r => [r.id, r]));
  const indexed = rows.map(r => ({ r, core: core(r.name, false) }));

  function match(rawName: string, rawAddress: string): OmCarPark | null {
    const name = rawName.toUpperCase().trim();
    if (!name) return null;
    const st = core(name, true);
    const context = `${name} ${rawAddress.toUpperCase()}`;
    for (const { r, core: c } of indexed) {
      if (sameCarPark(st, c) && qualifierOk(r.name, context)) return r;
    }
    return null;
  }

  console.log(`[OneMotoring] ${rows.length} car parks (updated ${updated ?? 'unknown'})`);
  return { updated, byId, match };
}
