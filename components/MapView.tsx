'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { Charger, Status } from '@/lib/types';
import { FAST_KW, getStatus } from '@/lib/chargers';

const SG_CENTER: [number, number] = [1.3521, 103.8198];
const ZOOM_INIT = 12;
// OneMap only covers Singapore.
const SG_BOUNDS: [[number, number], [number, number]] = [[1.14, 103.55], [1.50, 104.12]];

export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  /** `offset` shifts the view (px) so the station isn't hidden under a sheet. */
  flyTo: (lat: number, lng: number, zoom?: number, offset?: [number, number]) => void;
  /** Fit the view to these points, keeping `padding` px clear [top, right, bottom, left]. */
  fitBounds: (points: [number, number][], padding: [number, number, number, number]) => void;
  getCenter: () => [number, number];
}

interface Props {
  chargers: Charger[];
  selected: Charger | null;
  onSelect: (c: Charger) => void;
  onMapClick: () => void;
  onReady: (handle: MapHandle) => void;
  onMove?: (center: [number, number]) => void;
  userPos: [number, number] | null;
}

// Icons are cached by appearance so unchanged markers keep the same icon
// object and Leaflet doesn't re-render their DOM on every data refresh.
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(status: Status, free: number, fast: boolean, selected = false): L.DivIcon {
  const label = status === 'offline' ? '–' : String(Math.min(free, 99));
  const key = `${status}|${label}|${fast}|${selected}`;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const w = fast ? 34 : 28;
  const h = w + 6;
  const cls = `pin pin-${status}${fast ? ' pin-fast' : ''}${selected ? ' pin-selected' : ''}`;
  const icon = L.divIcon({
    html: `<div class="${cls}">${label}</div>`,
    className: `pin-wrap pin-wrap-${status}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
  iconCache.set(key, icon);
  return icon;
}

// Minimal shape of leaflet.markercluster's cluster (not in @types/leaflet).
interface Cluster {
  getAllChildMarkers(): L.Marker[];
}

function clusterIcon(cluster: Cluster) {
  const markers = cluster.getAllChildMarkers();
  const count = markers.length;
  let free = 0;
  for (const m of markers) {
    const cls = (m.options.icon?.options as L.DivIconOptions | undefined)?.className ?? '';
    if (cls.includes('pin-wrap-available')) free++;
  }
  const pct = Math.round((free / count) * 100);
  const size = count < 10 ? 34 : count < 100 ? 40 : 48;
  return L.divIcon({
    // Ring shows the share of stations here with a free connector.
    html: `<div class="cluster" style="background:conic-gradient(var(--go-fill) ${pct}%, #fff ${pct}% 100%)"><span>${count}</span></div>`,
    className: '',
    iconSize: [size, size],
  });
}

function MapBindings({
  onMapClick,
  onReady,
  onMove,
}: {
  onMapClick: () => void;
  onReady: (h: MapHandle) => void;
  onMove?: (center: [number, number]) => void;
}) {
  const map = useMap();
  const readyRef = useRef(false);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady({
      zoomIn: () => { map.zoomIn(); },
      zoomOut: () => { map.zoomOut(); },
      flyTo: (lat, lng, zoom, offset) => {
        const z = zoom ?? Math.max(map.getZoom(), 16);
        let target = L.latLng(lat, lng);
        if (offset && (offset[0] || offset[1])) {
          target = map.unproject(map.project(target, z).add(L.point(offset[0], offset[1])), z);
        }
        map.flyTo(target, z, { duration: 0.6 });
      },
      fitBounds: (points, [top, right, bottom, left]) => {
        if (points.length === 0) return;
        map.flyToBounds(L.latLngBounds(points), {
          paddingTopLeft: [left, top],
          paddingBottomRight: [right, bottom],
          maxZoom: 16,
          duration: 0.6,
        });
      },
      getCenter: () => { const c = map.getCenter(); return [c.lat, c.lng]; },
    });
  }, [map, onReady]);

  useEffect(() => {
    map.on('click', onMapClick);
    return () => { map.off('click', onMapClick); };
  }, [map, onMapClick]);

  useEffect(() => {
    if (!onMove) return;
    const handler = () => {
      const c = map.getCenter();
      onMove([c.lat, c.lng]);
    };
    map.on('moveend', handler);
    return () => { map.off('moveend', handler); };
  }, [map, onMove]);

  return null;
}

const userIcon = () =>
  L.divIcon({ html: '<div class="user-dot"></div>', className: '', iconSize: [18, 18] });

export default function MapView({
  chargers, selected, onSelect, onMapClick, onReady, onMove, userPos,
}: Props) {
  const markers = useMemo(
    () =>
      chargers.map(c => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={pinIcon(getStatus(c), c.available, c.maxKw >= FAST_KW)}
          title={c.name}
          eventHandlers={{ click: () => onSelect(c) }}
        />
      )),
    [chargers, onSelect],
  );

  const you = useMemo(userIcon, []);

  return (
    <MapContainer
      center={SG_CENTER}
      zoom={ZOOM_INIT}
      zoomControl={false}
      minZoom={11}
      maxBounds={SG_BOUNDS}
      maxBoundsViscosity={0.8}
    >
      {/* OneMap (Singapore Land Authority) — free, no key, attribution required. */}
      <TileLayer
        url="https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png"
        minZoom={11}
        maxZoom={19}
        detectRetina
        attribution='<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:14px;width:14px;vertical-align:-3px"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'
      />
      <MapBindings onMapClick={onMapClick} onReady={onReady} onMove={onMove} />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={64}
        disableClusteringAtZoom={16}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom={false}
        iconCreateFunction={clusterIcon}
      >
        {markers}
      </MarkerClusterGroup>
      {selected && (
        <Marker
          position={[selected.lat, selected.lng]}
          icon={pinIcon(getStatus(selected), selected.available, selected.maxKw >= FAST_KW, true)}
          zIndexOffset={1000}
          interactive={false}
        />
      )}
      {userPos && <Marker position={userPos} icon={you} interactive={false} zIndexOffset={900} />}
    </MapContainer>
  );
}
