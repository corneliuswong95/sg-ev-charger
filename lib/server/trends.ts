import type { HistoryTrends, PopularTimes, StationHistory } from '@/lib/types';
import { SG_PUBLIC_HOLIDAYS } from '@/lib/holidays';
import { rpc, select } from './supabase';

// Read side of the history (written by lib/server/history.ts).

export function historyConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

export function fetchTrends(district: number | null): Promise<HistoryTrends> {
  return rpc<HistoryTrends>('history_trends', { p_district: district, p_holidays: SG_PUBLIC_HOLIDAYS });
}

export function fetchStationHistory(stationId: string): Promise<StationHistory> {
  return rpc<StationHistory>('station_history', { p_station_id: stationId });
}

const SLOTS = 168;
const zeros = () => new Array<number>(SLOTS).fill(0);

/** A site with no history yet gets all-zero slots. */
export async function fetchPopularTimes(siteKey: string): Promise<PopularTimes> {
  const [rows, first] = await Promise.all([
    select<{ reporting: number[]; plugs: number[]; in_use: number[]; full_count: number[] }>(
      'site_hours',
      `select=reporting,plugs,in_use,full_count&site_key=eq.${encodeURIComponent(siteKey)}`,
    ),
    select<{ taken_at: string }>('snapshots', 'select=taken_at&order=taken_at.asc&limit=1'),
  ]);
  const row = rows[0];
  return {
    since: first[0]?.taken_at ?? null,
    reporting: row?.reporting ?? zeros(),
    plugs: row?.plugs ?? zeros(),
    inUse: row?.in_use ?? zeros(),
    full: row?.full_count ?? zeros(),
  };
}
