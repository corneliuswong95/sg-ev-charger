import { NextResponse } from 'next/server';
import type { Charger, PlugSummary } from '@/lib/types';

const EVCBATCH_URL = 'https://datamall2.mytransport.sg/ltaodataservice/EVCBatch';
const CACHE_TTL_MS = 60_000;

export const dynamic = 'force-dynamic';

interface LTAEnvelope {
  value?: Array<{ Link?: string }>;
  Link?: string;
}

interface RawPlug {
  plugType?: string;
  current?: string;
  powerRating?: string;
  price?: string;
  priceType?: string;
}

interface RawChargingPoint {
  status?: string;
  operator?: string;
  plugTypes?: RawPlug[];
}

interface RawStation {
  address?: string;
  name?: string;
  longtitude?: string | number;
  latitude?: string | number;
  postalCode?: string;
  chargingPoints?: RawChargingPoint[];
}

let cache: { data: Charger[]; expiresAt: number } | null = null;
let inFlight: Promise<Charger[]> | null = null;

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function summarizePlugs(cps: RawChargingPoint[]): { plugs: PlugSummary[]; maxKw: number; hasDC: boolean } {
  const map = new Map<string, PlugSummary>();
  let maxKw = 0;
  let hasDC = false;
  for (const cp of cps) {
    for (const pt of cp.plugTypes ?? []) {
      const kw = Number(pt.powerRating);
      const safeKw = Number.isFinite(kw) ? kw : 0;
      if (safeKw > maxKw) maxKw = safeKw;
      if ((pt.current ?? '').toUpperCase() === 'DC') hasDC = true;
      const key = `${pt.plugType}|${pt.current}|${safeKw}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const priceNum = pt.price != null ? Number(pt.price) : undefined;
        map.set(key, {
          plugType: pt.plugType ?? 'Unknown',
          current: pt.current ?? '',
          kw: safeKw,
          count: 1,
          price: priceNum != null && Number.isFinite(priceNum) ? priceNum : undefined,
          priceType: pt.priceType,
        });
      }
    }
  }
  return {
    plugs: [...map.values()].sort((a, b) => b.kw - a.kw),
    maxKw,
    hasDC,
  };
}

function normalize(s: RawStation, i: number): Charger | null {
  const lat = toNumber(s.latitude);
  const lng = toNumber(s.longtitude);
  if (lat == null || lng == null) return null;

  const cps = s.chargingPoints ?? [];
  const available = cps.filter(cp => String(cp.status) === '1').length;
  const total = cps.length;
  const operator = cps.find(cp => cp.operator)?.operator ?? 'Unknown';
  const { plugs, maxKw, hasDC } = summarizePlugs(cps);

  return {
    id: `${s.postalCode ?? 'sg'}-${i}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    name: s.name ?? 'EV Charger',
    address: s.address ?? '',
    lat,
    lng,
    operator,
    available,
    total,
    maxKw,
    hasDC,
    plugs,
  };
}

async function fetchLink(key: string): Promise<string> {
  const linkRes = await fetch(EVCBATCH_URL, {
    headers: { AccountKey: key, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!linkRes.ok) {
    const body = await linkRes.text();
    throw new Error(`LTA EVCBatch ${linkRes.status}: ${body.slice(0, 300)}`);
  }
  const envelope = (await linkRes.json()) as LTAEnvelope;
  const downloadUrl = envelope.value?.[0]?.Link ?? envelope.Link;
  if (!downloadUrl) throw new Error('LTA EVCBatch response missing Link.');
  return downloadUrl;
}

function linkIsLive(url: string): boolean {
  // Presigned URLs carry X-Amz-Date + X-Amz-Expires (seconds). If we can read
  // both, skip dead links instead of wasting a round-trip.
  try {
    const u = new URL(url);
    const date = u.searchParams.get('X-Amz-Date');
    const expires = u.searchParams.get('X-Amz-Expires');
    if (!date || !expires) return true;
    // X-Amz-Date is ISO-basic: YYYYMMDDTHHMMSSZ
    const iso = date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    const issuedAt = Date.parse(iso);
    if (!Number.isFinite(issuedAt)) return true;
    const expiresMs = Number(expires) * 1000;
    // Treat as dead if <10s of life remaining.
    return issuedAt + expiresMs - Date.now() > 10_000;
  } catch {
    return true;
  }
}

async function fetchFromLTA(key: string): Promise<Charger[]> {
  let downloadUrl = await fetchLink(key);
  let dataRes: Response;

  if (linkIsLive(downloadUrl)) {
    dataRes = await fetch(downloadUrl, { cache: 'no-store' });
  } else {
    console.warn('[LTA] EVCBatch returned a stale link; requesting a fresh one.');
    downloadUrl = await fetchLink(key);
    dataRes = await fetch(downloadUrl, { cache: 'no-store' });
  }

  if (dataRes.status === 403) {
    // LTA occasionally re-hands a presigned URL whose 5-minute window is
    // already burned. Retry once with a fresh envelope.
    console.warn('[LTA] S3 returned 403; retrying with a fresh link.');
    downloadUrl = await fetchLink(key);
    dataRes = await fetch(downloadUrl, { cache: 'no-store' });
  }

  if (!dataRes.ok) {
    const body = await dataRes.text();
    throw new Error(`LTA S3 ${dataRes.status}: ${body.slice(0, 300)}`);
  }

  const raw = (await dataRes.json()) as unknown;
  const stations: RawStation[] = (() => {
    if (Array.isArray(raw)) return raw as RawStation[];
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      for (const k of Object.keys(obj)) {
        if (Array.isArray(obj[k])) return obj[k] as RawStation[];
      }
    }
    return [];
  })();

  return stations
    .map(normalize)
    .filter((c): c is Charger => c !== null);
}

async function getChargers(key: string): Promise<{ data: Charger[]; fromCache: boolean }> {
  if (cache && cache.expiresAt > Date.now()) {
    return { data: cache.data, fromCache: true };
  }
  if (inFlight) {
    const data = await inFlight;
    return { data, fromCache: false };
  }
  inFlight = (async () => {
    const data = await fetchFromLTA(key);
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  })();
  try {
    const data = await inFlight;
    return { data, fromCache: false };
  } finally {
    inFlight = null;
  }
}

export async function GET() {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'LTA_ACCOUNT_KEY is not set on the server.' },
      { status: 500 },
    );
  }

  try {
    const { data, fromCache } = await getChargers(key);
    console.log(`[LTA] returned ${data.length} chargers (cache=${fromCache})`);
    const res = NextResponse.json(data);
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res;
  } catch (err) {
    console.error('[LTA] fetch failed:', err);
    if (cache) {
      console.log(`[LTA] returning stale cache (${cache.data.length} chargers)`);
      return NextResponse.json(cache.data);
    }
    return NextResponse.json(
      { error: 'Failed to reach LTA DataMall.', detail: String(err) },
      { status: 502 },
    );
  }
}
