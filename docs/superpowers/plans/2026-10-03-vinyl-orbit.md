# Vinyl Orbit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-container web app that syncs the public Discogs collection of `seanmikel`, caches it in SQLite, and presents it in a BookOrbit-style UI with notes, tags, crates, a listening log, and price history.

**Architecture:** npm-workspaces monorepo. `server/` is a Fastify + better-sqlite3 TypeScript app that owns sync, persistence and a JSON API, and serves the built SPA in production. `web/` is a React + Vite SPA consuming the API via TanStack Query. One Docker image, one port (3020), one volume (`/data`).

**Tech Stack:** Node 22, TypeScript 5 (ESM), Fastify 5, @fastify/static, better-sqlite3, zod, tsx, Vitest, React 18, Vite 5, react-router-dom 6, @tanstack/react-query 5, recharts, marked + dompurify, lucide-react, concurrently.

**Spec:** `docs/superpowers/specs/2026-10-03-vinyl-orbit-design.md`

## Global Constraints

- App name "Vinyl Orbit"; wordmark rendered as "Vinyl" + accent-coloured "Orbit" in a serif (Fraunces), UI text Inter.
- Default port `3020`; data dir `/data` in Docker, `./data` in dev.
- Env vars and defaults exactly: `DISCOGS_USERNAME=seanmikel`, `DISCOGS_TOKEN=` (optional), `PORT=3020`, `DATA_DIR`, `SYNC_INTERVAL_HOURS=6` (`0` disables), `DETAIL_REFRESH_DAYS=7`, `DETAIL_REFRESH_PER_RUN=15`, `CURRENCY=USD`.
- Every Discogs request sends `User-Agent: VinylOrbit/1.0 +https://github.com/seanmikel/vinyl-orbit`; with a token, header `Authorization: Discogs token=<token>`.
- Rate limit: 1 request per 2500 ms unauthenticated, 1 per 1100 ms with token; on 429 retry up to 5 times (honour `Retry-After` seconds, else 2^attempt s).
- Sync never writes to user-owned tables (`notes`, `tags`, `release_tags`, `crates`, `crate_releases`, `plays`); it only inserts into `price_history`.
- Releases absent from the collection get `removed_at` set, never deleted; hidden from lists unless `includeRemoved=true`.
- No authentication; no writes to Discogs.
- Images cached at `DATA_DIR/images/{releaseId}/{idx}.jpg`, served at `/images/{releaseId}/{idx}.jpg`.
- Dark theme default, light available; accent default teal `#3cc8b4`; theme + accent stored in `localStorage` (wrapped in try/catch).
- Sidebar collapses to a drawer below 900px viewport width.

## Review Focus

1. **No cover / no images** (real case: release 30487525 "Four" has 0 images and empty `cover_image`) → card and detail show a vinyl placeholder, sync doesn't error. Test in Task 6 + Task 10.
2. **Odd tracklists** — `heading` rows with empty position, empty durations, CD `1-1`/`2-3` positions, `A1a` sub-positions, `index` tracks with `sub_tracks` (real: 14093800, 9222236) → grouped correctly by side/disc, runtime total omits unknown durations. Tests in Task 3.
3. **Same release owned twice** (Discogs allows multiple instances of one release id) → one row with `copies = 2`, no PK crash. Test in Task 5.
4. **No marketplace listings** (`lowest_price: null`) → value shows "—", excluded from total, no `price_history` NULL crash. Test in Task 5.
5. **Search input with `%`, `_`, quotes, or an apostrophe ("Guns N' Roses")** → treated literally, no SQL error. Test in Task 7.

---

## File Structure

```
package.json                 workspaces + root scripts (dev, build, test)
tsconfig.base.json
.env.example
Dockerfile
docker-compose.yml
.dockerignore
README.md
server/
  package.json  tsconfig.json  vitest.config.ts
  src/
    config.ts                  env → Config
    db/schema.sql              all tables + indexes
    db/index.ts                openDb()
    lib/format.ts              artist/format/decade helpers
    lib/tracks.ts              duration parsing + side grouping
    discogs/types.ts           Discogs response types
    discogs/rateLimiter.ts     RateLimiter
    discogs/client.ts          createDiscogsClient()
    repo/releases.ts           Discogs-owned writes + list/detail/facets reads
    repo/user.ts               notes, tags, crates, plays
    repo/insights.ts           dashboard, stats, search
    sync/sync.ts               runSync()
    sync/scheduler.ts          createScheduler()
    api-types.ts               JSON shapes shared with web
    routes/releases.ts  routes/user.ts  routes/insights.ts  routes/sync.ts
    app.ts                     buildApp()
    main.ts                    entrypoint
  test/
    fixtures/collection.json  fixtures/release-*.json
    *.test.ts
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx  App.tsx
    api/client.ts  api/hooks.ts
    theme/theme.css  theme/ThemeProvider.tsx
    components/  Sidebar.tsx TopBar.tsx CommandPalette.tsx CoverImage.tsx CoverCard.tsx Shelf.tsx
                 FilterBar.tsx AZRail.tsx Lightbox.tsx TagEditor.tsx CrateMenu.tsx SyncPanel.tsx
    pages/  Dashboard.tsx Library.tsx Release.tsx Browse.tsx Crate.tsx Stats.tsx
    lib/query.ts               URL <-> filter state
```

---

### Task 1: Monorepo scaffold + config

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config.ts`
- Test: `server/test/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Config {
    username: string; token: string | null; port: number; dataDir: string;
    syncIntervalHours: number; detailRefreshDays: number; detailRefreshPerRun: number; currency: string;
  }
  export function loadConfig(env?: Record<string, string | undefined>): Config
  ```

- [ ] **Step 1:** Root `package.json`: `"private": true`, `"workspaces": ["server","web"]`, scripts `dev` = `concurrently -n api,web "npm -w server run dev" "npm -w web run dev"`, `build` = `npm -w web run build && npm -w server run build`, `test` = `npm -w server test`. Server package: `"type": "module"`, deps fastify@5 @fastify/static better-sqlite3 zod; dev deps typescript tsx vitest @types/better-sqlite3 @types/node; scripts `dev` = `tsx watch src/main.ts`, `build` = `tsc -p tsconfig.json && cp src/db/schema.sql dist/db/`, `start` = `node dist/main.js`, `test` = `vitest run`. tsconfig: target ES2022, module NodeNext, strict, outDir `dist`, rootDir `src`. Run `npm install`.
- [ ] **Step 2: Write failing test** `server/test/config.test.ts`:
  ```ts
  test('defaults', () => {
    expect(loadConfig({})).toEqual({ username: 'seanmikel', token: null, port: 3020, dataDir: './data',
      syncIntervalHours: 6, detailRefreshDays: 7, detailRefreshPerRun: 15, currency: 'USD' });
  });
  test('overrides', () => {
    const c = loadConfig({ DISCOGS_USERNAME: 'x', DISCOGS_TOKEN: 'tok', PORT: '4000', DATA_DIR: '/data', SYNC_INTERVAL_HOURS: '0' });
    expect(c).toMatchObject({ username: 'x', token: 'tok', port: 4000, dataDir: '/data', syncIntervalHours: 0 });
  });
  test('empty token is null; non-numeric number throws', () => {
    expect(loadConfig({ DISCOGS_TOKEN: '' }).token).toBeNull();
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
  ```
- [ ] **Step 3:** `npm test` → FAIL (module missing).
- [ ] **Step 4:** Implement `loadConfig` (default `env = process.env`; zod or manual parsing; error message names the variable).
- [ ] **Step 5:** `npm test` → PASS. Write `.env.example` listing all Global Constraints env vars with defaults.
- [ ] **Step 6:** Commit `chore: scaffold monorepo and config`.

---

### Task 2: Database schema

**Files:**
- Create: `server/src/db/schema.sql`, `server/src/db/index.ts`
- Test: `server/test/db.test.ts`

**Interfaces:**
- Produces: `export function openDb(file: string): Database.Database` — creates parent dir for non-`:memory:` files, sets `journal_mode = WAL`, `foreign_keys = ON`, executes `schema.sql` (resolved relative to `import.meta.url`).

Schema (all `CREATE TABLE IF NOT EXISTS`; JSON columns are TEXT; timestamps ISO strings):
- `releases(id INTEGER PRIMARY KEY, instance_ids TEXT NOT NULL, copies INTEGER NOT NULL DEFAULT 1, master_id INTEGER, title TEXT NOT NULL, artists_display TEXT NOT NULL, artists_json TEXT NOT NULL, labels_json TEXT NOT NULL, formats_json TEXT NOT NULL, format_summary TEXT NOT NULL, genres_json TEXT NOT NULL, styles_json TEXT NOT NULL, year INTEGER, country TEXT, released TEXT, discogs_notes TEXT, lowest_price REAL, num_for_sale INTEGER, community_rating REAL, community_votes INTEGER, have INTEGER, want INTEGER, videos_json TEXT, identifiers_json TEXT, companies_json TEXT, extraartists_json TEXT, cover_remote TEXT, raw_json TEXT, date_added TEXT NOT NULL, basic_synced_at TEXT NOT NULL, detail_synced_at TEXT, removed_at TEXT)`
- `tracks(release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE, idx INTEGER NOT NULL, position TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, duration TEXT NOT NULL, artists_json TEXT, extraartists_json TEXT, PRIMARY KEY(release_id, idx))`
- `images(release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE, idx INTEGER NOT NULL, type TEXT NOT NULL, remote_url TEXT NOT NULL, local_path TEXT, width INTEGER, height INTEGER, PRIMARY KEY(release_id, idx))`
- `notes(release_id INTEGER PRIMARY KEY, body_md TEXT NOT NULL, updated_at TEXT NOT NULL)` — no FK to releases (user data must survive anything).
- `tags(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, color TEXT)`; `release_tags(release_id INTEGER NOT NULL, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(release_id, tag_id))`
- `crates(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)`; `crate_releases(crate_id INTEGER NOT NULL REFERENCES crates(id) ON DELETE CASCADE, release_id INTEGER NOT NULL, position INTEGER NOT NULL, PRIMARY KEY(crate_id, release_id))`
- `plays(id INTEGER PRIMARY KEY, release_id INTEGER NOT NULL, played_at TEXT NOT NULL, note TEXT)` + index on `(release_id, played_at)`
- `price_history(release_id INTEGER NOT NULL, recorded_on TEXT NOT NULL, lowest_price REAL, num_for_sale INTEGER, PRIMARY KEY(release_id, recorded_on))`
- `sync_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — holds `last_completed_at`, `last_error`.

- [ ] **Step 1: Failing test** — `openDb(':memory:')` then `SELECT name FROM sqlite_master WHERE type='table'` contains all 11 tables above; calling `openDb` twice on the same temp file succeeds (idempotent); deleting a tag cascades its `release_tags` rows.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): sqlite schema`.

---

### Task 3: Pure helpers (formats, artists, tracks)

**Files:**
- Create: `server/src/discogs/types.ts`, `server/src/lib/format.ts`, `server/src/lib/tracks.ts`
- Test: `server/test/format.test.ts`, `server/test/tracks.test.ts`

**Interfaces:**
- `discogs/types.ts`: `DiscogsArtist {name; anv; join; role; tracks; id}`, `DiscogsLabel {name; catno; id}`, `DiscogsFormat {name; qty: string; text?: string; descriptions?: string[]}`, `DiscogsTrack {position; type_: 'track'|'heading'|'index'; title; duration; artists?: DiscogsArtist[]; extraartists?: DiscogsArtist[]; sub_tracks?: DiscogsTrack[]}`, `DiscogsImage {type: 'primary'|'secondary'; uri; uri150; width; height}`, `CollectionItem {id; instance_id; date_added; rating; basic_information: {id; master_id; title; year; cover_image; thumb; formats; labels; artists; genres; styles}}`, `CollectionPage {pagination: {page; pages; items}; releases: CollectionItem[]}`, `DiscogsRelease` (fields listed in spec §2 incl. `community: {rating: {average; count}; have; want}`, `lowest_price: number|null`, `num_for_sale`, `images?`, `videos?: {uri; title; duration}[]`, `identifiers?: {type; value; description?}[]`, `companies?: {name; entity_type_name; catno}[]`).
- `lib/format.ts`:
  - `cleanArtistName(name: string): string` — strips trailing ` (\d+)`.
  - `artistsDisplay(artists: DiscogsArtist[]): string` — uses `anv || cleanArtistName(name)`, joins with each artist's `join` (normalise `,` → `, `, other joins wrapped in spaces), trims.
  - `formatSummary(formats: DiscogsFormat[]): string`
  - `decadeOf(year: number | null | undefined): number | null` — `0`/null → null, else `Math.floor(y/10)*10`.
- `lib/tracks.ts`:
  - `parseDuration(d: string): number | null` — `"m:ss"` or `"h:mm:ss"` → seconds; `''` → null.
  - `sideOf(position: string): string` — `/^([A-Z]+)\d/` or bare letters `/^[A-Z]+$/` → letters; `/^(\d+)-\d+/` → `"Disc " + n`; anything else (numeric `1`, `''`) → `""`.
  - `export interface TrackRow { position: string; type: string; title: string; duration: string; artists: string; credits: string }`
  - `export interface SideGroup { side: string; tracks: TrackRow[]; totalSeconds: number | null }`
  - `groupTracks(tracks: TrackRow[]): SideGroup[]` — iterate in order; headings attach to the next track's group (start a new group only when `sideOf` of a *track* changes); `totalSeconds` = sum of known durations, `null` if none known.

`formatSummary` rules per format, joined `" + "`: label = first of `LP`, `7"`, `10"`, `12"`, `EP` found in `descriptions`; else if `name === 'Box Set'` → `Box`; else `name` (`CD`, `Cassette`, `Vinyl`). Prefix `${qty}×` when qty > 1.

- [ ] **Step 1: Failing tests** (`format.test.ts`):
  ```ts
  expect(cleanArtistName('John Williams (4)')).toBe('John Williams');
  expect(artistsDisplay([{name:'John Williams (4)',anv:'',join:',',...}, {name:'London Symphony Orchestra',anv:'The London Symphony Orchestra',join:'',...}]))
    .toBe('John Williams, The London Symphony Orchestra');
  expect(formatSummary([{name:'Vinyl',qty:'1',descriptions:['LP','Album']}])).toBe('LP');
  expect(formatSummary([{name:'Vinyl',qty:'2',descriptions:['LP','Album']}])).toBe('2×LP');
  expect(formatSummary([{name:'Vinyl',qty:'1',descriptions:['7"','45 RPM','Single']}])).toBe('7"');
  expect(formatSummary([{name:'Vinyl',qty:'2',descriptions:['12"','45 RPM','Album']}])).toBe('2×12"');
  expect(formatSummary([{name:'CD',qty:'2',descriptions:['Album']}])).toBe('2×CD');
  expect(formatSummary([{name:'Vinyl',qty:'3',descriptions:['LP']},{name:'Box Set',qty:'1',descriptions:['Compilation']}])).toBe('3×LP + Box');
  expect(decadeOf(1977)).toBe(1970); expect(decadeOf(0)).toBeNull();
  ```
  (`tracks.test.ts`):
  ```ts
  expect(parseDuration('5:20')).toBe(320); expect(parseDuration('1:02:03')).toBe(3723); expect(parseDuration('')).toBeNull();
  expect(sideOf('A1')).toBe('A'); expect(sideOf('AA')).toBe('AA'); expect(sideOf('B1a')).toBe('B');
  expect(sideOf('1-10')).toBe('Disc 1'); expect(sideOf('3')).toBe(''); expect(sideOf('')).toBe('');
  // heading + empty durations (shape of release 14093800)
  const g = groupTracks([h(''), t('A1',''), t('A2',''), h(''), t('B6','3:00'), t('B7','')]);
  expect(g.map(x => x.side)).toEqual(['A','B']);
  expect(g[0].tracks[0].type).toBe('heading'); expect(g[0].totalSeconds).toBeNull(); expect(g[1].totalSeconds).toBe(180);
  // CD discs (shape of 9222236)
  expect(groupTracks([t('1-1','1:00'), t('1-2','1:00'), t('2-1','2:00')]).map(x => [x.side, x.totalSeconds])).toEqual([['Disc 1',120],['Disc 2',120]]);
  ```
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): format and tracklist helpers`.

---

### Task 4: Discogs client + rate limiter

**Files:**
- Create: `server/src/discogs/rateLimiter.ts`, `server/src/discogs/client.ts`, `server/test/fixtures/*.json`
- Test: `server/test/rateLimiter.test.ts`, `server/test/client.test.ts`

**Interfaces:**
- `class RateLimiter { constructor(intervalMs: number, clock?: { now(): number; sleep(ms: number): Promise<void> }); take(): Promise<void> }` — serialises callers; each `take()` resolves no sooner than `intervalMs` after the previous one resolved.
- ```ts
  export interface DiscogsClient {
    getCollectionPage(page: number, perPage?: number): Promise<CollectionPage>; // perPage default 100, folder 0, sort=added desc
    getRelease(id: number, currency: string): Promise<DiscogsRelease>;          // ?curr_abbr=
    downloadImage(url: string): Promise<Buffer>;                                // not rate-limited (i.discogs.com CDN)
  }
  export function createDiscogsClient(opts: { username: string; token: string | null;
    fetch?: typeof fetch; limiter?: RateLimiter; sleep?: (ms: number) => Promise<void> }): DiscogsClient
  export class DiscogsError extends Error { status: number }
  ```

- [ ] **Step 1: Record fixtures** (run once, commit results):
  ```bash
  cd server/test/fixtures
  curl -s -A "VinylOrbit/1.0" "https://api.discogs.com/users/seanmikel/collection/folders/0/releases?per_page=100" -o collection.json
  for id in 7455230 30487525 9222236 14093800; do curl -s -A "VinylOrbit/1.0" "https://api.discogs.com/releases/$id?curr_abbr=USD" -o release-$id.json; sleep 3; done
  ```
  Expected: `collection.json` has `pagination.items` ≈ 91; four release files each contain `"tracklist"`.
- [ ] **Step 2: Failing tests.** Rate limiter with a fake clock: three `take()` calls at t=0 with interval 2500 resolve at 0, 2500, 5000. Client with a stub `fetch`:
  - request URL for `getCollectionPage(2)` is `https://api.discogs.com/users/seanmikel/collection/folders/0/releases?page=2&per_page=100&sort=added&sort_order=desc`, has the Global Constraints `User-Agent`, and no `Authorization` header when token is null; with token `abc` the header is `Discogs token=abc`.
  - stub returns 429 (`Retry-After: 1`) twice then 200 → resolves; `sleep` called with `[1000, 1000]`.
  - stub returns 429 six times → rejects with `DiscogsError` status 429.
  - 404 → rejects `DiscogsError` status 404 without retry.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement (default limiter interval: 1100 ms if token else 2500 ms). **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat(server): rate-limited Discogs client + fixtures`.

---

### Task 5: Release repository (Discogs-owned data)

**Files:**
- Create: `server/src/repo/releases.ts`, `server/src/api-types.ts`
- Test: `server/test/repo.releases.test.ts`

**Interfaces:**
- `api-types.ts` (shared with web; plain types only, no imports from server code):
  ```ts
  export interface ReleaseListItem { id: number; title: string; artists: string; year: number | null; formatSummary: string;
    genres: string[]; styles: string[]; labels: { name: string; catno: string }[]; coverUrl: string | null;
    dateAdded: string; lowestPrice: number | null; playCount: number; lastPlayedAt: string | null;
    tags: Tag[]; copies: number; removed: boolean }
  export interface Tag { id: number; name: string; color: string | null; count?: number }
  export interface Crate { id: number; name: string; description: string; count: number; createdAt: string }
  export interface Play { id: number; playedAt: string; note: string | null }
  export interface ReleaseDetail extends ReleaseListItem { country: string | null; released: string | null; masterId: number | null;
    discogsUrl: string; discogsNotes: string | null; numForSale: number | null; communityRating: number | null; communityVotes: number | null;
    have: number | null; want: number | null; sides: SideGroup[]; images: { idx: number; url: string; width: number | null; height: number | null }[];
    credits: { name: string; role: string }[]; companies: { name: string; role: string }[]; identifiers: { type: string; value: string; description?: string }[];
    videos: { uri: string; title: string }[]; note: { bodyMd: string; updatedAt: string } | null; crates: Crate[]; plays: Play[];
    priceHistory: { date: string; lowestPrice: number | null; numForSale: number | null }[]; detailSyncedAt: string | null }
  export type SortKey = 'artist' | 'title' | 'year' | 'added' | 'played' | 'plays' | 'value';
  export interface ReleaseQuery { q?: string; genre?: string; style?: string; format?: string; decade?: number; label?: string; artist?: string;
    tag?: number; crate?: number; sort?: SortKey; order?: 'asc' | 'desc'; includeRemoved?: boolean }
  export interface Facets { genres: Facet[]; styles: Facet[]; formats: Facet[]; decades: Facet[]; labels: Facet[]; artists: Facet[]; tags: Tag[]; crates: Crate[]; total: number }
  export interface Facet { value: string; count: number }
  ```
  Re-export `SideGroup`/`TrackRow` shapes (copy the interfaces from `lib/tracks.ts` here and have `lib/tracks.ts` import them).
- `repo/releases.ts`:
  - `upsertBasic(db, items: CollectionItem[], now: string): void` — groups items by `basic_information.id` (→ `copies`, `instance_ids` JSON array, earliest `date_added`); upserts Discogs-owned basic columns + `cover_remote` (null when empty or contains `spacer.gif`); clears `removed_at`; never touches detail columns.
  - `markRemoved(db, seenIds: number[], now: string): number` — sets `removed_at = now` where `removed_at IS NULL` and id not in seen; returns count.
  - `applyDetail(db, rel: DiscogsRelease, now: string): void` — in one transaction: update detail columns + `raw_json`, replace `tracks` (flatten `index` tracks: the index row as a heading, then its `sub_tracks`), replace `images` (keep existing `local_path` where `remote_url` unchanged), `INSERT OR REPLACE` a `price_history` row for `now.slice(0,10)`, set `detail_synced_at = now`.
  - `releasesNeedingDetail(db, opts: { refreshDays: number; staleLimit: number | null; now: string }): number[]` — all non-removed with null `detail_synced_at`, then up to `staleLimit` (null = all) whose `detail_synced_at` is older than `refreshDays`, oldest first.
  - `imagesMissingLocal(db): { releaseId: number; idx: number; remoteUrl: string }[]`; `setImageLocalPath(db, releaseId, idx, path): void`.
  - `listReleases(db, q: ReleaseQuery): ReleaseListItem[]` — filters: genre/style match an element of the JSON arrays (`EXISTS (SELECT 1 FROM json_each(genres_json) WHERE value = ?)`), format = `format_summary` contains the value, decade, label (json_each over labels name), artist (substring of `artists_display`), tag, crate (ordered by crate position when sorting not given), `q` = case-insensitive substring across title/artists/labels with `LIKE ? ESCAPE '\'` and `%`/`_`/`\` escaped. Sort default `artist asc`; ties broken by title. `coverUrl` = `/images/{id}/0.jpg` if image 0 has `local_path`, else `cover_remote`, else null.
  - `getReleaseDetail(db, id: number): ReleaseDetail | null` — builds `sides` via `groupTracks`; `discogsUrl` = `https://www.discogs.com/release/{id}`; credits from `extraartists_json` (`cleanArtistName`).
  - `getFacets(db): Facets` — over non-removed releases; decades as strings like `"1970"`; sorted by count desc then value.

- [ ] **Step 1: Failing tests** using `openDb(':memory:')` + fixtures:
  - `upsertBasic(collection.releases)` → `SELECT count(*)` = fixture item count; release 7455230 has `format_summary '2×LP'`, `artists_display 'John Williams, The London Symphony Orchestra'`.
  - duplicate instance: upsert `[item, {...item, instance_id: 999}]` → one row, `copies = 2`.
  - release 30487525 → `cover_remote` null; `listReleases` item has `coverUrl: null`.
  - `markRemoved(db, [7455230], now)` returns fixture count − 1; `listReleases({})` length 1; `listReleases({ includeRemoved: true })` length = all; re-upserting clears `removed_at`.
  - `applyDetail(release-14093800)` → tracks include `heading` rows; detail `sides.map(s => s.side)` starts `['A','B','C']`; images count = fixture images length; `price_history` has 1 row.
  - `applyDetail(release-30487525)` (lowest_price null) → succeeds, `priceHistory[0].lowestPrice` null, `lowestPrice` null.
  - applying the same detail twice on the same day → still 1 `price_history` row.
  - `releasesNeedingDetail` returns all ids before detail; after `applyDetail` on one id with `now`, calling with `now` + 8 days, `refreshDays 7`, `staleLimit 0` returns only never-detailed ids; `staleLimit null` includes the stale one.
  - `listReleases({ genre: 'Stage & Screen' })` includes 7455230; `listReleases({ sort: 'year', order: 'asc' })` is non-decreasing in year (nulls last).
  - `getFacets(db).total` = non-removed count; `formats` contains `{ value: '2×LP' }`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): release repository`.

---

### Task 6: Sync + scheduler

**Files:**
- Create: `server/src/sync/sync.ts`, `server/src/sync/scheduler.ts`
- Test: `server/test/sync.test.ts`, `server/test/scheduler.test.ts`

**Interfaces:**
- ```ts
  export interface SyncProgress { phase: 'idle' | 'collection' | 'details' | 'images' | 'done' | 'error'; done: number; total: number; message?: string }
  export interface SyncResult { added: number; removed: number; detailed: number; imagesSaved: number; errors: string[] }
  export function runSync(deps: { db: Database; client: DiscogsClient; config: Config; now?: () => Date;
    onProgress?: (p: SyncProgress) => void }, opts: { full: boolean }): Promise<SyncResult>
  export interface SyncStatus { running: boolean; progress: SyncProgress; lastCompletedAt: string | null; lastError: string | null; lastResult: SyncResult | null }
  export function createScheduler(run: (full: boolean, onProgress: (p: SyncProgress) => void) => Promise<SyncResult>,
    opts: { intervalHours: number; db: Database }): { start(): void; stop(): void; trigger(full: boolean): SyncStatus; status(): SyncStatus }
  ```
- `runSync`: page through collection until `page >= pagination.pages`; `upsertBasic` per page; `markRemoved` with all seen ids (only if every page succeeded — a failed page must not mark anything removed); details for `releasesNeedingDetail({ staleLimit: opts.full ? null : config.detailRefreshPerRun })`; then download every `imagesMissingLocal` to `DATA_DIR/images/{id}/{idx}.jpg` and `setImageLocalPath`. Per-release/per-image errors are pushed to `errors` and the run continues. `added` = ids present after but not before.
- Scheduler: single-flight (`trigger` while running returns current status without starting another); persists `last_completed_at` / `last_error` to `sync_state`; `start()` triggers immediately (not full) then every `intervalHours` (skipped when 0) using `setInterval(...).unref()`.

- [ ] **Step 1: Failing tests** with a fake `DiscogsClient` serving fixtures (`downloadImage` returns `Buffer.from('jpg')`), temp `dataDir`, `:memory:` db:
  - first run: `added` = fixture count, `detailed` = fixture count of ids that have release fixtures available (fake client throws 404 for others → those appear in `errors`, run still resolves), image files exist on disk for 7455230 (`images/7455230/0.jpg`).
  - release 30487525 (no images) produces no error.
  - user data preserved: insert a note + play + tag for 7455230, run sync again with that id missing from the collection → release has `removed_at`, note/play/tag rows still present; run again with it back → `removed_at` null, note intact.
  - collection page failure (fake throws on page 1) → `markRemoved` not called (nothing removed), result has error.
  - non-full run with 3 stale releases and `detailRefreshPerRun: 1` → `detailed` = 1; full run → 3.
  - scheduler: `trigger` twice synchronously → `run` called once; after completion `status().lastCompletedAt` set and persisted in `sync_state`; a rejecting `run` sets `lastError`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(server): sync engine and scheduler`.

---

### Task 7: User data, insights repos + HTTP API

**Files:**
- Create: `server/src/repo/user.ts`, `server/src/repo/insights.ts`, `server/src/routes/releases.ts`, `server/src/routes/user.ts`, `server/src/routes/insights.ts`, `server/src/routes/sync.ts`, `server/src/app.ts`, `server/src/main.ts`
- Test: `server/test/api.test.ts`

**Interfaces:**
- `repo/user.ts`: `saveNote(db, releaseId, bodyMd, now)` (empty/whitespace body deletes the note), `listTags(db): Tag[]` (with counts), `createTag(db, name, color?): Tag` (returns existing on case-insensitive duplicate), `updateTag`, `deleteTag`, `addTagToRelease(db, releaseId, name): Tag` (creates if needed), `removeTagFromRelease`, `listCrates(db): Crate[]`, `createCrate(db, name, description, now)`, `updateCrate`, `deleteCrate`, `addToCrate(db, crateId, releaseId)` (position = max+1, ignore duplicate), `removeFromCrate`, `addPlay(db, releaseId, playedAt, note?): Play`, `deletePlay(db, id)`.
- `repo/insights.ts`:
  - `getDashboard(db, now: Date): { stats: { records: number; estimatedValue: number; valuedCount: number; playsThisMonth: number; topGenre: string | null };
    recentlyAdded: ReleaseListItem[]; pullSomething: ReleaseListItem[]; recentlyPlayed: ReleaseListItem[]; notPlayedInAWhile: ReleaseListItem[] }` — shelves of 20; `pullSomething` random (`ORDER BY random()`); `notPlayedInAWhile` = never played or last played > 90 days, oldest first.
  - `getStats(db): { byGenre: Facet[]; byStyle: Facet[]; byDecade: Facet[]; byFormat: Facet[]; byLabel: Facet[]; mostPlayed: (ReleaseListItem)[]; valueByGenre: { value: string; total: number }[]; totalValue: number; playsByMonth: { month: string; count: number }[] }` (last 12 months).
  - `search(db, q: string): { releases: ReleaseListItem[]; artists: Facet[]; labels: Facet[]; tracks: { releaseId: number; title: string; position: string; releaseTitle: string }[]; notes: { releaseId: number; snippet: string; releaseTitle: string }[] }` — each ≤ 8, LIKE with escaping (reuse an exported `likePattern(q)` helper from `repo/releases.ts`).
- Routes (all under `/api`, zod-validated, 400 `{ error }` on bad input, 404 `{ error: 'Not found' }`): exactly the list in spec §7, plus query param parsing for `ReleaseQuery` (`decade`, `tag`, `crate` numeric; `includeRemoved` `'true'`). `POST /api/sync` body `{ full?: boolean }` (default true for manual).
- `buildApp(deps: { db: Database; scheduler: ReturnType<typeof createScheduler>; dataDir: string; webDist?: string }): FastifyInstance` — registers routes; `@fastify/static` for `dataDir/images` at `/images/`; when `webDist` exists, serves it at `/` with SPA fallback (non-`/api`, non-`/images` GETs → `index.html`).
- `main.ts`: `loadConfig()` → `openDb(join(dataDir,'library.db'))` → client → scheduler → `buildApp` → listen `0.0.0.0:port` → `scheduler.start()`; webDist = `../../web/dist` relative to `dist/main.js` (`resolve(fileURLToPath(import.meta.url), '../../../web/dist')`); SIGTERM closes app + db.

- [ ] **Step 1: Failing tests** (`app.inject` against `:memory:` db seeded via `upsertBasic` + `applyDetail` fixtures, stub scheduler):
  - `GET /api/health` → 200 `{ ok: true }`.
  - `GET /api/releases?genre=Classical&sort=year` → 200, contains 7455230. `GET /api/releases?decade=abc` → 400.
  - `GET /api/releases/7455230` → `sides[0].side === 'A'`, `discogsUrl` correct; `GET /api/releases/1` → 404.
  - `PUT /api/releases/7455230/note {bodyMd:'**great**'}` → detail `note.bodyMd === '**great**'`; `PUT` with `'  '` → note null.
  - `POST /api/releases/7455230/tags {name:'Sunday'}` then `{name:'sunday'}` → one tag; `GET /api/facets` tags `[{name:'Sunday', count:1}]`.
  - crate create → add 7455230 twice → `GET /api/crates/:id` count 1; `GET /api/releases?crate=:id` returns it.
  - `POST /api/releases/7455230/plays {}` → 201; `GET /api/dashboard` `stats.playsThisMonth === 1`, `recentlyPlayed[0].id === 7455230`; `DELETE /api/plays/:id` → 204.
  - `GET /api/stats` `totalValue` equals sum of non-null `lowest_price` (30487525 null excluded).
  - Review Focus 5: `GET /api/search?q=` with each of `%`, `_`, `'`, `Guns N' Roses` → 200 and `%` returns no releases (literal match).
  - `POST /api/sync` → calls `scheduler.trigger(true)`; `GET /api/sync/status` → scheduler status.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Live check.** `npm -w server run dev` with `DATA_DIR=./data`; wait for sync (≈4 min; watch `curl -s localhost:3020/api/sync/status`). Expected: `lastCompletedAt` set, `curl -s localhost:3020/api/facets | jq .total` → 91, `ls data/images | wc -l` ≈ 90.
- [ ] **Step 6:** Commit `feat(server): HTTP API, insights, entrypoint`.

---

### Task 8: Web shell — theme, layout, routing, data layer

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api/client.ts`, `web/src/api/hooks.ts`, `web/src/theme/theme.css`, `web/src/theme/ThemeProvider.tsx`, `web/src/components/Sidebar.tsx`, `web/src/components/TopBar.tsx`, `web/src/components/SyncPanel.tsx`, `web/src/components/CoverImage.tsx`

**Interfaces:**
- Consumes: `server/src/api-types.ts` via tsconfig path alias `@api/*` → `../server/src/*` (types only, `import type`).
- `api/client.ts`: `api.get<T>(path, params?)`, `api.put`, `api.post`, `api.patch`, `api.del` — throws `Error(body.error ?? statusText)`.
- `api/hooks.ts`: `useReleases(q: ReleaseQuery)`, `useRelease(id)`, `useFacets()`, `useDashboard()`, `useStats()`, `useSearch(q)` (enabled when `q.length >= 2`), `useSyncStatus()` (refetch every 2 s while `running`, else 60 s), and mutations `useSaveNote`, `useAddTag`, `useRemoveTag`, `useCreateCrate`, `useAddToCrate`, `useRemoveFromCrate`, `useAddPlay`, `useDeletePlay`, `useTriggerSync` — each invalidates `['release', id]`, `['releases']`, `['facets']`, `['dashboard']` as relevant.
- `CoverImage({ src, alt, size? })` — renders `<img loading="lazy">`; on null or `onError` renders a CSS vinyl placeholder (dark disc with grooves + accent label circle).
- Routes: `/` Dashboard, `/library` Library, `/release/:id` Release, `/browse/:facet` Browse (`artists|labels|genres|styles|formats|decades`), `/crate/:id` Crate, `/stats` Stats. Placeholder components for pages built in later tasks.

- [ ] **Step 1:** Scaffold Vite React TS app; deps per Tech Stack; `vite.config.ts` proxies `/api` and `/images` to `http://localhost:3020`; `npm run dev` at root starts both.
- [ ] **Step 2:** `theme.css` tokens on `:root` (dark) and `[data-theme="light"]`: `--bg #0f1514`, `--surface #151d1c`, `--surface-2 #1b2524`, `--border #26322f`, `--text #e6ecea`, `--muted #8a9a96`, `--accent` (default `#3cc8b4`), `--radius 12px`; light equivalents (`--bg #f6f8f8`, `--surface #ffffff`, `--border #e2e8e7`, `--text #17201e`, `--muted #5f6f6b`). Body background = `--bg` plus a fixed concentric-groove `repeating-radial-gradient` at ~4% opacity. Fonts Inter + Fraunces from Google Fonts.
- [ ] **Step 3:** `ThemeProvider` exposes `{ theme, setTheme, accent, setAccent }`; persists to `localStorage` keys `vo-theme`, `vo-accent` (try/catch); sets `data-theme` and `--accent` on `<html>`. Accent palette: teal `#3cc8b4`, blue `#5b8def`, violet `#9b7bea`, pink `#e86fa6`, orange `#ef8a4c`, yellow `#e3c04a`, green `#6cc56f`.
- [ ] **Step 4:** `Sidebar` (BookOrbit structure from spec §8): wordmark; Dashboard; Library with `facets.total`; Browse group (Artists, Labels, Genres, Styles, Formats, Decades with counts = facet list length); Crates group with counts and "+" (prompt for name → `useCreateCrate`); Tags group (tag → `/library?tag=id`); footer `SyncPanel` (relative "Synced 2h ago", button "Sync now", progress bar `done/total` + phase while running, last error in muted red). Collapsible groups; below 900px becomes an off-canvas drawer toggled from `TopBar`.
- [ ] **Step 5:** `TopBar`: sidebar toggle, search pill showing `⌘K` (opens palette — stub until Task 11), theme toggle (sun/moon), accent picker popover, Stats link.
- [ ] **Step 6: Verify.** `npm run dev`; open `http://localhost:5173` in the browser pane. Expected: dark shell with sidebar counts populated from the live API (Library 91), theme toggle switches light/dark and survives reload, no console errors. Check 375px width: sidebar hidden behind toggle, no horizontal scroll.
- [ ] **Step 7:** Commit `feat(web): app shell, theme, data hooks`.

---

### Task 9: Library page

**Files:**
- Create: `web/src/pages/Library.tsx`, `web/src/components/CoverCard.tsx`, `web/src/components/FilterBar.tsx`, `web/src/components/AZRail.tsx`, `web/src/lib/query.ts`
- Test: `web/src/lib/query.test.ts` (add `vitest` to web; root `test` script runs both workspaces)

**Interfaces:**
- `lib/query.ts`: `parseQuery(sp: URLSearchParams): ReleaseQuery & { view: 'grid'|'list'|'table'; size: number }`, `toSearchParams(q): URLSearchParams` (omits defaults: sort `artist`, order `asc`, view `grid`, size `180`). `azKey(item: ReleaseListItem, sort: SortKey): string` — artist sort → first letter of `artists` ignoring leading "The "; title sort → first letter of title ignoring leading "The "/"A "; non-letters → `#`; other sorts → `''` (rail hidden).
- `CoverCard({ item, size })`: square `CoverImage`, format badge bottom-right (accent-tinted pill, e.g. `2×LP`), hover overlay with artists / title / year, links to `/release/:id`; copies > 1 shows `×2` badge.

- [ ] **Step 1: Failing test:** `parseQuery(new URLSearchParams('genre=Rock&decade=1970&view=table'))` → `{ genre:'Rock', decade:1970, view:'table', size:180, sort:'artist', order:'asc' }`; `toSearchParams(parseQuery(sp)).toString()` round-trips without defaults; `azKey({artists:'The Beatles'}, 'artist') === 'B'`; `azKey({title:'4 Way Street'}, 'title') === '#'`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `query.ts`. **Step 4:** Run → PASS.
- [ ] **Step 5:** Build `Library`: header "Library (n)"; toolbar = search-within field, sort select (Artist, Title, Year, Date added, Last played, Play count, Value) + asc/desc toggle, Filters popover (selects for genre, style, format, decade, label, tag, crate populated from `useFacets`; active filters shown as removable chips), view toggle grid/list/table, size slider (120–280 px). Grid: CSS grid `repeat(auto-fill, minmax(var(--size), 1fr))`. List: small cover + artist/title/year/format/tags/plays. Table: columns Artist, Title, Year, Format, Label, Cat#, Plays, Last played, Value. All state lives in the URL via `toSearchParams`. `AZRail` on the right: letters A–Z + `#`, letters without items dimmed, click scrolls to the first card with that key.
- [ ] **Step 6: Verify in browser pane:** 91 covers render; filter Genre=Classical narrows the grid and the URL updates; reload keeps filters; A–Z rail jumps; release 30487525 shows the vinyl placeholder; table view sorts by Value.
- [ ] **Step 7:** Commit `feat(web): library grid, filters, A–Z rail`.

---

### Task 10: Release detail page

**Files:**
- Create: `web/src/pages/Release.tsx`, `web/src/components/Lightbox.tsx`, `web/src/components/TagEditor.tsx`, `web/src/components/CrateMenu.tsx`

**Interfaces:**
- Consumes: `useRelease`, `useSaveNote`, `useAddTag`, `useRemoveTag`, `useAddToCrate`, `useRemoveFromCrate`, `useAddPlay`, `useDeletePlay` (Task 8).
- `Lightbox({ images, startIdx, onClose })`: fixed full-screen overlay, ←/→ navigate, Esc closes, thumbnail strip, counter "3 / 15".

- [ ] **Step 1:** Header layout per spec §8: cover (max 360 px, click → Lightbox; placeholder if none), title, artists (each links to `/library?artist=`), label + catno (link `/library?label=`), `formatSummary` · year · country, genre/style chips (link to filtered library), `TagEditor` (chips with ×, input with autocomplete from `useFacets().tags`, Enter adds). Action row: primary accent button "Played it" (adds play now; toast "Logged a play"), "Add to crate" (`CrateMenu` checklist of crates + "New crate…"), "Open on Discogs" (external link). Chips: Lowest `$5.00` (or "—"), `17 for sale`, `★ 4.5 (120)`, `Have 1,234 · Want 567`. Values formatted with `Intl.NumberFormat` using currency `USD`. "Removed from Discogs collection" banner if `removed`.
- [ ] **Step 2:** Tabs (state in `?tab=`; default `tracks`):
  - *Tracks* — one card per `SideGroup` titled "Side A" (or "Disc 1"; untitled group when side is ""), rows: position, title, per-track artists (muted), duration right-aligned; heading rows as small caps subheadings; footer with side runtime `mm:ss` when `totalSeconds` not null; overall runtime at top.
  - *Notes* — textarea (monospace-light) + live Markdown preview (`marked` → `DOMPurify.sanitize`), toggle Edit/Preview/Split; debounced autosave 800 ms; status "Saving… / Saved 12:03 / Save failed — retrying"; on failure keep the draft in `localStorage` key `vo-note-draft-{id}` and retry every 5 s.
  - *History* — "Log a play" with date input (default today) + optional note; list of plays newest first with delete; play count and last played summary; price sparkline (recharts `LineChart`, no axes, tooltip with date + price) from `priceHistory`, "Not enough data yet" when < 2 points.
  - *Details* — Discogs notes (preserve line breaks), credits table (role → names), companies, identifiers (type, value, description), videos (title links), "Last synced …".
- [ ] **Step 3: Verify in browser pane** on `/release/7455230`: sides A–D render with runtimes; lightbox shows 15 images and arrow keys work; add tag "Soundtrack Night" → appears in sidebar Tags; write a note, reload → note persists; "Played it" → History shows 1 play and dashboard count updates; `/release/14093800` shows heading rows and no runtime totals; `/release/30487525` shows placeholder and "—" price.
- [ ] **Step 4:** Commit `feat(web): release detail page`.

---

### Task 11: Dashboard, Browse, Crate, Stats, command palette

**Files:**
- Create: `web/src/pages/Dashboard.tsx`, `web/src/pages/Browse.tsx`, `web/src/pages/Crate.tsx`, `web/src/pages/Stats.tsx`, `web/src/components/Shelf.tsx`, `web/src/components/CommandPalette.tsx`
- Modify: `web/src/components/TopBar.tsx` (open palette)

- [ ] **Step 1: Dashboard:** greeting by local hour ("Good morning/afternoon/evening, Sean"); four stat cards (Records, Est. value with "n of N priced", Plays this month, Top genre); `Shelf` rows (horizontal scroll, header with title + count + optional action): Recently Added, Pull Something (shuffle icon refetches), Recently Played (hidden when empty), Not Played in a While.
- [ ] **Step 2: Browse** `/browse/:facet`: searchable list of `{value, count}` from `useFacets` (artists/labels as rows with count badges; genres/styles/formats/decades as a chip cloud sized by count); click → `/library?{facet}=value` (map `artists→artist`, `labels→label`, `genres→genre`, `styles→style`, `formats→format`, `decades→decade`).
- [ ] **Step 3: Crate** `/crate/:id`: name + description (inline editable), grid of releases in crate order with remove (×) on hover, delete crate (confirm dialog).
- [ ] **Step 4: Stats:** recharts horizontal bar charts for genre, style (top 15), decade (vertical bars), format, label (top 15); "Value by genre" bars with currency labels; total value card; plays-by-month bar chart; most-played list. Series colour = `var(--accent)`; gridlines `var(--border)`; readable in both themes.
- [ ] **Step 5: CommandPalette:** opens on ⌘K / Ctrl+K and the TopBar pill; Esc closes; input → `useSearch` (debounced 150 ms); grouped results Releases (cover thumb), Artists, Labels, Tracks ("A2 · Imperial Attack — Star Wars"), Notes (snippet); ↑/↓ + Enter navigate; artists/labels go to filtered library.
- [ ] **Step 6: Verify in browser pane:** dashboard shelves populated; shuffle changes Pull Something; ⌘K "imperial" finds the Star Wars track and Enter opens the release; Browse → Decades → 1970s filters library; create crate "Sunday Morning", add two records from detail pages, open crate; Stats charts render in dark and light.
- [ ] **Step 7:** Commit `feat(web): dashboard, browse, crates, stats, command palette`.

---

### Task 12: Docker packaging + README

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `README.md`

- [ ] **Step 1: Dockerfile** (multi-stage):
  - `build` stage `node:22-alpine`: `apk add --no-cache python3 make g++`; copy root + workspace `package*.json`; `npm ci`; copy sources; `npm run build`; `npm prune --omit=dev`.
  - `runtime` stage `node:22-alpine`: `WORKDIR /app`; copy `node_modules`, `server/package.json`, `server/dist`, `server/node_modules` (if present), `web/dist` from build; `ENV NODE_ENV=production DATA_DIR=/data PORT=3020`; `VOLUME /data`; `EXPOSE 3020`; `HEALTHCHECK CMD wget -qO- http://localhost:3020/api/health || exit 1`; `CMD ["node","server/dist/main.js"]`.
- [ ] **Step 2: docker-compose.yml:** service `vinyl-orbit`, `build: .`, `image: vinyl-orbit:latest`, `container_name: vinyl-orbit`, `ports: ["3020:3020"]`, `env_file: .env`, `volumes: ["./data:/data"]`, `restart: unless-stopped`. `.dockerignore`: `node_modules`, `**/node_modules`, `**/dist`, `data`, `.git`, `.env`.
- [ ] **Step 3: Production-mode check without Docker:** `npm run build && DATA_DIR=./data node server/dist/main.js`; open `http://localhost:3020` → SPA loads from the server, deep link `/release/7455230` reload works (SPA fallback), `/images/7455230/0.jpg` returns 200.
- [ ] **Step 4: README:** what it is; dev (`npm install`, `cp .env.example .env`, `npm run dev`, open 5173); deploy on the Docker host (`git clone …` or copy folder, `cp .env.example .env`, `docker compose up -d --build`, open `http://<host>:3020`; first sync ≈ 4 minutes); update (`git pull && docker compose up -d --build`); backup (copy `data/`, especially `data/library.db`); env var table; optional `DISCOGS_TOKEN` (Discogs → Settings → Developers → Generate token) for faster syncs.
- [ ] **Step 5:** `npm test` → all PASS. Commit `chore: docker packaging and README`.

---

## Self-review notes

- Spec coverage: config §4 → T1; schema §5 → T2; sync §6 → T6; API §7 → T7; UI §8 → T8–T11; errors §9 → T4/T6/T7/T10; deployment §10 → T12; testing §11 → T1–T7, T9 + browser checks. The spec's `releases.instance_id` is realised as `instance_ids` + `copies` (Review Focus 3).
- Docker build can't be verified on the dev Mac (no Docker); T12 Step 3 verifies the production build path, and the owner runs `docker compose up -d --build` on the Docker host.
