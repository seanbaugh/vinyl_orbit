import type {
  Crate, Facet, Facets, Play, ReleaseDetail, ReleaseListItem, ReleaseQuery, SortKey, Tag, TrackRow,
} from '../api-types.js';
import type { Db } from '../db/index.js';
import type { CollectionItem, DiscogsArtist, DiscogsRelease, DiscogsTrack } from '../discogs/types.js';
import { artistsDisplay, cleanArtistName, decadeOf, formatSummary } from '../lib/format.js';
import { groupTracks } from '../lib/tracks.js';

const parse = <T>(json: string | null | undefined, fallback: T): T => (json ? (JSON.parse(json) as T) : fallback);

/** Escapes LIKE wildcards so user input matches literally; use with `ESCAPE '\'`. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const artistLabel = (a: DiscogsArtist) => a.anv || cleanArtistName(a.name);

// ---------------------------------------------------------------- writes

export function upsertBasic(db: Db, items: CollectionItem[], now: string): void {
  const byId = new Map<number, CollectionItem[]>();
  for (const item of items) {
    const id = item.basic_information.id;
    byId.set(id, [...(byId.get(id) ?? []), item]);
  }

  const stmt = db.prepare(`
    INSERT INTO releases (id, instance_ids, copies, master_id, title, artists_display, artists_json, labels_json,
      formats_json, format_summary, genres_json, styles_json, year, cover_remote, date_added, basic_synced_at, removed_at)
    VALUES (@id, @instance_ids, @copies, @master_id, @title, @artists_display, @artists_json, @labels_json,
      @formats_json, @format_summary, @genres_json, @styles_json, @year, @cover_remote, @date_added, @now, NULL)
    ON CONFLICT(id) DO UPDATE SET
      instance_ids = excluded.instance_ids, copies = excluded.copies, master_id = excluded.master_id,
      title = excluded.title, artists_display = excluded.artists_display, artists_json = excluded.artists_json,
      labels_json = excluded.labels_json, formats_json = excluded.formats_json, format_summary = excluded.format_summary,
      genres_json = excluded.genres_json, styles_json = excluded.styles_json, year = excluded.year,
      cover_remote = COALESCE(excluded.cover_remote, releases.cover_remote),
      date_added = excluded.date_added, basic_synced_at = excluded.basic_synced_at, removed_at = NULL`);

  db.transaction(() => {
    for (const [id, copies] of byId) {
      const b = copies[0].basic_information;
      const cover = b.cover_image && !b.cover_image.includes('spacer.gif') ? b.cover_image : null;
      stmt.run({
        id,
        instance_ids: JSON.stringify(copies.map((c) => c.instance_id)),
        copies: copies.length,
        master_id: b.master_id || null,
        title: b.title,
        artists_display: artistsDisplay(b.artists),
        artists_json: JSON.stringify(b.artists),
        labels_json: JSON.stringify(b.labels.map((l) => ({ name: cleanArtistName(l.name), catno: l.catno }))),
        formats_json: JSON.stringify(b.formats),
        format_summary: formatSummary(b.formats),
        genres_json: JSON.stringify(b.genres ?? []),
        styles_json: JSON.stringify(b.styles ?? []),
        year: b.year || null,
        cover_remote: cover,
        date_added: copies.map((c) => c.date_added).sort()[0],
        now,
      });
    }
  })();
}

export function markRemoved(db: Db, seenIds: number[], now: string): number {
  const seen = JSON.stringify(seenIds);
  return db
    .prepare(`UPDATE releases SET removed_at = ? WHERE removed_at IS NULL
              AND id NOT IN (SELECT value FROM json_each(?))`)
    .run(now, seen).changes;
}

function flattenTracks(tracklist: DiscogsTrack[]): DiscogsTrack[] {
  return tracklist.flatMap((t) => {
    if (t.type_ !== 'index') return [t];
    const subs = (t.sub_tracks ?? []).map((sub) => ({ ...sub, position: sub.position || t.position }));
    const subsTimed = subs.some((sub) => sub.duration);
    return [{ ...t, type_: 'heading' as const, duration: subsTimed ? '' : t.duration }, ...subs];
  });
}

export function applyDetail(db: Db, rel: DiscogsRelease, now: string): void {
  const exists = db.prepare('SELECT 1 FROM releases WHERE id = ?').get(rel.id);
  if (!exists) return;

  const images = [...(rel.images ?? [])].sort((a, b) => Number(a.type !== 'primary') - Number(b.type !== 'primary'));
  // Cached files are named by idx, so a cached path is only still valid if the same image sits at the same idx.
  const existingLocal = new Map(
    (db.prepare('SELECT idx, remote_url, local_path FROM images WHERE release_id = ?').all(rel.id) as
      { idx: number; remote_url: string; local_path: string | null }[]).map((r) => [`${r.idx}|${r.remote_url}`, r.local_path]),
  );

  db.transaction(() => {
    db.prepare(`
      UPDATE releases SET master_id = @master_id, country = @country, released = @released, discogs_notes = @notes,
        lowest_price = @lowest_price, num_for_sale = @num_for_sale, community_rating = @rating,
        community_votes = @votes, have = @have, want = @want, videos_json = @videos, identifiers_json = @identifiers,
        companies_json = @companies, extraartists_json = @extraartists, raw_json = @raw,
        cover_remote = COALESCE(cover_remote, @cover), detail_synced_at = @now
      WHERE id = @id`).run({
      id: rel.id,
      master_id: rel.master_id ?? null,
      country: rel.country ?? null,
      released: rel.released ?? null,
      notes: rel.notes ?? null,
      lowest_price: rel.lowest_price ?? null,
      num_for_sale: rel.num_for_sale ?? null,
      rating: rel.community?.rating?.average ?? null,
      votes: rel.community?.rating?.count ?? null,
      have: rel.community?.have ?? null,
      want: rel.community?.want ?? null,
      videos: JSON.stringify(rel.videos ?? []),
      identifiers: JSON.stringify(rel.identifiers ?? []),
      companies: JSON.stringify(rel.companies ?? []),
      extraartists: JSON.stringify(rel.extraartists ?? []),
      raw: JSON.stringify(rel),
      cover: images[0]?.uri ?? null,
      now,
    });

    db.prepare('DELETE FROM tracks WHERE release_id = ?').run(rel.id);
    const insTrack = db.prepare(`INSERT INTO tracks (release_id, idx, position, type, title, duration, artists_json, extraartists_json)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    flattenTracks(rel.tracklist ?? []).forEach((t, idx) =>
      insTrack.run(rel.id, idx, t.position ?? '', t.type_ ?? 'track', t.title ?? '', t.duration ?? '',
        JSON.stringify(t.artists ?? []), JSON.stringify(t.extraartists ?? [])));

    db.prepare('DELETE FROM images WHERE release_id = ?').run(rel.id);
    const insImage = db.prepare(`INSERT INTO images (release_id, idx, type, remote_url, local_path, width, height)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`);
    images.forEach((img, idx) =>
      insImage.run(rel.id, idx, img.type, img.uri, existingLocal.get(`${idx}|${img.uri}`) ?? null, img.width ?? null, img.height ?? null));

    db.prepare(`INSERT OR REPLACE INTO price_history (release_id, recorded_on, lowest_price, num_for_sale)
                VALUES (?, ?, ?, ?)`).run(rel.id, now.slice(0, 10), rel.lowest_price ?? null, rel.num_for_sale ?? null);
  })();
}

export function releasesNeedingDetail(
  db: Db, opts: { refreshDays: number; staleLimit: number | null; now: string },
): number[] {
  const fresh = (db.prepare(`SELECT id FROM releases WHERE removed_at IS NULL AND detail_synced_at IS NULL
                             ORDER BY date_added DESC`).all() as { id: number }[]).map((r) => r.id);
  const cutoff = new Date(Date.parse(opts.now) - opts.refreshDays * 86_400_000).toISOString();
  const stale = (db.prepare(`SELECT id FROM releases WHERE removed_at IS NULL AND detail_synced_at IS NOT NULL
                             AND detail_synced_at < ? ORDER BY detail_synced_at ASC LIMIT ?`)
    .all(cutoff, opts.staleLimit ?? -1) as { id: number }[]).map((r) => r.id);
  return [...fresh, ...stale];
}

/** Images with no cached file. Pass `exists` to also treat recorded-but-deleted files as missing. */
export function imagesMissingLocal(
  db: Db, exists?: (localPath: string) => boolean,
): { releaseId: number; idx: number; remoteUrl: string }[] {
  const rows = db.prepare(`SELECT i.release_id AS releaseId, i.idx, i.remote_url AS remoteUrl, i.local_path AS localPath
                           FROM images i JOIN releases r ON r.id = i.release_id
                           WHERE r.removed_at IS NULL ORDER BY i.idx, i.release_id`).all() as
    { releaseId: number; idx: number; remoteUrl: string; localPath: string | null }[];
  return rows
    .filter((r) => r.localPath === null || (exists !== undefined && !exists(r.localPath)))
    .map(({ releaseId, idx, remoteUrl }) => ({ releaseId, idx, remoteUrl }));
}

export function setImageLocalPath(db: Db, releaseId: number, idx: number, path: string): void {
  db.prepare('UPDATE images SET local_path = ? WHERE release_id = ? AND idx = ?').run(path, releaseId, idx);
}

// ---------------------------------------------------------------- reads

interface ListRow {
  id: number; title: string; artists_display: string; year: number | null; format_summary: string;
  genres_json: string; styles_json: string; labels_json: string; cover_remote: string | null;
  cover_local: string | null; cover_image_remote: string | null; date_added: string; lowest_price: number | null; play_count: number;
  last_played_at: string | null; copies: number; removed_at: string | null;
}

const LIST_SELECT = `
  SELECT r.id, r.title, r.artists_display, r.year, r.format_summary, r.genres_json, r.styles_json, r.labels_json,
    r.cover_remote, i0.local_path AS cover_local, i0.remote_url AS cover_image_remote, r.date_added, r.lowest_price, r.copies, r.removed_at,
    (SELECT count(*) FROM plays p WHERE p.release_id = r.id) AS play_count,
    (SELECT max(played_at) FROM plays p WHERE p.release_id = r.id) AS last_played_at
  FROM releases r
  LEFT JOIN images i0 ON i0.release_id = r.id AND i0.idx = 0`;

const ARTIST_SORT = `(CASE WHEN lower(r.artists_display) LIKE 'the %' THEN substr(r.artists_display, 5)
                     ELSE r.artists_display END) COLLATE NOCASE`;

const TITLE_SORT = `(CASE WHEN lower(r.title) LIKE 'the %' THEN substr(r.title, 5)
                    WHEN lower(r.title) LIKE 'an %' THEN substr(r.title, 4)
                    WHEN lower(r.title) LIKE 'a %' THEN substr(r.title, 3)
                    ELSE r.title END) COLLATE NOCASE`;

const SORTS: Record<SortKey, { expr: string; nullable: boolean }> = {
  artist: { expr: ARTIST_SORT, nullable: false },
  title: { expr: TITLE_SORT, nullable: false },
  year: { expr: 'r.year', nullable: true },
  added: { expr: 'r.date_added', nullable: false },
  played: { expr: 'last_played_at', nullable: true },
  plays: { expr: 'play_count', nullable: false },
  value: { expr: 'r.lowest_price', nullable: true },
};

function tagsFor(db: Db, ids: number[]): Map<number, Tag[]> {
  const rows = db.prepare(`SELECT rt.release_id, t.id, t.name, t.color FROM release_tags rt
                           JOIN tags t ON t.id = rt.tag_id
                           WHERE rt.release_id IN (SELECT value FROM json_each(?)) ORDER BY t.name`)
    .all(JSON.stringify(ids)) as { release_id: number; id: number; name: string; color: string | null }[];
  const map = new Map<number, Tag[]>();
  for (const r of rows) map.set(r.release_id, [...(map.get(r.release_id) ?? []), { id: r.id, name: r.name, color: r.color }]);
  return map;
}

function toListItems(db: Db, rows: ListRow[]): ReleaseListItem[] {
  const tags = tagsFor(db, rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    artists: r.artists_display,
    year: r.year,
    formatSummary: r.format_summary,
    genres: parse(r.genres_json, []),
    styles: parse(r.styles_json, []),
    labels: parse(r.labels_json, []),
    coverUrl: r.cover_local ? `/images/${r.id}/0.jpg` : r.cover_image_remote ?? r.cover_remote,
    dateAdded: r.date_added,
    lowestPrice: r.lowest_price,
    playCount: r.play_count,
    lastPlayedAt: r.last_played_at,
    tags: tags.get(r.id) ?? [],
    copies: r.copies,
    removed: r.removed_at !== null,
  }));
}

/** Runs the list query with an extra WHERE/ORDER fragment; used by insights too. */
export function queryList(db: Db, where: string[], params: unknown[], orderBy: string, limit?: number): ReleaseListItem[] {
  const sql = `${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy}
               ${limit ? `LIMIT ${Math.floor(limit)}` : ''}`;
  return toListItems(db, db.prepare(sql).all(...params) as ListRow[]);
}

export function listReleases(db: Db, q: ReleaseQuery): ReleaseListItem[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, ...p: unknown[]) => { where.push(clause); params.push(...p); };

  if (!q.includeRemoved) add('r.removed_at IS NULL');
  if (q.genre) add('EXISTS (SELECT 1 FROM json_each(r.genres_json) WHERE value = ?)', q.genre);
  if (q.style) add('EXISTS (SELECT 1 FROM json_each(r.styles_json) WHERE value = ?)', q.style);
  if (q.label) add("EXISTS (SELECT 1 FROM json_each(r.labels_json) WHERE json_extract(value, '$.name') = ?)", q.label);
  if (q.format) add("r.format_summary LIKE ? ESCAPE '\\'", likePattern(q.format));
  if (q.artist) add("r.artists_display LIKE ? ESCAPE '\\'", likePattern(q.artist));
  if (q.decade !== undefined) add('r.year >= ? AND r.year < ?', q.decade, q.decade + 10);
  if (q.tag !== undefined) add('EXISTS (SELECT 1 FROM release_tags rt WHERE rt.release_id = r.id AND rt.tag_id = ?)', q.tag);
  if (q.crate !== undefined) add('EXISTS (SELECT 1 FROM crate_releases cr WHERE cr.release_id = r.id AND cr.crate_id = ?)', q.crate);
  if (q.q?.trim()) {
    const p = likePattern(q.q.trim());
    add(`(r.title LIKE ? ESCAPE '\\' OR r.artists_display LIKE ? ESCAPE '\\' OR r.labels_json LIKE ? ESCAPE '\\')`, p, p, p);
  }

  let orderBy: string;
  if (!q.sort && q.crate !== undefined) {
    orderBy = '(SELECT position FROM crate_releases cr WHERE cr.release_id = r.id AND cr.crate_id = ?)';
    params.push(q.crate);
  } else {
    const sort = SORTS[q.sort ?? 'artist'];
    const dir = q.order === 'desc' ? 'DESC' : 'ASC';
    orderBy = `${sort.nullable ? `(${sort.expr}) IS NULL, ` : ''}${sort.expr} ${dir}, r.title COLLATE NOCASE ASC`;
  }
  return queryList(db, where, params, orderBy);
}

export function getReleaseDetail(db: Db, id: number): ReleaseDetail | null {
  const [base] = queryList(db, ['r.id = ?'], [id], 'r.id');
  if (!base) return null;
  const r = db.prepare('SELECT * FROM releases WHERE id = ?').get(id) as Record<string, any>;

  const tracks = (db.prepare('SELECT * FROM tracks WHERE release_id = ? ORDER BY idx').all(id) as Record<string, any>[])
    .map((t): TrackRow => ({
      position: t.position,
      type: t.type,
      title: t.title,
      duration: t.duration,
      artists: artistsDisplay(parse<DiscogsArtist[]>(t.artists_json, [])),
      credits: parse<DiscogsArtist[]>(t.extraartists_json, []).map((a) => `${a.role}: ${artistLabel(a)}`).join('; '),
    }));

  const images = (db.prepare('SELECT * FROM images WHERE release_id = ? ORDER BY idx').all(id) as Record<string, any>[])
    .map((i) => ({
      idx: i.idx as number,
      url: i.local_path ? `/images/${id}/${i.idx}.jpg` : (i.remote_url as string),
      width: i.width as number | null,
      height: i.height as number | null,
    }));

  const note = db.prepare('SELECT body_md AS bodyMd, updated_at AS updatedAt FROM notes WHERE release_id = ?').get(id) as
    ReleaseDetail['note'] | undefined;
  const crates = db.prepare(`SELECT c.id, c.name, c.description, c.created_at AS createdAt,
                               (SELECT count(*) FROM crate_releases x WHERE x.crate_id = c.id) AS count
                             FROM crates c JOIN crate_releases cr ON cr.crate_id = c.id
                             WHERE cr.release_id = ? ORDER BY c.name`).all(id) as Crate[];
  const plays = db.prepare(`SELECT id, played_at AS playedAt, note FROM plays WHERE release_id = ?
                            ORDER BY played_at DESC, id DESC`).all(id) as Play[];
  const priceHistory = db.prepare(`SELECT recorded_on AS date, lowest_price AS lowestPrice, num_for_sale AS numForSale
                                   FROM price_history WHERE release_id = ? ORDER BY recorded_on`).all(id) as
    ReleaseDetail['priceHistory'];

  return {
    ...base,
    country: r.country,
    released: r.released,
    masterId: r.master_id,
    discogsUrl: `https://www.discogs.com/release/${id}`,
    discogsNotes: r.discogs_notes,
    numForSale: r.num_for_sale,
    communityRating: r.community_rating,
    communityVotes: r.community_votes,
    have: r.have,
    want: r.want,
    sides: groupTracks(tracks),
    images,
    credits: parse<DiscogsArtist[]>(r.extraartists_json, []).map((a) => ({ name: artistLabel(a), role: a.role })),
    companies: parse<{ name: string; entity_type_name: string }[]>(r.companies_json, [])
      .map((c) => ({ name: cleanArtistName(c.name), role: c.entity_type_name })),
    identifiers: parse(r.identifiers_json, []),
    videos: parse<{ uri: string; title: string }[]>(r.videos_json, []).map((v) => ({ uri: v.uri, title: v.title })),
    note: note ?? null,
    crates,
    plays,
    priceHistory,
    detailSyncedAt: r.detail_synced_at,
  };
}

function tally(values: string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function listTagsWithCounts(db: Db): Tag[] {
  return db.prepare(`SELECT t.id, t.name, t.color,
                       (SELECT count(*) FROM release_tags rt JOIN releases r ON r.id = rt.release_id
                        WHERE rt.tag_id = t.id AND r.removed_at IS NULL) AS count
                     FROM tags t ORDER BY t.name COLLATE NOCASE`).all() as Tag[];
}

export function listCratesWithCounts(db: Db): Crate[] {
  return db.prepare(`SELECT c.id, c.name, c.description, c.created_at AS createdAt,
                       (SELECT count(*) FROM crate_releases cr WHERE cr.crate_id = c.id) AS count
                     FROM crates c ORDER BY c.name COLLATE NOCASE`).all() as Crate[];
}

export function getFacets(db: Db): Facets {
  const rows = db.prepare(`SELECT artists_json, labels_json, genres_json, styles_json, format_summary, year
                           FROM releases WHERE removed_at IS NULL`).all() as Record<string, any>[];
  return {
    genres: tally(rows.flatMap((r) => parse<string[]>(r.genres_json, []))),
    styles: tally(rows.flatMap((r) => parse<string[]>(r.styles_json, []))),
    formats: tally(rows.map((r) => r.format_summary)),
    decades: tally(rows.map((r) => decadeOf(r.year)).filter((d): d is number => d !== null).map(String)),
    labels: tally(rows.flatMap((r) => [...new Set(parse<{ name: string }[]>(r.labels_json, []).map((l) => l.name))])),
    artists: tally(rows.flatMap((r) => [...new Set(parse<DiscogsArtist[]>(r.artists_json, []).map(artistLabel))])),
    tags: listTagsWithCounts(db),
    crates: listCratesWithCounts(db),
    total: rows.length,
  };
}
