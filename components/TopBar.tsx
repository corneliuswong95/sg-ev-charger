'use client';

import type { Charger, FilterKey } from '@/lib/types';
import OperatorFilter from './OperatorFilter';
import { BoltIcon, CloseIcon, RefreshIcon } from './Icons';

const FILTERS: { key: FilterKey; label: string; dot?: boolean; bolt?: boolean }[] = [
  { key: 'available', label: 'Available now', dot: true },
  { key: 'fast', label: 'Fast 50 kW+', bolt: true },
  { key: 'dc', label: 'DC' },
];

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  filters: FilterKey[];
  onToggleFilter: (k: FilterKey) => void;
  /** Stations matching everything but the operator filter (for menu counts). */
  operatorSource: Charger[];
  operator: string | null;
  onOperatorChange: (key: string | null) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

export default function TopBar({
  query, onQueryChange, filters, onToggleFilter,
  operatorSource, operator, onOperatorChange, refreshing, onRefresh,
}: Props) {
  return (
    <header className="topbar">
      <div className="searchbar" role="search">
        <span className="brand-mark" aria-hidden>
          <BoltIcon size={20} />
        </span>
        <label htmlFor="station-search" className="visually-hidden">
          Search chargers
        </label>
        <input
          id="station-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Search name, street or postcode"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
        {query ? (
          <button className="icon-btn" onClick={() => onQueryChange('')} aria-label="Clear search">
            <CloseIcon size={18} />
          </button>
        ) : (
          <button
            className={`icon-btn${refreshing ? ' spinning' : ''}`}
            onClick={onRefresh}
            aria-label="Refresh live availability"
          >
            <RefreshIcon size={18} />
          </button>
        )}
      </div>

      <div className="filter-row">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className="chip"
            aria-pressed={filters.includes(f.key)}
            onClick={() => onToggleFilter(f.key)}
          >
            {f.dot && <span className="chip-dot" />}
            {f.bolt && <BoltIcon size={14} />}
            {f.label}
          </button>
        ))}
        <OperatorFilter chargers={operatorSource} value={operator} onChange={onOperatorChange} />
      </div>
    </header>
  );
}
