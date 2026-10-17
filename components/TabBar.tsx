'use client';

import { ChartIcon, MapIcon, TagIcon } from './Icons';

export type Tab = 'map' | 'prices' | 'stats';

interface Props {
  tab: Tab;
  onChange: (t: Tab) => void;
}

export default function TabBar({ tab, onChange }: Props) {
  return (
    <nav className={`tabbar${tab !== 'map' ? ' on-page' : ''}`} aria-label="Sections">
      <button className="tab" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onChange('map')}>
        <MapIcon size={22} />
        Map
      </button>
      <button className="tab" aria-current={tab === 'prices' ? 'page' : undefined} onClick={() => onChange('prices')}>
        <TagIcon size={22} />
        Prices
      </button>
      <button className="tab" aria-current={tab === 'stats' ? 'page' : undefined} onClick={() => onChange('stats')}>
        <ChartIcon size={22} />
        Stats
      </button>
    </nav>
  );
}
