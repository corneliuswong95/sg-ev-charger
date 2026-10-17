import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { fetchEvBatchWithRetry } from '@/lib/server/data';
import { recordSnapshot } from '@/lib/server/history';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NEEDED = ['LTA_ACCOUNT_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const;

function authorized(req: Request, secret: string): boolean {
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Records one history snapshot (lib/server/history.ts). Called every 15
 * minutes by .github/workflows/history-snapshot.yml with `Authorization:
 * Bearer $CRON_SECRET`. Safe to call repeatedly: an LTA update is only
 * recorded once.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'History collection is not configured.' }, { status: 503 });
  }
  if (!authorized(req, secret)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const missing = NEEDED.filter(name => !process.env[name]);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Missing on the server: ${missing.join(', ')}.` }, { status: 500 });
  }

  try {
    const result = await recordSnapshot(await fetchEvBatchWithRetry());
    console.log(
      `[history] ${result.recorded ? 'recorded' : 'already had'} ${result.takenAt}: ` +
        `${result.stations} stations, ${result.plugs} plugs; catalogue ${result.catalogue}` +
        (result.priceChanges != null ? `, ${result.priceChanges} price changes` : ''),
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error('[history] snapshot failed:', err);
    return NextResponse.json({ error: 'Snapshot failed.', detail: String(err) }, { status: 502 });
  }
}
