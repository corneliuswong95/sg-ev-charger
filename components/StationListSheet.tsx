'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Charger } from '@/lib/types';
import { distanceKm } from '@/lib/geo';
import { formatTime } from '@/lib/format';
import StationRow from './StationRow';
import { ChevronIcon } from './Icons';

interface Props {
  chargers: Charger[];
  origin: [number, number] | null;
  originIsUser: boolean;
  query: string;
  updatedAt: string | null;
  selectedId: string | null;
  onSelect: (c: Charger) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  onClearSearch: () => void;
}

const PAGE = 40;
const DRAG_THRESHOLD = 50;

export default function StationListSheet({
  chargers, origin, originIsUser, query, updatedAt, selectedId, onSelect,
  expanded, onExpandedChange, hasFilters, onClearFilters, onClearSearch,
}: Props) {
  const [limit, setLimit] = useState(PAGE);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const moved = useRef(false);

  const rows = useMemo(() => {
    const withDist = chargers.map(c => ({
      charger: c,
      distance: origin ? distanceKm(origin[0], origin[1], c.lat, c.lng) : null,
    }));
    if (origin) withDist.sort((a, b) => a.distance! - b.distance!);
    return withDist;
  }, [chargers, origin]);

  // Reset paging when the result set changes.
  useEffect(() => setLimit(PAGE), [query, chargers]);

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = e.clientY;
    moved.current = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragStart.current == null) return;
    const dy = e.clientY - dragStart.current;
    if (Math.abs(dy) > 4) moved.current = true;
    if ((expanded && dy > 0) || (!expanded && dy < 0)) setDrag(dy);
  }
  function onPointerUp() {
    if (dragStart.current == null) return;
    dragStart.current = null;
    if (moved.current) {
      if (expanded && drag > DRAG_THRESHOLD) onExpandedChange(false);
      else if (!expanded && drag < -DRAG_THRESHOLD) onExpandedChange(true);
    }
    setDrag(0);
  }
  function onGripClick() {
    if (moved.current) return; // handled as a drag
    onExpandedChange(!expanded);
  }

  const time = formatTime(updatedAt);
  const title = query.trim()
    ? rows.length === 0 ? 'No matches' : `${rows.length.toLocaleString()} match${rows.length === 1 ? '' : 'es'}`
    : originIsUser ? 'Chargers near you' : 'Chargers near map centre';
  const sub = query.trim()
    ? `For “${query.trim()}”${origin && rows.length > 0 ? ', closest first' : ''}`
    : `${rows.length.toLocaleString()} stations${time ? `, live as of ${time}` : ''}`;

  return (
    <section
      className={`list-sheet${expanded ? ' expanded' : ''}${drag ? ' dragging' : ''}`}
      style={drag ? { transform: `translateY(calc(var(--sheet-y) + ${drag}px))` } : undefined}
      aria-label="Charger list"
    >
      <button
        className="sheet-grip"
        onClick={onGripClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-expanded={expanded}
      >
        <span className="grip-text">
          <span className="grip-title">{title}</span>
          <span className="grip-sub">{sub}</span>
        </span>
        <span className="grip-chevron" aria-hidden>
          <ChevronIcon size={18} />
        </span>
      </button>

      <div className="station-list">
        {rows.length === 0 ? (
          <div className="list-empty">
            <strong>{query.trim() ? 'Nothing matches that search' : 'No chargers match these filters'}</strong>
            {query.trim() ? 'Try a station name, street, postcode or operator.' : 'Turn off a filter to see more stations.'}
            <div>
              {query.trim() && <button onClick={onClearSearch}>Clear search</button>}
              {hasFilters && (
                <button onClick={onClearFilters} style={{ marginLeft: query.trim() ? 20 : 0 }}>Clear filters</button>
              )}
            </div>
          </div>
        ) : (
          <>
            {rows.slice(0, limit).map(({ charger, distance }) => (
              <StationRow
                key={charger.id}
                charger={charger}
                distance={distance}
                selected={charger.id === selectedId}
                onSelect={onSelect}
              />
            ))}
            {rows.length > limit && (
              <button className="show-more" onClick={() => setLimit(l => l + PAGE)}>
                Show more ({(rows.length - limit).toLocaleString()} left)
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
