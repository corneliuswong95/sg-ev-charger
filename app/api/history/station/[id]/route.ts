import { NextResponse } from 'next/server';
import { fetchStationHistory, historyConfigured } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

/** One station's last 28 days and price changes; `id` is Charger.id. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!historyConfigured()) {
    return NextResponse.json({ error: 'History is not configured.' }, { status: 503 });
  }
  const id = params.id.trim();
  if (!/^[\w-]{1,80}$/.test(id)) {
    return NextResponse.json({ error: 'Invalid station.' }, { status: 400 });
  }
  try {
    const res = NextResponse.json(await fetchStationHistory(id));
    res.headers.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    return res;
  } catch (err) {
    // Code deployed before db/history.sql was re-run: hide the section rather than show an error.
    if (String(err).includes('PGRST202')) {
      return NextResponse.json({ error: 'Station history is not set up yet.' }, { status: 503 });
    }
    console.error('[history] station history failed:', err);
    return NextResponse.json({ error: 'Failed to load station history.' }, { status: 502 });
  }
}
