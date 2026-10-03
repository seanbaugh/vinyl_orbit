# Spinning Now: full-screen now-playing view

Date: 2026-10-03
Scope: web only (no server or API changes)

## Goal

A **Spinning now** button opens a full-screen, TV-friendly view: large cover art beside a spinning
record (black vinyl) or CD (silver), chosen by the release's format. The user mirrors their Mac to an
Apple TV (AirPlay screen mirroring) to show it on a big screen. The app does not implement casting.

## Sources of "now spinning" (priority order)

1. **Mini-player track** — a preview is loaded in `PlayerProvider`. The view shows that album; the disc
   spins only while audio is playing; track title, `Album — Artist`, progress bar and `n/N` follow the queue.
2. **Marked record** — the user pressed **Spin now** on a release page. No audio, so the disc spins
   continuously. Title reads "Now spinning" with album and artist. A Stop button clears it.
3. Neither present: the Spinning now button is hidden.

## Changes

### Disc kind in the queue
- `QueueItem` (`web/src/player/queue.ts`) gains `kind?: 'vinyl' | 'cd'`.
- `queueFor()` in `web/src/pages/Release.tsx` sets it with `formatFamily(r.formatSummary) === 'cd' ? 'cd' : 'vinyl'`,
  the same rule the release page already uses for `CoverDisc`.

### Marked record store
- New `web/src/lib/nowSpinning.ts`: `useNowSpinning()` returns `{ releaseId, set(id), clear() }`.
  Backed by `localStorage` (try/catch around every access), synced across tabs via the `storage` event.
  Browser-only by decision: the user mirrors from the device they control. Moving it to a server row later is a small change.

### Overlay
- New `web/src/components/SpinningNow.tsx`, rendered from `App.tsx`; open state lives in `NowSpinningProvider` (so the release page can open it too).
- Visuals: blurred, enlarged cover as background; `CoverDisc` centred and sized to the viewport (fills 16:9);
  title, then `Album — Artist`; thin progress bar and `n/N` (preview source only).
- Controls (previous, play/pause, next, close; Stop for the marked source) fade out after 3 s without pointer
  movement, and the cursor hides. Keys: Space play/pause, arrows prev/next, Esc closes.
- Requests the Fullscreen API on open and exits on close; if refused, remains a full-window overlay.
- Holds a Screen Wake Lock while open where supported.
- Title cross-fades on track change. Disc animation respects `prefers-reduced-motion`.
- For the marked source, cover, format and titles come from the existing release detail query. No new endpoint.
- Styles in `web/src/theme/theme.css`, using the accent colour.

### Entry points
- **Spinning now** button in `MiniPlayer` and in `TopBar` (visible only when a source exists); shortcut ⌘⇧S.
- **Spin now** button on the release page, next to the preview-album button. It:
  1. stops any playing preview, then calls `useNowSpinning().set(id)`,
  2. logs a play via the existing `useAddPlay` (`POST /api/releases/:id/plays`), skipped if a play for that
     release was logged by Spin now within the last 10 minutes (tracked in `localStorage`); a toast confirms,
  3. opens the overlay immediately.

### AirPlay
Documented in the README: Control Center → Screen Mirroring → Apple TV, then press Spinning now.

## Testing (TDD)
- `queueFor` maps CD formats to `kind: 'cd'`, others to `'vinyl'`.
- `nowSpinning`: persists, clears, reads across a `storage` event, tolerates a throwing `localStorage`.
- `SpinningNow`: renders cover, title and artist; CD vs vinyl disc; spinning class only while the preview
  plays; continuous spin for the marked record; preview source wins over the marked record; renders nothing
  with no source; Esc and close call `onClose`.
- Spin now: logs exactly one play per 10-minute window, sets the marked record, opens the overlay.
- Manual check in the browser preview at 1920×1080, both disc kinds.

## Out of scope
Server-side or cross-device "now spinning" state; native casting (AirPlay or Chromecast APIs); side/disc tracking.
