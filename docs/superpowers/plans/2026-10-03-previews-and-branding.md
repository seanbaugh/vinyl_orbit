# Track Previews & Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Apple Music 30-second track previews with a persistent mini-player and correctable album matching, and replace the logo/background with the approved "Groove arc" mark and subtle vinyl visuals.

**Architecture:** Server matches Discogs releases to iTunes albums (rate-limited, cached in two new SQLite tables, single-flight) and exposes `/api/releases/:id/previews*`. The web app gets a root-level `PlayerProvider` (one `<audio>`, pure queue reducer) with a `MiniPlayer`, preview controls on the Release page, a `Logo` component, a fixed `VinylBackdrop`, and a cover-with-disc header.

**Tech Stack:** existing (Fastify 5, better-sqlite3, zod, Vitest, React 18, TanStack Query 5, Vite 8) + jsdom/@testing-library/react (already dev deps in web).

**Spec:** `docs/superpowers/specs/2026-10-03-previews-and-branding-design.md` (and the base spec `2026-10-03-vinyl-orbit-design.md`)

## Global Constraints

- iTunes endpoints exactly: `https://itunes.apple.com/search?term=<urlencoded>&entity=<album|song>&country=<PREVIEW_COUNTRY>&limit=<n>` and `https://itunes.apple.com/lookup?id=<collectionId>&entity=song&country=<PREVIEW_COUNTRY>`; `User-Agent` = the Discogs client's `USER_AGENT`.
- iTunes rate limit: 1 request / 3000 ms (own `RateLimiter`); 429 retried like the Discogs client (≤ 5, `Retry-After` else 2^n s).
- `PREVIEW_COUNTRY` env, default `US`.
- Matching constants: album accept threshold `0.6`; album score `0.5·title + 0.25·artist + 0.15·year + 0.1·count` (Various: title `0.75`, artist `0`); track accept `dice ≥ 0.75`; fallback accept `dice ≥ 0.8` and artist `albumSim ≥ 0.5`; fallback cap `5` searches; candidates list max `8`; stopwords `the, and, a, an, of`.
- `preview_matches` / `preview_tracks` are user-owned: the Discogs sync never writes or deletes them.
- Only Apple songs with a non-empty `previewUrl` are ever mapped.
- Player: one `HTMLAudioElement` app-wide; `prev` restarts the current clip when `currentTime > 3`.
- Visuals: backdrop rotation 180 s/turn; cover disc 1.8 s/turn while its record plays; disc slide-out 22 % (32 % while playing, 14 % under 900 px); all motion disabled under `prefers-reduced-motion: reduce`.
- Wordmark: lowercase `vinyl` + accent `orbit`, Inter 600, 21 px, letter-spacing −0.03em; Fraunces removed.

## Review Focus

1. **Apple returns nothing useful** — `resultCount: 0`, or a lookup with only the collection wrapper / songs lacking `previewUrl` → status `unmatched` (or fallback), never a crash. Test in Task 3 + Task 4.
2. **Titles that normalise to empty** ("—", "???", "( )") → similarity 0, no match, no exception. Test in Task 1.
3. **Rapid track switching / navigation while a clip is loading** → events from a superseded `src` (late `ended`, `error`, rejected `play()`) must not advance or corrupt the new queue. Test in Task 6.
4. **Browser blocks `audio.play()`** (rejected promise, e.g. NotAllowedError) → state becomes `paused`, never stuck in `loading`. Test in Task 6.
5. **Concurrent first GETs for one release** (React StrictMode double-fetch, two tabs) → one matching run, one set of rows. Test in Task 4.

---

## File Structure

```
server/src/
  config.ts                     + previewCountry
  db/schema.sql                 + preview_matches, preview_tracks
  api-types.ts                  + TrackRow.idx, PreviewInfo, PreviewCandidate
  repo/releases.ts              TrackRow rows carry idx
  previews/normalize.ts         normalizeAlbum/Track/Artist, tokens, dice, containment, albumSim
  previews/itunes.ts            createItunesClient()
  previews/match.ts             searchTerm, scoreAlbums, mapTracks, pickFallback
  previews/service.ts           createPreviewService()
  routes/previews.ts
  app.ts / main.ts              wire service
server/test/
  fixtures/itunes/*.json        (already recorded)
  normalize.test.ts itunes.test.ts match.test.ts previews.service.test.ts (+ api.test.ts additions)
web/src/
  player/queue.ts  player/queue.test.ts
  player/PlayerProvider.tsx  player/PlayerProvider.test.tsx
  components/MiniPlayer.tsx  components/PreviewBar.tsx  components/AlbumPicker.tsx
  components/Logo.tsx  components/VinylBackdrop.tsx  components/CoverDisc.tsx
  api/hooks.ts                  + preview hooks
  pages/Release.tsx             preview buttons, PreviewBar, CoverDisc
  App.tsx / main.tsx            PlayerProvider, MiniPlayer, VinylBackdrop
  components/Sidebar.tsx        Logo
  theme/theme.css               player, logo, backdrop, disc styles; remove serif
web/index.html, web/public/favicon.svg
README.md
```

---

### Task 1: Normalisation & similarity

**Files:** Create `server/src/previews/normalize.ts`; Test `server/test/normalize.test.ts`

**Interfaces — Produces:**
```ts
export function normalizeAlbum(s: string): string
export function normalizeTrack(s: string): string
export function normalizeArtist(s: string): string
export function tokens(normalized: string): Set<string>        // minus stopwords
export function dice(a: string, b: string): number              // inputs already normalised
export function containment(a: string, b: string): number
export function albumSim(a: string, b: string): number          // 0.5·dice + 0.5·containment
```
Rules exactly as spec §5 (version words: `remaster, remastered, mono, stereo, version, edit, mix, single, bonus, live, from, demo`).

- [ ] **Step 1: Failing tests**
  ```ts
  expect(normalizeAlbum('Star Wars: A New Hope (Original Motion Picture Score)')).toBe('star wars a new hope');
  expect(normalizeAlbum('Atlas: Two - Single')).toBe('atlas two');
  expect(normalizeTrack('Four (Instrumental)')).toBe('four instrumental');
  expect(normalizeTrack('Let It Be - Remastered 2009')).toBe('let it be');
  expect(normalizeTrack('Smile (Live From The Hollywood Bowl)')).toBe('smile');
  expect(normalizeTrack("Princess Leia's Theme")).toBe('princess leias theme');
  expect(normalizeTrack('Café del Mar (feat. Someone)')).toBe('cafe del mar');
  expect(normalizeArtist('Simon & Garfunkel')).toBe('simon and garfunkel');
  expect(dice('star wars', 'star wars')).toBe(1);
  expect(dice(normalizeTrack('Four'), normalizeTrack('Four (Instrumental)'))).toBeCloseTo(2 / 3);
  expect(containment('star wars', 'star wars a new hope')).toBe(1);
  expect(albumSim('the desert and the robot auction', 'desert robot auction')).toBe(1); // stopwords ignored
  // Review Focus 2
  for (const s of ['—', '???', '( )', '']) expect(dice(normalizeTrack(s), 'anything')).toBe(0);
  expect(dice('', '')).toBe(0);
  ```
- [ ] **Step 2:** `npm -w server test` → FAIL (module missing). **Step 3:** Implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(previews): title normalisation and similarity`.

---

### Task 2: iTunes client + config

**Files:** Create `server/src/previews/itunes.ts`; Modify `server/src/config.ts`, `.env.example`; Test `server/test/itunes.test.ts`, `server/test/config.test.ts`

**Interfaces — Produces:**
```ts
export interface ItunesAlbum { collectionId: number; collectionName: string; artistName: string; trackCount: number;
  releaseDate?: string; artworkUrl100?: string; collectionViewUrl?: string }
export interface ItunesSong { trackId: number; trackName: string; artistName: string; collectionId: number;
  discNumber?: number; trackNumber?: number; previewUrl?: string; trackViewUrl?: string }
export interface ItunesClient {
  searchAlbums(term: string): Promise<ItunesAlbum[]>;                       // entity=album, limit=10
  lookupAlbum(collectionId: number): Promise<{ album: ItunesAlbum | null; songs: ItunesSong[] }>;  // splits wrapperType collection/track
  searchSongs(term: string): Promise<ItunesSong[]>;                          // entity=song, limit=5
}
export class ItunesError extends Error { status: number }
export function createItunesClient(opts: { country: string; fetch?: typeof fetch; limiter?: RateLimiter;
  sleep?: (ms: number) => Promise<void> }): ItunesClient
```
`Config` gains `previewCountry: string` (env `PREVIEW_COUNTRY`, default `'US'`).

- [ ] **Step 1: Failing tests** — config default `previewCountry: 'US'` and override (update the existing `defaults` `toEqual`). Client with stub fetch serving fixtures: `searchAlbums('John Williams Star Wars')` requests `https://itunes.apple.com/search?term=John%20Williams%20Star%20Wars&entity=album&country=US&limit=10` with `User-Agent` = `USER_AGENT`, returns 10 albums, first `collectionId` 1375814280; `lookupAlbum(1375814280)` returns `album.collectionName` starting "Star Wars: A New Hope" and 16 songs with `previewUrl`; 429 twice then 200 → resolves with `sleep` called `[1000, 1000]`; 500 → rejects `ItunesError` status 500; `{"resultCount":0,"results":[]}` → `[]` / `{ album: null, songs: [] }`.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement (default limiter `new RateLimiter(3000)`; `encodeURIComponent` term). **Step 4:** → PASS.
- [ ] **Step 5:** Add `PREVIEW_COUNTRY=US` (with comment "Apple Music storefront for previews") to `.env.example`. Commit `feat(previews): iTunes client`.

---

### Task 3: Matching (pure)

**Files:** Create `server/src/previews/match.ts`; Test `server/test/match.test.ts`

**Interfaces:**
- Consumes: Task 1 functions; Task 2 `ItunesAlbum`, `ItunesSong`.
- Produces:
  ```ts
  export interface MatchInput { title: string; artists: string; year: number | null; isVarious: boolean;
    tracks: { idx: number; title: string }[] }                 // type 'track' rows only, in order
  export interface ScoredAlbum { album: ItunesAlbum; score: number }
  export const ALBUM_THRESHOLD = 0.6;
  export function searchTerm(input: MatchInput): string        // isVarious ? title : `${artists} ${title}`
  export function scoreAlbums(input: MatchInput, albums: ItunesAlbum[]): ScoredAlbum[]   // desc by score, ties → closer year
  export function mapTracks(tracks: MatchInput['tracks'], songs: ItunesSong[]): Map<number, ItunesSong>
  export function pickFallback(trackTitle: string, artists: string, songs: ItunesSong[]): ItunesSong | null
  ```
`isVarious` = normalised artists equals `various`. Year from `releaseDate.slice(0,4)`.

- [ ] **Step 1: Failing tests** (fixtures in `test/fixtures/itunes/` + `release-*.json`; build `MatchInput` from the Discogs fixture: title, `artistsDisplay(artists)`, year, track rows with their flattened idx):
  - Star Wars 7455230: `scoreAlbums(...)[0].album.collectionId === 1375814280` and its score ≥ 0.6; the "Empire Strikes Back" candidate (1375815586) scores lower.
  - Star Wars `mapTracks(input.tracks, lookup-1375814280 songs)` maps all 16 Discogs tracks; `"The Desert And The Robot Auction"` → `"The Desert and the Robot Auction"`.
  - Amidst the Chaos 18809824: best is 1452354896 with score ≥ 0.6.
  - Four 30487525: best score < `ALBUM_THRESHOLD`; `pickFallback('Four', 'Sleeping At Last', song-four)` → trackName `'Four'`; `pickFallback('Four (Instrumental)', ...)` → `'Four (Instrumental)'`; `pickFallback('Atlas', ...)` → null.
  - `mapTracks` never reuses a song (two Discogs tracks titled "Intro" with one Apple "Intro" → only one mapped), ignores songs without `previewUrl`, and with `[]` songs returns an empty map (Review Focus 1).
  - `searchTerm` for `isVarious` omits artists.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement per spec §5. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(previews): album scoring and track mapping`.

---

### Task 4: Schema, track idx, and preview service

**Files:** Modify `server/src/db/schema.sql`, `server/src/api-types.ts`, `server/src/lib/tracks.ts` (TrackRow construction untouched), `server/src/repo/releases.ts` (add `idx` to TrackRow rows); Create `server/src/previews/service.ts`; Test `server/test/previews.service.test.ts`, update `server/test/tracks.test.ts` helpers for `idx`

**Interfaces:**
- `api-types.ts`:
  ```ts
  // TrackRow gains: idx: number
  export type PreviewStatus = 'auto' | 'manual' | 'none' | 'unmatched';
  export interface PreviewInfo { status: PreviewStatus;
    album: { id: number; name: string; artist: string; url: string | null; artworkUrl: string | null } | null;
    tracks: Record<number, { previewUrl: string; url: string | null; source: 'album' | 'search' }>; matchedAt: string }
  export interface PreviewCandidate { id: number; name: string; artist: string; year: number | null; trackCount: number;
    artworkUrl: string | null; url: string | null; score: number }
  ```
- Schema: tables exactly as spec §4.
- `service.ts`:
  ```ts
  export class PreviewUnavailableError extends Error {}
  export interface PreviewService {
    get(releaseId: number): Promise<PreviewInfo | null>;          // null = unknown release
    candidates(releaseId: number): Promise<PreviewCandidate[] | null>;
    setAlbum(releaseId: number, appleAlbumId: number): Promise<PreviewInfo | null>;
    setNone(releaseId: number): Promise<PreviewInfo | null>;
    reset(releaseId: number): Promise<PreviewInfo | null>;
  }
  export function createPreviewService(deps: { db: Db; itunes: ItunesClient; now?: () => Date }): PreviewService
  ```
  Builds `MatchInput` from `releases` + `tracks` (type `track` rows). `get`: existing row and not stale → read; else match (auto) or re-map (manual, via `lookupAlbum(stored id)`); `none`/`unmatched` rows are returned as-is (not stale-checked). Staleness = any `preview_tracks.track_title` ≠ current `tracks.title` at that idx (or idx missing). Matching writes in one transaction (delete+insert tracks, upsert match). Single-flight per release id via an in-memory `Map<number, Promise<PreviewInfo>>`. Any `ItunesError`/network error during matching → throw `PreviewUnavailableError` and write nothing. Fallback searches stop after 5. `artworkUrl` = `artworkUrl100` with `100x100` → `300x300`.

- [ ] **Step 1: Failing tests** (`:memory:` db seeded with `upsertBasic` + `applyDetail` fixtures; fake `ItunesClient` serving fixtures and counting calls):
  - Star Wars `get` → status `auto`, album id 1375814280, 16 entries in `tracks`, keys equal the Discogs track idx values; second `get` makes 0 new iTunes calls.
  - Four `get` → status `auto` with 2 tracks `source: 'search'` (album rejected, fallback succeeded); total iTunes calls = 1 album search + 2 song searches.
  - Release whose album search and song searches return nothing → status `unmatched`, `tracks` `{}`; fallback calls capped at 5 for a 16-track release.
  - `setAlbum(7455230, 1375814280)` → status `manual`; then simulate a Discogs title change (`UPDATE tracks SET title = 'Main Title Theme' WHERE release_id = 7455230 AND idx = <first>`) → `get` re-maps using `lookupAlbum` only (no `searchAlbums` call) and status stays `manual`.
  - Auto match + title change → `get` re-runs auto matching (`searchAlbums` called again).
  - `setNone` → status `none`, `tracks` `{}`; `get` returns `none` without iTunes calls; `reset` → back to `auto`.
  - `candidates(7455230)` → ≤ 8 items, first id 1375814280, `score` descending, `year` 1977.
  - iTunes throws → `get` rejects `PreviewUnavailableError` and `preview_matches` has no row (Review Focus).
  - Two concurrent `get(7455230)` with a slow fake → exactly one `searchAlbums` call, both resolve equal (Review Focus 5).
  - Sync safety: running `upsertBasic` + `applyDetail` again leaves `preview_matches`/`preview_tracks` rows unchanged.
  - `getReleaseDetail(...).sides[0].tracks[0].idx` is a number (TrackRow idx).
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** `npm test` (all) → PASS.
- [ ] **Step 5:** Commit `feat(previews): preview service with caching and manual overrides`.

---

### Task 5: Preview routes + wiring

**Files:** Create `server/src/routes/previews.ts`; Modify `server/src/app.ts` (`AppDeps.previews: PreviewService`), `server/src/main.ts`; Test `server/test/api.test.ts`

**Interfaces:**
- Routes per spec §6. `PreviewUnavailableError` → 502 `{ error: "Couldn't reach Apple Music. Try again." }`; null → 404. `PUT` body is zod union `{ appleAlbumId: number int positive } | { none: true }`.
- `main.ts`: `createPreviewService({ db, itunes: createItunesClient({ country: config.previewCountry }) })`.

- [ ] **Step 1: Failing tests** (`buildApp` with a stub `PreviewService` recording calls): `GET /api/releases/7455230/previews` → 200 body from stub; stub returning null → 404; stub throwing `PreviewUnavailableError` → 502 with the message above; `GET …/candidates` → array; `PUT` `{appleAlbumId: 5}` → calls `setAlbum(7455230, 5)`; `PUT` `{none: true}` → `setNone`; `PUT {}` → 400; `DELETE` → `reset`. Update existing `buildApp` calls in tests to pass a stub service.
- [ ] **Step 2:** → FAIL. **Step 3:** Implement. **Step 4:** `npm test` → PASS; `cd server && npx tsc --noEmit -p tsconfig.json` clean.
- [ ] **Step 5: Live check** — restart the dev API; `curl -s localhost:3020/api/releases/7455230/previews | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['status'],d['album']['name'],len(d['tracks']))"` → `auto Star Wars: A New Hope (Original Motion Picture Score) 16`.
- [ ] **Step 6:** Commit `feat(previews): HTTP routes`.

---

### Task 6: Player core (queue + provider)

**Files:** Create `web/src/player/queue.ts`, `web/src/player/PlayerProvider.tsx`; Test `web/src/player/queue.test.ts`, `web/src/player/PlayerProvider.test.tsx`

**Interfaces — Produces:**
```ts
// queue.ts
export interface QueueItem { releaseId: number; trackIdx: number; title: string; artists: string; releaseTitle: string;
  coverUrl: string | null; previewUrl: string }
export interface PlayerState { queue: QueueItem[]; index: number; status: 'idle' | 'loading' | 'playing' | 'paused'; restart: number }
export type PlayerAction =
  | { type: 'play'; items: QueueItem[]; start: number } | { type: 'toggle' } | { type: 'next' }
  | { type: 'prev'; currentTime: number } | { type: 'ended' } | { type: 'error' } | { type: 'stop' }
  | { type: 'playing' } | { type: 'paused' };
export const initialPlayerState: PlayerState
export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState
// PlayerProvider.tsx
export function PlayerProvider(props: { children: ReactNode; createAudio?: () => HTMLAudioElement }): JSX.Element
export function usePlayer(): { state: PlayerState; current: QueueItem | null; progress: number; duration: number;
  play(items: QueueItem[], start: number): void; toggle(): void; next(): void; prev(): void; stop(): void; seek(fraction: number): void;
  isPlayingRelease(releaseId: number): boolean; isCurrent(releaseId: number, trackIdx: number): boolean }
```
Reducer semantics: `play` → queue/index set, status `loading`; `next`/`ended`/`error` on the last item → `initialPlayerState`; otherwise index+1, `loading`; `prev` with `currentTime > 3` → same index, `restart + 1`; else index−1 (min 0), `loading`; `toggle` playing→paused, paused→`loading`; `stop` → initial. Provider: effect on `(index, queue)` sets `audio.src` and calls `play()`; listeners are bound per src and ignore events whose `audio.src` no longer matches the current item (Review Focus 3); `play()` rejection → dispatch `paused` (Review Focus 4); `restart` change → `currentTime = 0`; `timeupdate` → progress; Media Session metadata/actions when `navigator.mediaSession` exists.

- [ ] **Step 1: Failing tests** — reducer: play→loading at start index; next at end → idle & empty queue; prev at 5 s restarts (restart+1, same index); prev at 1 s goes back; toggle paused→loading; error on last → idle. Provider (jsdom, `createAudio` returns a fake `EventTarget` with `src`, `currentTime`, `duration`, `play: vi.fn(() => Promise.resolve())`, `pause`): playing 2 items then dispatching `ended` on the fake → second item's `previewUrl` set as `src`; calling `play` with a new queue then dispatching a late `ended` captured from the *old* src handler → no advance; `play` rejecting → status `paused`.
- [ ] **Step 2:** `npm -w web test` → FAIL. **Step 3:** Implement. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(web): player queue and provider`.

---

### Task 7: Preview UI — hooks, mini-player, Release integration

**Files:** Create `web/src/components/MiniPlayer.tsx`, `web/src/components/PreviewBar.tsx`, `web/src/components/AlbumPicker.tsx`; Modify `web/src/api/hooks.ts`, `web/src/main.tsx` (wrap in `PlayerProvider`), `web/src/App.tsx` (render `MiniPlayer`; `content` gets class `with-player` while a queue exists), `web/src/pages/Release.tsx`, `web/src/theme/theme.css`

**Interfaces:**
- Consumes: Task 4 `PreviewInfo`, `PreviewCandidate`, `TrackRow.idx`; Task 6 `usePlayer`, `QueueItem`.
- hooks: `usePreviews(id)` (`['previews', id]`, `retry: false`), `usePreviewCandidates(id, enabled)`, `useSetPreviewAlbum(id)` (mutation `{appleAlbumId} | {none:true}` → `setQueryData(['previews', id])`), `useResetPreviews(id)`.

- [ ] **Step 1:** Tracks tab: build `queueFor(r, previews): QueueItem[]` (matched track rows in order). Each matched row gets a round ▶ button (`aria-label="Play preview of <title>"`); current row: highlighted background, ❚❚ + 3-bar equaliser animation (static under reduced motion); hover shows an external-link icon to `tracks[idx].url`. Rows without previews keep a blank button slot so titles align.
- [ ] **Step 2:** `PreviewBar` above sides: copy exactly per spec §7 (matched / none / unmatched / loading skeleton / error with Retry); "Preview album" uses `.btn-primary` and is hidden when no tracks; "Change" / "Choose album" open `AlbumPicker` (popover on desktop, full-width sheet under 900 px) listing candidates (artwork 44 px, name, artist · year · N tracks), current match ticked, footer actions "No previews" and "Reset to automatic"; Search Apple Music link → `https://music.apple.com/us/search?term=<artists title>`.
- [ ] **Step 3:** `MiniPlayer` per spec §7: fixed `left: calc(var(--sidebar-w) + 24px); right: 24px; bottom: 16px` (full width minus 16 px gutters under 900 px), cover 44 px (link to `/release/:id`), title · artist (ellipsis), clickable progress bar (`seek`), prev / play-pause / next / close buttons with aria-labels; hidden when `state.queue` empty. `.content.with-player` adds `padding-bottom: 96px`.
- [ ] **Step 4: Verify in the browser pane** (tab-1, dev servers): open `/release/7455230` → bar reads "Previews from Apple Music: Star Wars: A New Hope (Original Motion Picture Score) · Change" and 16 ▶ buttons; click ▶ on A2 → mini-player shows "Imperial Attack", `document.querySelector('audio')`-independent check via `usePlayer` state in UI (title text) and progress advancing after 2 s; navigate to `/library` → mini-player still visible and progressing; Next → "Princess Leia's Theme"; Change → pick another candidate → bar updates; reload → choice persists; "Reset to automatic" restores; `/release/30487525` shows 2 ▶; a record with no match shows "No previews found"; 375 px width: mini-player full-width, no horizontal scroll; no console errors.
- [ ] **Step 5:** `npm test` + web `tsc` clean. Commit `feat(web): track previews and mini-player`.

---

### Task 8: Rebrand — logo, backdrop, cover disc

**Files:** Create `web/src/components/Logo.tsx`, `web/src/components/VinylBackdrop.tsx`, `web/src/components/CoverDisc.tsx`; Modify `web/src/components/Sidebar.tsx`, `web/src/pages/Release.tsx`, `web/src/App.tsx`, `web/src/theme/theme.css`, `web/index.html`, `web/public/favicon.svg`

**Interfaces:**
- `Logo({ size = 32 }: { size?: number })` — inline SVG mark (viewBox 0 0 44 44, geometry identical to the approved mockup: disc r20 `var(--surface-2)`, rings r16.5 & r13 `var(--border-strong)` 1 px, accent arc `M22 2.5 A19.5 19.5 0 0 1 41.5 22` stroke 3 round, label r7 accent, hole r1.6 `var(--bg)`) + wordmark `<span class="wordmark">vinyl<span>orbit</span></span>`.
- `VinylBackdrop()` — `position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden` wrapper containing one SVG (1100×1100) positioned so its centre is at (100% + 180px, 100% + 260px): 40 rings from r=200 to r=545 step ~8.8 px, stroke `var(--groove-line)`; a conic-gradient sheen layer (`conic-gradient(from 0deg, transparent 0 40deg, var(--groove-sheen) 55deg, transparent 70deg)`, circular mask) and label circle r=180 filled `color-mix(in srgb, var(--accent) 7%, transparent)`; whole disc `animation: vo-spin 180s linear infinite`. `.app` content sits above (`position: relative; z-index: 1`).
- `CoverDisc({ coverUrl, alt, spinning, onClick })` — sleeve (existing `CoverImage`) above a disc element of equal size, absolutely positioned behind it; disc = `repeating-radial-gradient` grooves on near-black + label (`<img>` of the cover, 36 % diameter, circular) + 4 % hole; CSS vars `--disc-out` 22 % (32 % when `spinning`, 14 % under 900 px); `spinning` adds `animation: vo-spin 1.8s linear infinite`; entry slide 400 ms ease-out from 0. The header grid reserves room for the disc (cover column `max-width: 300px` with `margin-right` = 32 % of cover width).
- New tokens: `--groove-line` (dark `rgba(255,255,255,0.045)`, light `rgba(0,0,0,0.05)`), `--groove-sheen` (dark `rgba(255,255,255,0.06)`, light `rgba(0,0,0,0.04)`); remove the body `repeating-radial-gradient`, `--serif`, `.serif`, and the Fraunces font link.

- [ ] **Step 1:** Replace sidebar brand with `<Logo />`; `.wordmark` = Inter 600 21 px, letter-spacing −0.03em, `span { color: var(--accent) }`; favicon.svg = the mark with `#3cc8b4` accent, `#151d1c` disc, `#34433f` rings, `#0f1514` hole.
- [ ] **Step 2:** Mount `<VinylBackdrop />` first inside `.app`; `@media (prefers-reduced-motion: reduce)` disables all `vo-spin`, disc slide transitions, and the equaliser animation.
- [ ] **Step 3:** Release header uses `<CoverDisc spinning={player.isPlayingRelease(r.id) && player.state.status === 'playing'} …>`; clicking still opens the lightbox.
- [ ] **Step 4: Verify in browser pane:** sidebar shows the new mark + "vinylorbit" in dark and light, and recolours when the accent changes; favicon updated; backdrop visible but faint at bottom-right on Dashboard/Library in both themes, text contrast unaffected, rotating (compare `getComputedStyle(disc).transform` 2 s apart differs); Release page: disc peeks out ~22 %, spins only while this record's preview plays and stops on pause or when another record plays; with reduced motion emulated (`matchMedia` override not available → verify CSS rule exists via `document.styleSheets` search for `prefers-reduced-motion`); 375 px width: header stacks, disc peeks 14 %, no horizontal scroll; no console errors.
- [ ] **Step 5:** `npm test` + web `tsc` clean. Commit `feat(web): groove-arc logo and vinyl visuals`.

---

### Task 9: Docs + production build check

**Files:** Modify `README.md`

- [ ] **Step 1:** README: intro mentions Apple Music previews and the mini-player; config table adds `PREVIEW_COUNTRY` (`US`, "Apple Music storefront used for 30-second previews"); "How previews work" section (matched on first open, cached, Change to fix, not touched by sync, Spotify no longer offers previews).
- [ ] **Step 2:** `npm run build` succeeds; `DATA_DIR=./data PORT=3021 SYNC_INTERVAL_HOURS=0 node server/dist/main.js` → `curl -s localhost:3021/api/releases/7455230/previews` returns status `auto`; `/` serves HTML; stop it.
- [ ] **Step 3:** `npm test` → all PASS. Commit `docs: previews and rebrand`.

---

## Self-review notes

- Spec coverage: §2 source → T2; §4 data → T4; §5 matching → T1, T3, T4; §6 API → T5; §7 player → T6, T7; §8 rebrand → T8; §9 errors → T4, T5, T6, T7; §10 testing → T1–T8; config/README → T2, T9.
- `TrackRow.idx` is introduced in T4 and consumed in T7; `PreviewService` produced in T4, consumed in T5; `usePlayer` produced in T6, consumed in T7 and T8 (`isPlayingRelease`).
