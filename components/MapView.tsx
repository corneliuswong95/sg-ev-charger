'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { Charger } from '@/lib/types';
import { getStatus } from '@/lib/chargers';

const SG_CENTER: [number, number] = [1.3521, 103.8198];
const ZOOM_INIT = 12;

export interface MapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
  chargers: Charger[];
  onSelect: (c: Charger) => void;
  onMapClick: () => void;
  onReady: (handle: MapHandle) => void;
  userPos: [number, number] | null;
}

function clusterIcon(cluster: { getChildCount: () => number }) {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 44 : 54;
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:rgba(74,222,128,0.85);
      border:2px solid rgba(13,13,13,0.8);
      box-shadow:0 2px 12px rgba(0,0,0,.5);
      display:flex;align-items:center;justify-content:center;
      color:#0d0d0d;font-weight:800;font-size:${count < 100 ? 14 : 13}px;
    ">${count}</div>`,
    iconSize: [size, size],
    className: '',
  });
}

function markerIcon(status: ReturnType<typeof getStatus>, maxKw: number) {
  const colors = { available: '#4ade80', occupied: '#f87171', unknown: '#888' };
  const c = colors[status] ?? colors.unknown;
  const isFast = maxKw >= 50;
  const size = isFast ? 34 : 26;
  return L.divIcon({
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="position:absolute;inset:0;background:${c};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid rgba(0,0,0,.4);box-shadow:0 2px 10px rgba(0,0,0,.5);"></div>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${isFast ? 14 : 11}px;">⚡</span>
      </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    className: '',
  });
}

function MapBindings({
  onMapClick,
  onReady,
}: {
  onMapClick: () => void;
  onReady: (h: MapHandle) => void;
}) {
  const map = useMap();
  const readyRef = useRef(false);

  useEffect(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    onReady({
      zoomIn:  () => map.zoomIn(),
      zoomOut: () => map.zoomOut(),
      flyTo:   (lat, lng, zoom) => map.setView([lat, lng], zoom ?? Math.max(map.getZoom(), 15)),
    });
  }, [map, onReady]);

  useEffect(() => {
    map.on('click', onMapClick);
    return () => { map.off('click', onMapClick); };
  }, [map, onMapClick]);

  return null;
}

export default function MapView({ chargers, onSelect, onMapClick, onReady, userPos }: Props) {
  const markers = useMemo(
    () =>
      chargers.map(c => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={markerIcon(getStatus(c), c.maxKw)}
          eventHandlers={{ click: () => onSelect(c) }}
        />
      )),
    [chargers, onSelect],
  );

  return (
    <MapContainer center={SG_CENTER} zoom={ZOOM_INIT} zoomControl={false}>
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains={['a', 'b', 'c', 'd']}
        maxZoom={19}
        attribution='© <a href="https://carto.com">CARTO</a> © <a href="https://openstreetmap.org">OSM</a>'
      />
      <MapBindings onMapClick={onMapClick} onReady={onReady} />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        showCoverageOnHover={false}
        iconCreateFunction={clusterIcon}
      >
        {markers}
      </MarkerClusterGroup>
      {userPos && (
        <CircleMarker
          center={userPos}
          radius={9}
          pathOptions={{ color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: 0.85, weight: 2 }}
        />
      )}
    </MapContainer>
  );
}
