import { NextResponse } from 'next/server';
import { fetchTrends, historyConfigured } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

/** Trends for all of Singapore, or `?district=1..28`. Snapshots arrive every 15 minutes, so cache for 5. */
export async function GET(req: Request) {
  if (!historyConfigured()) {
    return NextResponse.json({ error: 'History is not configured.' }, { status: 503 });
  }
  const raw = new URL(req.url).searchParams.get('district');
  const district = raw == null ? null : Number(raw);
  if (district != null && !(Number.isInteger(district) && district >= 1 && district <= 28)) {
    return NextResponse.json({ error: 'district must be 1–28.' }, { status: 400 });
  }
  try {
    const res = NextResponse.json(await fetchTrends(district));
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res;
  } catch (err) {
    console.error('[history] trends failed:', err);
    return NextResponse.json({ error: 'Failed to load trends.' }, { status: 502 });
  }
}
