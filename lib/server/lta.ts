const DATAMALL = 'https://datamall2.mytransport.sg/ltaodataservice';
const EVCBATCH_URL = `${DATAMALL}/EVCBatch`;
const CARPARK_URL = `${DATAMALL}/CarParkAvailabilityv2`;

export interface RawEvId {
  evCpId?: string;
  status?: string;
}

export interface RawPlug {
  plugType?: string;
  current?: string;
  powerRating?: string;
  price?: string;
  priceType?: string;
  evIds?: RawEvId[];
}

export interface RawChargingPoint {
  status?: string;
  operator?: string;
  name?: string;
  position?: string;
  plugTypes?: RawPlug[];
}

export interface RawStation {
  address?: string;
  name?: string;
  longtitude?: string | number;
  latitude?: string | number;
  postalCode?: string;
  chargingPoints?: RawChargingPoint[];
}

export interface EvBatch {
  updatedAt: string | null;
  stations: RawStation[];
}

function accountKey(): string {
  const key = process.env.LTA_ACCOUNT_KEY;
  if (!key) throw new Error('LTA_ACCOUNT_KEY is not set on the server.');
  return key;
}

async function fetchLink(key: string): Promise<string> {
  const res = await fetch(EVCBATCH_URL, {
    headers: { AccountKey: key, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LTA EVCBatch ${res.status}: ${body.slice(0, 300)}`);
  }
  const envelope = (await res.json()) as { value?: Array<{ Link?: string }>; Link?: string };
  const link = envelope.value?.[0]?.Link ?? envelope.Link;
  if (!link) throw new Error('LTA EVCBatch response missing Link.');
  return link;
}

function linkIsLive(url: string): boolean {
  // Presigned URLs carry X-Amz-Date + X-Amz-Expires (seconds). If we can read
  // both, skip dead links instead of wasting a round-trip.
  try {
    const u = new URL(url);
    const date = u.searchParams.get('X-Amz-Date');
    const expires = u.searchParams.get('X-Amz-Expires');
    if (!date || !expires) return true;
    const iso = date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z',
    );
    const issuedAt = Date.parse(iso);
    if (!Number.isFinite(issuedAt)) return true;
    return issuedAt + Number(expires) * 1000 - Date.now() > 10_000;
  } catch {
    return true;
  }
}

/** LTA's "2026-10-04 21:40:00" is Singapore time. */
function parseLtaTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchEvBatch(): Promise<EvBatch> {
  const key = accountKey();
  let link = await fetchLink(key);
  if (!linkIsLive(link)) {
    console.warn('[LTA] EVCBatch returned a stale link; requesting a fresh one.');
    link = await fetchLink(key);
  }

  let res = await fetch(link, { cache: 'no-store' });
  if (res.status === 403) {
    // LTA occasionally re-hands a presigned URL whose window is already
    // burned. Retry once with a fresh envelope.
    console.warn('[LTA] S3 returned 403; retrying with a fresh link.');
    link = await fetchLink(key);
    res = await fetch(link, { cache: 'no-store' });
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LTA S3 ${res.status}: ${body.slice(0, 300)}`);
  }

  // Current shape is { LastUpdatedTime, evLocationsData: [...] }, but older
  // payloads were a bare array or wrapped under a different key.
  const raw = (await res.json()) as unknown;
  if (Array.isArray(raw)) return { updatedAt: null, stations: raw as RawStation[] };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const updatedAt = parseLtaTime(obj.LastUpdatedTime);
    for (const k of Object.keys(obj)) {
      if (Array.isArray(obj[k])) return { updatedAt, stations: obj[k] as RawStation[] };
    }
  }
  return { updatedAt: null, stations: [] };
}

interface RawCarParkLot {
  CarParkID?: string;
  AvailableLots?: number;
  LotType?: string;
  Agency?: string;
}

/** Live free car lots for HDB car parks, keyed by HDB car park number. */
export async function fetchHdbLots(): Promise<Map<string, number>> {
  const key = accountKey();
  const lots = new Map<string, number>();
  // DataMall pages at 500 records; ~2,500 car parks today. Cap the loop so a
  // misbehaving API can't spin forever.
  for (let skip = 0; skip < 10_000; skip += 500) {
    const res = await fetch(`${CARPARK_URL}?$skip=${skip}`, {
      headers: { AccountKey: key, accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`LTA CarParkAvailability ${res.status}`);
    const page = ((await res.json()) as { value?: RawCarParkLot[] }).value ?? [];
    for (const r of page) {
      if (r.Agency === 'HDB' && r.LotType === 'C' && r.CarParkID && typeof r.AvailableLots === 'number') {
        lots.set(r.CarParkID, r.AvailableLots);
      }
    }
    if (page.length < 500) break;
  }
  return lots;
}
