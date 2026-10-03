# Spinning Now Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-screen, TV-friendly "Spinning now" view (big cover beside a spinning vinyl or CD) that follows the mini-player or a record marked with a "Spin now" button.

**Architecture:** Web only. A small context (`NowSpinningProvider`) holds the marked record id (localStorage) and the overlay's open state, so both the release page and the app shell can open the overlay. `SpinningNow` resolves a single "source" (preview track wins, else the marked record) and renders it, reusing `CoverDisc`. The existing `useAddPlay` logs plays.

**Tech Stack:** React 18, react-router, TanStack Query, vitest + @testing-library/react (jsdom, `// @vitest-environment jsdom` per file), plain CSS in `web/src/theme/theme.css`.

**Spec:** `docs/superpowers/specs/2026-10-03-spinning-now-design.md`

All commands run from `/Users/seanbaugh/Discogs Library/web` unless stated. Tests: `npx vitest run <file>`. Type check: `npx tsc -p tsconfig.json --noEmit`.

## Global Constraints

- Web only: no server, schema or API changes.
- Button names: **Spin now** (release page) and **Spinning now** (top bar and mini-player). Shortcut ⌘⇧S.
- Disc kind rule: `formatFamily(r.formatSummary) === 'cd' ? 'cd' : 'vinyl'`.
- Controls auto-hide after 3 s of no pointer movement; cursor hides with them.
- "Spin now" logs at most one play per release per 10 minutes (`SPIN_LOG_WINDOW_MS = 600_000`).
- Every `localStorage` access is wrapped in try/catch; the UI must work when storage throws.
- Disc animation must respect `prefers-reduced-motion` (as the existing `.cover-disc` rules do).
- Use the accent colour variable `--accent`; no new colour palette.

## Review Focus

- Marked record's release is deleted or not loadable: overlay shows nothing rather than crashing; Spinning now button still offers Stop/clear (Task 4 test).
- Browser exits fullscreen itself (Esc consumed by the browser): overlay closes instead of lingering windowed (Task 5 test).
- Fullscreen API or Wake Lock missing/rejecting (Safari, non-HTTPS): overlay still opens (Task 5 test).
- Preview from another record is playing when "Spin now" is pressed: previews stop so the marked record is what the TV shows (Task 7 test).
- Release with no cover image: overlay renders the placeholder, not a broken image (Task 4 test).

---

### Task 1: Disc kind on queue items

**Files:**
- Modify: `web/src/player/queue.ts` (the `QueueItem` interface)
- Modify: `web/src/pages/Release.tsx` (`queueFor`: add `export`, set `kind`)
- Test: `web/src/pages/queueFor.test.ts`

**Interfaces:**
- Produces: `QueueItem.kind?: 'vinyl' | 'cd'`; `export function queueFor(r: ReleaseDetail, info: PreviewInfo | undefined): QueueItem[]`.

- [ ] **Step 1: Write the failing test** `queueFor.test.ts`: build a minimal `ReleaseDetail` cast (`as ReleaseDetail`) with one side holding two tracks (`idx` 1 and 2, `type: 'track'`) and a `PreviewInfo` of `{ status: 'ok', tracks: { 1: { previewUrl: 'u1' }, 2: { previewUrl: 'u2' } } }` (cast). Tests: `'CD formatSummary → kind cd'` (`formatSummary: '2×CD'`; every item `kind === 'cd'`), `'LP and unknown formats → kind vinyl'` (`'LP'` and `''`).
- [ ] **Step 2: Run** `npx vitest run src/pages/queueFor.test.ts`. Expected: FAIL (`queueFor` not exported).
- [ ] **Step 3: Implement.** Add `kind?: 'vinyl' | 'cd'` to `QueueItem`; export `queueFor` and add `kind: formatFamily(r.formatSummary) === 'cd' ? 'cd' : 'vinyl'` to each item.
- [ ] **Step 4: Run** the new test plus `npx vitest run src/player`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): record disc kind on player queue items`.

### Task 2: Marked-record store and overlay state

**Files:**
- Create: `web/src/lib/nowSpinning.tsx`
- Test: `web/src/lib/nowSpinning.test.tsx`

**Interfaces:**
- Produces: `NOW_SPINNING_KEY = 'vinyl-orbit.nowSpinning'`; `NowSpinningProvider({ children })`; `useNowSpinning(): { releaseId: number | null; set(id: number): void; clear(): void; open: boolean; setOpen(open: boolean): void }` (throws outside the provider, like `usePlayer`).

- [ ] **Step 1: Write failing tests** (jsdom; a `Probe` component captures the hook): `'starts null and set() persists the id'` (storage holds `"42"`, `releaseId === 42`); `'reads an existing id on mount'`; `'clear() removes it'`; `'updates when another tab changes storage'` (dispatch `new StorageEvent('storage', { key: NOW_SPINNING_KEY, newValue: '7' })`); `'works when localStorage throws'` (stub `Storage.prototype.getItem/setItem` to throw: `set(5)` still sets `releaseId` to 5 in memory); `'open defaults to false and setOpen toggles it'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/nowSpinning.test.tsx`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** with `useState` for `releaseId` (initialised from storage, parsed as a positive integer, else `null`) and `open`; a `window` `storage` listener keyed on `NOW_SPINNING_KEY`; memoised context value.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): now-spinning store and overlay state`.

### Task 3: Spin-log throttle

**Files:**
- Create: `web/src/lib/spinLog.ts`
- Test: `web/src/lib/spinLog.test.ts`

**Interfaces:**
- Produces: `SPIN_LOG_WINDOW_MS = 600_000`; `shouldLogSpin(releaseId: number, now?: number): boolean`; `markSpinLogged(releaseId: number, now?: number): void`. Storage key `'vinyl-orbit.spinLog'`, a JSON map of release id → timestamp.

- [ ] **Step 1: Write failing tests** (jsdom): `'true when never logged'`; `'false within 10 minutes of markSpinLogged'` (now+599_999); `'true at exactly 10 minutes'`; `'is per release'` (other id still true); `'true and no throw when localStorage throws or holds invalid JSON'`.
- [ ] **Step 2: Run** `npx vitest run src/lib/spinLog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both functions; `Date.now()` default for `now`; all storage access in try/catch.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): throttle spin-now play logging`.

### Task 4: SpinningNow overlay: source resolution and rendering

**Files:**
- Create: `web/src/components/SpinningNow.tsx`
- Modify: `web/src/theme/theme.css` (append a `/* spinning now */` section)
- Test: `web/src/components/SpinningNow.test.tsx`

**Interfaces:**
- Consumes: `usePlayer()` (`current`, `state.status`, `state.index`, `state.queue`, `progress`); `useNowSpinning()` from Task 2; `useRelease(id)` from `api/hooks`; `CoverDisc`; `formatFamily`; `QueueItem.kind` from Task 1.
- Produces: `SpinningNow({ onClose }: { onClose: () => void })`. Internal `useSpinSource(): SpinSource | null` where `SpinSource = { kind: 'preview' | 'marked'; releaseId: number; coverUrl: string | null; discKind: 'vinyl' | 'cd'; headline: string; subline: string; spinning: boolean; progress?: number; position?: { index: number; total: number } }`.
  - Preview source (player has `current`): headline = track title, subline = `${releaseTitle} — ${artists}`, `discKind = current.kind ?? 'vinyl'`, `spinning = status === 'playing'`.
  - Marked source (no `current`, `releaseId` set, release loaded): headline `Now spinning`, subline `${title} — ${artists}`, `spinning = true`.
  - Otherwise `null`: the component renders nothing.
- Markup: root `<div class="spinning-now" role="dialog" aria-label="Spinning now">`; blurred cover as `.spinning-now-bg` (inline `backgroundImage`); `CoverDisc` inside `.spinning-now-stage`; `<h1>` headline, `<p>` subline; `.spinning-now-progress` and `n/N` for the preview source only.

- [ ] **Step 1: Write failing tests.** Wrap in `QueryClientProvider` + `NowSpinningProvider` + `PlayerProvider` (fake audio as in `PlayerProvider.test.tsx`), mocking `../api/hooks` `useRelease` with `vi.mock`. Cases: `'preview source shows track, album and artist'`; `'CD item renders the silver disc, LP item the black record'`; `'disc has the spinning class only while status is playing'` (loading/paused → no `.spinning`); `'marked record spins continuously and reads Now spinning'`; `'preview source wins over the marked record'`; `'renders nothing with no source'`; `'renders nothing, without crashing, when the marked release fails to load'` (`useRelease` → `{ data: undefined, error }`); `'null cover renders the placeholder'` (`.placeholder` present, no `img` in `.spinning-now-stage` sleeve).
- [ ] **Step 2: Run** `npx vitest run src/components/SpinningNow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the component and CSS: fixed full-viewport container above the lightbox's z-index, dark scrim over the blurred background (`filter: blur(60px) saturate(1.2)`, scaled 1.2× to hide edges), stage sized `min(70vh, 40vw)` for the sleeve, headline `clamp(28px, 4vw, 64px)`, centred. Disc spin reuses `.cover-disc.spinning`; `prefers-reduced-motion` handled by existing rules.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): spinning-now overlay`.

### Task 5: Overlay behaviours: controls, keys, fullscreen, wake lock

**Files:**
- Modify: `web/src/components/SpinningNow.tsx`, `web/src/theme/theme.css`
- Test: `web/src/components/SpinningNow.test.tsx` (extend)

**Interfaces:**
- Consumes: `PlayerApi.toggle/next/prev/stop`, `useNowSpinning().clear`.
- Produces: no new exports.

Behaviour: a control bar (Previous, Play/Pause, Next for the preview source; Stop for the marked source; Close for both). On mount, `document.documentElement.requestFullscreen?.()` (errors swallowed); `navigator.wakeLock?.request('screen')` (errors swallowed, sentinel released on unmount); on unmount `document.exitFullscreen()` if `document.fullscreenElement`. `fullscreenchange` to no fullscreen element after having entered → `onClose()`. Keys: `Escape` → `onClose`; Space/Arrows act on the preview source only. Controls get class `idle` (opacity 0, `cursor: none` on root) after 3 s without `pointermove`/`keydown`; any such event restores them. Stop calls `clear()` then `onClose()`.

- [ ] **Step 1: Write failing tests** (fake timers where needed): `'requests fullscreen and a wake lock on open'`; `'still renders when requestFullscreen rejects and wakeLock is undefined'`; `'releases the wake lock and exits fullscreen on unmount'`; `'closes when the browser leaves fullscreen'` (set `document.fullscreenElement` stub, dispatch `fullscreenchange`); `'Escape and the Close button call onClose'`; `'Space toggles, ArrowRight/ArrowLeft call next/prev for a preview'` (spy on the fake audio / reducer state); `'Stop clears the marked record and closes'`; `'controls get idle after 3s and return on pointermove'`.
- [ ] **Step 2: Run** `npx vitest run src/components/SpinningNow.test.tsx`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the effects and control bar described above; CSS for `.spinning-now-controls`, `.spinning-now.idle { cursor: none }`, `.idle .spinning-now-controls { opacity: 0 }`, and a 0.6 s title cross-fade keyed on the headline.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): fullscreen, wake lock and auto-hiding controls for spinning-now`.

### Task 6: Wire the provider, buttons and shortcut

**Files:**
- Modify: `web/src/main.tsx` (wrap `App` with `NowSpinningProvider` inside `PlayerProvider`)
- Modify: `web/src/App.tsx` (render overlay; ⌘⇧S)
- Modify: `web/src/components/TopBar.tsx`, `web/src/components/MiniPlayer.tsx` (Spinning now button)
- Test: `web/src/components/SpinningNowButton.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 and 4.
- Produces: `SpinningNowButton()` in `web/src/components/SpinningNowButton.tsx`: an `icon-btn` (lucide `Disc3`, `aria-label="Spinning now"`, title includes the shortcut) that calls `setOpen(true)`, rendered only when `usePlayer().current || useNowSpinning().releaseId !== null`. Used by both TopBar and MiniPlayer.

- [ ] **Step 1: Write failing tests:** `'hidden with no source'`; `'visible when a preview is loaded'`; `'visible when a record is marked'`; `'click opens the overlay'` (`open` becomes true); `'⌘⇧S toggles the overlay only when a source exists'` (render `App`-level handler via a small exported hook `useSpinningNowShortcut()` in the same file, and test it with a `keydown` event `{ key: 's', metaKey: true, shiftKey: true }`).
- [ ] **Step 2: Run** `npx vitest run src/components/SpinningNowButton.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the button and hook; in `App.tsx` call the hook and render `{open && <SpinningNow onClose={() => setOpen(false)} />}`; add the button to TopBar (before the Stats link) and MiniPlayer controls (before Close).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -p tsconfig.json --noEmit`. Expected: all PASS, no type errors.
- [ ] **Step 5: Commit** `feat(web): spinning-now button and shortcut`.

### Task 7: "Spin now" on the release page

**Files:**
- Modify: `web/src/pages/Release.tsx` (button in `.actions`, after "Played it")
- Test: `web/src/pages/Release.spinNow.test.tsx`

**Interfaces:**
- Consumes: `useNowSpinning().set/setOpen`, `shouldLogSpin/markSpinLogged` (Task 3), `useAddPlay`, `usePlayer().stop`.

Behaviour on click, in order: `player.stop()`; `set(r.id)`; if `shouldLogSpin(r.id)` then `addPlay.mutate({}, { onSuccess })` where `onSuccess` calls `markSpinLogged(r.id)` and sets the toast `Logged a play`, else toast `Spinning (play already logged)`; `setOpen(true)`.

- [ ] **Step 1: Write failing tests** (mock `../api/hooks` with a fake `useRelease` and `useAddPlay` whose `mutate` invokes `onSuccess`): `'Spin now marks the record, logs one play and opens the overlay'`; `'a second click within 10 minutes does not log another play'`; `'stops a preview from another record'` (player playing release 99, click Spin now on release 1 → `state.status === 'idle'`).
- [ ] **Step 2: Run** `npx vitest run src/pages/Release.spinNow.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the button (lucide `Disc3` icon, label `Spin now`, class `btn`) and handler per the behaviour above.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc -p tsconfig.json --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): Spin now button on release page`.

### Task 8: README and visual check

**Files:**
- Modify: `README.md` (new short section "Show it on your TV (AirPlay)" before "How track previews work")
- Modify: `docs/superpowers/specs/2026-10-03-spinning-now-design.md` (two accuracy edits, below)

- [ ] **Step 1: README section:** on a Mac open the Control Center → Screen Mirroring → pick the Apple TV; open a release, press **Spin now** (or play a preview and press **Spinning now**, ⌘⇧S); Esc to leave.
- [ ] **Step 2: Spec edits:** in "Overlay", change "open state lives in `App`" to "open state lives in `NowSpinningProvider`", and add to the Spin now steps "stops any playing preview first".
- [ ] **Step 3: Visual verification.** Start the dev server with `preview_start`, open a vinyl release and a CD release, and screenshot the overlay at 1920×1080 for: preview playing, preview paused, Spin now (no audio). Confirm idle-hide after 3 s and that fullscreen exit closes the overlay. Report anything that looks off to the user.
- [ ] **Step 4: Run** `npx vitest run` and `npm run build` in `web/`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** `docs: AirPlay instructions for spinning-now`.
