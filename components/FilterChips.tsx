'use client';

import type { FilterKey } from '@/lib/types';

const CHIPS: { key: FilterKey; label: string; cls: string }[] = [
  { key: 'all',       label: 'All stations', cls: 'chip-all' },
  { key: 'available', label: 'Available',    cls: 'chip-avail' },
  { key: 'fast',      label: 'Fast (≥50 kW)', cls: 'chip-fast' },
  { key: 'dc',        label: 'DC only',      cls: 'chip-dc' },
];

interface Props {
  active: FilterKey;
  onChange: (k: FilterKey) => void;
}

export default function FilterChips({ active, onChange }: Props) {
  return (
    <div className="chips-row">
      {CHIPS.map(c => (
        <button
          key={c.key}
          className={`chip ${c.cls}${active === c.key ? ' active' : ''}`}
          onClick={() => onChange(c.key)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
