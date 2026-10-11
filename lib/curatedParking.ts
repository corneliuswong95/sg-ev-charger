import type { RateLine } from './types';
import { CURATED_MALLS } from './curatedMalls';

/*
  Hand-curated parking rates for car parks with EV chargers where there's no
  open dataset with rates: JTC industrial car parks and malls. Rates are
  copied from the car park owner's own published price list.

  Rules for editing:
  - Only add rates you've read on the owner's own page/PDF; link it in `source`.
  - Set `checked` to the date you read it; re-check periodically.
  - `match` is tested against `${raw LTA name} | ${raw LTA address}` in upper case.
    Keep it specific — a wrong match shows the wrong car park's prices.
*/

export interface CuratedCarPark {
  id: string;
  kind: 'jtc' | 'mall';
  name: string;
  match: RegExp;
  /** Who runs the car park, if the owner says. */
  operator?: string;
  /** Development name in LTA's car park availability feed, for live lots. */
  ltaName?: string;
  lines: RateLine[];
  notes?: string[];
  source: { label: string; url: string };
  checked: string;
}

const JTC_SOURCE = {
  label: 'JTC public car park rates (PDF, Jul 2026)',
  url: 'https://www.jtc.gov.sg/-/media/project/jtc-cx/corpweb/assets/get-help/season-parking/jtc_carpark-details_jan-2025_v2.pdf',
};
const JTC_CHECKED = '11 Oct 2026';
const PER_MIN = 'Charged by the minute.';

// Common JTC patterns, as worded in JTC's price list.
const p60 = '$0.60 per 30 min';
const free = 'Free';

function jtc(
  id: string, name: string, match: RegExp, operator: string, lines: RateLine[], perMinute = true,
): CuratedCarPark {
  return {
    id: `jtc-${id}`,
    kind: 'jtc',
    name,
    match,
    operator,
    lines,
    notes: perMinute ? [PER_MIN] : [],
    source: JTC_SOURCE,
    checked: JTC_CHECKED,
  };
}

/** Mon–Sat 7am–7pm paid, evenings, Sundays and PH free — JTC's most common scheme. */
const dayOnly7pm: RateLine[] = [
  { label: 'Mon–Sat, 7am to 7pm', value: p60 },
  { label: 'Mon–Sat, 7pm to 7am', value: free },
  { label: 'Sun and PH', value: free },
];
const cleantech: RateLine[] = [
  { label: 'Mon–Sat, 7am to 5pm', value: p60 },
  { label: 'Mon–Sat, 5pm to 7am', value: free },
  { label: 'Sun and PH', value: free },
];
const industrialCapped: RateLine[] = [
  { label: 'Mon–Sat, 7am to 10.30pm', value: p60 },
  { label: 'Mon–Sat, 10.30pm to 7am', value: `${p60}, capped at $5` },
  { label: 'Sun and PH', value: free },
];

const JTC_CAR_PARKS: CuratedCarPark[] = [
  // From JTC's public car park price list.
  jtc('cleantech-one', 'Cleantech One @ CleanTech Park', /\bCLEANTECH ONE\b/, 'TOP Parking', cleantech),
  jtc('cleantech-two', 'Cleantech Two @ CleanTech Park', /\bCLEANTECH TWO\b/, 'TOP Parking', cleantech),
  jtc('bedok-food-city', 'Bedok Food City', /\bBEDOK FOOD CITY\b/, 'Wilson Parking', [
    { label: 'Mon–Sat, 7am to 10.30pm', value: p60 },
    { label: 'Mon–Sat, 10.30pm to 7am', value: `${p60}, capped at $5` },
    { label: 'Sun and PH, 7am to 10.30pm', value: free },
    { label: 'Sun and PH, 10.30pm to 7am', value: `${p60}, capped at $5` },
  ]),
  // JTC Auditorium is inside JTC Summit (8 Jurong Town Hall Road).
  jtc('summit', 'JTC Summit', /\bJTC (AUDITORIUM|SUMMIT)\b.*\b8 JURONG TOWN HALL ROAD\b/, 'TOP Parking', [
    { label: 'Daily, 7am to 10.30pm', value: '$0.65 per 30 min' },
    { label: 'Daily, 10.30pm to 7am', value: '$0.65 per 30 min, capped at $4' },
  ]),
  jtc('aviation-one', 'Aviation One, Seletar Aerospace Park', /\bAVIATION ONE\b.*\bSELETAR\b/, 'Wilson Parking', [
    { label: 'Daily, 7am to 5pm', value: p60 },
    { label: 'Daily, 5pm to 7am', value: p60 },
  ]),
  jtc('aviation-two', 'Aviation Two, Seletar Aerospace Park', /\bAVIATION TWO\b.*\bSELETAR\b/, 'Wilson Parking', [
    { label: 'Daily, 7am to 5pm', value: p60 },
    { label: 'Daily, 5pm to 7am', value: p60 },
  ]),
  jtc('woodlands-loop-15', 'Woodlands Loop 15', /\b15 WOODLANDS LOOP\b/, 'LHN Parking', [
    { label: 'Daily, 7am to 7pm', value: p60 },
    { label: 'Daily, 7pm to 7am', value: `${p60}, capped at $4` },
  ]),
  jtc('medtech-hub', 'JTC MedTech Hub @ MedTech Park', /\bMEDTECH HUB\b/, 'TOP Parking', dayOnly7pm),
  jtc('defu-industrial-city', 'Defu Industrial City', /\bDEFU INDUSTRIAL CITY\b/, 'LHN Parking', [
    { label: 'Daily, 7am to 10pm', value: p60 },
    { label: 'Daily, 10pm to 7am', value: `${p60}, capped at $6` },
  ]),
  jtc('kaki-bukit-autohub', 'Kaki Bukit Avenue 2 Autohub', /\bKAKI BUKIT AUTOHUB\b/, 'Wilson Parking', industrialCapped),
  jtc('kb-1', 'KB-1, Kaki Bukit Avenue 3', /^KB-1 \|.*\bKAKI BUKIT AVENUE 3\b/, 'Wilson Parking', industrialCapped),
  jtc('space-tuas-biomedical', 'JTC Space @ Tuas Biomedical Park', /\bJTC SPACE @ TUAS BIOMEDICAL\b/, 'TOP Parking', dayOnly7pm),
  jtc('space-tuas', 'JTC Space @ Tuas', /\bJTC SPACE @ TUAS \|/, 'TOP Parking', dayOnly7pm),
  jtc('space-gul', 'JTC Space @ Gul', /\bJTC SPACE @ GUL\b/, 'TOP Parking', dayOnly7pm),
  jtc('space-tampines-north', 'JTC Space @ Tampines North', /\bJTC SPACE @ TAMPINES NORTH\b/, 'Wilson Parking', dayOnly7pm),
  jtc('launchpad', 'LaunchPad @ one-north (47–79 Ayer Rajah Crescent)', /\bLAUNCHPAD\b.*\bAYER RAJAH CRESCENT\b/, 'LHN Parking', [
    { label: 'Mon–Fri, 7am to 6pm', value: '$1.00 per 30 min' },
    { label: 'Mon–Fri, 6pm to 7am', value: '$1.00 per entry' },
    { label: 'Sat, Sun and PH', value: '$1.00 per entry' },
  ]),
  jtc('skytech', 'Skytech, Bukit Batok Street 24', /^SKYTECH \|.*\b2 BUKIT BATOK STREET 24\b/, 'TOP Parking', [
    { label: 'Mon–Fri, 7am to 10.30pm', value: p60 },
    { label: 'Mon–Fri, 10.30pm to 7am', value: `${p60}, capped at $4` },
    { label: 'Sat, 7am to 10.30pm', value: `${p60}, capped at $4` },
    { label: 'Sat, 10.30pm to 7am', value: `${p60}, capped at $4` },
    { label: 'Sun and PH', value: free },
  ]),
];

export const CURATED_CAR_PARKS: CuratedCarPark[] = [...JTC_CAR_PARKS, ...CURATED_MALLS];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Curated entry for a car park in LTA's availability feed, by its Development name. */
export function curatedByLtaName(ltaName: string): CuratedCarPark | null {
  const n = norm(ltaName);
  return CURATED_CAR_PARKS.find(c => c.ltaName && norm(c.ltaName) === n) ?? null;
}

export function findCuratedCarPark(rawName: string, rawAddress: string): CuratedCarPark | null {
  const s = `${rawName} | ${rawAddress}`.toUpperCase();
  return CURATED_CAR_PARKS.find(c => c.match.test(s)) ?? null;
}
