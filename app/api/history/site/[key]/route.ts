import { NextResponse } from 'next/server';
import { fetchPopularTimes, historyConfigured } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

/** Popular times for one site; `key` is siteKey() from lib/chargers.ts. */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  if (!historyConfigured()) {
    return NextResponse.json({ error: 'History is not configured.' }, { status: 503 });
  }
  // Next has already decoded the segment.
  const key = params.key.trim();
  if (!key || key.length > 120) {
    return NextResponse.json({ error: 'Invalid site.' }, { status: 400 });
  }
  try {
    const res = NextResponse.json(await fetchPopularTimes(key));
    res.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res;
  } catch (err) {
    console.error('[history] popular times failed:', err);
    return NextResponse.json({ error: 'Failed to load popular times.' }, { status: 502 });
  }
}
