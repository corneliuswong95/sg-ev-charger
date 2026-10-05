export type Current = 'AC' | 'DC';

/** One row per distinct (plug, current, power, price) at a station. */
export interface Connector {
  plugType: string;
  current: Current;
  kw: number;
  /** Connectors (LTA `evIds`) of this kind at the station. */
  count: number;
  available: number;
  /** Connectors reporting no live status. */
  offline: number;
  /** SGD per kWh as reported to LTA. `null` when the operator didn't list one. */
  price: number | null;
  /** Operator explicitly marked this connector as free (`priceType: "free"`). */
  free: boolean;
}

export interface CarParkRef {
  /** HDB car park number, e.g. "SE53". */
  code: string;
  /** Inside HDB's Central Area, where daytime rates are higher. */
  central: boolean;
}

export interface Charger {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  lat: number;
  lng: number;
  operator: string;
  /** Connector-level counts. `offline` = no live status reported. */
  available: number;
  occupied: number;
  offline: number;
  total: number;
  maxKw: number;
  hasDC: boolean;
  connectors: Connector[];
  /** Cheapest listed price per current type, `0` if listed as free. */
  minPrice: Record<Current, number | null>;
  carPark: CarParkRef | null;
}

export interface ChargersResponse {
  /** ISO timestamp of LTA's snapshot, if provided. */
  updatedAt: string | null;
  chargers: Charger[];
}

export type Status = 'available' | 'occupied' | 'offline';

export type FilterKey = 'available' | 'fast' | 'dc';

export interface HdbCarPark {
  code: string;
  address: string;
  type: string;
  system: string;
  shortTermParking: string;
  freeParking: string;
  nightParking: boolean;
  central: boolean;
}

export interface CarParkResponse {
  carPark: HdbCarPark;
  /** Live free car lots from LTA, `null` if this car park doesn't report. */
  lotsAvailable: number | null;
}
