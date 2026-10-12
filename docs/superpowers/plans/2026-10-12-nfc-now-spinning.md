# NFC Now-Spinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Home Assistant NFC tag tap logs a play, marks the record as spinning on the server, and opens the full-screen Spinning now view on every open Vinyl Orbit tab.

**Architecture:** A server-side poller reads two Home Assistant `input_text` helpers (read-only), matches album and artist to a release, and writes a single-row `now_spinning` table. The web app's marked-record state moves from `localStorage` to that table via a new `/api/now-spinning` endpoint. Plays are logged only on the server.

**Tech Stack:** Fastify, better-sqlite3, zod, vitest (server); React, @tanstack/react-query, vitest + Testing Library (web). No new dependencies (`fetch` only).

**Spec:** `docs/superpowers/specs/2026-10-12-nfc-now-spinning-design.md` (read its "Resolved details" section; it is binding).

## Global Constraints

- Home Assistant is read-only: only `GET {HA_URL}/api/states/<entity_id>`. Never call a write service, never change an automation or helper.
- Config: `HA_URL`, `HA_TOKEN`, `HA_POLL_SECONDS` (default 5). Feature is on only when both `HA_URL` and `HA_TOKEN` are set; otherwise behaviour is exactly as today.
- Entities read: `input_text.vinyl_album`, `input_text.vinyl_artist`.
- The token never reaches the browser or the logs.
- Play dedupe window: 10 minutes, checked against the `plays` table (UTC ISO strings), using an injectable clock.
- A tab auto-opens only for a tap less than 2 minutes old; first web load never auto-opens.
- Poller acts only when the same (album, artist) pair is seen on two consecutive successful polls.
- Home Assistant outage: log one `warn` per outage and one `info` on recovery, not per poll.
- Tests first (vitest), repo style; poller takes injected fetch/clock/read so no network in tests.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Home Assistant reports `unavailable` or `unknown` (it is restarting): treat as a failed read; do not clear the record or log a play. (Task 3)
2. Home Assistant unreachable or token wrong at server start: server starts normally, one warning, keeps retrying. (Task 3)
3. Album and artist differ in case, punctuation or diacritics ("Bartók", "Don't Cry Out Loud", `Windham Hill '88`): still match; blank artist never throws. (Task 2)
4. Two releases titled "Greatest Hits": artist decides; the wrong artist never matches. (Task 2)
5. A release removed by sync (or the library reset) while it is spinning: `GET /api/now-spinning` returns `releaseId: null` and the web does not error-loop. (Tasks 1, 4)

## File Structure

- Create `server/src/repo/nowSpinning.ts`: state table access and play dedupe.
- Create `server/src/routes/nowSpinning.ts`: the three endpoints.
- Create `server/src/homeassistant/match.ts`: overrides loading and album/artist → release matching.
- Create `server/src/homeassistant/overrides.default.json`: shipped overrides (seeded in Task 6).
- Create `server/src/homeassistant/client.ts`: reads the two helpers.
- Create `server/src/homeassistant/poller.ts`: state machine and timer.
- Create `web/src/components/NowSpinningTapWatcher.tsx`: auto-open on fresh tap.
- Modify: `server/src/db/schema.sql`, `server/src/app.ts`, `server/src/config.ts`, `server/src/main.ts`, `.env.example`, `README.md`, `web/src/api/hooks.ts`, `web/src/lib/nowSpinning.tsx`, `web/src/lib/useSpinNow.ts`, `web/src/App.tsx`.
- Delete: `web/src/lib/spinLog.ts`, `web/src/lib/spinLog.test.ts`.

---

### Task 1: Server-side now-spinning state and API

**Files:**
- Modify: `server/src/db/schema.sql`, `server/src/app.ts`
- Create: `server/src/repo/nowSpinning.ts`, `server/src/routes/nowSpinning.ts`
- Test: `server/test/repo.nowSpinning.test.ts`, `server/test/nowSpinning.api.test.ts` (API tests follow `server/test/api.test.ts` setup)

**Interfaces:**
- Produces (`repo/nowSpinning.ts`):
  - `type NowSpinningSource = 'tag' | 'manual'`
  - `interface NowSpinningState { releaseId: number | null; source: NowSpinningSource | null; updatedAt: string | null; tap: number; tapAgeMs: number | null }`
  - `getNowSpinning(db: Db, now: Date): NowSpinningState` (`releaseId` is null when the stored release is missing or has `removed_at` set; `tapAgeMs` is `now - tap_at`, null if never tapped)
  - `setNowSpinning(db: Db, releaseId: number, source: NowSpinningSource, now: Date, opts?: { tap?: boolean }): void` (`tap: true` increments `tap` and stamps `tap_at`)
  - `clearNowSpinning(db: Db): void`
  - `logPlayIfNew(db: Db, releaseId: number, now: Date, windowMs?: number): Play | null` (default 600_000; null if a play for that release exists with `played_at >= now - windowMs`)
- Produces (HTTP): `GET /api/now-spinning` → `NowSpinningState`; `PUT /api/now-spinning` body `{ releaseId: number }` → `NowSpinningState & { playLogged: boolean }` (404 if the release does not exist); `DELETE /api/now-spinning` → 204.

- [ ] **Step 1: Write failing repo tests** in `repo.nowSpinning.test.ts`: `getNowSpinning` on a fresh db → `{releaseId:null, source:null, tap:0, tapAgeMs:null}`; set manual then get → id and source; set with `{tap:true}` twice → `tap === 2` and `tapAgeMs` equals the injected clock difference; `clearNowSpinning` → null id; a stored id whose release has `removed_at` set (or was deleted) → `releaseId: null`; `logPlayIfNew` returns a Play first, `null` 9 minutes later, a Play again at 11 minutes.
- [ ] **Step 2: Run** `npm -w server test -- test/repo.nowSpinning.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the table in `schema.sql` in the existing idempotent style: `now_spinning (id INTEGER PRIMARY KEY CHECK (id = 1), release_id INTEGER, source TEXT, updated_at TEXT, tap INTEGER NOT NULL DEFAULT 0, tap_at TEXT)` plus `INSERT OR IGNORE INTO now_spinning (id) VALUES (1)`; then `repo/nowSpinning.ts` with the signatures above. Reuse `addPlay` from `repo/user.ts` inside `logPlayIfNew`.
- [ ] **Step 4: Run the repo tests.** Expected: PASS.
- [ ] **Step 5: Write failing API tests** in `nowSpinning.api.test.ts`: GET on empty → nulls; PUT `{releaseId}` of a synced fixture release → 200 with `source: 'manual'`, `playLogged: true`, and the play appears in the release detail; a second PUT immediately → `playLogged: false` and still one play; PUT unknown id → 404; PUT bad body → 400; DELETE → 204 then GET shows null.
- [ ] **Step 6: Run** them. Expected: FAIL.
- [ ] **Step 7: Implement** `nowSpinningRoutes(app, { db })` in `routes/nowSpinning.ts` (zod `parse`, `HttpError`, `releaseExists` pattern from `routes/user.ts`; use `new Date()` for the clock) and register it in `app.ts` after `userRoutes`.
- [ ] **Step 8: Run** `npm -w server test`. Expected: all PASS.
- [ ] **Step 9: Commit** `feat(server): server-side now-spinning state and API`.

---

### Task 2: Matcher and overrides

**Files:**
- Create: `server/src/homeassistant/match.ts`, `server/test/fixtures/ha/tag-library.json`, `server/test/fixtures/ha/collection.json`
- Test: `server/test/ha.match.test.ts`

**Interfaces:**
- Consumes: `normalizeAlbum`, `normalizeArtist`, `albumSim` from `server/src/previews/normalize.ts`; `releases` table (`id`, `title`, `artists_display`, `removed_at`).
- Produces:
  - `interface HaPair { album: string; artist: string }`
  - `interface HaOverride { album: string; artist: string; releaseId: number }`
  - `loadOverrides(file: string): HaOverride[]` (missing file → `[]`; invalid JSON or shape → `[]`; never throws)
  - `matchRecord(db: Db, pair: HaPair, overrides: HaOverride[]): number | null`

- [ ] **Step 1: Build fixtures.** `tag-library.json` = the 47 `{album, artist}` pairs from the spec Appendix. `collection.json` = `[{id, title, artistsDisplay}]` for the whole public collection of Discogs user `seanmikel` (fetch `https://api.discogs.com/users/seanmikel/collection/folders/0/releases?per_page=100`, all pages, with a `User-Agent` header; keep only those three fields).
- [ ] **Step 2: Write failing tests** in `ha.match.test.ts` using an in-memory db filled from `collection.json` (use the basic upsert in `repo/releases.ts`): overrides win over fuzzy matching and are matched on normalised album+artist; exact title+artist → that id; case/diacritics/punctuation variants match (Review Focus 3); blank artist does not throw; a pair with no similar title → `null`; two "Greatest Hits" rows with different artists resolve by artist and a wrong artist → `null` (Review Focus 4, use synthetic rows); a near-tie → `null`; `removed_at` rows are ignored; `loadOverrides` on missing file, bad JSON and good file.
- [ ] **Step 3: Run** `npm -w server test -- test/ha.match.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** `match.ts`. Score = `0.6 * albumSim(title) + 0.4 * albumSim(artist)` on normalised text; accept the best only if score ≥ 0.75 and it beats the runner-up by ≥ 0.1. These numbers are a starting point: tune them in Step 6.
- [ ] **Step 5: Run** the tests. Expected: PASS for the synthetic cases.
- [ ] **Step 6: Add a report test** that runs all 47 library pairs against `collection.json` and fails if any pair maps to a release the author did not intend. First print each pair's result (`console.table` in a scratch run), review by eye, then pin the verified results: a table in the test file of pair → expected release id, or `null` for "not in collection or needs an override". Adjust the thresholds if a wrong match appears.
- [ ] **Step 7: Run** `npm -w server test`. Expected: PASS.
- [ ] **Step 8: Commit** `feat(server): match Home Assistant album/artist text to a release`.

---

### Task 3: Home Assistant client, poller and wiring

**Files:**
- Create: `server/src/homeassistant/client.ts`, `server/src/homeassistant/poller.ts`
- Modify: `server/src/config.ts`, `server/src/main.ts`, `.env.example`, `server/test/config.test.ts`
- Test: `server/test/ha.client.test.ts`, `server/test/ha.poller.test.ts`

**Interfaces:**
- Consumes: Task 1 (`setNowSpinning`, `clearNowSpinning`, `getNowSpinning`, `logPlayIfNew`), Task 2 (`matchRecord`, `loadOverrides`, `HaPair`, `HaOverride`).
- Produces:
  - `Config` gains `haUrl: string | null; haToken: string | null; haPollSeconds: number` (env `HA_URL`, `HA_TOKEN`, `HA_POLL_SECONDS`, default 5).
  - `createHaClient(opts: { url: string; token: string; fetch?: typeof fetch }): { readHelpers(): Promise<HaPair> }`. It GETs both entities with `Authorization: Bearer`. It throws on network error, non-2xx, timeout (5 s), or state `unavailable`/`unknown`. An empty-string state is a valid empty value.
  - `interface HaPollerDeps { db: Db; read(): Promise<HaPair>; overrides(): HaOverride[]; now(): Date; log: { info(m: string): void; warn(m: string): void } }`
  - `createHaPoller(deps: HaPollerDeps): { tick(): Promise<void>; start(intervalMs: number): void; stop(): void }`

- [ ] **Step 1: Failing client tests** (`ha.client.test.ts`, injected fetch): sends the bearer header to `/api/states/input_text.vinyl_album` and `…_artist`; returns the two states; 401, 404, a thrown fetch and a hung request each reject; state `unavailable` rejects (Review Focus 1); an error message never contains the token.
- [ ] **Step 2: Run** `npm -w server test -- test/ha.client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `client.ts` (`AbortSignal.timeout(5000)`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Failing poller tests** (`ha.poller.test.ts`, scripted `read` results, in-memory db with fixture releases, fake clock). One test each:
  - a pair seen once does nothing; seen on two consecutive ticks acts (stability rule);
  - changed to a matching non-empty pair → source `tag`, `tap` incremented, one play logged;
  - the same pair re-confirmed later → no second play;
  - another tap of the same release within 10 minutes → record set, no new play;
  - non-matching pair → state unchanged, no play, one `info` log;
  - changed to empty with source `tag` → cleared; with source `manual` → unchanged;
  - first confirmed read after start, helper non-empty, matches stored tag record → nothing; different or empty stored record → set with source `tag`, no play, `tap` unchanged;
  - first confirmed read, helper empty, stored source `tag` → cleared; stored `manual` → kept;
  - a tag tap overwrites a manual record; (manual-overwrites-tag is covered by Task 1's PUT test);
  - read failure: one `warn` across three failing ticks, state untouched, one recovery `info` after a success (Review Focus 1 and 2);
  - a failed tick between two good ones resets the stability count.
- [ ] **Step 6: Run** `npm -w server test -- test/ha.poller.test.ts`. Expected: FAIL.
- [ ] **Step 7: Implement** `poller.ts` per the spec "Home Assistant poller" and "Resolved details" 2, 3, 7. Keep `lastSeen`, `confirmed` and `started` as closure state; `start` uses `setInterval` with an in-flight guard so ticks never overlap; `stop` clears it.
- [ ] **Step 8: Run.** Expected: PASS.
- [ ] **Step 9: Config and wiring.** Extend `loadConfig` (update the existing expectations in `config.test.ts`, add cases: unset → null, set → values, `HA_POLL_SECONDS` below 1 or invalid → error in the existing `num` style). In `main.ts`, when both `haUrl` and `haToken` are set, build the client, poller (overrides from `join(config.dataDir, 'ha-overrides.json')` merged over the shipped defaults from Task 2/6, user entries first, re-read each tick), call `start(haPollSeconds * 1000)`, log `Home Assistant now-spinning enabled`, and `stop()` it in the shutdown handler. Document the three variables in `.env.example`.
- [ ] **Step 10: Run** `npm -w server test` and `npm -w server run build`. Expected: PASS and a clean build.
- [ ] **Step 11: Commit** `feat(server): poll Home Assistant for the tapped record`.

---

### Task 4: Web: server-backed now-spinning state

**Files:**
- Modify: `web/src/api/hooks.ts`, `web/src/lib/nowSpinning.tsx`, `web/src/lib/useSpinNow.ts`, and the tests that mount `NowSpinningProvider`: `web/src/lib/nowSpinning.test.tsx`, `web/src/components/SpinningNow.test.tsx`, `SpinningNowButton.test.tsx`, `SpinPicker.test.tsx`, `web/src/pages/Release.spinNow.test.tsx`
- Delete: `web/src/lib/spinLog.ts`, `web/src/lib/spinLog.test.ts`
- Check: `web/src/main.tsx` (provider must sit inside the react-query provider)

**Interfaces:**
- Consumes: Task 1's HTTP endpoints.
- Produces:
  - In `hooks.ts`: `useNowSpinningState()` (query key `['nowSpinning']`, `GET /api/now-spinning`, `refetchInterval` 4000, refetch on window focus) returning `NowSpinningState` (same shape as the server's; add the type to `server/src/api-types.ts` and import via `@api/api-types`).
  - `NowSpinningApi` becomes `{ releaseId: number | null; tap: number | null; tapAgeMs: number | null; set(id: number): Promise<{ playLogged: boolean }>; clear(): void; open: boolean; setOpen(open: boolean): void }`. `tap` and `tapAgeMs` are null until the first load completes.
  - `NOW_SPINNING_KEY` is removed; nothing reads or writes `localStorage` for this state.

- [ ] **Step 1: Rewrite `nowSpinning.test.tsx` first** (wrapped in a `QueryClientProvider`, fetch mocked as the other web tests do): starts null; after load exposes server `releaseId`, `tap`, `tapAgeMs`; `set(42)` sends `PUT /api/now-spinning` with `{releaseId: 42}`, resolves with `{playLogged}` and `releaseId` is 42 straight away (optimistic) and the release's plays are refetched; `clear()` sends `DELETE` and goes null; a server change picked up on the next refetch updates `releaseId`; a server `releaseId: null` for a removed release (Review Focus 5) leaves the provider quiet (no error toast, no loop).
- [ ] **Step 2: Run** `npm -w web test -- src/lib/nowSpinning.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `useNowSpinningState` and rewrite `NowSpinningProvider` on top of it; keep `open`/`setOpen` as local state and the existing exports (`NowSpinningProvider`, `useNowSpinning`). Reuse the existing play-query invalidation in `hooks.ts` (export `useInvalidate` if it is private).
- [ ] **Step 4: Update `useSpinNow.ts`:** stop the player, `nowSpinning.set(releaseId).then(({ playLogged }) => onMessage(playLogged ? 'Logged a play' : 'Spinning (play already logged)'))`, then `setOpen(true)`. Remove the `useAddPlay` and `spinLog` imports and delete `spinLog.ts` and its test. Update `Release.spinNow.test.tsx` so its "logs exactly one play" assertion expects one `PUT` and no `POST …/plays`.
- [ ] **Step 5: Update the other four test files** to mount the provider inside a `QueryClientProvider` with mocked `/api/now-spinning` responses, keeping their existing assertions.
- [ ] **Step 6: Run** `npm -w web test` and `npm -w web run build`. Expected: PASS, clean type-check.
- [ ] **Step 7: Commit** `feat(web): now-spinning state comes from the server`.

---

### Task 5: Web: open on a fresh tap

**Files:**
- Create: `web/src/components/NowSpinningTapWatcher.tsx`
- Modify: `web/src/App.tsx` (render it once, inside both providers)
- Test: `web/src/components/NowSpinningTapWatcher.test.tsx`

**Interfaces:**
- Consumes: Task 4's `useNowSpinning()` (`tap`, `tapAgeMs`, `releaseId`, `setOpen`) and `usePlayer().stop()`.
- Produces: `NowSpinningTapWatcher(): null` (renders nothing).

- [ ] **Step 1: Write failing tests** (provider mounted with mocked state sequences): the first load with `tap: 5` never opens (including `tapAgeMs: 1000`); a later refetch with `tap: 6` and `tapAgeMs: 30_000` calls `player.stop()` and opens the view, once; `tap: 6` and `tapAgeMs: 130_000` does not open (stale tap); an unchanged `tap` on later refetches does not reopen a view the user closed; when `releaseId` goes from a number to null while the view is open and no preview is loaded, the view closes (this relies on the existing "closes itself once nothing is left to show" effect in `useSpinningNowShortcut`; the test pins it, add code only if it fails); the same transition while a preview track is loaded leaves it open.
- [ ] **Step 2: Run** `npm -w web test -- src/components/NowSpinningTapWatcher.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `NowSpinningTapWatcher`: remember the first non-null `tap` as the baseline (a ref); on a later increase with `tapAgeMs < 120_000`, `player.stop()` then `setOpen(true)`; update the baseline either way.
- [ ] **Step 4: Run** `npm -w web test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): open Spinning now when a tag is tapped`.

---

### Task 6: Seed overrides, docs and end-to-end check

**Files:**
- Modify: `server/src/homeassistant/overrides.default.json`, `README.md`, `docker-compose.yml` only if env passthrough needs it, the server build/`Dockerfile` if the JSON file is not copied into `dist` (check how `schema.sql` is handled and do the same)
- Test: extend `server/test/ha.match.test.ts`

- [ ] **Step 1: Seed overrides.** From the Task 2 report, add one `{album, artist, releaseId}` entry to `overrides.default.json` for every library pair that fuzzy matching misses and whose record is in the collection. Extend the report test: every pair now resolves to its pinned id or is pinned `null` (not in the collection) with a comment saying why.
- [ ] **Step 2: Run** `npm -w server test` and `npm -w server run build`; confirm the JSON is present in the built output next to the code that loads it. Expected: PASS.
- [ ] **Step 3: README.** Add a "NFC tags (Home Assistant)" section: what it does, creating a long-lived token (Home Assistant profile → Security), the three env vars, that the Docker host must reach `HA_URL`, that Vinyl Orbit only reads two helpers and changes nothing in Home Assistant, the user override file `data/ha-overrides.json` with an example entry, and the re-tap limitation.
- [ ] **Step 4: Manual verification** with the real services: run the app with `HA_URL`/`HA_TOKEN` set, tap a tag, and confirm within ~10 s a play is logged once and a browser tab with Vinyl Orbit open opens the view; let Home Assistant clear (or start Sonos) and confirm the view closes; restart the server mid-spin and confirm no second play and no auto-open on reload; run with no `HA_*` set and confirm normal behaviour. Use the browser preview tools for the web side. Report any failure instead of fixing around it.
- [ ] **Step 5: Run** `npm test`. Expected: PASS.
- [ ] **Step 6: Commit** `docs: NFC now-spinning setup and seeded overrides`.
