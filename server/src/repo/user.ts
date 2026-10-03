import type { Crate, Play, Tag } from '../api-types.js';
import type { Db } from '../db/index.js';
import { listCratesWithCounts, listTagsWithCounts } from './releases.js';

// ---------------------------------------------------------------- notes

export function saveNote(db: Db, releaseId: number, bodyMd: string, now: string): void {
  if (!bodyMd.trim()) {
    db.prepare('DELETE FROM notes WHERE release_id = ?').run(releaseId);
    return;
  }
  db.prepare(`INSERT INTO notes (release_id, body_md, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(release_id) DO UPDATE SET body_md = excluded.body_md, updated_at = excluded.updated_at`)
    .run(releaseId, bodyMd, now);
}

// ---------------------------------------------------------------- tags

export const listTags = listTagsWithCounts;

export function createTag(db: Db, name: string, color: string | null = null): Tag {
  const trimmed = name.trim();
  db.prepare('INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').run(trimmed, color);
  return db.prepare('SELECT id, name, color FROM tags WHERE name = ?').get(trimmed) as Tag;
}

export function updateTag(db: Db, id: number, patch: { name?: string; color?: string | null }): Tag | null {
  const tag = db.prepare('SELECT id, name, color FROM tags WHERE id = ?').get(id) as Tag | undefined;
  if (!tag) return null;
  const next = { name: patch.name?.trim() || tag.name, color: patch.color === undefined ? tag.color : patch.color };
  db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(next.name, next.color, id);
  return { id, ...next };
}

export function deleteTag(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM tags WHERE id = ?').run(id).changes > 0;
}

export function addTagToRelease(db: Db, releaseId: number, name: string): Tag {
  const tag = createTag(db, name);
  db.prepare('INSERT OR IGNORE INTO release_tags (release_id, tag_id) VALUES (?, ?)').run(releaseId, tag.id);
  return tag;
}

export function removeTagFromRelease(db: Db, releaseId: number, tagId: number): void {
  db.prepare('DELETE FROM release_tags WHERE release_id = ? AND tag_id = ?').run(releaseId, tagId);
}

// ---------------------------------------------------------------- crates

export const listCrates = listCratesWithCounts;

export function getCrate(db: Db, id: number): Crate | null {
  return listCratesWithCounts(db).find((c) => c.id === id) ?? null;
}

export function createCrate(db: Db, name: string, description: string, now: string): Crate {
  const { lastInsertRowid } = db.prepare('INSERT INTO crates (name, description, created_at) VALUES (?, ?, ?)')
    .run(name.trim(), description, now);
  return getCrate(db, Number(lastInsertRowid))!;
}

export function updateCrate(db: Db, id: number, patch: { name?: string; description?: string }): Crate | null {
  const crate = getCrate(db, id);
  if (!crate) return null;
  db.prepare('UPDATE crates SET name = ?, description = ? WHERE id = ?')
    .run(patch.name?.trim() || crate.name, patch.description ?? crate.description, id);
  return getCrate(db, id);
}

export function deleteCrate(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM crates WHERE id = ?').run(id).changes > 0;
}

export function addToCrate(db: Db, crateId: number, releaseId: number): void {
  db.prepare(`INSERT OR IGNORE INTO crate_releases (crate_id, release_id, position)
              VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM crate_releases WHERE crate_id = ?))`)
    .run(crateId, releaseId, crateId);
}

export function removeFromCrate(db: Db, crateId: number, releaseId: number): void {
  db.prepare('DELETE FROM crate_releases WHERE crate_id = ? AND release_id = ?').run(crateId, releaseId);
}

// ---------------------------------------------------------------- plays

export function addPlay(db: Db, releaseId: number, playedAt: string, note: string | null = null): Play {
  const { lastInsertRowid } = db.prepare('INSERT INTO plays (release_id, played_at, note) VALUES (?, ?, ?)')
    .run(releaseId, playedAt, note);
  return { id: Number(lastInsertRowid), playedAt, note };
}

export function deletePlay(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM plays WHERE id = ?').run(id).changes > 0;
}
