// Display helpers shared by server normalization and client components.

// Words with vowels that are still acronyms. Vowel-less words (DBS, SPC, HDB…)
// are kept uppercase automatically.
const ACRONYMS = new Set([
  'AA', 'AC', 'ACS', 'CHIJ', 'DC', 'EV', 'ICB', 'II', 'III', 'ION', 'IV', 'ITE',
  'JEM', 'NEX', 'NTU', 'NTUC', 'NUH', 'NUS', 'OCBC', 'OUE', 'SAFRA', 'SATS',
  'SIA', 'SMU', 'SUTD', 'UE', 'UOB', 'UWC', 'VI', 'YMCA', 'IKEA',
]);
// Vowel-less abbreviations that read better in title case.
const TITLE_ABBR = new Set(['ST', 'RD', 'DR', 'BLK', 'BLKS', 'MT', 'JLN', 'PL', 'LN', 'CL', 'CRES', 'STN', 'CTR', 'LTD']);
const SMALL = new Set(['OF', 'THE', 'AND', 'AT', 'BY', 'IN', 'ON']);
// Brand spellings title-casing can't infer.
const SPECIAL: Record<string, string> = {
  COMFORTDELGRO: 'ComfortDelGro',
  ENGIE: 'ENGIE',
  CAPITALAND: 'CapitaLand',
  CHARGEPLUS: 'ChargePlus',
};

function capitalize(word: string): string {
  const lower = word.toLowerCase();
  const cased = lower.replace(/(^|[-/(.'’@+])([a-z])/g, (m, sep: string, ch: string, offset: number) => {
    // "ANDREW'S" → "Andrew's", but "D'LEEDON" → "D'Leedon".
    if ((sep === "'" || sep === '’') && offset > 0) {
      const rest = lower.slice(offset + 1);
      if (rest.length <= 1) return m;
    }
    return sep + ch.toUpperCase();
  });
  // "MCNAIR" → "McNair"
  return cased.replace(/^Mc([a-z])(?=[a-z]{2})/, (_, ch: string) => `Mc${ch.toUpperCase()}`);
}

function titleWord(word: string, index: number): string {
  if (!word) return word;
  const bare = word.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (SPECIAL[bare]) return word.toUpperCase().replace(bare, SPECIAL[bare]);
  // Block/unit numbers ("142A", "L3A", "#01-02") stay as-is; compounds like
  // "1/CENTRAL" or "24-HOUR" are cased piece by piece.
  if (/\d/.test(word)) {
    if (!/[A-Za-z]{2,}/.test(word) || !/[-/]/.test(word)) return word.toUpperCase();
    return word
      .split(/([-/])/)
      .map(part => (/^[-/]$/.test(part) ? part : titleWord(part, 1)))
      .join('');
  }
  if (ACRONYMS.has(bare)) return word.toUpperCase();
  if (TITLE_ABBR.has(bare)) return capitalize(word);
  if (bare.length >= 2 && !/[AEIOUY]/.test(bare)) return word.toUpperCase();
  if (index > 0 && SMALL.has(bare)) return word.toLowerCase();
  return capitalize(word);
}

export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(titleWord)
    .join(' ');
}

export function formatAddress(raw: string): string {
  return titleCase(raw).replace(/,?\s*Singapore\s+(\d{6})$/i, ', Singapore $1');
}

/** "$0.6976", "$0.69", "$0.545" — as precise as the operator listed it. */
export function formatPrice(price: number): string {
  let s = price.toFixed(4).replace(/0+$/, '');
  if (/\.\d$/.test(s)) s += '0';
  if (s.endsWith('.')) s += '00';
  return `$${s}`;
}

export function formatKw(kw: number): string {
  return Number.isInteger(kw) ? String(kw) : kw.toFixed(1);
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const SGT_TIME = new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Singapore',
});

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return SGT_TIME.format(d).replace(/\s/g, ' ').toLowerCase();
}
