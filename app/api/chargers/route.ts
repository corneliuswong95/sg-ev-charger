import { NextResponse } from 'next/server';
import { chargers } from '@/lib/server/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.LTA_ACCOUNT_KEY) {
    return NextResponse.json(
      { error: 'LTA_ACCOUNT_KEY is not set on the server.' },
      { status: 500 },
    );
  }
  try {
    const data = await chargers.get();
    const res = NextResponse.json(data);
    res.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    return res;
  } catch (err) {
    console.error('[LTA] fetch failed:', err);
    return NextResponse.json(
      { error: 'Failed to reach LTA DataMall.', detail: String(err) },
      { status: 502 },
    );
  }
}
