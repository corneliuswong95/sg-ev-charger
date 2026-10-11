import type { Current } from './types';

/*
  Corrections to per-kWh prices in LTA's feed, for stations where the
  operator's own published price shows LTA's listing is wrong.

  Each correction only applies while LTA still reports the wrong price
  (`from`), so it stops applying by itself once LTA's data is fixed.
  Only add entries backed by the operator's own published price, and say
  where and when you checked it.
*/

export interface PriceCorrection {
  /** Tested against `${raw LTA name} | ${raw LTA address}` in upper case. */
  station: RegExp;
  /** Tested against LTA's operator company name. */
  operator: RegExp;
  current: Current;
  /** The price LTA reports for these connectors. */
  from: number;
  /** The operator's own price. */
  to: number;
  note: string;
}

const SP = /^SP MOBILITY\b/i;
const SP_SWAP = 'LTA lists this site’s AC and DC prices the wrong way round. Corrected to SP Mobility’s own prices (checked 11 Oct 2026).';

export const PRICE_CORRECTIONS: PriceCorrection[] = [
  // SP's own listing: DC 50 kW $0.894, AC $0.807 per kWh.
  { station: /\| 2 ANG MO KIO DRIVE\b/, operator: SP, current: 'DC', from: 0.8066, to: 0.8938, note: SP_SWAP },
  { station: /\| 2 ANG MO KIO DRIVE\b/, operator: SP, current: 'AC', from: 0.8938, to: 0.8066, note: SP_SWAP },
  { station: /\| 111 SOMERSET ROAD\b/, operator: SP, current: 'DC', from: 0.8066, to: 0.8938, note: SP_SWAP },
  { station: /\| 111 SOMERSET ROAD\b/, operator: SP, current: 'AC', from: 0.8938, to: 0.8066, note: SP_SWAP },
];

export function correctPrice(
  rawName: string, rawAddress: string, operator: string, current: Current, price: number | null,
): { price: number; ltaPrice: number; note: string } | null {
  if (price == null) return null;
  const station = `${rawName} | ${rawAddress}`.toUpperCase();
  const c = PRICE_CORRECTIONS.find(
    x => x.current === current && Math.abs(x.from - price) < 0.00005 && x.operator.test(operator) && x.station.test(station),
  );
  return c ? { price: c.to, ltaPrice: price, note: c.note } : null;
}
