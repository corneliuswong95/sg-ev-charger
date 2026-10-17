/*
  Singapore's 28 postal districts, keyed by postal sector (the first two
  digits of a six-digit postcode). Sector groupings follow URA's postal
  district list; names are shortened to the places people know.
*/

export interface District {
  /** District number, 1–28. */
  no: number;
  name: string;
}

const DISTRICTS: [number, string, string[]][] = [
  [1,  'Raffles Place, Marina',            ['01', '02', '03', '04', '05', '06']],
  [2,  'Tanjong Pagar',                    ['07', '08']],
  [3,  'Queenstown, Tiong Bahru',          ['14', '15', '16']],
  [4,  'Telok Blangah, HarbourFront',      ['09', '10']],
  [5,  'Pasir Panjang, Clementi',          ['11', '12', '13']],
  [6,  'High Street, Beach Road',          ['17']],
  [7,  'Middle Road, Golden Mile',         ['18', '19']],
  [8,  'Little India, Farrer Park',        ['20', '21']],
  [9,  'Orchard, River Valley',            ['22', '23']],
  [10, 'Bukit Timah, Holland, Tanglin',    ['24', '25', '26', '27']],
  [11, 'Novena, Thomson',                  ['28', '29', '30']],
  [12, 'Balestier, Toa Payoh',             ['31', '32', '33']],
  [13, 'MacPherson, Braddell',             ['34', '35', '36', '37']],
  [14, 'Geylang, Eunos',                   ['38', '39', '40', '41']],
  [15, 'Katong, Joo Chiat',                ['42', '43', '44', '45']],
  [16, 'Bedok, Upper East Coast',          ['46', '47', '48']],
  [17, 'Changi, Loyang',                   ['49', '50', '81']],
  [18, 'Tampines, Pasir Ris',              ['51', '52']],
  [19, 'Hougang, Sengkang, Punggol',       ['53', '54', '55', '82']],
  [20, 'Ang Mo Kio, Bishan',               ['56', '57']],
  [21, 'Upper Bukit Timah, Clementi Park', ['58', '59']],
  [22, 'Jurong, Boon Lay, Tuas',           ['60', '61', '62', '63', '64']],
  [23, 'Bukit Batok, Bukit Panjang, Choa Chu Kang', ['65', '66', '67', '68']],
  [24, 'Lim Chu Kang, Tengah',             ['69', '70', '71']],
  [25, 'Woodlands, Kranji',                ['72', '73']],
  [26, 'Upper Thomson, Springleaf',        ['77', '78']],
  [27, 'Yishun, Sembawang',                ['75', '76']],
  [28, 'Seletar, Yio Chu Kang',            ['79', '80']],
];

const BY_SECTOR = new Map<string, District>();
for (const [no, name, sectors] of DISTRICTS) {
  for (const s of sectors) BY_SECTOR.set(s, { no, name });
}

/** "520123" → District 18 (Tampines, Pasir Ris); `null` for missing or unknown postcodes. */
export function districtOf(postalCode: string): District | null {
  const m = postalCode.trim().match(/^(\d{2})\d{4}$/);
  return m ? BY_SECTOR.get(m[1]) ?? null : null;
}
