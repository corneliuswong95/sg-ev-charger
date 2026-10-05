'use client';

import type { Charger } from '@/lib/types';
import { availabilityShort, getStatus } from '@/lib/chargers';
import { formatDistance, formatKw, formatPrice } from '@/lib/format';
import OperatorIcon from './OperatorIcon';

interface Props {
  charger: Charger;
  distance: number | null;
  selected: boolean;
  onSelect: (c: Charger) => void;
}

export function lowestPrice(c: Charger): number | null {
  const { AC, DC } = c.minPrice;
  if (AC == null) return DC;
  if (DC == null) return AC;
  return Math.min(AC, DC);
}

export default function StationRow({ charger, distance, selected, onSelect }: Props) {
  const status = getStatus(charger);
  const price = lowestPrice(charger);
  return (
    <button
      className={`station-row${selected ? ' selected' : ''}`}
      onClick={() => onSelect(charger)}
    >
      <OperatorIcon operator={charger.operator} size={40} />
      <span className="row-body">
        <span className="row-name" style={{ display: 'block' }}>{charger.name}</span>
        <span className="row-meta">
          <span className={`status-pill ${status}`}>{availabilityShort(charger)}</span>
          {charger.maxKw > 0 && (
            <span>
              <span className="num">{formatKw(charger.maxKw)}</span> kW {charger.hasDC ? 'DC' : 'AC'}
            </span>
          )}
          {price != null && (
            <span>
              {price === 0 ? 'Free' : <>from <span className="num">{formatPrice(price)}</span></>}
            </span>
          )}
        </span>
      </span>
      {distance != null && (
        <span className="row-aside">
          <span className="row-dist">{formatDistance(distance)}</span>
        </span>
      )}
    </button>
  );
}
