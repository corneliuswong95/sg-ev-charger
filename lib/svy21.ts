// SVY21 (Singapore's national grid, used by HDB/URA datasets) → WGS84.
// Transverse Mercator inverse projection with SVY21's published constants.

const a = 6378137;
const f = 1 / 298.257223563;
const oLat = 1.366666;
const oLon = 103.833333;
const oN = 38744.572;
const oE = 28001.642;
const k = 1;

const b = a * (1 - f);
const e2 = 2 * f - f * f;
const e4 = e2 * e2;
const e6 = e4 * e2;
const A0 = 1 - e2 / 4 - (e4 * 3) / 64 - (e6 * 5) / 256;
const A2 = (3 / 8) * (e2 + e4 / 4 + (e6 * 15) / 128);
const A4 = (15 / 256) * (e4 + (e6 * 3) / 4);
const A6 = (35 * e6) / 3072;

const rad = (d: number) => (d * Math.PI) / 180;

function meridianDistance(latDeg: number): number {
  const r = rad(latDeg);
  return a * (A0 * r - A2 * Math.sin(2 * r) + A4 * Math.sin(4 * r) - A6 * Math.sin(6 * r));
}

const M0 = meridianDistance(oLat);

export function svy21ToWgs84(northing: number, easting: number): [number, number] {
  const Mprime = M0 + (northing - oN) / k;
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n2 * n2;
  const G = a * (1 - n) * (1 - n2) * (1 + (9 * n2) / 4 + (225 * n4) / 64) * (Math.PI / 180);
  const sigma = (Mprime * Math.PI) / (180 * G);

  const latPrime =
    sigma +
    ((3 * n) / 2 - (27 * n3) / 32) * Math.sin(2 * sigma) +
    ((21 * n2) / 16 - (55 * n4) / 32) * Math.sin(4 * sigma) +
    ((151 * n3) / 96) * Math.sin(6 * sigma) +
    ((1097 * n4) / 512) * Math.sin(8 * sigma);

  const sin2 = Math.sin(latPrime) ** 2;
  const rho = (a * (1 - e2)) / (1 - e2 * sin2) ** 1.5;
  const v = a / Math.sqrt(1 - e2 * sin2);
  const psi = v / rho;
  const psi2 = psi * psi;
  const psi3 = psi2 * psi;
  const psi4 = psi3 * psi;
  const t = Math.tan(latPrime);
  const t2 = t * t;
  const t4 = t2 * t2;
  const t6 = t4 * t2;

  const Ep = easting - oE;
  const x = Ep / (k * v);
  const x3 = x ** 3;
  const x5 = x ** 5;
  const x7 = x ** 7;

  const lf = t / (k * rho);
  const lat =
    latPrime -
    lf * ((Ep * x) / 2) +
    lf * ((Ep * x3) / 24) * (-4 * psi2 + 9 * psi * (1 - t2) + 12 * t2) -
    lf * ((Ep * x5) / 720) *
      (8 * psi4 * (11 - 24 * t2) -
        12 * psi3 * (21 - 71 * t2) +
        15 * psi2 * (15 - 98 * t2 + 15 * t4) +
        180 * psi * (5 * t2 - 3 * t4) +
        360 * t4) +
    lf * ((Ep * x7) / 40320) * (1385 - 3633 * t2 + 4095 * t4 + 1575 * t6);

  const sec = 1 / Math.cos(lat);
  const lon =
    rad(oLon) +
    x * sec -
    ((x3 * sec) / 6) * (psi + 2 * t2) +
    ((x5 * sec) / 120) * (-4 * psi3 * (1 - 6 * t2) + psi2 * (9 - 68 * t2) + 72 * psi * t2 + 24 * t4) -
    ((x7 * sec) / 5040) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);

  return [(lat * 180) / Math.PI, (lon * 180) / Math.PI];
}
