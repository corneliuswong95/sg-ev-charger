export interface OperatorMeta {
  key: string;
  label: string;
  color: string;
  domain?: string;
  matches: RegExp;
}

const OPERATORS: OperatorMeta[] = [
  { key: 'sp',         label: 'SP Mobility',    color: '#ec6608', domain: 'sp.com.sg',            matches: /\bsp\b|sp[\s-]?(group|mobility)/i },
  { key: 'shell',      label: 'Shell Recharge', color: '#fbce07', domain: 'shell.com.sg',         matches: /shell/i },
  { key: 'bluesg',     label: 'BlueSG',         color: '#3b82f6', domain: 'bluesg.com.sg',        matches: /blue\s?sg/i },
  { key: 'cdg',        label: 'ComfortDelGro',  color: '#16a34a', domain: 'cdgengie.com',         matches: /comfort\s?del\s?gro|\bcdg\b/i },
  { key: 'chargeplus', label: 'Charge+',        color: '#f97316', domain: 'chargeplus.com',       matches: /charge\s?\+|chargeplus/i },
  { key: 'tesla',      label: 'Tesla',          color: '#e31937', domain: 'tesla.com',            matches: /tesla/i },
  { key: 'greenlots',  label: 'Greenlots',      color: '#22c55e', domain: 'greenlots.com',        matches: /greenlots/i },
  { key: 'evcs',       label: 'EVCS',           color: '#0ea5e9', domain: 'evcs.com.sg',          matches: /\bevcs\b/i },
  { key: 'cityenergy', label: 'City Energy Go', color: '#dc2626', domain: 'cityenergy.com.sg',    matches: /city\s?energy/i },
  { key: 'volt',       label: 'Volt',           color: '#a855f7', domain: 'voltcharging.sg',      matches: /\bvolt\b/i },
];

const UNKNOWN: OperatorMeta = {
  key: 'unknown',
  label: 'Unknown',
  color: '#64748b',
  matches: /.*/,
};

const cache = new Map<string, OperatorMeta>();

export function resolveOperator(raw: string | undefined | null): OperatorMeta {
  const key = (raw ?? '').trim();
  if (!key) return UNKNOWN;
  const hit = cache.get(key);
  if (hit) return hit;
  const found = OPERATORS.find(o => o.matches.test(key));
  if (found) {
    cache.set(key, found);
    return found;
  }
  // Unknown but named operator — give it a stable identity so the filter
  // still treats e.g. two "Acme Charging" rows as one.
  const fallback: OperatorMeta = {
    key: `other:${key.toLowerCase()}`,
    label: key,
    color: '#64748b',
    matches: new RegExp('^' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
  };
  cache.set(key, fallback);
  return fallback;
}

export function operatorLogoUrl(op: OperatorMeta, size = 64): string | null {
  if (!op.domain) return null;
  return `https://www.google.com/s2/favicons?sz=${size}&domain=${op.domain}`;
}

export function operatorInitials(op: OperatorMeta): string {
  const words = op.label.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
