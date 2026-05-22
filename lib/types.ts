export interface PlugType {
  plugType: string;
  current: string;
  powerRating: string;
  price?: string;
  priceType?: string;
  evIds?: Array<{ evCpId?: string; status?: string }>;
}

export interface ChargingPoint {
  status: string;
  operatingHours?: string;
  operator?: string;
  position?: string;
  name?: string;
  plugTypes?: PlugType[];
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
  chargingPoints: ChargingPoint[];
}

export type Status = 'available' | 'occupied' | 'unknown';

export type FilterKey = 'all' | 'available' | 'fast' | 'dc';
