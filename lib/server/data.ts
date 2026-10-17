import type { ChargersResponse } from '@/lib/types';
import { ttlCache } from './cache';
import { fetchCarParkLots, fetchEvBatch } from './lta';
import { fetchHdbIndex } from './hdb';
import { fetchUraCarParks, fetchUraPlaces, uraConfigured } from './ura';
import { fetchOmIndex } from './onemotoring';
import { buildParkingMatcher, type ParkingSources } from './carparks';
import { normalizeStations } from './normalize';

const DAY = 24 * 60 * 60 * 1000;

// HDB car park attributes change rarely; refresh daily.
export const hdbIndex = ttlCache(DAY, fetchHdbIndex);

// URA car park rates (only if URA_ACCESS_KEY is set); URA updates daily.
export const uraCarParks = ttlCache(DAY, fetchUraCarParks);

// URA car park locations from data.gov.sg (no key needed).
export const uraPlaces = ttlCache(DAY, fetchUraPlaces);

// LTA OneMotoring's list of mall/office/hotel car parks.
export const omIndex = ttlCache(DAY, fetchOmIndex);

// Live lot counts for HDB, URA and major malls — LTA updates roughly every minute.
export const carParkLots = ttlCache(2 * 60 * 1000, fetchCarParkLots);

/** Parking sources are a bonus: a failure just means less parking info. */
function optional<T>(label: string, p: Promise<T>): Promise<T | null> {
  return p.catch(err => {
    console.warn(`[parking] ${label} unavailable:`, err);
    return null;
  });
}

export async function parkingSources(): Promise<ParkingSources> {
  const [hdb, ura, places, om, lots] = await Promise.all([
    optional('HDB car park index', hdbIndex.get()),
    uraConfigured() ? optional('URA car parks', uraCarParks.get()) : Promise.resolve(null),
    optional('URA parking places', uraPlaces.get()),
    optional('OneMotoring car parks', omIndex.get()),
    optional('LTA car park lots', carParkLots.get()),
  ]);
  return { hdb, ura, uraPlaces: places, om, lots };
}

/** LTA occasionally resets connections; one quick retry avoids most 502s. */
export async function fetchEvBatchWithRetry() {
  try {
    return await fetchEvBatch();
  } catch (err) {
    console.warn('[LTA] fetch failed, retrying once:', err);
    await new Promise(r => setTimeout(r, 800));
    return fetchEvBatch();
  }
}

export const chargers = ttlCache<ChargersResponse>(60_000, async () => {
  const [batch, sources] = await Promise.all([fetchEvBatchWithRetry(), parkingSources()]);
  const list = normalizeStations(batch.stations, buildParkingMatcher(sources));
  const by = { hdb: 0, ura: 0, jtc: 0, mall: 0 };
  for (const c of list) if (c.carPark) by[c.carPark.kind]++;
  console.log(
    `[LTA] ${list.length} stations; parking matched: ${by.hdb} HDB, ${by.ura} URA, ${by.jtc} JTC, ${by.mall} mall/other` +
      (sources.ura ? '' : ' (URA rates off: no URA_ACCESS_KEY)'),
  );
  return { updatedAt: batch.updatedAt, chargers: list };
});
