import { NextResponse } from 'next/server';
import type { Charger, ChargingPoint } from '@/lib/types';

const EVCBATCH_URL = 'https://datamall2.mytransport.sg/ltaodataservice/EVCBatch';

export const revalidate = 60;

interface LTAEVCBatchEnvelope {
  value?: Array<{ Link?: string }>;
  Link?: string;
}

interface LTAStation {
  address?: string;
  name?: string;
  longtitude?: string | number;
  latitude?: string | number;
  postalCode?: string;
  chargingPoints?: ChargingPoint[];
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function deriveAvailability(cps: ChargingPoint[]): { available: number; total: number } {
  let available = 0;
  for (const cp of cps) {
    if (String(cp.status) === '1') available += 1;
  }
  return { available, total: cps.length };
}

function normalize(s: LTAStation, i: number): Charger | null {
  const lat = toNumber(s.latitude);
  const lng = toNumber(s.longtitude);
  if (lat == null || lng == null) return null;

  const cps = s.chargingPoints ?? [];
  const { available, total } = deriveAvailability(cps);
  const operator = cps.find(cp => cp.operator)?.operator ?? 'Unknown';

  return {
    id: `${s.postalCode ?? 'sg'}-${i}-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    name: s.name ?? 'EV Charger',
    address: s.address ?? '',
    lat,
    lng,
    operator,
    available,
    total,
    chargingPoints: cps,
  };
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
    const linkRes = await fetch(EVCBATCH_URL, {
      headers: { AccountKey: key, accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!linkRes.ok) {
      const body = await linkRes.text();
      console.error(`[LTA] EVCBatch ${linkRes.status}: ${body.slice(0, 300)}`);
      return NextResponse.json(
        { error: `LTA EVCBatch ${linkRes.status}`, detail: body.slice(0, 300) },
        { status: 502 },
      );
    }

    const envelope = (await linkRes.json()) as LTAEVCBatchEnvelope;
    const downloadUrl = envelope.value?.[0]?.Link ?? envelope.Link;
    if (!downloadUrl) {
      console.error('[LTA] EVCBatch missing Link in response:', envelope);
      return NextResponse.json(
        { error: 'LTA EVCBatch response missing Link.' },
        { status: 502 },
      );
    }

    const dataRes = await fetch(downloadUrl, { cache: 'no-store' });
    if (!dataRes.ok) {
      const body = await dataRes.text();
      console.error(`[LTA] S3 ${dataRes.status}: ${body.slice(0, 300)}`);
      return NextResponse.json(
        { error: `LTA S3 download ${dataRes.status}`, detail: body.slice(0, 300) },
        { status: 502 },
      );
    }

    const raw = (await dataRes.json()) as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      console.log('[LTA] S3 top-level keys:', Object.keys(raw as Record<string, unknown>));
      const firstArrayKey = Object.entries(raw as Record<string, unknown>).find(
        ([, v]) => Array.isArray(v),
      )?.[0];
      console.log('[LTA] first array key:', firstArrayKey,
        'len:', firstArrayKey ? (raw as Record<string, unknown[]>)[firstArrayKey].length : 0);
    } else if (Array.isArray(raw)) {
      console.log('[LTA] S3 returned top-level array of length:', raw.length);
      if (raw.length > 0) console.log('[LTA] first item keys:', Object.keys(raw[0] ?? {}));
    }

    const stations: LTAStation[] = (() => {
      if (Array.isArray(raw)) return raw as LTAStation[];
      if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key])) return obj[key] as LTAStation[];
        }
      }
      return [];
    })();

    const chargers = stations
      .map(normalize)
      .filter((c): c is Charger => c !== null);

    console.log(`[LTA] EVCBatch → ${chargers.length} chargers (raw ${stations.length})`);
    return NextResponse.json(chargers);
  } catch (err) {
    console.error('[LTA] fetch failed:', err);
    return NextResponse.json(
      { error: 'Failed to reach LTA DataMall.', detail: String(err) },
      { status: 502 },
    );
  }
}
