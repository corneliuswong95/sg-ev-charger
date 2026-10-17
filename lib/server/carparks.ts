import type { CarParkRef, HdbCarPark, ParkingDetails, RateLine } from '@/lib/types';
import { distanceKm } from '@/lib/geo';
import { titleCase } from '@/lib/format';
import {
  HDB_RATES_SOURCE, URA_COUPONS_SOURCE, hasFreeParking, hdbRateLines, paymentText, uraRateLines,
} from '@/lib/parking';
import { CURATED_CAR_PARKS, curatedByLtaName, findCuratedCarPark, type CuratedCarPark } from '@/lib/curatedParking';
import type { HdbIndex } from './hdb';
import type { CarParkLots } from './lta';
import type { UraCarPark, UraPlace } from './ura';
import { omInline, type OmCarPark, type OmIndex } from './onemotoring';

export interface ParkingMatch {
  ref: CarParkRef;
  /** Set when the match is an HDB car park (used to name generic stations). */
  hdb: HdbCarPark | null;
}

export type ParkingMatcher = (lat: number, lng: number, address: string, name: string) => ParkingMatch | null;

export interface ParkingSources {
  hdb: HdbIndex | null;
  /** URA rates from URA's API — only when URA_ACCESS_KEY is set. */
  ura: Map<string, UraCarPark> | null;
  /** URA car park locations from data.gov.sg (no key needed). */
  uraPlaces: UraPlace[] | null;
  om: OmIndex | null;
  lots: CarParkLots[] | null;
}

// URA: within 60 m, and either a URA *off-street* car park sharing a name word
// ("JOO CHIAT ROAD OFF STREET" ↔ "Joo Chiat Road Off Street") or one with the
// same name as the station ("MND COMPLEX"). Kerbside lots next to private
// buildings and petrol stations were the usual false positives.
const URA_M = 60;
const URA_UNNAMED_M = 15;
const URA_KERBSIDE = /^(SERVICE ROAD|BACK ?LANE)/i;
const PETROL = /^(SHELL|SPC|CALTEX|ESSO|SINOPEC)\b/i;
const BANK_PREFIX = new Set(['DBS', 'CITIBANK', 'ATM', 'POSB']);
// LTA-listed malls: charger is usually in the mall's own car park.
const MALL_SAME_PLACE_M = 30;
const MALL_NAMED_M = 120;

const STOP = new Set([
  'THE', 'OF', 'AT', 'CAR', 'PARK', 'MALL', 'CENTRE', 'CENTER', 'PLAZA', 'BUILDING', 'SINGAPORE',
  'OFF', 'ST', 'STREET', 'RD', 'ROAD', 'AVENUE', 'AVE', 'DRIVE', 'LANE', 'BLK',
]);

function keyWords(s: string): Set<string> {
  return new Set(s.toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length >= 3 && !STOP.has(w)));
}

function sharesWord(a: string, b: string): boolean {
  const wb = keyWords(b);
  for (const w of keyWords(a)) if (wb.has(w)) return true;
  return false;
}

function coreWords(s: string): Set<string> {
  return new Set(
    s.toUpperCase().replace(/\(.*?\)/g, ' ').split(/[^A-Z0-9]+/)
      .filter(w => w && w !== 'THE' && w !== 'SINGAPORE' && !BANK_PREFIX.has(w)),
  );
}

function sameWords(a: string, b: string): boolean {
  const wa = coreWords(a);
  const wb = coreWords(b);
  if (wa.size === 0 || wa.size !== wb.size) return false;
  for (const w of wa) if (!wb.has(w)) return false;
  return true;
}

function uraMatches(stationName: string, uraName: string, m: number): boolean {
  if (!stationName.trim()) return m <= URA_UNNAMED_M;
  if (m > URA_M || PETROL.test(stationName)) return false;
  if (/\bOFF ?ST(REET)?\b/i.test(uraName)) return sharesWord(stationName, uraName);
  return sameWords(stationName, uraName);
}

function nearest<T extends { lat: number; lng: number }>(items: T[], lat: number, lng: number, ok: (t: T) => boolean) {
  let best: { item: T; m: number } | null = null;
  for (const item of items) {
    // Cheap pre-filter: ~0.0015° ≈ 165 m.
    if (Math.abs(item.lat - lat) > 0.0015 || Math.abs(item.lng - lng) > 0.0015) continue;
    if (!ok(item)) continue;
    const m = distanceKm(lat, lng, item.lat, item.lng) * 1000;
    if (!best || m < best.m) best = { item, m };
  }
  return best;
}

export function buildParkingMatcher(s: ParkingSources): ParkingMatcher {
  const uraPoints = s.ura
    ? [...s.ura.values()].flatMap(cp => cp.points.map(([lat, lng]) => ({ lat, lng, code: cp.code, name: cp.name })))
    : (s.uraPlaces ?? []).filter(p => p.carLots > 0);
  const malls = (s.lots ?? [])
    .filter(l => l.agency === 'LTA' && l.lat != null && l.lng != null)
    .map(l => ({ lat: l.lat!, lng: l.lng!, id: l.id, name: l.name }));

  return (lat, lng, address, name) => {
    const h = s.hdb?.match(lat, lng, address, name);
    if (h) {
      return {
        ref: { kind: 'hdb', code: h.code, central: h.central, freeSunday: hasFreeParking(h.freeParking) },
        hdb: h,
      };
    }

    const curated = findCuratedCarPark(name, address);
    if (curated) return { ref: { kind: curated.kind, code: curated.id }, hdb: null };

    const u = nearest(uraPoints, lat, lng, p => !URA_KERBSIDE.test(p.name));
    if (u && uraMatches(name, u.item.name, u.m)) {
      return { ref: { kind: 'ura', code: u.item.code }, hdb: null };
    }

    const om = s.om?.match(name, address);
    if (om) return { ref: { kind: 'mall', code: om.id }, hdb: null };

    const mall = nearest(malls, lat, lng, () => true);
    if (mall && (mall.m <= MALL_SAME_PLACE_M || (mall.m <= MALL_NAMED_M && sameWords(name, mall.item.name)))) {
      return { ref: { kind: 'mall', code: `lta-${mall.item.id}` }, hdb: null };
    }
    return null;
  };
}

// ─── Details for the detail sheet ───

const sameName = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Live lots for a named mall, via LTA's list of major car parks. */
function mallLots(lots: CarParkLots[] | null, ...names: (string | undefined)[]): number | null {
  for (const n of names) {
    if (!n) continue;
    const row = lots?.find(l => l.agency === 'LTA' && sameName(l.name, n));
    if (row) return row.lots;
  }
  return null;
}

function omLines(cp: OmCarPark): RateLine[] {
  const rows: RateLine[] = [
    { label: 'Weekdays, before 5/6pm', value: cp.weekdayDay },
    { label: 'Weekdays, after 5/6pm', value: cp.weekdayEvening },
    { label: 'Saturdays', value: cp.saturday },
    { label: 'Sundays and PH', value: cp.sundayPH },
  ];
  return rows.filter(r => r.value && r.value !== '-');
}

function omDetails(cp: OmCarPark, s: ParkingSources): ParkingDetails {
  const inline = omInline();
  const updated = s.om?.updated;
  return {
    kind: 'mall',
    title: cp.name,
    subtitle: `Listed by LTA OneMotoring (${cp.area})`,
    lines: inline ? omLines(cp) : [],
    lotsAvailable: mallLots(s.lots, cp.name),
    notes: inline
      ? [
          'LTA notes these rates may not include GST, and car parks may change them without notice.',
          'Parking is paid separately from charging.',
        ]
      : [`LTA publishes this car park’s rates on OneMotoring${updated ? ` (updated ${updated})` : ''}. Parking is paid separately from charging.`],
    link: inline ? undefined : { label: 'View rates on OneMotoring', url: cp.url },
    // Attribution LTA agreed to: name, last-updated date, link back.
    sources: inline
      ? [{ label: `LTA OneMotoring${updated ? `, updated ${updated}` : ''}`, url: cp.url }]
      : [],
  };
}

export function parkingDetails(ref: CarParkRef, s: ParkingSources): ParkingDetails | null {
  if (ref.kind === 'hdb') {
    const cp = s.hdb?.byCode.get(ref.code);
    if (!cp) return null;
    return {
      kind: 'hdb',
      title: `HDB car park ${cp.code}`,
      subtitle: `${titleCase(cp.type)}. ${paymentText(cp.system)}.`,
      lines: hdbRateLines(cp),
      lotsAvailable: s.lots?.find(l => l.agency === 'HDB' && l.id === cp.code)?.lots ?? null,
      notes: ['Parking is paid separately from charging.'],
      sources: [{ label: 'HDB parking charges', url: HDB_RATES_SOURCE }],
    };
  }

  if (ref.kind === 'ura') {
    const api = s.ura?.get(ref.code);
    const place = s.uraPlaces?.find(p => p.code === ref.code);
    const name = api?.name || place?.name || ref.code;
    const system = api?.system === 'coupon' ? 'Parking.sg app or coupons' : api?.system === 'electronic' ? 'Electronic gantry' : null;
    const capacity = api?.capacity ?? place?.carLots ?? null;
    return {
      kind: 'ura',
      title: `URA car park ${ref.code}`,
      subtitle: [titleCase(name.replace(/\s*\bOFF\s*ST(REET)?\b\.?/i, '').trim()), system, capacity ? `${capacity} car lots` : null]
        .filter(Boolean).join('. ') + '.',
      lines: api ? uraRateLines(api.bands) : [],
      lotsAvailable: s.lots?.find(l => l.agency === 'URA' && l.id === ref.code)?.lots ?? null,
      notes: api
        ? [...api.remarks, 'Rates from URA, updated daily. Parking is paid separately from charging.']
        : ['URA car parks charge $0.60 or $1.20 per 30 min for cars, depending on location. Check the signboard or the Parking.sg app for this one.'],
      sources: api
        ? [{ label: 'URA car park data (Singapore Open Data Licence)', url: 'https://eservice.ura.gov.sg/maps/api/' }]
        : [{ label: 'URA parking coupons and rates', url: URA_COUPONS_SOURCE }],
    };
  }

  if (ref.code.startsWith('om-')) {
    const cp = s.om?.byId.get(ref.code);
    return cp ? omDetails(cp, s) : null;
  }

  if (ref.code.startsWith('lta-')) {
    const id = ref.code.slice(4);
    const row = s.lots?.find(l => l.agency === 'LTA' && l.id === id);
    if (!row) return null;
    const curated = curatedByLtaName(row.name);
    if (curated) return curatedDetails(curated, row.lots);
    return {
      kind: 'mall',
      title: row.name,
      subtitle: null,
      lines: [],
      lotsAvailable: row.lots,
      notes: ['Rates for this car park aren’t published as open data. Check the signboard at the entrance.'],
      sources: [],
    };
  }

  const c = CURATED_CAR_PARKS.find(x => x.id === ref.code);
  return c ? curatedDetails(c, mallLots(s.lots, c.ltaName, c.name)) : null;
}

function curatedDetails(c: CuratedCarPark, lotsAvailable: number | null): ParkingDetails {
  return {
    kind: c.kind,
    title: c.name,
    subtitle: c.kind === 'jtc'
      ? `JTC car park${c.operator ? `, run by ${c.operator}` : ''}.`
      : c.operator ? `Run by ${c.operator}.` : null,
    lines: c.lines,
    lotsAvailable,
    notes: [...(c.notes ?? []), `Rates checked ${c.checked}. Parking is paid separately from charging.`],
    sources: [c.source],
  };
}
