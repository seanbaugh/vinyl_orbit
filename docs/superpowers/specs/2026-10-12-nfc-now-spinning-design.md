# NFC tag now-spinning: Home Assistant drives Spinning now

Date: 2026-10-12
Scope: server and web

## Intent and why

The user already has NFC tags on their records. Tapping one fires a Home Assistant automation that shows the
album art on their ESPHome displays. They want the same tap to drive Vinyl Orbit: the play is logged and the
full-screen **Spinning now** view opens by itself, on whatever screen is showing Vinyl Orbit (for example a
browser mirrored to the TV).

The Home Assistant side works flawlessly and **must not be changed**. Vinyl Orbit adapts to it.

## What exists today

### Home Assistant (read-only reference; do not modify)
- Automation `Vinyl - Now Playing` triggers on 47 NFC tag IDs. It holds a lookup table
  tag → `{album, artist, cover filename}` (plain text, no Discogs IDs) and writes three helpers:
  `input_text.vinyl_album`, `input_text.vinyl_artist`, `input_text.vinyl_cover_url`.
- Helpers are cleared (set to `""`) by `Vinyl - Auto Clear After Idle` (helper unchanged for 1 hour) and by
  `Vinyl - Clear when Sonos plays` (either Sonos player starts playing).
- Home Assistant base URL: `http://192.168.1.214:8123`.
- Known quirk: re-tapping the tag of the record already showing writes the same value, so the helper does not
  change. Vinyl Orbit cannot see such a tap, and accepts that.

### Vinyl Orbit
- `Spin now` on a release page (`web/src/lib/useSpinNow.ts`) stops any preview, marks the release as spinning,
  logs a play (client-side dedupe of 10 minutes via `localStorage`, `spinLog.ts`) and opens the overlay.
- The marked record lives only in this browser's `localStorage` (`web/src/lib/nowSpinning.tsx`). The earlier
  Spinning now design left server-side or cross-device state out of scope; this design brings it in.
- Plays: `POST /api/releases/:id/plays`, table `plays`.
- Matching text between sources already exists in `server/src/previews/normalize.ts` (`normalizeAlbum`,
  `normalizeArtist`, `albumSim`).

## Goals

1. Tapping a tag makes the matching record in the collection "spinning now" on the server, logs one play, and
   opens the Spinning now view in every open Vinyl Orbit browser tab.
2. When Home Assistant clears the helpers, Vinyl Orbit stops spinning too.
3. The marked record becomes server-side state, so every screen follows it.
4. With no Home Assistant settings configured, Vinyl Orbit behaves exactly as it does today.

## Non-goals
- No change to any Home Assistant automation, helper, script or dashboard. Vinyl Orbit only reads helper states.
- No dependence on the `/local/covers` images; Vinyl Orbit keeps using its own Discogs cover art.
- No writing back to Home Assistant, no webhooks, no add-on.
- No tag programming or tag management UI.
- No changes to the preview player or to the Spinning now view's visuals.

## Anti-goals (a failure even if it technically works)
- Logging the same listen twice, or logging a play for a wrong record because of a loose match.
- A Home Assistant outage, bad token or wrong URL breaking Vinyl Orbit, or filling its logs.
- The token reaching the browser.
- The view popping open on page load for something that was already spinning.

## Design

### Configuration (server, `config.ts`)
- `HA_URL` (e.g. `http://192.168.1.214:8123`), `HA_TOKEN` (Home Assistant long-lived access token), and
  `HA_POLL_SECONDS` (default 5). The feature is on only when both `HA_URL` and `HA_TOKEN` are set.
  Documented in `.env.example` and the README, including how to create a token and that it needs no special
  permissions beyond reading states.

### Home Assistant poller (server)
- New module under `server/src/homeassistant/`, started from `main.ts` next to the scheduler and stopped on
  shutdown. Every `HA_POLL_SECONDS` it reads `input_text.vinyl_album` and `input_text.vinyl_artist` via
  `GET {HA_URL}/api/states/<entity_id>` with the bearer token. (Polling is the author's call; a websocket
  subscription is the alternative and is left to the builder if it is clearly simpler.)
- Failures (network, 401, 404, timeout) are logged once per outage at `warn`, not every poll, and the poller
  keeps trying. A recovery is logged once.
- State machine on the combined (album, artist) value:
  - **First successful read after server start:** if non-empty, set the matched record as spinning, but do not
    log a play and mark it so the web does not auto-open. If empty, nothing.
  - **Changed to a non-empty value (observed live):** match it (below). On a match: set it as spinning with
    source `tag`, log a play unless that release already has a play in the last 10 minutes (checked against the
    `plays` table, not the browser), and mark this as a fresh tap so web clients auto-open. On no match: log at
    `info`, change nothing, log no play.
  - **Changed to empty:** if the current spinning record came from a tag, clear it. A record set by the web
    **Spin now** button is left alone.

### Matching
- Compare the helper's album and artist against the collection (`releases`: title and artists text) using the
  existing normalisers and `albumSim`. Accept the best candidate only above a threshold chosen by the builder
  and tested against the 47 real album/artist pairs listed in the Appendix; ties or near-ties are a miss, not a
  guess.
- Manual overrides for pairs that cannot match (Appendix lists likely ones: "Various", "Soundtrack",
  abbreviated titles). Overrides are a small JSON file in `DATA_DIR` (`ha-overrides.json`: a list of
  `{ album, artist, releaseId }`), read at poll time so editing needs no restart. A missing file is normal. Override
  lookup uses the same normalisers and runs before fuzzy matching. (Format and location are the author's call.)

### Server-side now-spinning state
- New single-row table `now_spinning`: `release_id`, `source` (`tag` | `manual`), `updated_at`, `fresh_tap`
  marker as the builder sees fit. Schema added with the existing idempotent migration style in `schema.sql`.
- `GET /api/now-spinning` returns `{ releaseId, source, updatedAt, tap }` where `tap` changes value only on a
  fresh tag tap (an incrementing counter or timestamp), so clients can tell "newly tapped" from "already there".
- `PUT /api/now-spinning { releaseId }` sets it with source `manual`; `DELETE /api/now-spinning` clears it.
  Used by the **Spin now** button and the Stop button. No auth, like the rest of the app on the LAN.

### Web
- `NowSpinningProvider` reads server state (React Query on `GET /api/now-spinning`, refetch every few seconds
  and on window focus) instead of `localStorage`. `set` and `clear` call the PUT and DELETE endpoints. The
  `localStorage` key is no longer used; there is no migration.
- Auto-open: when the provider sees `tap` change **after its first load**, it stops any preview playing (same
  reason as Spin now: it would take over the TV), and opens the view. First load never auto-opens.
- Source priority in the view is unchanged: a loaded preview track wins over the marked record.
- Play logging moves entirely to the server so nothing is logged twice (see "Resolved details"). Auto-open is
  view-only: it never logs a play from the browser.

## Resolved details (author's calls after a builder review; marked for the user to check)

1. **One place logs plays.** `PUT /api/now-spinning` (manual Spin now) and the poller (tag tap) both log a play
   on the server, skipping it when that release already has a play in the last 10 minutes in `plays`. The
   client no longer calls `POST /plays` for Spin now and `spinLog.ts` is removed. Tabs reacting to a `tap`
   change only open the view; they never log.
2. **Last writer wins, source follows the writer.** A tag tap overwrites a manual record. A manual Spin now
   overwrites a tag record, including the same release (its source becomes `manual`, so a later Home Assistant
   clear leaves it showing; the Stop button clears it).
3. **Startup.** The first successful read compares the helper with `now_spinning`:
   - helper non-empty, matches the stored tag record: do nothing;
   - helper non-empty, stored record is different or empty: the helper wins, set it with source `tag`, no play,
     no `tap` bump;
   - helper empty and the stored record's source is `tag`: clear it (Home Assistant cleared while the server
     was down); a `manual` record is left alone.
4. **Matching data.** The builder reads the user's public Discogs collection (user `seanmikel`, via the app's
   existing Discogs client or the synced database) to test the matcher against real titles; the Appendix is
   the expected-input list. Ship `ha-overrides.json` seeded for every Appendix pair that fails fuzzy
   matching against the real collection, so all 47 tags resolve at launch. Tags for records not in the
   collection simply miss, which is fine.
5. **Deleted releases.** `GET /api/now-spinning` returns `releaseId: null` if the stored release no longer
   exists. The web fetches release details itself, as today.
6. **Stale taps and clearing.** A tab auto-opens only for a `tap` less than 2 minutes old, so a throttled tab
   waking later does not pop open. When the server state becomes empty (Home Assistant clear or Stop), the
   Spinning now view closes if it is showing the marked record; a preview-driven view is unaffected.
7. **Consistent reads.** The poller fetches both helpers, then acts only when the same (album, artist) pair is
   seen on two consecutive polls, so a read straddling a tag change cannot produce a mixed pair.
8. **Dedupe clock.** The 10-minute window uses the injected clock and compares UTC ISO strings, which is how
   `plays.played_at` is stored.

## Constraints
- Docker host must reach Home Assistant at the URL; the feature is optional and silent when unconfigured.
- Single container, SQLite, no new services. Keep dependencies out unless clearly needed (`fetch` is enough).
- Tests first, in the repo's style (vitest). Poller takes an injectable fetch and clock so the state machine is
  tested without a network. Real fixtures: the 47 Appendix pairs for matching.

## Left to the builder
Poll vs websocket, exact match threshold, override file details, table shape, refetch interval, wording of
log lines and README steps.

## Appendix: tag library (album — artist), from the automation
Atlas — Sleeping at Last; Space — Sleeping at Last; Gorecki Symphony No 3 — Henryk Gorecki; Shadowfax —
Shadowfax; Southern Exposure — Alex de Grassi; True Confessions — Bananarama; Reach the Beach — The Fixx;
17 — Chicago; Windham Hill '88 — Various; The Copland Album — Leonard Bernstein; Holst - The Planets — Previn,
London Symphony Orchestra; The End — Cody Fry; Autumn — George Winston; Greatest Hits — Melissa Manchester;
How to Keep a Fire Burning — Safari Room; Reckless — Bryan Adams; Firebird and Rite of Spring — Maazel, Tilson
Thomas; Jupiter 8 — Paul Horn; Wind Dance — Scott Cossu; A Chorus Line — Original Broadway Cast; Mahler
Symphony No 1 — Bernstein; Mahler Symphony No 2 — Bruno Walter; Caribou — Elton John; Brother to Brother —
Gino Vannelli; Blame It on Love — Rachael Sweet; Chicago VII — Chicago; Storm at Sunup — Gino Vannelli; Opera
Sauvage — Vangelis; Whitney — Whitney Houston; Underneath the Colours — INXS; Christine McVie — Christine
McVie; Something of Time — Nightnoise; Don't Cry Out Loud — Melissa Manchester; Chicago 2 — Chicago; Pauper in
Paradise — Gino Vannelli; Amadeus — Soundtrack; Firebird — London Symphony; Greatest Hits — Chicago; Star
Wars — John Williams; Gist of the Gemini — Gino Vannelli; Breaking Hearts — Elton John; Remembrance Days — The
Dream Academy; China — Vangelis; Breakdown — Melissa Etheridge; Mahler Symphony No 5 — Karajan; Berio and
Bartók — Leonard Bernstein; Pictures at an Exhibition — Solti, Chicago Symphony Orchestra.

Note: "Greatest Hits" appears twice (Melissa Manchester, Chicago), so artist must take part in matching.
