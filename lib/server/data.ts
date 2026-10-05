import type { ChargersResponse } from '@/lib/types';
import { ttlCache } from './cache';
import { fetchEvBatch, fetchHdbLots } from './lta';
import { fetchHdbIndex } from './hdb';
import { normalizeStations } from './normalize';

// HDB car park attributes change rarely; refresh daily.
export const hdbIndex = ttlCache(24 * 60 * 60 * 1000, fetchHdbIndex);

// Live lot counts — LTA updates roughly every minute.
export const hdbLots = ttlCache(2 * 60 * 1000, fetchHdbLots);

/** LTA occasionally resets connections; one quick retry avoids most 502s. */
async function fetchEvBatchWithRetry() {
  try {
    return await fetchEvBatch();
  } catch (err) {
    console.warn('[LTA] fetch failed, retrying once:', err);
    await new Promise(r => setTimeout(r, 800));
    return fetchEvBatch();
  }
}

export const chargers = ttlCache<ChargersResponse>(60_000, async () => {
  const [batch, hdb] = await Promise.all([
    fetchEvBatchWithRetry(),
    // Parking info is a bonus: never let it take down the charger list.
    hdbIndex.get().catch(err => {
      console.warn('[HDB] car park index unavailable:', err);
      return null;
    }),
  ]);
  const list = normalizeStations(batch.stations, hdb?.match ?? null);
  console.log(
    `[LTA] ${list.length} stations, ${list.filter(c => c.carPark).length} matched to HDB car parks`,
  );
  return { updatedAt: batch.updatedAt, chargers: list };
});
