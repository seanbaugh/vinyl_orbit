import type { Dashboard, Facet, SearchResults, Stats } from '../api-types.js';

export type { Dashboard, SearchResults, Stats };
import type { Db } from '../db/index.js';
import { getFacets, likePattern, queryList } from './releases.js';

const SHELF = 20;
const ACTIVE = 'r.removed_at IS NULL';

function value(db: Db) {
  return db.prepare(`SELECT coalesce(sum(lowest_price), 0) AS total, count(lowest_price) AS n
                     FROM releases WHERE removed_at IS NULL`).get() as { total: number; n: number };
}

export function getDashboard(db: Db, now: Date): Dashboard {
  const facets = getFacets(db);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const v = value(db);
  return {
    stats: {
      records: facets.total,
      estimatedValue: v.total,
      valuedCount: v.n,
      playsThisMonth: (db.prepare(`SELECT count(*) AS n FROM plays p JOIN releases r ON r.id = p.release_id
                                   WHERE ${ACTIVE} AND p.played_at >= ?`).get(monthStart) as { n: number }).n,
      topGenre: facets.genres[0]?.value ?? null,
    },
    recentlyAdded: queryList(db, [ACTIVE], [], 'r.date_added DESC', SHELF),
    pullSomething: queryList(db, [ACTIVE], [], 'random()', SHELF),
    recentlyPlayed: queryList(db, [ACTIVE, 'last_played_at IS NOT NULL'], [], 'last_played_at DESC', SHELF),
    notPlayedInAWhile: queryList(db, [ACTIVE, '(last_played_at IS NULL OR last_played_at < ?)'], [cutoff],
      'last_played_at IS NOT NULL, last_played_at ASC, r.date_added ASC', SHELF),
  };
}

export function getStats(db: Db, now: Date = new Date()): Stats {
  const facets = getFacets(db);
  const rows = db.prepare('SELECT genres_json, lowest_price FROM releases WHERE removed_at IS NULL AND lowest_price IS NOT NULL')
    .all() as { genres_json: string; lowest_price: number }[];
  const byGenre = new Map<string, number>();
  for (const r of rows) {
    for (const g of JSON.parse(r.genres_json) as string[]) byGenre.set(g, (byGenre.get(g) ?? 0) + r.lowest_price);
  }
  const since = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const playRows = db.prepare(`SELECT substr(p.played_at, 1, 7) AS month, count(*) AS count FROM plays p
                               JOIN releases r ON r.id = p.release_id
                               WHERE ${ACTIVE} AND p.played_at >= ? GROUP BY month`).all(since.toISOString()) as
    { month: string; count: number }[];
  const playsByMonth = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { month, count: playRows.find((p) => p.month === month)?.count ?? 0 };
  });

  return {
    byGenre: facets.genres,
    byStyle: facets.styles,
    byDecade: [...facets.decades].sort((a, b) => a.value.localeCompare(b.value)),
    byFormat: facets.formats,
    byLabel: facets.labels,
    mostPlayed: queryList(db, [ACTIVE, 'play_count > 0'], [], 'play_count DESC, last_played_at DESC', 10),
    valueByGenre: [...byGenre].map(([v, total]) => ({ value: v, total })).sort((a, b) => b.total - a.total),
    totalValue: value(db).total,
    playsByMonth,
  };
}

export function search(db: Db, q: string): SearchResults {
  const term = q.trim();
  if (!term) return { releases: [], artists: [], labels: [], tracks: [], notes: [] };
  const p = likePattern(term);
  const lower = term.toLowerCase();
  const facets = getFacets(db);
  const matches = (f: Facet) => f.value.toLowerCase().includes(lower);

  const notes = (db.prepare(`SELECT n.release_id AS releaseId, n.body_md AS body, r.title AS releaseTitle FROM notes n
                             JOIN releases r ON r.id = n.release_id
                             WHERE ${ACTIVE} AND n.body_md LIKE ? ESCAPE '\\' LIMIT 8`).all(p) as
    { releaseId: number; body: string; releaseTitle: string }[]).map((n) => {
    const at = Math.max(0, n.body.toLowerCase().indexOf(lower) - 40);
    return { releaseId: n.releaseId, releaseTitle: n.releaseTitle,
      snippet: (at > 0 ? '…' : '') + n.body.slice(at, at + 120).replace(/\s+/g, ' ') };
  });

  return {
    releases: queryList(db, [ACTIVE, `(r.title LIKE ? ESCAPE '\\' OR r.artists_display LIKE ? ESCAPE '\\')`], [p, p],
      'r.title COLLATE NOCASE', 8),
    artists: facets.artists.filter(matches).slice(0, 8),
    labels: facets.labels.filter(matches).slice(0, 8),
    tracks: db.prepare(`SELECT t.release_id AS releaseId, t.title, t.position, r.title AS releaseTitle FROM tracks t
                        JOIN releases r ON r.id = t.release_id
                        WHERE ${ACTIVE} AND t.type = 'track' AND t.title LIKE ? ESCAPE '\\'
                        ORDER BY t.title COLLATE NOCASE LIMIT 8`).all(p) as SearchResults['tracks'],
    notes,
  };
}
