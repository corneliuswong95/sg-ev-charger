import type { HdbCarPark } from '@/lib/types';
import { HDB_CENTRAL_CODES } from '@/lib/parking';
import { svy21ToWgs84 } from '@/lib/svy21';
import { distanceKm } from '@/lib/geo';

// data.gov.sg "HDB Carpark Information" (HDB), ~2,300 car parks, SVY21 coords.
const HDB_DATASET_URL =
  'https://data.gov.sg/api/action/datastore_search?resource_id=d_23f946fa557947f93a8043bbef41dd09&limit=5000';

interface RawHdbRecord {
  car_park_no?: string;
  address?: string;
  x_coord?: string;
  y_coord?: string;
  car_park_type?: string;
  type_of_parking_system?: string;
  short_term_parking?: string;
  free_parking?: string;
  night_parking?: string;
}

interface IndexedCarPark {
  info: HdbCarPark;
  lat: number;
  lng: number;
  blocks: BlockSpec[];
}

type BlockSpec = { exact: string } | { from: number; to: number };

export interface HdbIndex {
  byCode: Map<string, HdbCarPark>;
  match: (lat: number, lng: number, address: string, name: string) => HdbCarPark | null;
}

// EV station coordinates in LTA's feed are usually geocoded to the car park
// itself, so anything this close is the same place.
const SAME_PLACE_M = 25;
// Further out we also require the block number to match.
const NEARBY_M = 100;
const CELL = 0.001; // ~110 m grid cells

const NOT_HDB = /^(SHELL|SPC|CALTEX|ESSO|SINOPEC)\b|FILLING STATION|PETROL/i;

function parseBlocks(address: string): BlockSpec[] {
  const tokens = address.toUpperCase().replace(/^(BLOCKS?|BLKS?)\s*/, '').split(/\s+/);
  const spec: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t) || t === 'TO' || t === '&' || t === 'AND') spec.push(t);
    else break;
  }
  const joined = spec.join(' ').replace(/\s+TO\s+/g, '-');

  // A lone "101/107" is HDB shorthand for a range; "459/456" is two blocks.
  const pair = joined.match(/^(\d+)[A-Z]?\/(\d+)[A-Z]?$/);
  if (pair) {
    const from = Number(pair[1]);
    const to = Number(pair[2]);
    if (to > from && to - from <= 30) return [{ from, to }];
  }

  const out: BlockSpec[] = [];
  for (const part of joined.split(/[,&/\s]+|AND/).filter(Boolean)) {
    const range = part.match(/^(\d+)[A-Z]?-(\d+)[A-Z]?$/);
    if (range) out.push({ from: Number(range[1]), to: Number(range[2]) });
    else if (/^\d+[A-Z]?$/.test(part)) out.push({ exact: part });
  }
  return out;
}

/** Same block number, ignoring letter suffixes on either side (859 ≈ 859B). */
function blockMatches(stationAddress: string, specs: BlockSpec[]): boolean {
  const m = stationAddress.trim().toUpperCase().match(/^(\d+)[A-Z]?\b/);
  if (!m) return false;
  const num = Number(m[1]);
  return specs.some(s =>
    'exact' in s ? Number(s.exact.replace(/[A-Z]$/, '')) === num : num >= s.from && num <= s.to,
  );
}

const cellKey = (lat: number, lng: number) => `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;

export async function fetchHdbIndex(): Promise<HdbIndex> {
  const res = await fetch(HDB_DATASET_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.gov.sg HDB carparks ${res.status}`);
  const body = (await res.json()) as { result?: { records?: RawHdbRecord[] } };
  const records = body.result?.records ?? [];
  if (records.length === 0) throw new Error('data.gov.sg HDB carparks: no records');

  const byCode = new Map<string, HdbCarPark>();
  const grid = new Map<string, IndexedCarPark[]>();

  for (const r of records) {
    const code = r.car_park_no?.trim();
    const x = Number(r.x_coord);
    const y = Number(r.y_coord);
    if (!code || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    const [lat, lng] = svy21ToWgs84(y, x);
    const info: HdbCarPark = {
      code,
      address: r.address ?? '',
      type: r.car_park_type ?? '',
      system: r.type_of_parking_system ?? '',
      shortTermParking: r.short_term_parking ?? '',
      freeParking: r.free_parking ?? '',
      nightParking: (r.night_parking ?? '').toUpperCase() === 'YES',
      central: HDB_CENTRAL_CODES.has(code),
    };
    byCode.set(code, info);
    const entry: IndexedCarPark = { info, lat, lng, blocks: parseBlocks(info.address) };
    const key = cellKey(lat, lng);
    const bucket = grid.get(key);
    if (bucket) bucket.push(entry);
    else grid.set(key, [entry]);
  }

  function match(lat: number, lng: number, address: string, name: string): HdbCarPark | null {
    if (NOT_HDB.test(name)) return null;
    const ci = Math.floor(lat / CELL);
    const cj = Math.floor(lng / CELL);
    let best: { cp: IndexedCarPark; m: number } | null = null;
    let bestBlock: { cp: IndexedCarPark; m: number } | null = null;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (const cp of grid.get(`${ci + di}:${cj + dj}`) ?? []) {
          const m = distanceKm(lat, lng, cp.lat, cp.lng) * 1000;
          if (!best || m < best.m) best = { cp, m };
          if (m <= NEARBY_M && (!bestBlock || m < bestBlock.m) && blockMatches(address, cp.blocks)) {
            bestBlock = { cp, m };
          }
        }
      }
    }
    if (best && best.m <= SAME_PLACE_M) return best.cp.info;
    return bestBlock?.cp.info ?? null;
  }

  console.log(`[HDB] indexed ${byCode.size} car parks`);
  return { byCode, match };
}
