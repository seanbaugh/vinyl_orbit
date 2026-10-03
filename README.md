# Vinyl Orbit

A self-hosted browser for your public Discogs collection: a cover-grid library with filters and an A–Z rail, large cover lightbox, side-by-side tracklists, credits and identifiers, 30-second Apple Music previews of every track with a mini-player that keeps playing while you browse, plus things Discogs doesn't do well — Markdown notes, personal tags, crates, a listening log, and price history.

Everything runs in one Docker container: a Node/Fastify server that syncs from the Discogs API into SQLite and serves a React app on port **3020**.

## Deploy on the Docker host

```bash
git clone <this repo> vinyl-orbit    # or copy the folder over
cd vinyl-orbit
cp .env.example .env                 # set DISCOGS_USERNAME if it isn't seanmikel
docker compose up -d --build
```

Open `http://<docker-host>:3020` (to use another port, change the left side of `ports:` in `docker-compose.yml`). The first sync runs on startup and takes about 4 minutes for ~100 records (Discogs allows ~25 requests/minute without a token). Covers appear as they're cached.

**Update:** `git pull && docker compose up -d --build`

**Back up:** copy the `data/` folder (the database is `data/library.db`; `data/images/` is a re-downloadable cache). Your notes, tags, crates and plays live only in `library.db`.

**Logs:** `docker compose logs -f vinyl-orbit`

## Configuration (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DISCOGS_USERNAME` | `seanmikel` | Whose public collection to sync |
| `DISCOGS_TOKEN` | *(empty)* | Optional personal token — faster syncs (60 req/min). Discogs → Settings → Developers → Generate token |
| `TZ` | `America/Los_Angeles` | Your time zone, used for month boundaries in play stats |
| `SYNC_INTERVAL_HOURS` | `6` | How often to sync automatically (`0` = only on startup / "Sync now") |
| `DETAIL_REFRESH_DAYS` | `7` | Re-fetch prices and ratings for a record after this many days |
| `DETAIL_REFRESH_PER_RUN` | `15` | Max out-of-date records refreshed per scheduled sync (spreads the load) |
| `CURRENCY` | `USD` | Marketplace price currency |
| `PREVIEW_COUNTRY` | `US` | Apple Music storefront used for 30-second track previews |

New records are always fetched in full on the next sync. **Sync now** in the sidebar refreshes everything that's out of date immediately.

## How syncing treats your data

- Discogs data (titles, tracklists, prices…) is overwritten on each sync.
- Your notes, tags, crates and plays are never touched by a sync.
- If you remove a record from your Discogs collection it's hidden, not deleted — add it back and its notes and plays reappear.

## How track previews work

- The first time you open a record's Tracks tab, Vinyl Orbit looks it up on Apple Music (free iTunes Search API, no account needed), picks the closest album, and matches each track by title. Tracks it can't place get a per-track search. The result is saved, so later visits are instant.
- Press ▶ on any track, or **Preview album**, and the clips play in the mini-player at the bottom — it keeps going while you browse. Media keys work too.
- Wrong album? Click **Change** above the tracklist to pick another, turn previews off for that record, or reset to automatic. Your choice is kept across syncs and restarts.
- Spotify no longer offers preview clips through its API, so previews come from Apple Music only.

## Develop (no Docker needed)

Requires Node 22.

```bash
npm install
npm run dev        # API on :3020 (data in ./data), web on :5173 with hot reload
npm test           # server + web tests
npm run build      # production build; then: DATA_DIR=./data node server/dist/main.js
```

Layout: `server/` (Fastify, better-sqlite3, sync engine, JSON API under `/api`), `web/` (React, Vite, TanStack Query), shared response types in `server/src/api-types.ts`.
