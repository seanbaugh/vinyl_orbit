# Vinyl Orbit — Track Previews & Rebrand Design Spec

Date: 2026-10-03
Status: Approved in conversation, pending written-spec review
Builds on: `2026-10-03-vinyl-orbit-design.md`

## 1. Purpose

1. **Track previews** — play a 30-second sample of any track without leaving the app, from a persistent mini-player, with "Preview album" to play a record's samples back to back. Matches to Apple Music are automatic and user-correctable.
2. **Rebrand** — replace the BookOrbit-like logo with a modern mark and wordmark (approved "Logo A · Groove arc"), and add subtle vinyl visuals: a giant slowly turning record in the page background, and a disc that slides out from behind the cover on record pages (spinning while that record's preview plays).

**Success criteria**
- Opening a typical record's Tracks tab shows ▶ buttons on most tracks within ~1 s the first time and instantly afterwards.
- Audio keeps playing while navigating anywhere in the app; clips auto-advance through the queue.
- A wrong match can be corrected in two clicks and stays corrected across syncs and restarts.
- The new logo appears in the sidebar, favicon, and browser tab; vinyl visuals are subtle (never reduce text contrast), honour `prefers-reduced-motion`, and look right in light and dark themes.

**Non-goals**: full-length playback, Spotify (its API no longer returns previews for new apps), Deezer fallback (possible later), previews outside the Release page queue (e.g. on cover cards), offline caching of audio.

## 2. Preview source — verified

- Apple iTunes Search API, no key/auth: `GET https://itunes.apple.com/search?term=…&entity=album&country=US&limit=10` and `GET https://itunes.apple.com/lookup?id={collectionId}&entity=song&country=US`. Song results carry `trackName`, `trackNumber`, `discNumber`, `trackTimeMillis`, `previewUrl` (30 s AAC from `audio-ssl.itunes.apple.com`), `trackViewUrl`; album results carry `collectionName`, `artistName`, `trackCount`, `releaseDate`, `artworkUrl100`, `collectionViewUrl`.
- Documented limit ≈ 20 requests/minute → server-side limiter at 1 request / 3000 ms.
- `<audio src=previewUrl>` plays cross-origin without CORS configuration (no Web Audio processing needed).

## 3. Architecture

Server-side lookup and caching; browser streams audio directly from Apple.

```
server/src/
  previews/normalize.ts   title/artist normalisation + similarity
  previews/itunes.ts      iTunes client (own RateLimiter, User-Agent, 429 retry like Discogs client)
  previews/match.ts       album scoring, track mapping, per-track fallback search
  previews/service.ts     get-or-match, candidates, set manual/none, reset; staleness check
  routes/previews.ts
web/src/
  player/PlayerProvider.tsx  context: queue, current, state; single <audio>; Media Session
  player/queue.ts            pure queue reducer
  components/MiniPlayer.tsx
  components/PreviewBar.tsx  "Previews from Apple Music: <album> · Change" + Preview album
  components/AlbumPicker.tsx
  components/Logo.tsx        mark + wordmark
  components/VinylBackdrop.tsx  giant corner record
```

New config: `PREVIEW_COUNTRY` (default `US`) — Apple storefront used for search and lookup.

## 4. Data model (new tables; user-owned class — sync never touches them)

- `preview_matches(release_id INTEGER PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('auto','manual','none','unmatched')), apple_album_id INTEGER, album_name TEXT, album_artist TEXT, album_url TEXT, artwork_url TEXT, matched_at TEXT NOT NULL)`
  - `unmatched` = automatic matching found nothing (retryable via reset); `none` = user chose "No previews".
- `preview_tracks(release_id INTEGER NOT NULL, track_idx INTEGER NOT NULL, track_title TEXT NOT NULL, preview_url TEXT NOT NULL, track_url TEXT, apple_track_id INTEGER, source TEXT NOT NULL CHECK(source IN ('album','search')), PRIMARY KEY(release_id, track_idx))`
  - `track_title` is the Discogs title at match time. On read, a preview whose `track_title` no longer equals the current `tracks.title` at that idx is stale: for `auto` the release is re-matched; for `manual` the track mapping is re-run against the stored album (no new album search).
- `TrackRow` (api-types) gains `idx: number` (the `tracks.idx`) so the UI can key previews to rows.

## 5. Matching

**Normalise** (`normalize(s)`): lowercase → strip accents (NFD) → drop bracketed segments `(...)`/`[...]` → drop a trailing ` - …` suffix containing remaster/remix/live/version/edit/mono/stereo/mix → drop `feat./ft./featuring …` → `&`→`and` → remove non-alphanumerics → collapse spaces. Artist names additionally drop a leading `the `. Discogs `(n)` suffixes are already stripped upstream.

**Similarity** (`similarity(a,b)`): Dice coefficient over the token sets of the normalised strings (1 if both normalise equal, 0 if either empty).

**Album pick** — search `term = "<first artist> <title>"` (entity=album, limit 10). Score each candidate:
`0.6·sim(title, collectionName) + 0.3·sim(artist, artistName) + 0.1·countScore`, where `countScore = 1 − min(1, |discogsTrackCount − trackCount| / max(discogsTrackCount, 1))` (track-type rows only). Year is a tiebreak only (closest `releaseDate` year to the Discogs year). Accept the best if score ≥ 0.6. For compilations/"Various" artists, artist weight is folded into title (title 0.9).

**Track mapping** (album found): lookup songs; for each Discogs track row (type `track`, in order) pick the unused Apple song with the highest `sim(title, trackName)`; accept if ≥ 0.75; ties broken by smallest |ordinal difference| (Discogs track order vs Apple disc/track order). Each Apple song is used at most once.

**Fallback** (album not found, or tracks left unmatched): up to 5 unmatched tracks get `search?term="<artist> <track title>"&entity=song&limit=5`; accept the best result with `sim(title) ≥ 0.8` and `sim(artist) ≥ 0.5`; `source = 'search'`. If nothing matched at all → status `unmatched`.

**Request budget**: first match of a release ≤ 2 + 5 = 7 requests (typically 2). Results cached until reset/stale.

## 6. API

- `GET /api/releases/:id/previews` → `PreviewInfo`:
  `{ status: 'auto'|'manual'|'none'|'unmatched', album: { id, name, artist, url, artworkUrl } | null, tracks: Record<trackIdx, { previewUrl, url, source }>, matchedAt }`. Runs matching if no row exists or the match is stale. 404 unknown release. 502 `{ error }` if Apple is unreachable (nothing cached on failure).
- `GET /api/releases/:id/previews/candidates` → up to 8 `{ id, name, artist, year, trackCount, artworkUrl, url, score }`, best first (same search as auto-match; not cached).
- `PUT /api/releases/:id/previews` body `{ appleAlbumId: number }` (status `manual`, tracks re-mapped against that album with fallback search) or `{ none: true }` (status `none`, tracks cleared) → `PreviewInfo`.
- `DELETE /api/releases/:id/previews` → clears the row and re-runs auto matching → `PreviewInfo`.
- Concurrency: matching for the same release is single-flight (a second request awaits the first).

## 7. Player (web)

- **PlayerProvider** at app root owns one `HTMLAudioElement`, a queue of `QueueItem { releaseId, trackIdx, title, artists, releaseTitle, coverUrl, previewUrl }`, `currentIndex`, `state: 'idle'|'loading'|'playing'|'paused'`, `progress` (0–1). Actions: `playQueue(items, startIndex)`, `toggle()`, `next()`, `prev()` (restart if > 3 s in, else previous), `stop()`. On `ended` → `next()`; on `error` → skip to next (stop at end). Navigation never unmounts it. Media Session metadata + play/pause/next/prev handlers when available.
- **queue.ts** — pure reducer for the above transitions (unit-tested).
- **Track rows**: matched tracks show a ▶ button (keyboard accessible, `aria-label="Play preview of <title>"`); the playing row is highlighted with an animated equaliser glyph and ▶ becomes ❚❚. Clicking ▶ plays the queue of all matched tracks of that record starting at that track.
- **PreviewBar** above the tracklist:
  - matched: "Previews from Apple Music: *Album* · Change" + primary-style "Preview album" button (plays all from the first).
  - `none`: "Previews off · Change". `unmatched`: "No previews found · Choose album · Search Apple Music" (external link to `music.apple.com/us/search?term=…`).
  - loading: subtle skeleton; error: "Previews unavailable right now · Retry".
- **AlbumPicker** (popover/sheet): candidate list with artwork, name, artist, year, track count; current match ticked; "No previews"; "Reset to automatic".
- **MiniPlayer**: fixed bottom bar (inset 12 px, rounded, `--surface` with border/shadow), cover art (opens the record), title · artist, progress bar (clickable seek), prev / play-pause / next, close (stops and clears). Content area gets bottom padding while open; on <900 px it spans full width above the bottom edge. Each track row also links "Listen on Apple Music" via a small external icon on hover.

## 8. Rebrand

**Logo A · Groove arc**
- Mark (`Logo.tsx`, inline SVG, 32 px in sidebar): dark disc (`--surface-2`) with two thin groove rings (`--border-strong`), an accent-coloured 90° arc on the outer edge (stroke 3, round caps, top → right), accent label circle with a centre hole. All colours from CSS tokens so the accent picker recolours it.
- Wordmark: lowercase `vinyl` + accent `orbit`, Inter 600, 21 px, letter-spacing −0.03em, no space. Fraunces is removed from the app.
- Favicon (`web/public/favicon.svg`) = the mark with default teal; `<title>` stays "Vinyl Orbit".

**Background 1 · Giant record (all pages)** — `VinylBackdrop`: a fixed, pointer-events-none SVG disc ~1100 px diameter, centred off-canvas at bottom-right (≈ 35 % visible), made of ~40 hairline groove rings at very low contrast (`--groove` token, ~4 % in dark / ~4 % in light), a faint conic "sheen" wedge (≈ 6 % opacity) so rotation is perceptible, and a dim accent label. Rotates 360° every 180 s; static under `prefers-reduced-motion`. Replaces the current `repeating-radial-gradient` body background. Sits under all content (z-index 0; app content above).

**Background 2 · Disc behind the cover (Release page)** — the header cover becomes a sleeve: a vinyl disc (same groove styling, label = the cover image cropped to a circle at 36 % diameter, with a centre hole) positioned behind the cover, sliding out ~22 % to the right on page load (400 ms ease-out). While the mini-player is playing a track from *this* record, the disc rotates (33⅓ rpm feel: 1.8 s per turn) and slides out to ~32 %; paused/other record → stops. Static (no slide/spin) under `prefers-reduced-motion`. On < 900 px the disc slides out ~14 %. Clicking the cover still opens the lightbox.

## 9. Error handling

- Apple unreachable / 429 exhausted → 502 to the UI; nothing cached; PreviewBar shows retry. Matching never blocks the rest of the Release page.
- Preview URL fails to load (expired/removed) → player skips to next; the release's match is marked stale for that track only on next GET (re-mapped).
- Removed-from-collection releases keep their preview rows (consistent with other user-owned data).

## 10. Testing

- Server (Vitest): `normalize`/`similarity` cases (remaster suffixes, brackets, feat., accents, "The"); album scoring and track mapping against recorded iTunes fixtures (Star Wars 7455230 — expects the 1977 score album or a similar-scoring candidate and partial track coverage; Amidst the Chaos 18809824 — high coverage; Four 30487525 — likely unmatched/fallback); fallback cap of 5 searches; manual override persistence; `none`; stale-title re-map; single-flight; 502 path; API routes via `inject`.
- Web (Vitest): `queue.ts` reducer (play, next at end stops, prev restart rule, error skip); `PlayerProvider` behaviour with a fake audio element in jsdom (ended → next).
- Browser checks: play/pause/next across navigation, Preview album, picker change persists after reload, mini-player on mobile width, logo in both themes and accents, backdrop subtle and static with reduced motion, disc spins only for the playing record.
