import type { Charger } from './types';
import { resolveOperator } from './operators';

/*
  Extra charges on top of the per-kWh price. LTA's feed only carries $/kWh,
  so time-based fees (idle fees, overnight minimums, per-minute pricing) are
  curated by hand from each operator's own published terms.

  Rules for editing this file:
  - Only add numbers an operator has published, with a link to the source.
  - Update TARIFFS_CHECKED whenever you re-verify.
*/

export const TARIFFS_CHECKED = '4 Oct 2026';

export type Applies = 'yes' | 'maybe' | 'no';

export interface Fee {
  title: string;
  detail: string;
  /** Whether this fee is time-based (charged by the minute/hour or by time of day). */
  timeBased: boolean;
  /** Does this fee apply at a given station? Defaults to "maybe". */
  appliesAt?: (c: Charger) => { applies: Applies; why: string };
}

export interface Source {
  label: string;
  url: string;
}

export interface OperatorTariff {
  /** Compact label for list rows, shown when a time-based fee applies. */
  tag?: string;
  fees: Fee[];
  notes?: string[];
  sources: Source[];
}

const PETROL = /^(SPC|SHELL|CALTEX|ESSO|SINOPEC)\b|FILLING STATION|PETROL STATION/i;
const isPetrol = (c: Charger) => PETROL.test(c.name);

export const TARIFFS: Record<string, OperatorTariff> = {
  sp: {
    tag: 'Idle fee $0.50/min',
    fees: [
      {
        title: 'Idle fee',
        detail:
          '$0.50 per minute once charging ends, after a 30-minute grace period. Charged 10am to 10pm daily, or all day at petrol stations. Capped at $40 per session.',
        timeBased: true,
        appliesAt: c =>
          isPetrol(c)
            ? { applies: 'yes', why: 'Applies here all day (petrol station).' }
            : c.carPark
              ? { applies: 'yes', why: 'Applies here (HDB car park).' }
              : { applies: 'maybe', why: 'Applies at selected sites. The SP app shows which.' },
      },
      {
        title: 'Guest checkout minimum',
        detail: 'Paying without an SP account has a minimum charge of $0.50 per session.',
        timeBased: false,
      },
    ],
    notes: [
      'You pay the rate in effect when your session starts.',
      'Prices include GST.',
    ],
    sources: [
      { label: 'SP Mobility: idle fee changes (31 Aug 2026)', url: 'https://www.spmobility.sg/news/Idle-Fees-Sep-2026' },
      { label: 'SP Mobility: guest checkout (22 Apr 2025)', url: 'https://www.spmobility.sg/news/guest-checkout' },
      { label: 'SP Group EV charging terms', url: 'https://www.spgroup.com.sg/a/ev-tnc' },
    ],
  },

  strides: {
    tag: 'Idle fee $0.50/min',
    fees: [
      {
        title: 'Idle fee',
        detail:
          '$0.50 per minute, billed in 5-minute blocks, after a 30-minute grace period. Charged 10am to 10pm daily. Capped at $20 per session.',
        timeBased: true,
        appliesAt: c =>
          c.carPark
            ? { applies: 'yes', why: 'Applies here (HDB car park).' }
            : { applies: 'maybe', why: 'Applies at selected sites. The ChargEco app shows which.' },
      },
    ],
    notes: [
      'Strides YTL operates as ChargEco. From 5 Oct 2026 these chargers move to the SP app as SP Mobility chargers, so SP’s fees may apply.',
      'Prices include GST.',
    ],
    sources: [
      { label: 'ChargEco: idle fee update (31 Aug 2026)', url: 'https://chargeco.global/update-on-idle-fee/' },
      { label: 'SP Mobility: ChargEco moving to SP app (20 Sep 2026)', url: 'https://www.spmobility.sg/news/CE-to-SPM' },
    ],
  },

  cdg: {
    tag: 'Idle & overnight fees',
    fees: [
      {
        title: 'Idle fee',
        detail:
          '$0.50 per 5 minutes once charging ends, after a 30-minute grace period. Charged 8.30am to 10pm. No cap stated.',
        timeBased: true,
        appliesAt: () => ({ applies: 'maybe', why: 'Being rolled out to selected sites. The CDG Energy app shows which.' }),
      },
      {
        title: 'Overnight minimum spend',
        detail:
          'If your session is active at any time between 10pm and 2am, you pay at least $15, or your actual charging cost if that is higher.',
        timeBased: true,
        appliesAt: () => ({ applies: 'maybe', why: 'Being rolled out to selected sites. The CDG Energy app shows which.' }),
      },
    ],
    notes: [
      'ComfortDelGro ENGIE was renamed CDG Energy in Aug 2026.',
      'Prices include GST. Car park charges are paid separately.',
    ],
    sources: [
      { label: 'CDG Energy: idling and overnight fees', url: 'https://cdg-energy.com/wp-content/uploads/2026/09/idling-overnight-fees-1.html' },
      { label: 'CDG Energy FAQ', url: 'https://cdg-energy.com/faq/' },
    ],
  },

  shell: {
    tag: 'Idle fee $0.50/min',
    fees: [
      {
        title: 'Idle fee',
        detail:
          '$0.50 per minute once charging ends, rounded up to the minute. Grace period is 15 minutes at Shell stations and 30 minutes elsewhere. Charged 24 hours a day. Capped at $40 per session.',
        timeBased: true,
        appliesAt: c =>
          c.carPark
            ? { applies: 'no', why: 'Not charged at HDB car parks.' }
            : isPetrol(c)
              ? { applies: 'yes', why: 'Applies here, with a 15-minute grace period (Shell station).' }
              : { applies: 'maybe', why: 'Applies at most Shell sites with a 30-minute grace period, but not at condominiums.' },
      },
    ],
    sources: [
      { label: 'Shell Recharge: idle fees FAQ (updated 22 Aug 2025)', url: 'https://www.shell.com.sg/shell-recharge-for-ev/idle-fees-frequently-asked-questions.html' },
    ],
  },

  chargeplus: {
    fees: [
      {
        title: 'Idle fee',
        detail: 'Charge+ has announced idle fees but hasn’t published the rate. Check the Charge+ app before leaving your car.',
        timeBased: true,
      },
    ],
    notes: ['Regular parking fees apply on top of charging.'],
    sources: [{ label: 'Charge+ Singapore', url: 'https://www.chargeplus.com/sg' }],
  },

  volt: {
    fees: [
      {
        title: 'Volt Card bundle',
        detail:
          '$122 for 190 kWh ($0.642 per kWh, AC or DC), valid for 2 months. Can’t be used at HDB car parks, One Raffles Quay or Marina Bay Financial Centre.',
        timeBased: false,
      },
    ],
    notes: [
      'Volt publishes pay-as-you-go rates of $0.66 per kWh for AC and $0.74 per kWh for DC (Mar 2026). The station prices shown here come from LTA and vary by site.',
      'No minimum fee. Parking is charged separately by the premises.',
    ],
    sources: [
      { label: 'Keppel Volt: Volt Card (updated Mar 2026)', url: 'https://www.keppelvolt.com/drivers/promotions--partnerships/ev-charging-made-easier-with-the-volt-card/' },
      { label: 'Keppel Volt: driver FAQ', url: 'https://www.keppelvolt.com/faq/drivers/' },
    ],
  },

  tesla: {
    tag: 'Congestion fee',
    fees: [
      {
        title: 'Congestion fee',
        detail:
          'When a Supercharger site is busy, about $0.50 per minute (up to $1.00 at some sites) once your battery reaches 80% or charging ends. 5-minute grace period, no cap.',
        timeBased: true,
        appliesAt: () => ({ applies: 'maybe', why: 'Only when the site is busy.' }),
      },
      {
        title: 'Peak and off-peak pricing',
        detail: 'Some Superchargers charge different rates by time of day. The rate is set when you plug in and is shown in the Tesla app.',
        timeBased: true,
        appliesAt: () => ({ applies: 'maybe', why: 'At selected Superchargers.' }),
      },
    ],
    sources: [
      { label: 'Tesla Singapore: Supercharger fees (archived 12 May 2026)', url: 'https://web.archive.org/web/20260512045935/https://www.tesla.com/en_sg/support/charging/supercharger/fees' },
    ],
  },

  cityenergy: {
    fees: [
      {
        title: 'After-charging grace period',
        detail: '30 minutes after charging ends. Additional charges may apply after that; the amount isn’t published.',
        timeBased: true,
      },
    ],
    notes: ['No monthly or annual subscription fees.'],
    sources: [{ label: 'City Energy Go FAQ', url: 'https://www.cityenergygo.com.sg/faqs/' }],
  },

  watt: {
    fees: [
      {
        title: 'Idle fee',
        detail: 'Site owners can set an idle fee. Amounts aren’t published; check the WATT app.',
        timeBased: true,
      },
    ],
    sources: [{ label: 'WATT terms of use (8 Sep 2025)', url: 'https://www.watt.sg/terms-of-use/' }],
  },

  kigo: {
    fees: [
      {
        title: 'Idle fee',
        detail: 'Kigo supports idle fees at some sites. Amounts aren’t published; check the Kigo app.',
        timeBased: true,
      },
      {
        title: 'Minimum charge',
        detail: 'The minimum transaction is $0.50.',
        timeBased: false,
      },
    ],
    sources: [{ label: 'Kigo app user guide v2.0 (16 Jul 2025)', url: 'https://www.seletarairport.com/content/dam/seletarAirport/files/KIGO%20user%20guide.pdf' }],
  },

  solacharge: {
    fees: [
      {
        title: 'May be charged by the hour',
        detail: 'SolaCharge site owners can price per hour, per kWh or by monthly plan, and may add hogging fees. LTA has no price listed for these chargers.',
        timeBased: true,
      },
    ],
    sources: [{ label: 'Solateks: public EV charging', url: 'https://www.solateks.com/ev-public' }],
  },

  goparkin: {
    fees: [
      {
        title: 'Pricing set per site',
        detail: 'GoParkin can charge per kWh or per minute, with off-peak rates and idle fees. Amounts aren’t published; check the GoParkin app.',
        timeBased: true,
      },
    ],
    sources: [{ label: 'ST Engineering GoParkin brochure (Apr 2023)', url: 'https://www.stengg.com/getmedia/b1e452f7-d0b3-4286-8f9f-12d061afb8f5/goparkin-electric-vehicle-charging-solution.pdf' }],
  },

  greatcharge: {
    fees: [],
    notes: ['Promotional rates until 31 Dec 2026: AC $0.545 and DC $0.600 per kWh, including GST.'],
    sources: [{ label: 'Great Rewards: Charge & Earn promotion', url: 'https://greatrewards.com.sg/promotion/charge-earn-carpark-at-great-world-pasir-ris-mall/' }],
  },
};

export function tariffFor(operator: string): OperatorTariff | null {
  return TARIFFS[resolveOperator(operator).key] ?? null;
}

/**
 * List-row tag for time-based fees: `confirmed` when one definitely applies
 * here, otherwise a softer "may apply" when the operator has any.
 */
export function timeFeeTag(c: Charger): { text: string; confirmed: boolean } | null {
  const t = tariffFor(c.operator);
  if (!t) return null;
  const timeFees = t.fees.filter(f => f.timeBased);
  if (timeFees.length === 0) return null;
  const results = timeFees.map(f => feeApplies(f, c).applies);
  if (results.includes('yes') && t.tag) return { text: t.tag, confirmed: true };
  if (results.includes('maybe')) return { text: 'Fees may apply', confirmed: false };
  return null;
}

export function feeApplies(fee: Fee, c: Charger) {
  return fee.appliesAt?.(c) ?? { applies: 'maybe' as Applies, why: 'May apply. Check the operator’s app.' };
}
