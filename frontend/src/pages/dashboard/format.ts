/** Small formatting helpers shared by the three folds. */

export const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Seconds since midnight (may exceed 86 400 across midnight) -> HH:MM:SS[.d]. */
export function fmtClock(sec: number, decimals = 0): string {
  const day = ((sec % 86400) + 86400) % 86400;
  const whole = Math.floor(day + 1e-9);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const base = `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (!decimals) return base;
  const frac = Math.round((day - whole) * 10 ** decimals);
  return `${base}.${pad(Math.min(frac, 10 ** decimals - 1), decimals)}`;
}

/** Number with sensible digits: big values whole, small values to 2 places. */
export function fmtNum(v: number | null | undefined, digits?: number): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (digits !== undefined) return v.toFixed(digits);
  const a = Math.abs(v);
  if (a >= 1000) return Math.round(v).toString();
  if (a >= 100) return v.toFixed(0);
  return v.toFixed(2);
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export const todayIso = () => isoDate(new Date());

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (i: number) => MONTHS[i];

/** Unit as shown on a card. UNITS holds the project's own spellings; a few read badly. */
const UNIT_LABEL: Record<string, string> = {
  sec: 's',
  knots: 'kts',
  millirad: 'mrad',
  // 'lsw' is how the source file names the sink-rate unit; it is not a recognised
  // unit. Left as recorded until the requirements author confirms m/s.
};
export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return '';
  return UNIT_LABEL[unit.toLowerCase()] ?? unit;
}
