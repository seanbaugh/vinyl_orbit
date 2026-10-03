export const CURRENCY = 'USD';

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY });
const moneyRound = new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const int = new Intl.NumberFormat();

export const fmtMoney = (v: number | null | undefined, round = false) =>
  v === null || v === undefined ? '—' : (round ? moneyRound : money).format(v);
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : int.format(v));

export function fmtSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.round((now - Date.parse(iso)) / 1000);
  if (diff < 60) return 'just now';
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [2592000, 'month'], [31536000, 'year']];
  let [size, name] = units[0];
  for (const u of units) if (diff >= u[0]) [size, name] = u;
  const n = Math.floor(diff / size);
  return `${n} ${name}${n === 1 ? '' : 's'} ago`;
}
