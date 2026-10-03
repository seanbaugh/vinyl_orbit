-- Discogs-owned data (overwritten by sync)
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY,
  instance_ids TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1,
  master_id INTEGER,
  title TEXT NOT NULL,
  artists_display TEXT NOT NULL,
  artists_json TEXT NOT NULL,
  labels_json TEXT NOT NULL,
  formats_json TEXT NOT NULL,
  format_summary TEXT NOT NULL,
  genres_json TEXT NOT NULL,
  styles_json TEXT NOT NULL,
  year INTEGER,
  country TEXT,
  released TEXT,
  discogs_notes TEXT,
  lowest_price REAL,
  num_for_sale INTEGER,
  community_rating REAL,
  community_votes INTEGER,
  have INTEGER,
  want INTEGER,
  videos_json TEXT,
  identifiers_json TEXT,
  companies_json TEXT,
  extraartists_json TEXT,
  cover_remote TEXT,
  raw_json TEXT,
  date_added TEXT NOT NULL,
  basic_synced_at TEXT NOT NULL,
  detail_synced_at TEXT,
  removed_at TEXT
);

CREATE TABLE IF NOT EXISTS tracks (
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  position TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT NOT NULL,
  artists_json TEXT,
  extraartists_json TEXT,
  PRIMARY KEY (release_id, idx)
);

CREATE TABLE IF NOT EXISTS images (
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  local_path TEXT,
  width INTEGER,
  height INTEGER,
  PRIMARY KEY (release_id, idx)
);

-- User-owned data (never touched by sync). No FKs to releases on purpose:
-- user data must survive anything that happens to Discogs data.
CREATE TABLE IF NOT EXISTS notes (
  release_id INTEGER PRIMARY KEY,
  body_md TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT
);

CREATE TABLE IF NOT EXISTS release_tags (
  release_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (release_id, tag_id)
);

CREATE TABLE IF NOT EXISTS crates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crate_releases (
  crate_id INTEGER NOT NULL REFERENCES crates(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (crate_id, release_id)
);

CREATE TABLE IF NOT EXISTS plays (
  id INTEGER PRIMARY KEY,
  release_id INTEGER NOT NULL,
  played_at TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS plays_release_played ON plays (release_id, played_at);

CREATE TABLE IF NOT EXISTS price_history (
  release_id INTEGER NOT NULL,
  recorded_on TEXT NOT NULL,
  lowest_price REAL,
  num_for_sale INTEGER,
  PRIMARY KEY (release_id, recorded_on)
);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
