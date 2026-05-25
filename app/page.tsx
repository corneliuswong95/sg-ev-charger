'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import FilterChips from '@/components/FilterChips';
import OperatorFilter from '@/components/OperatorFilter';
import Fabs from '@/components/Fabs';
import ChargerSheet from '@/components/ChargerSheet';
import NearbySheet from '@/components/NearbySheet';
import type { MapHandle } from '@/components/MapView';
import type { Charger, FilterKey } from '@/lib/types';
import { matchesFilter, matchesOperator } from '@/lib/chargers';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => null,
});

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const BG_REFRESH_MS = 2 * 60 * 1000;

export default function Home() {
  const [chargers, setChargers]       = useState<Charger[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [filter, setFilter]           = useState<FilterKey>('all');
  const [operator, setOperator]       = useState<string | null>(null);
  const [selected, setSelected]       = useState<Charger | null>(null);
  const [userPos, setUserPos]         = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter]     = useState<[number, number] | null>(null);

  const mapRef = useRef<MapHandle | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const loadChargers = useCallback(async (isRefresh = false, attempt = 1): Promise<void> => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    if (isRefresh) setRefreshing(true);
    else if (attempt === 1) setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chargers', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Charger[] = await res.json();
      if (ctrl.signal.aborted) return;
      setChargers(data);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(`[loadChargers] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => loadChargers(isRefresh, attempt + 1), RETRY_DELAY_MS);
        return;
      }
      setError('Failed to load charger data. Tap to retry.');
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadChargers();
    return () => inFlight.current?.abort();
  }, [loadChargers]);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/chargers');
        if (!res.ok) return;
        const data: Charger[] = await res.json();
        setChargers(data);
      } catch {
        // silent — leave existing data in place
      }
    }, BG_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => chargers.filter(c => matchesFilter(c, filter) && matchesOperator(c, operator)),
    [chargers, filter, operator],
  );

  const handleSelect = useCallback((c: Charger) => {
    setSelected(c);
    mapRef.current?.flyTo(c.lat, c.lng);
  }, []);

  const handleMapClick = useCallback(() => setSelected(null), []);
  const handleMapReady = useCallback((h: MapHandle) => {
    mapRef.current = h;
    setMapCenter(h.getCenter());
  }, []);
  const handleMapMove = useCallback((c: [number, number]) => setMapCenter(c), []);

  function handleRefresh() {
    setSelected(null);
    loadChargers(true);
  }

  function locateUser() {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ll: [number, number] = [coords.latitude, coords.longitude];
        setUserPos(ll);
        mapRef.current?.flyTo(ll[0], ll[1], 15);
      },
      () => setError('Could not get your location.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const nearbyOrigin = userPos ?? mapCenter;
  const originLabel: 'You' | 'Map center' = userPos ? 'You' : 'Map center';

  return (
    <>
      {loading && (
        <div className="loading-screen">
          <div className="spinner" />
          <div className="loading-label">Loading EV chargers…</div>
        </div>
      )}

      <Header count={filtered.length} refreshing={refreshing} onRefresh={handleRefresh} />
      <div className="chips-wrap">
        <FilterChips active={filter} onChange={setFilter} />
        <OperatorFilter chargers={chargers} value={operator} onChange={setOperator} />
      </div>

      <MapView
        chargers={filtered}
        onSelect={handleSelect}
        onMapClick={handleMapClick}
        onReady={handleMapReady}
        onMove={handleMapMove}
        userPos={userPos}
      />

      <Fabs
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onLocate={locateUser}
      />

      <NearbySheet
        chargers={filtered}
        origin={nearbyOrigin}
        originLabel={originLabel}
        selectedId={selected?.id ?? null}
        onSelect={handleSelect}
        hidden={loading || !!selected}
      />

      <ChargerSheet charger={selected} onClose={() => setSelected(null)} />

      {error && (
        <div className="toast show" onClick={() => loadChargers(false)}>
          {error}
        </div>
      )}
    </>
  );
}
