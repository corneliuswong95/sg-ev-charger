import { svy21ToWgs84 } from '@/lib/svy21';

// URA Data Service — https://eservice.ura.gov.sg/maps/api/
// Needs a free AccessKey (register at https://eservice.ura.gov.sg/maps/api/reg.html).
// A token is issued per day; car park details/rates are updated daily.
const URA_BASE = 'https://eservice.ura.gov.sg/uraDataService';
// URA's gateway rejects requests without a browser-like User-Agent.
const UA = 'Mozilla/5.0 (compatible; sg-ev-charger/1.0)';

interface RawUraRate {
  ppCode?: string;
  ppName?: string;
  vehCat?: string;
  startTime?: string;
  endTime?: string;
  weekdayRate?: string;
  weekdayMin?: string;
  satdayRate?: string;
  satdayMin?: string;
  sunPHRate?: string;
  sunPHMin?: string;
  remarks?: string;
  parkingSystem?: string;
  parkCapacity?: number;
  geometries?: Array<{ coordinates?: string }>;
}

export interface UraRateBand {
  start: string;
  end: string;
  weekday: { rate: string; per: string };
  saturday: { rate: string; per: string };
  sundayPH: { rate: string; per: string };
}

export interface UraCarPark {
  code: string;
  name: string;
  system: 'coupon' | 'electronic' | 'unknown';
  capacity: number | null;
  remarks: string[];
  bands: UraRateBand[];
  points: [number, number][];
}

export function uraConfigured(): boolean {
  return !!process.env.URA_ACCESS_KEY;
}

async function fetchToken(key: string): Promise<string> {
  const res = await fetch(`${URA_BASE}/insertNewToken/v1`, {
    headers: { AccessKey: key, 'User-Agent': UA, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`URA token ${res.status}`);
  const body = (await res.json()) as { Status?: string; Result?: string; Message?: string };
  if (body.Status !== 'Success' || !body.Result) {
    throw new Error(`URA token: ${body.Message || body.Status || 'no token'}`);
  }
  return body.Result;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export async function fetchUraCarParks(): Promise<Map<string, UraCarPark>> {
  const key = process.env.URA_ACCESS_KEY;
  if (!key) throw new Error('URA_ACCESS_KEY is not set.');
  const token = await fetchToken(key);
  const res = await fetch(`${URA_BASE}/invokeUraDS/v1?service=Car_Park_Details`, {
    headers: { AccessKey: key, Token: token, 'User-Agent': UA, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`URA Car_Park_Details ${res.status}`);
  const body = (await res.json()) as { Status?: string; Message?: string; Result?: RawUraRate[] };
  if (body.Status !== 'Success' || !Array.isArray(body.Result)) {
    throw new Error(`URA Car_Park_Details: ${body.Message || body.Status || 'no result'}`);
  }

  const out = new Map<string, UraCarPark>();
  for (const r of body.Result) {
    const code = clean(r.ppCode);
    // vehCat is "Car" in the docs' sample and "C" in the field list.
    if (!code || !/^c(ar)?$/i.test(clean(r.vehCat))) continue;
    let cp = out.get(code);
    if (!cp) {
      cp = {
        code,
        name: clean(r.ppName),
        system: r.parkingSystem === 'C' ? 'coupon' : r.parkingSystem === 'B' ? 'electronic' : 'unknown',
        capacity: typeof r.parkCapacity === 'number' ? r.parkCapacity : null,
        remarks: [],
        bands: [],
        points: [],
      };
      out.set(code, cp);
    }
    for (const g of r.geometries ?? []) {
      const [x, y] = (g.coordinates ?? '').split(',').map(v => Number(v.trim()));
      if (Number.isFinite(x) && Number.isFinite(y)) cp.points.push(svy21ToWgs84(y, x));
    }
    const remark = clean(r.remarks);
    if (remark && !cp.remarks.includes(remark)) cp.remarks.push(remark);
    const band: UraRateBand = {
      start: clean(r.startTime),
      end: clean(r.endTime),
      weekday: { rate: clean(r.weekdayRate), per: clean(r.weekdayMin) },
      saturday: { rate: clean(r.satdayRate), per: clean(r.satdayMin) },
      sundayPH: { rate: clean(r.sunPHRate), per: clean(r.sunPHMin) },
    };
    const dup = cp.bands.some(b => JSON.stringify(b) === JSON.stringify(band));
    if (!dup) cp.bands.push(band);
  }
  console.log(`[URA] ${out.size} car parks with car rates`);
  return out;
}

// ─── URA car park locations without a key ───
// data.gov.sg "Capacity of URA Parking Places" (URA, Singapore Open Data
// Licence): one WGS84 point per parking place, keyed by the same ppCode.
const URA_PLACES_DATASET = 'd_9bf8620ecfdc8a5f8f77e3f02160af5c';

export interface UraPlace {
  code: string;
  name: string;
  carLots: number;
  lat: number;
  lng: number;
}

interface RawPlaceFeature {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: { PP_CODE?: string; PARKING_PL?: string; NO_CAR?: number };
}

export async function fetchUraPlaces(): Promise<UraPlace[]> {
  const poll = await fetch(
    `https://api-open.data.gov.sg/v1/public/api/datasets/${URA_PLACES_DATASET}/poll-download`,
    { cache: 'no-store' },
  );
  if (!poll.ok) throw new Error(`data.gov.sg URA places ${poll.status}`);
  const link = ((await poll.json()) as { data?: { url?: string } }).data?.url;
  if (!link) throw new Error('data.gov.sg URA places: no download link');
  const res = await fetch(link, { cache: 'no-store' });
  if (!res.ok) throw new Error(`data.gov.sg URA places download ${res.status}`);
  const geo = (await res.json()) as { features?: RawPlaceFeature[] };

  const out: UraPlace[] = [];
  for (const f of geo.features ?? []) {
    const [lng, lat] = f.geometry?.coordinates ?? [];
    const code = f.properties?.PP_CODE?.trim();
    if (!code || typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat + lng)) continue;
    out.push({
      code,
      name: clean(f.properties?.PARKING_PL),
      carLots: f.properties?.NO_CAR ?? 0,
      lat,
      lng,
    });
  }
  console.log(`[URA] ${out.length} parking places from data.gov.sg`);
  return out;
}
