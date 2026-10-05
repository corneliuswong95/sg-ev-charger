import { NextResponse } from 'next/server';
import type { CarParkResponse } from '@/lib/types';
import { hdbIndex, hdbLots } from '@/lib/server/data';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  // Next has already decoded the segment.
  const code = params.code.trim().toUpperCase();
  try {
    const index = await hdbIndex.get();
    const carPark = index.byCode.get(code);
    if (!carPark) {
      return NextResponse.json({ error: `Unknown HDB car park ${code}.` }, { status: 404 });
    }
    const lots = await hdbLots.get().catch(err => {
      console.warn('[LTA] car park lots unavailable:', err);
      return null;
    });
    const body: CarParkResponse = { carPark, lotsAvailable: lots?.get(code) ?? null };
    const res = NextResponse.json(body);
    res.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    return res;
  } catch (err) {
    console.error('[HDB] car park lookup failed:', err);
    return NextResponse.json({ error: 'Failed to load car park details.' }, { status: 502 });
  }
}
