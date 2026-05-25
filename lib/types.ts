export interface PlugSummary {
  plugType: string;
  current: string;
  kw: number;
  count: number;
  price?: number;
  priceType?: string;
}

export interface Charger {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  operator: string;
  available: number;
  total: number;
  maxKw: number;
  hasDC: boolean;
  plugs: PlugSummary[];
}

export type Status = 'available' | 'occupied' | 'unknown';

export type FilterKey = 'all' | 'available' | 'fast' | 'dc';
