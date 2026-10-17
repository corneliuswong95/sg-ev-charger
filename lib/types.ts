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
  /** Set when `price` corrects a wrong LTA listing (see lib/priceCorrections.ts). */
  correction?: { ltaPrice: number; note: string };
}

/** Where a station's parking info comes from. */
export type ParkingKind = 'hdb' | 'ura' | 'jtc' | 'mall';

export interface CarParkRef {
  kind: ParkingKind;
  /**
   * HDB car park number ("SE53"), URA ppCode ("A0004"), curated id
   * ("jtc-medtech-hub"), OneMotoring id ("om-1-ion-orchard") or LTA id ("lta-12").
   */
  code: string;
  /** Inside HDB's Central Area, where daytime rates are higher (HDB only). */
  central?: boolean;
  /** Parking is free on Sundays and public holidays (HDB only). */
  freeSunday?: boolean;
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

/** /api/history/trends — for all of Singapore or one postal district. */
export interface HistoryTrends {
  /** First and latest recorded snapshot (ISO), null before any data. */
  since: string | null;
  latest: string | null;
  snapshots: number;
  /** Distinct Singapore days with data. */
  days: number;
  /** [ISO time, plugs in use, plugs reporting a status], last 24 hours. */
  last24h: [string, number, number][];
  /** Most plugs in use in any snapshot so far. */
  record: { t: string; inUse: number; reporting: number } | null;
  /** [day of week (0 = Sunday), hour, mean share of reporting plugs in use, snapshots, distinct days]. */
  cells: [number, number, number, number, number][];
  /** Mean share in use at the latest snapshot's weekday and hour, on earlier days. */
  usualNow: { share: number | null; days: number };
  /** Plugs-in-use summed over snapshots: 10.30pm–7am vs all day. */
  night: { night: number | null; all: number | null };
  /** Mean share in use on Sundays and public holidays ("rest") vs Mon–Fri ("work"). */
  restVsWork: { rest: number | null; restDays: number; work: number | null; workDays: number };
}

/** /api/history/site/[key] — one site's running totals per hour of the week. */
export interface PopularTimes {
  /** When history collection began (ISO). */
  since: string | null;
  /** 168 slots each; index = day of week (0 = Sunday) × 24 + hour, Singapore time. */
  reporting: number[];
  plugs: number[];
  inUse: number[];
  full: number[];
}

export interface RateLine {
  label: string;
  value: string;
}

/** Ready-to-render parking block for the detail sheet, whatever the source. */
export interface ParkingDetails {
  kind: ParkingKind;
  title: string;
  subtitle: string | null;
  /** Empty when rates aren't known for this car park. */
  lines: RateLine[];
  /** Live free car lots from LTA, `null` if not reported. */
  lotsAvailable: number | null;
  notes: string[];
  /** Where to see the rates when we can only link to them. */
  link?: { label: string; url: string };
  sources: { label: string; url: string }[];
}
