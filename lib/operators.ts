import { titleCase } from './format';

export interface OperatorMeta {
  key: string;
  /** Brand drivers recognise (what the app/charger says). */
  label: string;
  color: string;
  domain?: string;
  matches: RegExp;
}

// Registered company names come from LTA's feed (e.g. "SP MOBILITY PTE. LTD.").
const OPERATORS: OperatorMeta[] = [
  { key: 'sp',         label: 'SP Mobility',     color: '#E4002B', domain: 'spmobility.sg',       matches: /^sp\b|sp[\s-]?(group|mobility)/i },
  { key: 'cdg',        label: 'CDG Energy',      color: '#00AAFF', domain: 'cdg-energy.com',      matches: /comfort\s?del\s?gro|\bcdg\b/i },
  { key: 'shell',      label: 'Shell Recharge',  color: '#DD1D21', domain: 'shell.com.sg',        matches: /shell/i },
  { key: 'chargeplus', label: 'Charge+',         color: '#00B26B', domain: 'chargeplus.com',      matches: /charge\s?\+|chargeplus/i },
  { key: 'strides',    label: 'ChargEco',        color: '#5B2D8E', domain: 'chargeco.global', matches: /strides|chargeco/i },
  { key: 'volt',       label: 'Volt',            color: '#111827', domain: 'keppelvolt.com',      matches: /\bvolt\b/i },
  { key: 'tesla',      label: 'Tesla',           color: '#CC0000', domain: 'tesla.com',           matches: /tesla/i },
  { key: 'mnl',        label: 'MNL',             color: '#0F766E', domain: 'mnlasia.com',         matches: /\bmnl\b/i },
  { key: 'fastpark',   label: 'FastParkNCharge', color: '#1D4ED8',                                matches: /fastpark/i },
  { key: 'watt',       label: 'Watt',            color: '#F59E0B', domain: 'watt.sg', matches: /novowatt/i },
  { key: 'greatcharge',label: 'Great Charge',    color: '#B45309',                                matches: /great\s?charge/i },
  { key: 'kigo',       label: 'Kigo',            color: '#16A34A', domain: 'eigen.energy', matches: /eigen/i },
  { key: 'evmobility', label: 'EV Mobility',     color: '#2563EB', domain: 'evmobility.sg',       matches: /ev\s?mobility/i },
  { key: 'ked',        label: 'KED Energy',      color: '#7C3AED', domain: 'ked.energy', matches: /\bked\b/i },
  { key: 'goparkin',   label: 'GoParkin',        color: '#E11D48', domain: 'stengg.com', matches: /st\s?engineering/i },
  { key: 'solacharge', label: 'SolaCharge',      color: '#EAB308', domain: 'solacharge.sg',       matches: /solateks/i },
  { key: 'cityenergy', label: 'City Energy Go',  color: '#DC2626',                                matches: /city\s?energy/i },
  { key: 'evone',      label: 'EVOne',           color: '#0891B2', domain: 'evone.com.sg',        matches: /evone/i },
];

const UNKNOWN: OperatorMeta = {
  key: 'unknown',
  label: 'Unknown operator',
  color: '#64748B',
  matches: /.*/,
};

const COMPANY_SUFFIX = /\s*(PTE\.?\s*LTD\.?|PRIVATE LIMITED|LIMITED|LTD\.?)\s*$/i;

/** "STRIDES YTL PTE. LTD." → "Strides YTL" */
export function companyName(raw: string): string {
  return titleCase(raw.replace(COMPANY_SUFFIX, ''));
}

const cache = new Map<string, OperatorMeta>();

export function resolveOperator(raw: string | undefined | null): OperatorMeta {
  const name = (raw ?? '').trim();
  if (!name || /^unknown/i.test(name)) return UNKNOWN;
  const hit = cache.get(name);
  if (hit) return hit;
  const found = OPERATORS.find(o => o.matches.test(name));
  if (found) {
    cache.set(name, found);
    return found;
  }
  // Smaller operator we don't have a brand for — use a tidied company name
  // and give it a stable key so the filter groups its stations together.
  const fallback: OperatorMeta = {
    key: `other:${name.toLowerCase()}`,
    label: companyName(name),
    color: '#64748B',
    matches: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
  };
  cache.set(name, fallback);
  return fallback;
}

export function operatorLogoUrl(op: OperatorMeta, size = 64): string | null {
  if (!op.domain) return null;
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${op.domain}`;
}

export function operatorInitials(op: OperatorMeta): string {
  const words = op.label.replace(/[^A-Za-z0-9+ ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
