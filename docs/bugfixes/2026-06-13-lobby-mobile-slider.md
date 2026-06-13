# Bugfix wave — lobby kicks, mobile answers cut off, slider not rendering

Date: 2026-06-13 · Architect/Reviewer: Opus (orchestrator) · Implementers: subagents
Repo: `git.joelduss.xyz/agent-claude/rahoot` (fork of Razzia) · monorepo root `source/`

Three independent, user-reported bugs. Opus authored this spec + acceptance
criteria; ephemeral workers implement against it; Opus reviews + verifies.

---

## BUG 1 — Lobby kicks players out before the game starts (HIGH, socket)

### Root cause
`source/packages/socket/src/handlers/game.ts`

- `handlePlayerLeave` (`game.ts:30-42`): when `!game.started` it calls
  `game.removePlayer(socket.id)` **immediately** — no grace window. When the
  game *has* started it instead calls `game.setPlayerDisconnected(socket.id)`
  (keeps the player, marks `connected:false`, allows reconnect).
- This same `handlePlayerLeave` is wired to **both**:
  - the transient transport drop: `socket.on("disconnect")` (`game.ts:242-246`), and
  - the intentional leave: `EVENTS.PLAYER.LEAVE` (`game.ts:222-228`).
- So a flaky-wifi blip / tab-background / network-switch in the lobby
  (`disconnect` event) **removes the player from the roster**. On reconnect,
  `EVENTS.PLAYER.RECONNECT` → `registry.getPlayerGame(gameId, clientId)`
  resolves the game by `g.players.some(p => p.clientId === clientId)`
  (`registry.ts` getPlayerGame) — the player is gone → returns `undefined`
  → handler emits `GAME.RESET "errors:game.notFound"` → client navigates to `/`
  → **player kicked**.

Contrast: a *started*-game disconnect keeps the player (grace) and
`reconnectPlayer` (`game/index.ts:278-331`) finds them by `clientId`, swaps the
socket id, restores `connected:true`. The lobby just needs the same grace.

### Key fact that makes the fix safe
The client emits `EVENTS.PLAYER.LEAVE` **only** from the TanStack Router
`onLeave` hook (`web/src/pages/party/$gameId.tsx:132-137`) — i.e. only on
*intentional in-app navigation away*. A wifi blip / tab close does **not** fire
it. So the two server entry points are cleanly separable:

| Server entry | Meaning | Lobby behaviour wanted |
|---|---|---|
| `socket.on("disconnect")` | transport drop (transient) | **GRACE** — keep player, mark disconnected, allow reconnect |
| `EVENTS.PLAYER.LEAVE` | user navigated away (intentional) | **REMOVE** — current behaviour, keep it |

### Required change (socket only)
1. In `handlers/game.ts`, split the player path by **intent**:
   - Keep `EVENTS.PLAYER.LEAVE` → remove-in-lobby / disconnect-when-started
     (current `handlePlayerLeave` semantics — do **not** change intentional leave).
   - Change `socket.on("disconnect")` so that for a player it calls a new
     `handlePlayerDisconnect(game)` that, **whether or not the game is started**,
     calls `game.setPlayerDisconnected(socket.id)` (never `removePlayer`).
2. Add a **lobby grace cleanup** so genuinely-gone players don't pile up as
   ghosts in the host roster. Add to `services/game/index.ts` a small, leak-safe
   mechanism:
   - On a lobby transport-disconnect (`setPlayerDisconnected` while `!started`),
     schedule a per-player removal after `LOBBY_DISCONNECT_GRACE_MS`.
   - Grace timer callback is **idempotent + guarded**:
     `if (player still exists && !player.connected && !game.started) →
     this.removePlayer(player.id)`. If the player reconnected (connected:true)
     or the game started, it no-ops.
   - **Cancel/clear** the timer on: successful `reconnectPlayer`, `kickPlayer`,
     intentional `removePlayer`, and game disposal/cleanup (no dangling timers).
   - Store timers in a `Map<clientId, Timeout>` on the Game; clear all in the
     game's existing dispose/cleanup path (mirror how `healthPushTimer` /
     `autoTimer` are cleared).
   - `LOBBY_DISCONNECT_GRACE_MS`: **45_000** (45 s — long enough for a real
     mobile reconnect storm `reconnectionDelayMax:5000` × retries, short enough
     to clear the roster before a host typically starts). Put it next to the
     other timeout constants; a named constant, not a magic number.
3. Do **not** change started-game behaviour, the reconnect flow, the manager
   path, or `EMPTY_GAME_TIMEOUT` (whole-lobby abandonment is already handled by
   `registry.cleanupEmptyGames`).

### Acceptance criteria (Bug 1)
- A lobby player whose socket drops (`disconnect`) and reconnects within 45 s via
  `PLAYER.RECONNECT` **stays in the game** and resumes the waiting screen — no
  `GAME.RESET`, no kick.
- The host roster still shows the player during the grace window (no flicker);
  count via `TOTAL_PLAYERS` is unchanged during grace.
- A lobby player who never returns is removed after the grace window
  (`MANAGER.REMOVE_PLAYER` + updated `TOTAL_PLAYERS`).
- An **intentional** `PLAYER.LEAVE` in the lobby still removes immediately.
- No timer leaks: disposing/cleaning a game clears all pending grace timers.
- `pnpm --filter socket types` clean; `pnpm --filter socket test` green.

### Test (Bug 1) — new vitest file
`source/packages/socket/src/handlers/__tests__/lobby-disconnect.test.ts`
Follow the existing fakes pattern in `__tests__/display.test.ts` (inline
`makeFakeSocket`, `Registry.getInstance()`, `registry.cleanup()` in
`afterEach`, `vi.useFakeTimers()` for the grace-expiry case). Cover:
1. lobby player `disconnect` → still present + `connected:false` (NOT removed),
   no `GAME.RESET` to that player.
2. after disconnect, `PLAYER.RECONNECT` (same clientId, new socket) →
   `PLAYER.SUCCESS_RECONNECT`, player back to `connected:true`, NOT reset.
3. lobby player `disconnect`, advance fake timers past grace → player removed,
   `MANAGER.REMOVE_PLAYER` emitted.
4. lobby player `EVENTS.PLAYER.LEAVE` → removed immediately (intentional).
5. (regression) started-game disconnect still graces as before.

---

## BUG 2 — On small/old phones, 2 of 4 answers cut off + page won't scroll (HIGH, web)

### Root cause (player answer screen layout)
Vertical stack on the player route, none of it scrollable:

- `GameWrapper.tsx:99` `<section class="relative flex min-h-dvh">` — row flex,
  min dynamic-viewport height.
- `GameWrapper.tsx:131` main column `z-10 flex w-full flex-1 flex-col
  justify-between` — header / content / footer pinned by `justify-between`.
- `GameWrapper.tsx:237-245` content slot `flex flex-1 flex-col` wrapping
  `{children}` — **`flex-1` with no `min-h-0` and no `overflow-y`**. A flex item
  defaults to `min-height:auto`, so it refuses to shrink below its content and
  **overflows its container instead of scrolling**.
- `Answers.tsx:308` answers root `flex h-full flex-1 flex-col justify-between`.
- `Answers.tsx:309` question/media block `... h-full ... flex-1 ...
  justify-center` — **greedy**: `h-full` + `flex-1` makes the question/media
  claim the column height, starving the answer grid.
- `Answers.tsx:376` answer grid `grid grid-cols-2 gap-1` (2×2), and
  `AnswerButton.tsx:36` tiles `px-4 py-6 lg:py-10` — tall tiles.
- `index.css` has **no** `html,body{overflow:hidden}` (only `.display-kiosk`,
  the beamer route) — so the body *could* scroll; the flex chain is what traps
  the overflow.

Net: question + media + HUD + 2×2 tall tiles exceed a small dvh; the bottom row
falls under the in-flow white footer (`GameWrapper.tsx:247-254`) and **nothing
scrolls** because the only `flex-1` slot lacks `min-h-0`/overflow.

### Required change (web only) — these are layout bugfixes, no visual redesign
Goal: on a 320–375 px-wide / short phone, **all 4 answer tiles (or the slider +
submit) are reachable** — fit without scroll where possible, and where content
is genuinely taller than the viewport the **content area scrolls**. Desktop /
beamer (`lg:`) layout must be visually unchanged.

1. Make the player content a real scroll container:
   - `GameWrapper.tsx:237` content slot: add `min-h-0 overflow-y-auto` (keep
     `flex-1 flex-col`). The `min-h-0` is load-bearing — without it `overflow`
     won't engage in the flex column.
   - Ensure the ancestor column (`GameWrapper.tsx:131`) doesn't clip: it stays
     `flex-1 flex-col` (no `overflow-hidden`).
2. De-greed the question/media block so the answers always get their share:
   - `Answers.tsx:309`: drop `h-full` (keep `flex-1 ... justify-center` so it
     centers and *shares* space but can shrink). Add `min-h-0`.
   - `Answers.tsx:308` root: replace `h-full` with `min-h-full` (fill when short,
     grow when tall) so the scroll container can extend; keep
     `flex-1 flex-col justify-between`.
   - Constrain media on small screens: `QuestionMedia.tsx:83` already caps at
     `max-h-60 sm:max-h-100` — keep, but verify the question `<h2>` +
     media together can shrink (the `min-h-0` above enables this).
3. Smaller tiles on small screens so 4 fit:
   - `AnswerButton.tsx:36`: change `px-4 py-6 lg:py-10` → keep large only at `lg`,
     e.g. `px-3 py-3 sm:py-5 lg:py-10` (base = phone). Don't touch `lg:`.
   - `Answers.tsx:376` grid: keep `grid-cols-2`; ensure `gap-1` and the grid
     itself can scroll if still too tall (covered by the scroll container).
4. Account for the **fixed reconnecting banner** (`GameWrapper.tsx:146-155`,
   `fixed top-0`) and the in-flow footer — the scroll container must not hide the
   last tile beneath the footer. If needed add bottom padding to the scroll
   region so the final tile clears the footer.

### Acceptance criteria (Bug 2)
- At 360×640 **and** 320×568 (old iPhone SE / small Android), portrait: all four
  answer tiles are visible or reachable by scrolling within the content area;
  the slider question shows the value, the range, and the **Submit** button fully.
- No content is permanently hidden under the footer/banner.
- `lg`/desktop/beamer (`/display`) layout pixel-unchanged (spot-check 1080p+4K).
- No new global `overflow:hidden`; `.display-kiosk` behaviour untouched.
- `pnpm --filter web types` clean; `pnpm --filter web build` succeeds.

---

## BUG 3 — Slider not rendering correctly in some browsers (MED, web)

### Root cause
`Answers.tsx:347-356` player slider:
```
<input type="range" ...
  className="accent-primary h-3 w-full cursor-pointer appearance-none
             rounded-full bg-white/40 disabled:cursor-not-allowed
             lg:h-[clamp(0.75rem,1.5vh,1.5rem)]" />
```
`appearance-none` **strips the native track + thumb**, but `index.css` has **no**
`::-webkit-slider-runnable-track` / `::-webkit-slider-thumb` /
`::-moz-range-track` / `::-moz-range-thumb` rules. `accent-color` does not draw a
thumb once `appearance` is removed. On Chromium it degrades acceptably, but on
**Safari/iOS and older Android WebViews** the thumb is invisible/undraggable —
the slider looks broken / unusable.

### Required change (web only)
Add explicit, cross-browser range styling in
`source/packages/web/src/index.css`. Scope it so it does not affect the kiosk or
other inputs — target the player slider. Provide:
- a visible **track** (use the existing translucent look: `bg-white/40`
  equivalent, `border-radius` full, height matching `h-3` / the `lg` clamp),
- a visible **thumb** (circular, sized ~1.5–2× track height, filled with the
  theme accent `var(--color-primary)` / `--answer`/primary token, with a subtle
  border/shadow for contrast on the translucent track),
- both `-webkit-` (`::-webkit-slider-runnable-track`,
  `::-webkit-slider-thumb` with `-webkit-appearance:none` + `margin-top` to
  vertically center the thumb on the track) **and** `-moz-`
  (`::-moz-range-track`, `::-moz-range-thumb`) pseudo-elements,
- keep `:disabled` styling (dim/`not-allowed`) consistent with the current
  `disabled:` classes,
- respect the existing `accent-primary` intent — thumb colour should track the
  runtime theme accent if feasible (CSS var), else the static primary.

Prefer a dedicated class (e.g. `.quiz-range`) added to the input in
`Answers.tsx:355` plus the rules in `index.css`, so the styling is explicit and
self-documenting rather than relying on Tailwind utilities that don't emit
vendor pseudo-elements. Do not introduce a JS slider library.

### Acceptance criteria (Bug 3)
- The range thumb + track are clearly visible and draggable in Chromium, Firefox,
  and WebKit (Safari/iOS). Verify the WebKit thumb is centered on the track
  (the classic `margin-top` fix) and not clipped.
- Thumb uses the theme accent; disabled state still dims + `not-allowed`.
- `lg` (beamer) sizing preserved; no regression to the multiple-choice screen.
- `pnpm --filter web types` clean; `pnpm --filter web build` succeeds.

---

## Verification (Opus, after workers)
- `cd source && pnpm -r run types && pnpm dlx oxlint` (or `pnpm lint`) clean.
- `pnpm --filter socket test` green incl. new lobby test.
- `pnpm --filter web build` succeeds.
- Playwright (chromium + webkit) at 320/360/375 widths: answers reachable,
  slider visible/draggable; lobby-wait: join → force socket disconnect → wait →
  reconnect → still in game (screenshot evidence).
- Gitea: 3 issues + summary, commit referencing them, CHANGELOG entry.

## Constraints
- Each fix stays in its package; **no cross-file scope creep**.
- Preserve existing comments' intent; match surrounding code style (oxlint +
  prettier-plugin-tailwindcss enforce class ordering — run `format:fix`).
- Socket and web fixes are independent (different packages) → safe in parallel.
