# Vinyl Orbit — Design Spec

Date: 2026-10-03
Status: Approved in conversation, pending written-spec review

## 1. Purpose

A self-hosted web app, shipped as a single Docker container, for browsing and enriching the owner's public Discogs collection (user `seanmikel`, 91 releases at time of writing). It pulls collection and release data from the Discogs API, caches it locally, and adds personal data Discogs doesn't hold well: rich notes, tags, crates, a listening log, and price history.

Visual and interaction reference: the owner's BookOrbit instance (self-hosted book library) — dark charcoal surface with subtle background pattern, teal accent, rounded bordered cards, left sidebar with count badges, ⌘K search, cover-grid library with A–Z rail, tabbed detail page.

**Success criteria**
- `docker compose up -d --build` on the Docker host yields a working app on port 3020 with no other setup beyond env vars.
- First sync completes unattended (≈4 min unauthenticated) and the full collection is browsable with covers, tracklists and details.
- Notes, tags, crates and plays persist across container rebuilds and Discogs re-syncs.
- App remains fully usable when Discogs is unreachable (serves cached data).

**Non-goals (v1)**
- Multi-user accounts / authentication (LAN-only, single user).
- Writing anything back to Discogs (notes stay in-app).
- Editing Discogs metadata.
- Collections other than the owner's.

## 2. Constraints

- Developed on a Mac without Docker (Node 22 available); deployed on a separate Docker host on the same LAN.
- Discogs unauthenticated rate limit: ~25 requests/minute. Optional `DISCOGS_TOKEN` raises it to 60/min.
- Discogs custom collection fields (owner notes) are private and not used.
- Verified public endpoints (no token):
  - `GET /users/{u}/collection/folders/0/releases` — basic info: title, year, artists, labels+catno, formats, genres, styles, cover/thumb URLs, date_added, rating.
  - `GET /releases/{id}` — tracklist, extraartists (credits), companies, identifiers, notes, images (multiple), videos, community (rating, have/want), `lowest_price`, `num_for_sale`, country, released.
  - `i.discogs.com` images download with a User-Agent header.

## 3. Architecture

Single Node.js (TypeScript) process serving both the JSON API and the built React SPA.

```
vinyl-orbit/
  server/
    src/
      config.ts          env parsing + defaults
      discogs/client.ts  HTTP client: User-Agent, optional token, token-bucket limiter, 429 backoff
      discogs/types.ts   Discogs response types
      db/schema.sql      tables (below)
      db/index.ts        better-sqlite3 connection + migrations
      db/repo/*.ts       one module per aggregate (releases, notes, tags, crates, plays, prices)
      sync/sync.ts       collection sync + detail queue + image cache
      sync/scheduler.ts  startup + interval runs, single-flight lock, progress state
      routes/*.ts        Fastify route plugins
      app.ts             Fastify app factory (used by tests and main)
      main.ts            entrypoint
    test/
  web/
    src/
      api/          typed fetch client
      components/   Sidebar, TopBar, CommandPalette, CoverCard, FilterBar, AZRail, Lightbox, ...
      pages/        Dashboard, Library, Release, Browse, Stats, Crate
      theme/        CSS variables, light/dark, accent colours
  Dockerfile
  docker-compose.yml
  .env.example
  README.md
```

Stack: Fastify, better-sqlite3, Zod (request validation), React 18, Vite, React Router, TanStack Query, Recharts (stats), a Markdown renderer (`marked` + DOMPurify), Vitest.

## 4. Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DISCOGS_USERNAME` | `seanmikel` | Collection owner |
| `DISCOGS_TOKEN` | (empty) | Optional; raises rate limit |
| `PORT` | `3020` | HTTP port |
| `DATA_DIR` | `/data` (`./data` in dev) | SQLite DB + image cache |
| `SYNC_INTERVAL_MINUTES` | `15` | Scheduled collection check; `0` disables |
| `DETAIL_REFRESH_DAYS` | `7` | Re-fetch release detail (prices, ratings) after N days |
| `DETAIL_REFRESH_PER_RUN` | `5` | Max stale (non-new) releases refreshed per scheduled run, spreading load |
| `CURRENCY` | `USD` | Marketplace currency |

## 5. Data model (SQLite, `DATA_DIR/library.db`)

**Discogs-owned (overwritten by sync)**
- `releases` — `id` PK (Discogs release id), `instance_id`, `master_id`, `title`, `artists_display`, `artists_json`, `labels_json`, `formats_json`, `format_summary` (e.g. "2×LP"), `genres_json`, `styles_json`, `year`, `country`, `released`, `discogs_notes`, `lowest_price`, `num_for_sale`, `community_rating`, `community_votes`, `have`, `want`, `videos_json`, `identifiers_json`, `companies_json`, `extraartists_json`, `raw_json`, `date_added`, `basic_synced_at`, `detail_synced_at`, `removed_at` (nullable).
- `tracks` — `release_id`, `idx`, `position`, `type` (track|heading|index), `title`, `duration`, `artists_json`, `extraartists_json`.
- `images` — `release_id`, `idx`, `type` (primary|secondary), `remote_url`, `local_path`, `width`, `height`.
- Lookup facets (genres, styles, labels, artists, formats, decade) are derived by query/views, not separate tables.

**User-owned (never touched by sync)**
- `notes` — `release_id` PK, `body_md`, `updated_at`.
- `tags` — `id`, `name` unique, `color`. `release_tags` — (`release_id`, `tag_id`).
- `crates` — `id`, `name`, `description`, `created_at`. `crate_releases` — (`crate_id`, `release_id`, `position`).
- `plays` — `id`, `release_id`, `played_at`, `note` (optional).
- `price_history` — `release_id`, `recorded_on` (date), `lowest_price`, `num_for_sale`; one row per release per day max, written whenever detail sync runs.

Releases removed from the Discogs collection get `removed_at` set (hidden by default) rather than deleted, so user data is preserved; reappearing releases clear it.

## 6. Sync

1. **Collection pass:** page through folder 0 at `per_page=100`; upsert basic info; record seen ids; set `removed_at` on unseen, clear it on seen.
2. **Detail queue:** all releases with null `detail_synced_at` (new — always fetched immediately), plus up to `DETAIL_REFRESH_PER_RUN` releases older than `DETAIL_REFRESH_DAYS`, oldest first (manual "Sync now" refreshes all stale ones). Fetch `/releases/{id}`; upsert release fields, replace tracks and images; append `price_history` row.
3. **Image cache:** download the primary image (and secondaries) to `DATA_DIR/images/{release_id}/{idx}.jpg`; skip if present. Served at `/images/...`. If download fails, UI falls back to the remote URL then a placeholder.
4. **Rate limiting:** token bucket (unauth: 1 req / 2.5 s; token: 1 req / 1.1 s). On HTTP 429, wait per `Retry-After` or exponential backoff (max 5 retries). Respect `X-Discogs-Ratelimit-Remaining`.
5. **Scheduling:** run on startup and every `SYNC_INTERVAL_MINUTES` (collection pass is 1 request per 100 releases, so frequent runs are cheap); single-flight (a manual trigger during a run returns current status). Progress exposed via `GET /api/sync/status` (phase, done/total, last error, last completed).
6. **Failures:** per-release errors are logged and recorded; the run continues. Total failure leaves existing data intact.

## 7. API (JSON, prefix `/api`)

- `GET /releases` — query: `q`, `genre`, `style`, `format`, `decade`, `label`, `artist`, `tag`, `crate`, `sort` (artist|title|year|added|played|plays|value), `order`, `includeRemoved`. Returns list with cover path, format summary, play count, last played, tags.
- `GET /releases/:id` — full detail incl. tracks, images, note, tags, crates, plays, price history.
- `GET /facets` — counts for genres, styles, formats, decades, labels, artists, tags, crates.
- `PUT /releases/:id/note` — `{ body_md }`.
- `POST /releases/:id/tags` `{ name }` · `DELETE /releases/:id/tags/:tagId`.
- `GET/POST /tags`, `PATCH/DELETE /tags/:id`.
- `GET/POST /crates`, `GET/PATCH/DELETE /crates/:id`, `POST /crates/:id/releases` `{ releaseId }`, `DELETE /crates/:id/releases/:releaseId`.
- `POST /releases/:id/plays` `{ played_at? , note? }` · `DELETE /plays/:id`.
- `GET /dashboard` — stat cards + shelves (recently added, random sample, recently played, not played in a while).
- `GET /stats` — breakdowns by genre, style, decade, format, label; most played; value by genre; total estimated value (sum of `lowest_price`).
- `GET /search?q=` — command palette results across releases, artists, labels, tracks, notes.
- `GET /sync/status` · `POST /sync` (trigger).
- `GET /health`.

## 8. UI

Theme: dark default and light mode; accent colour choice (default teal); stored in `localStorage`. Typography: Inter for UI, serif (e.g. Fraunces) for the "Vinyl Orbit" wordmark. Subtle concentric-groove background pattern (nod to BookOrbit's texture, vinyl-themed).

- **Sidebar:** Dashboard, Library (count); Browse — Artists, Labels, Genres & Styles, Formats, Decades (counts); Crates (+ new); Tags; footer with last-synced time and Sync button/progress.
- **Top bar:** ⌘K command palette search; theme toggle; Stats link.
- **Dashboard:** greeting; stat cards (records, est. value, plays this month, top genre); horizontal shelves: Recently Added, Pull Something (random, reshuffle), Recently Played, Not Played in a While.
- **Library:** square cover cards with format badge; hover shows artist/title/year. Toolbar: sort, filters (genre, style, format, decade, label, tag, crate), grid/list/table toggle, cover size slider. A–Z rail keyed to the current sort field. Filter state reflected in the URL.
- **Release detail** (`/release/:id`): large cover (click → full-screen lightbox of all images, arrow-key navigation); title, linked artists, label/catno, format, year/country, genre/style chips, inline-editable tags; actions: Played it, Add to crate, Open on Discogs; chips: lowest price, # for sale, community rating, have/want. Tabs:
  - *Tracks* — grouped by side (derived from position prefix letter; CD/numeric positions grouped as one), durations, per-track credits, side runtime totals.
  - *Notes* — Markdown editor with preview, debounced autosave.
  - *History* — play log (add with date / delete), price sparkline.
  - *Details* — Discogs notes, credits, companies, identifiers (barcode, matrix), videos (links).
- **Browse pages:** list with counts → filtered library view.
- **Crate page:** crate description + its releases grid (manual order).
- **Stats page:** charts per Section 7 `/stats`.
- Responsive: sidebar collapses to a drawer under ~900px.

## 9. Error handling

- Discogs unreachable / rate-limited: sync records error and retries next schedule; UI shows status in the sync panel; all reads served from SQLite.
- Missing images: remote URL fallback, then placeholder.
- API validation via Zod; 400 with message on bad input; 404 for unknown ids.
- Notes autosave shows saved/failed state; failed saves retry and keep local draft.

## 10. Deployment

- Multi-stage `Dockerfile` on `node:22-alpine`: install + build web, build server, copy into slim runtime with production deps (better-sqlite3 native build in builder stage for the same base image).
- `docker-compose.yml`: service `vinyl-orbit`, `ports: ["3020:3020"]`, `volumes: ["./data:/data"]`, env from `.env`, `restart: unless-stopped`, healthcheck on `/api/health`.
- Transfer: project is a git repo; on the Docker host, clone/pull then `docker compose up -d --build`. README documents this plus backup (copy `data/`).
- Dev on the Mac: `npm run dev` runs server (tsx watch) and Vite with proxy; data in `./data`.

## 11. Testing

- Vitest unit tests: rate limiter, format summary, side grouping, sync (Discogs client mocked with recorded fixtures from the real `seanmikel` collection), repo modules on in-memory SQLite.
- API tests via Fastify `inject`.
- Manual smoke test in the browser against a real sync before handoff; `docker build` verified on the Docker host by the owner (no Docker on dev machine).
