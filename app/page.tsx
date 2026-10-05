'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import TopBar from '@/components/TopBar';
import Fabs from '@/components/Fabs';
import ChargerSheet from '@/components/ChargerSheet';
import StationListSheet from '@/components/StationListSheet';
import PricesView from '@/components/PricesView';
import TabBar, { type Tab } from '@/components/TabBar';
import { BoltIcon } from '@/components/Icons';
import type { MapHandle } from '@/components/MapView';
import type { Charger, ChargersResponse, FilterKey } from '@/lib/types';
import { matchesFilters, matchesOperator, matchesQuery } from '@/lib/chargers';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => null,
});

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const BG_REFRESH_MS = 2 * 60 * 1000;
const SEARCH_FIT_DELAY_MS = 450;
const DESKTOP = '(min-width: 768px)';

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia(DESKTOP).matches;

/** Pixel shift so a flown-to station lands in the part of the map not covered by a sheet. */
function sheetOffset(): [number, number] {
  if (typeof window === 'undefined') return [0, 0];
  if (isDesktop()) return [-212, 0];
  // Detail sheet covers the bottom ~72%; put the pin in the strip above it.
  return [0, Math.round(window.innerHeight * 0.3)];
}

/** Map area left visible by the top bar and sheets: [top, right, bottom, left]. */
function visiblePadding(): [number, number, number, number] {
  if (isDesktop()) return [40, 60, 40, 440];
  // Mobile: list sheet expands over most of the screen while searching, so
  // fit into the strip under the top bar.
  return [130, 30, Math.round(window.innerHeight * 0.62), 30];
}

type Notice = { message: string; retry: boolean };

export default function Home() {
  const [data, setData]               = useState<ChargersResponse>({ updatedAt: null, chargers: [] });
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [notice, setNotice]           = useState<Notice | null>(null);
  const [tab, setTab]                 = useState<Tab>('map');
  const [pricesVisited, setPricesVisited] = useState(false);
  const [filters, setFilters]         = useState<FilterKey[]>([]);
  const [operator, setOperator]       = useState<string | null>(null);
  const [query, setQuery]             = useState('');
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [listExpanded, setListExpanded] = useState(false);
  const [userPos, setUserPos]         = useState<[number, number] | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [mapCenter, setMapCenter]     = useState<[number, number] | null>(null);

  const mapRef = useRef<MapHandle | null>(null);
  const mapUiRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const loadChargers = useCallback(async (isRefresh = false, attempt = 1): Promise<void> => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    if (isRefresh) setRefreshing(true);
    else if (attempt === 1) setLoading(true);
    setNotice(null);

    try {
      const res = await fetch('/api/chargers', { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: ChargersResponse = await res.json();
      if (ctrl.signal.aborted) return;
      setData(body);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(`[loadChargers] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(() => loadChargers(isRefresh, attempt + 1), RETRY_DELAY_MS);
        return;
      }
      setNotice({ message: 'Couldn’t load live charger data from LTA.', retry: true });
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
        setData(await res.json());
      } catch {
        // silent — keep the data we have
      }
    }, BG_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Keep hidden map controls out of the tab order and accessibility tree
  // while the Prices tab covers them. (React 18 has no `inert` prop.)
  useEffect(() => {
    const el = mapUiRef.current;
    if (!el) return;
    el.toggleAttribute('inert', tab === 'prices');
    el.setAttribute('aria-hidden', String(tab === 'prices'));
  }, [tab]);

  const chargers = data.chargers;

  // Everything except the operator filter, so the operator menu can show
  // counts that match what the user would get.
  const preOperator = useMemo(
    () => chargers.filter(c => matchesFilters(c, filters) && matchesQuery(c, query)),
    [chargers, filters, query],
  );
  const filtered = useMemo(
    () => preOperator.filter(c => matchesOperator(c, operator)),
    [preOperator, operator],
  );

  // Look the selection up by id so an open sheet picks up refreshed availability.
  const selected = useMemo(
    () => (selectedId ? chargers.find(c => c.id === selectedId) ?? null : null),
    [chargers, selectedId],
  );

  // Move the map to search results once the user pauses typing.
  useEffect(() => {
    if (!query.trim() || filtered.length === 0 || filtered.length > 400) return;
    const t = setTimeout(() => {
      mapRef.current?.fitBounds(filtered.map(c => [c.lat, c.lng]), visiblePadding());
    }, SEARCH_FIT_DELAY_MS);
    return () => clearTimeout(t);
    // Only re-fit when the query (or the matching set) changes, not on data refresh.
  }, [query, filtered.length]);

  const handleSelect = useCallback((c: Charger) => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      openerRef.current = document.activeElement;
    }
    setSelectedId(c.id);
    setTab('map');
    mapRef.current?.flyTo(c.lat, c.lng, undefined, sheetOffset());
  }, []);

  const closeSheet = useCallback(() => {
    setSelectedId(null);
    // Return focus to whatever opened the sheet, if it's still on screen.
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected) requestAnimationFrame(() => opener.focus({ preventScroll: true }));
  }, []);

  const handleMapReady = useCallback((h: MapHandle) => {
    mapRef.current = h;
    setMapCenter(h.getCenter());
  }, []);
  const handleMapMove = useCallback((c: [number, number]) => setMapCenter(c), []);

  function handleQuery(q: string) {
    setQuery(q);
    if (q.trim() && !query.trim()) setListExpanded(true);
  }

  function toggleFilter(k: FilterKey) {
    setFilters(f => (f.includes(k) ? f.filter(x => x !== k) : [...f, k]));
  }

  function clearFilters() {
    setFilters([]);
    setOperator(null);
    setQuery('');
  }

  function changeTab(t: Tab) {
    setTab(t);
    if (t === 'prices') setPricesVisited(true);
  }

  function locateUser(fly = true) {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      setNotice({ message: 'This browser can’t share your location.', retry: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ll: [number, number] = [coords.latitude, coords.longitude];
        setUserPos(ll);
        setLocationDenied(false);
        if (fly) {
          setListExpanded(false);
          mapRef.current?.flyTo(ll[0], ll[1], 15);
        }
      },
      () => {
        setLocationDenied(true);
        setNotice({
          message: 'Location is off. Allow location access in your browser to sort chargers by distance.',
          retry: false,
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const origin = userPos ?? mapCenter;
  const hasFilters = filters.length > 0 || operator != null;

  return (
    <>
      {loading && (
        <div className="loading-screen" role="status">
          <div className="loading-mark"><BoltIcon size={32} /></div>
          <div className="loading-label">Loading live charger data</div>
        </div>
      )}

      <div ref={mapUiRef}>
        <MapView
          chargers={filtered}
          selected={selected}
          onSelect={handleSelect}
          onMapClick={closeSheet}
          onReady={handleMapReady}
          onMove={handleMapMove}
          userPos={userPos}
        />

        <TopBar
          query={query}
          onQueryChange={handleQuery}
          filters={filters}
          onToggleFilter={toggleFilter}
          operatorSource={preOperator}
          operator={operator}
          onOperatorChange={setOperator}
          refreshing={refreshing}
          onRefresh={() => loadChargers(true)}
        />

        <Fabs
          onZoomIn={() => mapRef.current?.zoomIn()}
          onZoomOut={() => mapRef.current?.zoomOut()}
          onLocate={() => locateUser(true)}
          located={userPos != null}
          hidden={listExpanded}
        />

        <StationListSheet
          chargers={filtered}
          origin={origin}
          originIsUser={userPos != null}
          query={query}
          updatedAt={data.updatedAt}
          selectedId={selectedId}
          onSelect={handleSelect}
          expanded={listExpanded}
          onExpandedChange={setListExpanded}
          hasFilters={hasFilters}
          onClearFilters={clearFilters}
          onClearSearch={() => setQuery('')}
        />
      </div>

      {pricesVisited && (
        <div hidden={tab !== 'prices'}>
          <PricesView
            chargers={chargers}
            updatedAt={data.updatedAt}
            userPos={userPos}
            locationDenied={locationDenied}
            onRequestLocation={() => locateUser(false)}
            onOpenStation={handleSelect}
          />
        </div>
      )}

      <TabBar tab={tab} onChange={changeTab} />

      <ChargerSheet charger={selected} updatedAt={data.updatedAt} onClose={closeSheet} />

      {notice && (
        <div className="toast" role="alert">
          <span>{notice.message}</span>
          {notice.retry && (
            <button onClick={() => { setNotice(null); loadChargers(chargers.length > 0); }}>Retry</button>
          )}
          <button onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </>
  );
}
