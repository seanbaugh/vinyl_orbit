import type { ReleaseListItem, ReleaseQuery, SortKey } from '@api/api-types';

export type View = 'grid' | 'list' | 'table';
export type LibraryQuery = ReleaseQuery & { view: View; size: number };

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'artist', label: 'Artist' },
  { key: 'title', label: 'Title' },
  { key: 'year', label: 'Year' },
  { key: 'added', label: 'Date added' },
  { key: 'played', label: 'Last played' },
  { key: 'plays', label: 'Play count' },
  { key: 'value', label: 'Value' },
];

const DEFAULTS = { sort: 'artist' as SortKey, order: 'asc' as const, view: 'grid' as View, size: 180 };
const STRING_KEYS = ['q', 'genre', 'style', 'format', 'label', 'artist'] as const;
const NUMBER_KEYS = ['decade', 'tag', 'crate'] as const;
// Serialisation order: filters, then presentation.
const ORDER = [...STRING_KEYS, ...NUMBER_KEYS, 'sort', 'order', 'view', 'size'] as const;

export type DisplayPref = Pick<LibraryQuery, 'sort' | 'order' | 'view' | 'size'>;

const PREF_KEY = 'vinyl-orbit:display';

/** The sort, order, view and size the user last chose, which apply wherever a link doesn't name one. */
export function loadPref(): DisplayPref {
  try {
    const v = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null');
    if (v) {
      const size = Number(v.size);
      return {
        sort: SORTS.some((s) => s.key === v.sort) ? v.sort : DEFAULTS.sort,
        order: v.order === 'desc' ? 'desc' : 'asc',
        view: v.view === 'list' || v.view === 'table' ? v.view : 'grid',
        size: Number.isFinite(size) ? Math.min(280, Math.max(120, size)) : DEFAULTS.size,
      };
    }
  } catch { /* storage unavailable or corrupt: fall back to the defaults */ }
  return { ...DEFAULTS };
}

export function savePref(pref: DisplayPref): void {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch { /* best effort */ }
}

export function parseQuery(sp: URLSearchParams, pref: DisplayPref = DEFAULTS): LibraryQuery {
  const q: LibraryQuery = { ...DEFAULTS, ...pref };
  for (const k of STRING_KEYS) {
    const v = sp.get(k);
    if (v) q[k] = v;
  }
  for (const k of NUMBER_KEYS) {
    const v = Number(sp.get(k));
    if (sp.get(k) && Number.isInteger(v)) q[k] = v;
  }
  const sort = sp.get('sort');
  if (SORTS.some((s) => s.key === sort)) q.sort = sort as SortKey;
  const order = sp.get('order');
  if (order === 'asc' || order === 'desc') q.order = order;
  const view = sp.get('view');
  if (view === 'list' || view === 'table') q.view = view;
  const size = Number(sp.get('size'));
  if (sp.get('size') && Number.isFinite(size)) q.size = Math.min(280, Math.max(120, size));
  return q;
}

export function toSearchParams(q: Partial<LibraryQuery>, pref: DisplayPref = DEFAULTS): URLSearchParams {
  const sp = new URLSearchParams();
  const defaults: Record<string, unknown> = { ...DEFAULTS, ...pref };
  for (const k of ORDER) {
    const v = q[k];
    if (v === undefined || v === '' || v === defaults[k]) continue;
    sp.set(k, String(v));
  }
  return sp;
}

/** Strips the query down to what the API understands. */
export function apiQuery(q: LibraryQuery): ReleaseQuery {
  const { view: _v, size: _s, ...rest } = q;
  return rest;
}

const ARTICLE = /^(the|a|an)\s+/i;

export function azKey(item: ReleaseListItem, sort: SortKey | undefined): string {
  let text: string;
  if (sort === 'artist' || sort === undefined) text = item.artists.replace(/^the\s+/i, '');
  else if (sort === 'title') text = item.title.replace(ARTICLE, '');
  else return '';
  const first = text.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}
