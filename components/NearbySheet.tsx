'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Charger } from '@/lib/types';
import { distanceKm, formatDistance, getStatus, STATUS_LABEL } from '@/lib/chargers';
import OperatorIcon from './OperatorIcon';

interface Props {
  chargers: Charger[];
  origin: [number, number] | null;
  originLabel: 'You' | 'Map center';
  selectedId: string | null;
  onSelect: (c: Charger) => void;
  hidden: boolean;
}

interface Row {
  charger: Charger;
  distance: number | null;
}

const MAX_ROWS = 50;

export default function NearbySheet({
  chargers, origin, originLabel, selectedId, onSelect, hidden,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const rows = useMemo<Row[]>(() => {
    const withDist: Row[] = chargers.map(c => ({
      charger: c,
      distance: origin ? distanceKm(origin[0], origin[1], c.lat, c.lng) : null,
    }));
    if (origin) {
      withDist.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    return withDist.slice(0, MAX_ROWS);
  }, [chargers, origin]);

  useEffect(() => {
    if (hidden && expanded) setExpanded(false);
  }, [hidden, expanded]);

  function onTouchStart(e: React.TouchEvent) {
    dragStart.current = e.touches[0].clientY;
    setDragOffset(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (dragStart.current == null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    // Only allow drag in the "closing" direction relative to current state,
    // so we don't fight scrolling inside the list.
    if (expanded && dy > 0) setDragOffset(dy);
    else if (!expanded && dy < 0) setDragOffset(dy);
  }
  function onTouchEnd() {
    if (dragStart.current == null) return;
    const dy = dragOffset;
    dragStart.current = null;
    setDragOffset(0);
    const THRESHOLD = 60;
    if (expanded && dy > THRESHOLD) setExpanded(false);
    else if (!expanded && dy < -THRESHOLD) setExpanded(true);
  }

  if (hidden) return null;

  return (
    <div
      ref={sheetRef}
      className={`nearby-sheet${expanded ? ' expanded' : ''}`}
      style={dragOffset !== 0 ? { transform: `translateY(calc(var(--nearby-y) + ${dragOffset}px))`, transition: 'none' } : undefined}
    >
      <button
        className="nearby-handle-row"
        onClick={() => setExpanded(e => !e)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse list' : 'Expand nearby chargers list'}
      >
        <span className="nearby-handle" />
        <span className="nearby-peek">
          <span className="nearby-peek-title">Nearby chargers</span>
          <span className="nearby-peek-sub">
            {rows.length === 0
              ? 'No stations match'
              : origin
                ? `${rows.length} sorted by distance from ${originLabel.toLowerCase()}`
                : `${rows.length} stations`}
          </span>
        </span>
        <span className={`nearby-chevron${expanded ? ' up' : ''}`} aria-hidden>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div className="nearby-list">
        {rows.length === 0 ? (
          <div className="nearby-empty">No chargers match the current filters.</div>
        ) : (
          rows.map(({ charger, distance }) => {
            const status = getStatus(charger);
            const isSelected = charger.id === selectedId;
            return (
              <button
                key={charger.id}
                className={`nearby-item${isSelected ? ' selected' : ''}`}
                onClick={() => onSelect(charger)}
              >
                <OperatorIcon operator={charger.operator} size={36} />
                <div className="nearby-item-body">
                  <div className="nearby-item-name">{charger.name}</div>
                  <div className="nearby-item-meta">
                    <span className={`nearby-dot ${status}`} />
                    <span>{STATUS_LABEL[status]}</span>
                    <span className="nearby-meta-sep">·</span>
                    <span>{charger.available}/{charger.total} free</span>
                    {charger.maxKw > 0 && (
                      <>
                        <span className="nearby-meta-sep">·</span>
                        <span>{charger.maxKw} kW</span>
                      </>
                    )}
                  </div>
                </div>
                {distance != null && (
                  <div className="nearby-item-dist">{formatDistance(distance)}</div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
