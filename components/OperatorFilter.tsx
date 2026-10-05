'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Charger } from '@/lib/types';
import { resolveOperator } from '@/lib/operators';
import OperatorIcon from './OperatorIcon';
import { BoltIcon, CaretIcon } from './Icons';

interface Props {
  chargers: Charger[];
  value: string | null;
  onChange: (key: string | null) => void;
}

interface OperatorOption {
  key: string;
  label: string;
  count: number;
  sample: string;
}

export default function OperatorFilter({ chargers, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo<OperatorOption[]>(() => {
    const map = new Map<string, OperatorOption>();
    for (const c of chargers) {
      const meta = resolveOperator(c.operator);
      const existing = map.get(meta.key);
      if (existing) existing.count += 1;
      else map.set(meta.key, { key: meta.key, label: meta.label, count: 1, sample: c.operator });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [chargers]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = value ? options.find(o => o.key === value) : null;

  function pick(key: string | null) {
    onChange(key);
    setOpen(false);
  }

  return (
    <div className="op-filter" ref={wrapRef}>
      <button
        className={`chip${value ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current ? (
          <>
            <OperatorIcon operator={current.sample} size={18} />
            {current.label}
          </>
        ) : (
          'All operators'
        )}
        <CaretIcon size={16} />
      </button>

      {open && (
        <div className="op-menu" role="listbox" aria-label="Operator">
          <button
            className="op-menu-item"
            onClick={() => pick(null)}
            role="option"
            aria-selected={value === null}
          >
            <span className="op-menu-all"><BoltIcon size={14} /></span>
            <span className="op-menu-label">All operators</span>
            <span className="op-menu-count num">{chargers.length}</span>
          </button>
          {options.map(o => (
            <button
              key={o.key}
              className="op-menu-item"
              onClick={() => pick(o.key)}
              role="option"
              aria-selected={value === o.key}
            >
              <OperatorIcon operator={o.sample} size={24} />
              <span className="op-menu-label">{o.label}</span>
              <span className="op-menu-count num">{o.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
