import { NextResponse } from 'next/server';
import type { ParkingKind } from '@/lib/types';
import { parkingSources } from '@/lib/server/data';
import { parkingDetails } from '@/lib/server/carparks';

export const dynamic = 'force-dynamic';

const KINDS: ParkingKind[] = ['hdb', 'ura', 'jtc', 'mall'];

export async function GET(_req: Request, { params }: { params: { kind: string; code: string } }) {
  const kind = params.kind as ParkingKind;
  // Next has already decoded the segment. HDB/URA codes are upper case; curated and mall ids lower.
  const code = kind === 'hdb' || kind === 'ura' ? params.code.trim().toUpperCase() : params.code.trim();
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: `Unknown parking source ${params.kind}.` }, { status: 404 });
  }
  try {
    const details = parkingDetails({ kind, code }, await parkingSources());
    if (!details) {
      return NextResponse.json({ error: `Unknown car park ${code}.` }, { status: 404 });
    }
    const res = NextResponse.json(details);
    res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res;
  } catch (err) {
    console.error('[parking] lookup failed:', err);
    return NextResponse.json({ error: 'Failed to load parking details.' }, { status: 502 });
  }
}
