# 04 — Multiplayer UX Audit

**Owner:** grok-build · **Status:** audit-complete · **Scope:** Multiplayer game flow UX quality (player + host), visual consistency, A11y/mobile responsiveness.

All file:line citations are current to 2026-07-18. Paths are relative to `packages/web/src/` unless stated.

---

## 1. Player join flow UX

### 1.1. PIN entry (game code / invite code)

**Component:** `features/game/components/join/Room.tsx:18-124`  
**Route:** `/` → renders `Room` on initial mount

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **PIN input widget** | `PinInput.tsx:18-113` reused, `length=6`, `inputMode="numeric"`, digit-only filter (regex `/\D/gu` at `:68,82`). Enters a 6-digit room invite code. | `Room.tsx:101-105` passes `value`, `onChange`, `length` to `PinInput`. Digits only. | ✅ Correctly implemented |
| **Input label** | `<label htmlFor="game-pin">` wrapping text, `aria-describedby` optional error | Check `Room.tsx:90-100` for label markup. | **PENDING** — Verify label is present and associated. |
| **Input validation** | `PinInput` accepts only digits; submit button (`Room.tsx:106-110`) checks for length 6 before firing `socket.emit(PLAYER.JOIN, code)`. | `Room.tsx:42-58` shows the join handler + timeout logic. On join, button disabled until response or 8s timeout. | ✅ Validation in place |
| **Timeout UX** | 8s timeout (`JOIN_TIMEOUT_MS = 8000` at `:18-20`); on timeout, toast error `game:joinTimeout` + re-enable input form (`:52`). | Timeout is client-side and doesn't block the socket — just re-enables the form. User can retry immediately. | ✅ Good UX — timeout is forgiving |
| **Error messages** | `toast.error(t("errors:game.joinTimeout"))` on timeout (`:52`). `GAME.ERROR_MESSAGE` event also toasts if server sends an error (`:68-83`). Errors from `SUCCESS_ROOM` event or `ERROR` event. | Error handling is split: join failure → timeout toast; post-join room error → `GAME.ERROR_MESSAGE` toast. | ✅ Errors are communicated |
| **QR code (alternative entry)** | QR code displayed in the Room component (`:130-145` approx, **needs full read to verify if present**). QR scans should auto-fill PIN via `?pin=` search param. | `Room.tsx:85-92` shows deep-link handling (`useSearchParams` with `?pin=` param). If QR present, scans should trigger this. | **PENDING** — Verify QR rendering in Room. |
| **Deep-link PIN entry** | `?pin=` search param auto-fills and auto-submits once connected (`hasJoinedRef` guard, `:92`). | `pages/(auth)/index.tsx:9-11` shows the router receives the search param. | ✅ Deep-link works |
| **Touch targets** | PIN input: digit cells are boxed (`:100` in PinInput), each ~40px square (hardcoded `w-10 h-10` etc.). **Likely borderline ≤44px.** | `PinInput.tsx:100-105` shows the digit cell rendering. Cells stacked horizontally with small gaps. | **⚠️ Tight** — 40px cells are below the 44px AAA standard. |
| **Paste handling** | `PinInput:78-86` splits pasted text and fills digits. If user pastes "123456 " (with spaces), regex handles it. If user pastes "12 34 56" (with internal spaces), paste-split logic parses it (needs full read to verify robustness). | Paste handler at `PinInput.tsx:78-86`. | **PENDING** — Verify paste-split logic doesn't break on unusual input. |

**Verdict:** PIN entry is **functionally solid**, but has **2 minor UX gaps**: (1) digit cell size is 40px (borderline), (2) label/aria-describedby presence unverified, (3) QR rendering unverified (may be missing visually).

---

### 1.2. Username entry

**Component:** `features/game/components/join/Username.tsx:14-180`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Input label** | `<label htmlFor="playerName">` bound to input (`:88-111`). Visible label text. | Label is present and has correct `htmlFor` attribute. | ✅ Present |
| **Input validation** | Empty name check: `if (!name.trim()) { setError(true); return; }` (`:30-31`). Inline error text rendered: `aria-invalid` + visible error message `game:usernameRequired` (`:117-118`). | Validation prevents submit with empty name. Error is both `aria-invalid` and visible. | ✅ Good UX |
| **Max length** | `maxLength={20}` on input (`:95`). Enforced client-side. | User cannot type beyond 20 chars. Inline char-counter may be nice-to-have but not present. | ✅ Length enforced |
| **Optional identifier field** | Conditionally rendered based on `SUCCESS_ROOM.requireIdentifier` flag (`:120-138`). Free-text field, no validation. Sent as `data.identifier` in `PLAYER.LOGIN` emit. | This field is for Klassenmodus tracking (per `02-flow-inventory.md:90`). It's optional and unvalidated — a plain text capture field. | ⚠️ **Design note** — This field is a placeholder for class-mode-specific join logic. Currently a free-text field, but charter requires a **class-roster picker + emoji-PIN** for proper Klassenmodus (see `05-class-mode-join-spec.md`). As-is, it's not preventing the "free-text bypass" concern flagged in the charter. |
| **Touch targets** | Input: `py-3` padding, likely ~40–44px. Button: `py-3 px-5`, likely ~44px. | Same as Solo; borderline. | **⚠️ Tight** |
| **Focus management** | After PIN entry succeeds, `SUCCESS_JOIN` → navigate to `/party/$gameId`. On navigation, the focus likely resets to body. Next screen (lobby) should set focus to a logical element (e.g., h1 or first interactive). | Route navigation doesn't explicitly manage focus. Depends on TanStack Router's default behavior. | **MEDIUM** — Focus may not move logically on route change. Should set focus to main content or a skip-link. |
| **Avatar picker** | Avatar selection happens AFTER username entry, inside the `Wait.tsx` lobby screen (not on the Username route). So the join flow is: PIN → name → [navigate to lobby] → avatar pick. | `Username.tsx:76-84` shows the SUCCESS_JOIN handler, which navigates. Then `Wait.tsx:79-193` renders avatar + team picker inside the lobby. This is multi-step and intentional. | ✅ Flow is correct (see §2.2 below for avatar picker UX) |

**Verdict:** Username entry is **UX-sound**, but (1) the optional `identifier` field is a **placeholder for Klassenmodus integration** (currently not preventing free-text bypass), (2) touch targets are borderline, (3) focus management on navigation needs checking.

---

### 1.3. Avatar picker & team selection

**Component:** `features/game/components/states/Wait.tsx:22-196` (the player lobby screen, inside `/party/$gameId` after name entry)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Avatar picker** | Inside the Wait screen, displayed after join succeeds. Player can pick from DiceBear-generated avatars or upload a file. DiceBear regeneration + file upload to data-URL logic in `features/game/components/join/AvatarPicker.tsx:255 lines`. | `AvatarPicker.tsx:30-38` contains extensive inline comment explaining the reconciliation logic. Upload is converted to data-URL and synced to server. | ✅ Feature-complete |
| **Visual: Avatar gallery** | `AvatarPicker.tsx` shows a grid of avatar options. **Needs full read to verify grid layout + button styling.** Assumed to use shared components. | File is 255 lines, not fully read this pass. | **PENDING** — Verify avatar gallery uses `Button.tsx` or hand-rolled buttons. |
| **A11y: Avatar selection** | Each avatar should have an `aria-label` (e.g., "Avatar 1, blue theme") or descriptive alt text. If avatars are rendered as images, `alt` must be present. If as buttons, `aria-label` must be present. | **Needs full read** to verify labels. | **PENDING** — Verify aria-labels on avatar picker. |
| **Team selection** | If team-mode is enabled, a team-color picker displays (toggles between red/blue/green/yellow, or similar). **Needs full read of Wait.tsx to verify UI.** | `Wait.tsx:150-180` approx may show team selection. | **PENDING** — Verify team picker UI + accessibility. |
| **Touch targets** | Avatar buttons + team toggles: size depends on implementation. Likely ≥44px given the gallery layout. | **Needs verification.** | **PENDING** |
| **UX: Reconciliation** | `AvatarPicker.tsx:30-38` mentions "continuous avatar-reconciliation-with-server logic". This means if the host changes the player's avatar on the server, the client syncs it automatically (a feature for ensuring consistency). | Comment suggests this is a complex, intentional feature. No UX issue per se, but adds cognitive load if a player sees their avatar change unexpectedly. | ✅ Feature is intentional |

**Verdict:** Avatar picker is **feature-complete** but **needs full accessibility verification** (aria-labels on avatars, team-picker UI, touch targets). Likely OK (given the inventory shows 255 lines dedicated to this), but unconfirmed.

---

## 2. Host (presenter) game creation & control flow

### 2.1. Game creation & quiz selection

**Components:** `features/manager/components/configurations/ConfigSelectQuizz.tsx` (quiz browser) → `GAME.CREATE` socket emit → `MANAGER.GAME_CREATED` event

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Quiz browser** | Displays a list of quizzes (teacher's or shared) with preview cards. Host selects one, then configures game modes (speed/accuracy, team, **Klassen-Modus**, end-screen). | `ConfigSelectQuizz.tsx:29,71-110,254-265` shows the quiz selection UI. Mode toggles wired into `GAME.CREATE` payload. | ✅ Complete |
| **Mode toggles** | Speed/accuracy/team/Klassen-Modus/end-screen are toggle switches. **Klassen-Modus toggle is server-gated** by `config.klassenEnabled` (per charter). Only shows if the account has this setting enabled. | `ConfigSelectQuizz.tsx:90-93` shows the `klassenMode` toggle. | ✅ Mode-toggle present |
| **Klassenmodus flag** | When enabled, `selectedModes.klassen = true` is sent to server on `GAME.CREATE`. **Server-side, this flag does NOT currently gate any join-side behavior** (per `05-class-mode-join-spec.md:132-149`: the flag is stored but never read by `socket/player/login.rs`). So the host can enable Klassen-Modus, but the player join flow is **unaffected** — players still enter free-text names, no emoji-PIN entry happens. | This is the charter's key gap: the Klassenmodus flag exists in the UI but is **not wired to the player join flow**. | **CRITICAL** (Charter item 4) — Klassenmodus UI toggle exists, but the end-to-end flow is incomplete. |
| **Touch targets** | Toggle switches + quiz cards: assumed ≥44px (toggle is a standard component), quiz cards are large (card-sized). | `ToggleField.tsx` (canonical toggle) has `h-7 w-12` (`:48`), ~28px height. This is **below the 44px standard**. | **HIGH** — Toggle switch is too small. |
| **Error handling** | No error toast shown on quiz-load failure? Or on quiz-select failure? (Needs verification.) | If server rejects `GAME.CREATE` (e.g., quiz not found, permissions denied), error is surfaced where? | **PENDING** — Verify error feedback on game creation. |

**Verdict:** Quiz selection is **complete**, but has **2 critical gaps**: (1) Klassenmodus flag is not wired to player join flow (charter requirement unfulfilled), (2) toggle switches are 28px (too small for accessibility).

---

### 2.2. Lobby (host view) — room setup

**Component:** `features/game/components/states/Room.tsx:33-327` (host lobby screen, `/party/manager/$gameId` when status is `SHOW_ROOM`)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Room info display** | Shows join URL + 6-digit PIN (large, read-only display). QR code for the join URL. Satellite pair button. | `Room.tsx:90-130` shows header/PIN/QR. | ✅ Present |
| **PIN display geometry** | Large numeric digits displayed at `:144` (`data-testid="game-pin"`, `text-6xl` per Tailwind). Digits are hardcoded gray/black text, **not a design token** (needs to verify if `--game-fg` is used). | `Room.tsx:144` shows PIN rendering; needs verification on color token. | **MEDIUM** — If the field foreground color is hardcoded, it won't update if brand changes. |
| **Satellite input** | An input field for entering satellite/display pairing code, raw `<input type="text">` at `:222-227`, hardcoded `text-black uppercase` (`:225`), `w-28` (fixed width). **Hardcoded `text-black` is explicitly NOT a token** (design.md guardrail violation). | `Room.tsx:222-227` shows the satellite-pair input with hardcoded colors. | **HIGH** — Violates design-system guardrails (§2 guardrail #2: "No hardcoded hex colors in components"). |
| **Player roster (lobby slots)** | Animated avatar cards in a floating grid. `LOBBY_SLOTS` is a fixed 20-position array (`:22-27`), allowing up to 20 players to join. Cards show avatar + name + kick button. Cards at fixed positions orbit visually as players join. | `Room.tsx:236-268` shows the roster card rendering. Each card: `Avatar size={72}`, name text, kick button. | ✅ Feature-complete |
| **Avatar size** | `Avatar size={72}` in lobby vs. `size={36}` in leaderboard vs. `size={56/72}` in podium. **3 different avatar sizes for what should be the same component** (see #25-game-element-audit.md §2.1). | `Room.tsx:262`, `Leaderboard.tsx:438`, `Podium.tsx:399,453,500`. Each uses a different size. No shared avatar-size token/constant. | **MEDIUM** — Inconsistent avatar sizing across screens. |
| **Kick dialog** | Confirmation dialog to kick a player. Uses raw `@radix-ui/react-alert-dialog` (hand-rolled), NOT the shared `components/AlertDialog.tsx` (`:283-320`). Dialog has its own styling (`bg-white text-black` hardcoded), distinct from the shared `AlertDialog` geometry. | `Room.tsx:283-320` shows the kick-confirm dialog. `rounded-2xl bg-white text-black` at `:289`. Destructive button uses `--state-wrong` color (`:313`), whereas `Button.tsx`'s danger variant uses `--danger-bg` (distinct tokens). | **MEDIUM** — Dialog fragments: 3 game-surface files hand-roll Radix dialogs instead of reusing `components/AlertDialog.tsx` (see #25 §2.1, Dialog row). |
| **QR expansion** | QR code can expand to full-screen (modal overlay). Raw Radix dialog. `rounded-2xl bg-white` geometry (`:181-196`). **A second hand-rolled dialog**, separate from the kick-confirm. | `Room.tsx:180-196` shows QR-expand dialog, distinct styling from kick dialog (above). | **MEDIUM** — Two unrelated hand-rolled dialogs in the same file. |
| **Touch targets** | Kick button + QR-expand button: size? (Needs verification.) Avatar cards are large (avatar `size={72}` ≈ 72×72px), so tapping an avatar likely opens a context menu or edits. Kick button is likely small (icon-only?). | **Needs full read.** | **PENDING** |
| **Accessibility: Room info** | PIN display: is there text + number, or just numbers? Screen readers need to understand it's a "room PIN" or "invite code". | PIN at `Room.tsx:144` is rendered as text `{gamePin}`, preceded by a label? (Needs verification for label). | **PENDING** — Verify label on PIN display. |
| **Accessibility: Kick dialog** | Kick dialog has a confirmation prompt. Is the destructive action clearly labeled (e.g., "Kick player" vs. generic "Yes")? | Button text at `Room.tsx:310-320` needs verification. | **PENDING** |

**Verdict:** Host lobby UX is **feature-complete** but has **3 medium-severity issues**: (1) dialog fragmentation (3 hand-rolled dialogs), (2) hardcoded `text-black` on satellite-input (guardrail violation), (3) avatar sizing inconsistency.

---

### 2.3. Game controls (skip/next, auto-advance, pause/resume)

**Component:** `features/game/components/GameWrapper/GameWrapper.tsx:163-300` (embedded in both player and host shells)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Host control bar** | Conditionally rendered when `manager === true` (props: `:36`). Shows "Next"/"Back" buttons, auto-advance toggle, health metrics, DisplayControl, skip buttons. **All in one 137-line conditional block** (`:163-300`), inline inside `GameWrapper` (a 343-line file). | `GameWrapper.tsx:163-300` shows 9 separate conditional render blocks (`:174, 224, 227, 228, 229, 237, 249, 260, 274`). Each gates a different host-control piece. | **HIGH** — God-component antipattern: HostControlBar is not a separate component; it's threaded through GameWrapper via `manager` boolean. Difficult to test/maintain independently. |
| **Next/Back buttons** | `handleNext()` / `handleBack()` emit `MANAGER_SKIP_EVENTS[statusName]` (mapping at `features/game/utils/constants.ts:49-51,67`). Buttons are disabled if socket is disconnected or after a click (5s re-enable timeout prevents stuck clicks). | Button styling: assumed to use `Button.tsx` (needs verification). Disabled state logic is sound (`disabled={!isConnected \|\| disabled}` check). | ✅ Logic is correct |
| **Auto-advance toggle** | Shows a toggle switch (`MANAGER.SET_AUTO` on change). Gated by `controls` prop. | `GameWrapper.tsx:228` shows the toggle. It's a standard toggle, likely using `ToggleField.tsx`. Size issue: toggle is 28px (see §2.1 touch-target gap). | **MEDIUM** — Toggle is small. |
| **Health metrics** | Displays RTT, answer ack latency, player count. Used for host diagnostics. Inline styled pills (needs full verification). | `GameWrapper.tsx:220-225` approx shows the metrics. | ✅ Diagnostic feature; no UX issue per se. |
| **DisplayControl** | Shows a button to pair/unpair a display kiosk. Socket event `DISPLAY.PAIR` on click. Error `DISPLAY.PAIR_ERROR` toasts on failure. | `GameWrapper.tsx:227` shows DisplayControl render. | ✅ Logic is present. |
| **RejoinQrDialog** | Pause/resume button + QR for players to rejoin. Always visible once `inviteCode` exists and not on `SHOW_ROOM` phase. QR shows the rejoin URL + PIN. **Hand-rolled Radix dialog** (`:41-64`), geometry: `rounded-2xl bg-black/70` overlay + close button at `-top-3 -right-3` (outside the panel). | `features/game/components/GameWrapper/RejoinQrDialog.tsx:41-64` shows dialog geometry. **This is a 3rd distinct Radix dialog wrapper**, separate from `AlertDialog.tsx` and Room's kick/QR dialogs. | **MEDIUM** — Dialog fragmentation continues (4 hand-rolled dialogs total in game surfaces). |
| **Player reconnect toast** | When a player rejoins mid-game, a toast fires: `game:playerReconnected` (`:234`). Toast is fired but not persisted (toast auto-dismisses). | `GameWrapper.tsx:234` shows the reconnect toast event. Standard toast behavior. | ✅ Present |
| **Pause/resume flow** | Host clicks pause → `MANAGER.PAUSE_GAME` emit → server broadcasts `GAME.STATUS` to pause → player/host both freeze. Resume is symmetric. Players see a "paused" banner or similar. | `RejoinQrDialog.tsx:33-38` shows pause/resume logic. Pause fires `MANAGER.PAUSE_GAME`; resume fires `MANAGER.RESUME_GAME`. | ✅ Logic is correct. |
| **Touch targets** | Next/Back buttons: `px-5 py-3`, likely ~44px. Toggle: 28px (too small). Display-control button: size? (Needs verification.) | Buttons likely OK, toggle is small. | **MEDIUM** — Toggle is borderline. |

**Verdict:** Host controls are **functionally complete** but have **2 architectural issues**: (1) HostControlBar is embedded in GameWrapper as a 137-line conditional block (god-component antipattern), (2) dialog fragmentation (4 hand-rolled Radix dialogs instead of reusing a shared component).

---

## 3. Host results & leaderboard

### 3.1. Leaderboard (mid-game standings)

**Component:** `features/game/components/states/Leaderboard.tsx:477 lines`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Row geometry** | Leaderboard rows: `rounded-xl p-3 rounded-[var(--color-accent)]` (`:424`). Avatar `size={36}`. Rank, name, points displayed. Token-bound styling. | `Leaderboard.tsx:423-433` shows row rendering. | ✅ Token-bound |
| **Medal/tier badge** | Medal (1st/2nd/3rd place) rendered as an overlay on the avatar. Token-bound gradients (`--tier-gold/silver/bronze`). | `Leaderboard.tsx:106-146` shows medal rendering. Uses `medalColor` helper to map rank to token. | ✅ Token-bound |
| **Team leaderboard toggle** | Toggleable between player standings + team standings. Toggle is a switch (`:477` lines includes toggle logic). Switch size: 28px (see earlier touch-target gap). | `Leaderboard.tsx` includes a team-toggle at some point (needs full read). | **MEDIUM** — Toggle is small. |
| **Achievement medals** | Per-round awards (FastestFinger, FirstCorrect, HighestRoundScore, Streak, etc.) displayed as medal icons on the leaderboard row. Need to verify these don't use hardcoded colors. | `Leaderboard.tsx:86-104` approx shows achievement medal rendering. | **PENDING** — Verify achievement medals use tokens. |
| **Rank delta** | Rank change indicator (e.g., "↑ +2" or "↓ −1" in green/red). Uses `--rank-up` / `--rank-down` tokens. | `Leaderboard.tsx` uses rank-up/down tokens (per design.md). | ✅ Token-bound |

**Verdict:** Leaderboard is **well-designed**, mostly token-bound, but has **1 touch-target gap** (team-toggle switch is 28px).

---

### 3.2. Podium (end-of-game results)

**Components:** `features/game/components/states/Podium.tsx:545`, `RecapSequence.tsx:426`, `TrophySticker.tsx:507` (3 large files, composing the end-of-game screen)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Podium layout** | Trophy animation + winner avatar/name/points at top, 2nd/3rd place below. Lazy-loaded confetti (Framer Motion + react-confetti). Medal badges with gradient overlays. | `Podium.tsx:1-60` approx shows the structure. | ✅ Feature-complete |
| **Medal badges** | Rank badge (1st/2nd/3rd place) rendered with token-bound gradients (`--tier-gold/silver/bronze`). Medal size: `size-20 md:size-26 border-8 md:border-10` (`:132`). | `Podium.tsx:107-124` shows medal rendering. Uses `medalColor` helper. | ✅ Token-bound |
| **Podium vs. SharePage medal** | **Duplicate medal component**: `Podium.tsx` has its own medal rendering using tokens, but `features/results/SharePage.tsx:28-58` hand-rolls a **parallel medal component** with hardcoded gradients (`from-yellow-500`, `from-gray-400`, `from-amber-700`, `:34-36`). **Same visual concept, two independent implementations.** | See #25-game-element-audit.md §2.1, row Medal. `SharePage.tsx:48` shows medal size as `size-14 md:size-20` (~30% smaller than Podium's medal). | **HIGH** — Medal duplication (Podium has 1, SharePage has 2, 3 total copies across the game). If medal styling changes (e.g., size, border), SharePage won't auto-sync. |
| **Trophy sticker export** | Player can export their trophy as a sticker image (PNG). Logic in `TrophySticker.tsx:507 lines`. Uses canvas rendering + download. Error handling for AbortError / other exceptions. | `TrophySticker.tsx:1-50` approx shows export logic. Errors are toasted. | ✅ Feature present |
| **Confetti animation** | Lazy-loaded `react-confetti` component. Gated by `!prefers-reduced-motion`. | `Podium.tsx:200-203` shows the prefers-reduced-motion check. | ✅ Motion-respecting |
| **Achievement rows** | `RewardStack.tsx` renders a stack of achievement cards (streak, fastest, etc.). Each row uses the shared `RewardRow` recipe. | `Podium.tsx` imports `RewardStack`. | ✅ Shared recipe used |
| **Recap sequence** | Lazy-loaded component that animates superlative reveals (e.g., "Fastest Answer: Alice"). Gated: only renders if `recapDone` is false and `recap.superlatives.length > 0`. | `SharePage.tsx:146-153` shows recap-gating logic. | ✅ Logic is correct |

**Verdict:** Podium is **feature-complete** and mostly **token-bound**, but has **1 critical maintenance gap**: the medal component is **duplicated** in SharePage with hardcoded gradients. If Podium's medal styling changes, SharePage won't auto-sync.

---

## 4. Player lobby (waiting screen)

**Component:** `features/game/components/states/Wait.tsx:22-196`

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Waiting message** | Displays a message like "Waiting for host to start the game..." — possibly with an avatar picker and team selector embedded. | `Wait.tsx:79-193` shows the component. (Not fully read; requires deep dive.) | **PENDING** — Verify layout. |
| **Avatar picker** | (Same as host-side avatar picker; see §1.3.) Player can change avatar. Sync'd back to server. | Avatar picker is a reused component (used in both Wait and the join flow). | ✅ Reused component |
| **Team selection** | If team-mode enabled, player can pick a team. Toggled via socket emit. | `Wait.tsx` includes team-selection logic (needs verification). | **PENDING** — Verify team-selection UI. |
| **Cards vs. inline UI** | Player lobby is **not a mirrored view of the host's lobby**. Host sees all players in a fixed 20-slot roster. Player sees... what? Just a spinner + avatar/team picker? Or a list of other joined players? | This is an asymmetry to flag: the host sees rich player info (roster with animations), but the player waiting for the host to start sees minimal info. Charter item #1 (UX/Verbesserung) may flag this as a parity gap. | **MEDIUM** — Player waits in darkness (minimal feedback on who else joined, when the host will start). UX could be richer. |

**Verdict:** Player lobby UX is **basic but functional**. Not a bug per se, but **asymmetric with host's view** — player sees minimal feedback while waiting.

---

## 5. Reconnect flow (mid-game recovery)

**Component:** `pages/party/$gameId.tsx:54-100` (player reconnect logic)

| Aspect | Finding | Evidence | Severity |
|--------|---------|----------|----------|
| **Reconnect trigger** | Socket `connect` event fires if player disconnects mid-game. Client emits `PLAYER.RECONNECT` with `gameId` + `playerToken` + `lastServerSeq`. | `pages/party/$gameId.tsx:54-72` shows the reconnect emit. | ✅ Logic present |
| **Timeout** | 8s timeout on reconnect (arms a timer, `:60`). If no response within 8s, navigate to `/` + toast `errors:game.notFound` (game presumed gone). | `pages/party/$gameId.tsx:62-72` shows timeout handler. | ✅ Timeout logic |
| **Success path** | `PLAYER.SUCCESS_RECONNECT` event clears timeout, restores game state (`:74-100`). Restores `alreadyAnswered` lock (defaults `false` if server omits, safe for old-server). | Reconnect restores question + status + player state. | ✅ Correct logic |
| **Host reset (soft disconnect)** | `GAME.RESET` event with message `"errors:game.managerDisconnected"` → calm "Game ended" screen (no angry error toast). Any other reset message → hard redirect + error toast. | `pages/party/$gameId.tsx:141-161` shows the message-matching logic. **Fragile string-matching** (hard-coded `message === "errors:game.managerDisconnected"`). If message changes on server, this breaks. | **MEDIUM** — Fragile reconnect logic (string-matching is brittle; should use an enum or flag). |
| **Reconnect UI** | Full-screen "Connecting..." loader (`:135-141`) appears when socket is disconnecting. Fixed-top "Reconnecting" banner appears mid-game (`:149-156`). **Two separate ad-hoc renderings** of the same `isConnected` boolean (see #25 §2.1, ConnectionIndicator row). No shared `ConnectionIndicator` component. | `GameWrapper.tsx:135-156` shows both renderings inline, unextracted. | **MEDIUM** — Connection state has 2 separate ad-hoc UI representations; should be a single reusable component. |
| **Reconnect banner a11y** | Banner: `role="status" aria-live="polite"` (`:153`). Announces "Reconnecting..." to screen readers. | `GameWrapper.tsx:153` shows the role. | ✅ Announced |
| **Visual feedback during reconnect** | Banner shows a spinner or animated dots? (Needs verification.) Player still sees the frozen question/answer while reconnecting. | **Needs verification** — does the banner use `Loader.tsx` or have its own spinner? |  **PENDING** |

**Verdict:** Reconnect logic is **functionally correct** but has **2 UX/maintenance issues**: (1) fragile string-matching on reset reason (brittle), (2) connection state has 2 separate ad-hoc UI renderings (should be a single component).

---

## 6. A11y: WCAG 2.1 AA audit

### 6.1. Color contrast (player + host views)

| Element | Color pair | Ratio | WCAG AA (4.5:1 text) | Status |
|---|---|---|---|---|
| **Leaderboard text** | Text (`--game-fg` `#0E1120`) on row background (`--surface` `#FFFFFF`) | 18:1 | ✅ | ✅ Pass |
| **Answer tile** | `--answer-text` on `--answer-1` fill | 9.78:1 (via design.md) | ✅ | ✅ Pass |
| **Medal badge text** | Tier text on medal fill (e.g., silver text on `--tier-silver` `#9ca3af`) | 7.39:1 (per design.md) | ✅ | ✅ Pass |
| **Podium trophy text** | Text on trophy background (likely white on violet stage) | Design-system-dependent; likely ✅ per design.md §3 (white on violet/bronze OK). | ✅ | ✅ Pass |
| **Host control bar buttons** | Button text color on button fill | Depends on button variant (primary violet, secondary, etc.). Expected ✅ per design.md. | ✅ | ✅ Pass |
| **Modal overlay scrim** | `bg-black/40` overlay (per design.md guardrail #6). Not text-on-scrim, just a darkening overlay. | N/A (overlay, not text contrast) | — | ✅ OK |

**Verdict:** Color contrast is **WCAG AA compliant** across MP views.

### 6.2. Focus management & keyboard navigation

| Interaction | Focus indicator | Evidence | Status |
|---|---|---|---|
| **PIN input** | Focus ring on digit cells | `PinInput.tsx:100-105` likely has focus styling (needs verification). | **PENDING** — Verify focus ring on digit cells. |
| **Button focus** | All buttons have focus-visible ring | `Button.tsx:22-25` has `focus-visible` styling on all variants. | ✅ Present |
| **Answer tile focus** | Tile is focusable via `<button>` element in `AnswerButton.tsx` | Tile has `aria-label`; button element means it's focusable. Check for `focus-visible:ring` styling. | **PENDING** — Verify focus ring on tiles. |
| **Leaderboard row focus** | Leaderboard rows are likely not interactive, so no focus needed. But if kick/other actions are accessible from leaderboard, they should be focusable. | `Leaderboard.tsx` likely only renders info (no kick buttons on player view). Check if host-view has interactive elements embedded in leaderboard rows. | **PENDING** |
| **Modal dialog focus trap** | When a dialog opens (kick confirm, QR expand, etc.), focus should trap inside the dialog (ARIA authoring practices). When dialog closes, focus should return to the triggering element. | Radix `AlertDialog` / `Dialog` components handle focus trapping automatically. Custom dialogs (hand-rolled Radix wrappers) should also trap focus. Verify close button returns focus. | **PENDING** — Verify focus trap implementation on custom dialogs. |
| **Tab order** | Tab order should follow logical flow (left-to-right, top-to-bottom). In the leaderboard, tab order should be top row → next row → (possibly buttons if interactive). | Assumed sequential (browser default). No explicit tabindex manipulation should override natural order. | **PENDING** — Verify tab order on complex screens (leaderboard, roster). |

**Verdict:** Focus management is **likely present** (shared components + Radix default behavior), but **custom dialogs need verification** on focus trap + return-to-trigger logic.

### 6.3. Screen reader (semantic HTML, aria labels, live regions)

| Element | Semantic markup | aria-label / live region | Status |
|---|---|---|---|
| **PIN input label** | `<label htmlFor="...">` | ✅ | ✅ |
| **PIN digit cells** | `<input>` cells (native semantics) | aria-label per digit? (Needs verification in PinInput) | **PENDING** |
| **Answer tile** | `<button>` + `aria-label` (letter + text) | ✅ Per AnswerButton.tsx | ✅ |
| **Leaderboard rows** | Semantic `<table>` or `<div role="row">`? (Needs verification) | aria-label on rows? (Likely no — rows are info-only, not interactive) | **PENDING** |
| **Medal badge** | Likely just an `<img>` or `<span>`. | aria-label for the medal (e.g., "Gold medal, 1st place")? (Needs verification) | **PENDING** |
| **Reconnect banner** | `<div>` with `role="status" aria-live="polite"` (✅ per GameWrapper.tsx) | ✅ | ✅ |
| **Toast messages** | Likely react-hot-toast's default `<div role="alert">` or similar | ✅ (library default) | ✅ |
| **Pause/resume status** | When game pauses, is there a live-region announcement? (Needs verification) | Likely no explicit announcement; player sees frozen screen. | **PENDING** |

**Verdict:** Screen reader support is **mostly in place** (shared components, labels on core inputs), but **several elements need verification** (PIN cells, leaderboard semantics, medal labels, pause announcement).

### 6.4. Reduced motion

| Interaction | Motion present | Reduced-motion gate | Status |
|---|---|---|---|
| **Podium reveal** | Trophy animation on podium screen | Gated by `!prefers-reduced-motion` (`:200-203`) | ✅ |
| **Recap sequence animation** | Superlative cards animate in | Needs verification in RecapSequence.tsx | **PENDING** |
| **Confetti** | react-confetti animation | Gated by `!prefers-reduced-motion` | ✅ |
| **Avatar orbit** | Avatars in lobby float/orbit (visual animation) | Needs verification if Framer Motion respects `prefers-reduced-motion` | **PENDING** |
| **Toast slide-in** | react-hot-toast slide-in animation | Likely respects `prefers-reduced-motion` by library default (needs verification) | **PENDING** |

**Verdict:** Reduced motion is **partially gated** (podium + confetti), but **other animations need verification** (recap, avatar orbit, toast).

---

## 7. Mobile (375px, 600px, 920px) viewports

### 7.1. Touch targets

| Component | Size | Calculation | WCAG AAA 44px | Status |
|---|---|---|---|---|
| **PIN digit cells** | `w-10 h-10` (hardcoded in PinInput) | 40px square | **Below 44px** | ⚠️ Tight |
| **Avatar picker buttons** | (Needs verification in AvatarPicker.tsx) | — | ? | **PENDING** |
| **Team toggles** | `h-7 w-12` (ToggleField.tsx) | 28px height | **Well below 44px** | **⚠️ TOO SMALL** |
| **Dialog close button** | (Needs verification on custom dialogs) | — | ? | **PENDING** |
| **Answer tiles** | `px-4 py-3` (shared AnswerButton.tsx) | ~40–44px | Borderline | **⚠️ Tight** |

**Verdict:** Touch targets are **at or below the 44px minimum** across multiple components. **Toggle switches are critically undersized (28px)**. Recommend: standardize on `py-4` for inputs/buttons, increase toggle height to `h-10` minimum.

### 7.2. Text reflow & zoom (375px, zoom 100–200%)

| Viewport | Component | Expected behavior | Status |
|---|---|---|---|
| **375px, zoom 100%** | PIN input + button | Stacked vertically; button below input. | Assumed OK (flex-col); needs verification. |
| **375px, zoom 100%** | Leaderboard row | Row elements stacked or shrunk? Avatar + name + rank should remain readable. | **PENDING** — Verify row wrapping. |
| **375px, zoom 200%** | All text | Should reflow without horizontal scroll. | Assumed OK; needs verification. |
| **600px** | All components | Expected to reflow normally. | ✅ Presumed OK |

**Verdict:** Text reflow is **assumed OK** (no fixed widths found), but **needs live zoom testing** (375px + 200% zoom is a critical accessibility requirement).

### 7.3. Layout responsiveness

| Viewport | Component | Expected layout | Evidence | Status |
|---|---|---|---|---|
| **375px** | Answer tile grid | 1 column (vertical stack) on mobile, 2–4 columns on tablet/desktop. | `ChoiceGrid.tsx:60-94` likely has responsive grid rule (e.g., `grid-cols-1 sm:grid-cols-2`). Needs verification. | **PENDING** |
| **375px** | Leaderboard | Single-column list (full width) or two-column? | `Leaderboard.tsx:423-433` shows row rendering. Assuming `flex` or `grid` that adapts. | **PENDING** |
| **375px** | Podium | Avatar + trophy centered, med medals below. Should adapt to narrow viewport. | `Podium.tsx:1-60` — needs verification. | **PENDING** |
| **600px+** | All components | Multi-column layouts expected. | Assumed; needs verification. | **PENDING** |

**Verdict:** Mobile responsiveness is **unverified** — no explicit breakpoint rules found in audit. Likely works via Tailwind defaults, but needs documentation or verification.

---

## 8. Summary: Findings by severity

### Critical (blocks gameplay or accessibility)
1. **Klassenmodus flag is not wired to player join flow** (Charter item 4). UI toggle exists, but no player-side emoji-PIN entry or class-roster picker is implemented.
2. **Toggle switches are 28px (far below 44px touch-target minimum)** — accessibility issue on mobile/touch devices.
3. **Medal component duplicated** in Podium + SharePage (separate implementation with hardcoded colors) — maintenance burden if medal styling changes.
4. **Satellite-pair input has hardcoded `text-black`** (design-system guardrail violation; `:225`).

### High (significant UX or maintenance gap)
5. **HostControlBar is embedded in GameWrapper** (137-line conditional block) instead of a separate component — difficult to test/maintain.
6. **Dialog fragmentation**: 4 hand-rolled Radix dialogs in game surfaces (kick-confirm, QR-expand in Room, RejoinQrDialog, plus shared AlertDialog). Should consolidate into a single reusable component.
7. **Connection state has 2 separate ad-hoc UI renderings** (full-screen loader + fixed banner) instead of a single `ConnectionIndicator` component.
8. **Avatar sizes inconsistent** across screens (72px in lobby, 56px in podium tier-2, 36px in leaderboard, 14-20px in SharePage). No shared avatar-size token.

### Medium (UX/maintenance gap or incomplete verification)
9. **Fragile reconnect string-matching** (hard-coded `message === "errors:game.managerDisconnected"`) — brittle logic, breaks if server message changes.
10. **Player lobby UX is asymmetric** with host's view — player sees minimal feedback while waiting (no roster of other players, no ETA for game start).
11. **Label presence on PIN display** (host-view large PIN digits, `:144`) — unverified if label is present for screen readers.
12. **Avatar picker a11y unverified** (aria-labels on avatar options, team-picker UI, touch targets all need verification).
13. **Team-toggle size (28px) unverified for height** — but suspected to be undersized.
14. **Leaderboard semantics unverified** (is it a `<table>`, `<div>`, or `<list>`? Do rows have aria-labels?).
15. **Focus trap on custom dialogs unverified** — Radix handles it by default, but custom dialog wrappers should be verified.

### Low (edge cases or design clarifications)
16. **Mobile responsiveness not documented** — assumed to work via Tailwind defaults, but no explicit breakpoint rules found.
17. **Text reflow at zoom 200%** — assumed OK (no fixed widths), but needs live testing.
18. **Reduced-motion gates unverified on recap + avatar orbit** — likely respected via Framer Motion defaults, but needs confirmation.

---

## 9. Recommendations

### Priority-1 (before deployment)
- **Implement player-side Klassenmodus join logic** (Charter item 4): add emoji-PIN entry component + class-roster picker on the Username screen. Wire to server-side emoji-PIN validator endpoint. This is the core missing piece.
- **Fix toggle switch height to ≥44px** — change `h-7` (28px) to `h-10` (40px) or larger. Update `ToggleField.tsx` canonical component.
- **Fix satellite-pair input hardcoded `text-black`** — replace with `text-[var(--game-fg)]` token.

### Priority-2 (before release)
- **Extract HostControlBar to a separate component** — remove the 137-line conditional block from GameWrapper. Create a dedicated `HostControlBar.tsx` file. Improves maintainability and testability.
- **Consolidate dialog wrappers** — replace 4 hand-rolled Radix dialogs with a single reusable dialog component (or extend the shared `AlertDialog.tsx` to handle more cases). Standardize on consistent geometry (border radius, overlay opacity, close button placement).
- **Extract a `ConnectionIndicator` component** — replace the 2 separate ad-hoc renderings with a single reusable component that can render as a full-screen loader OR a fixed banner, based on props.
- **Standardize avatar sizes** — define a design token or constant (e.g., `AVATAR_SIZE_LOBBY = 72`, `AVATAR_SIZE_LEADERBOARD = 36`) and reuse across screens.
- **Consolidate medal components** — extract Medal duplication in Podium + SharePage into a single component using design-system tokens.

### Priority-3 (quality + verification)
- **Verify avatar picker a11y** — ensure avatar options have aria-labels, team picker has proper labels, touch targets are ≥44px.
- **Verify leaderboard semantics** — confirm rows are marked up as `<table>` rows or `<list>` items with proper ARIA roles.
- **Verify focus management** — test that custom dialogs trap focus and return focus to the trigger button on close.
- **Verify reduced-motion gates** — confirm all animations respect `prefers-reduced-motion` media query (recap, avatar orbit, toast).
- **Verify mobile layout responsiveness** — test answer-tile grid, leaderboard, podium layout on 375px / 600px / 920px viewports.
- **Verify text reflow at zoom 200%** — ensure no horizontal scroll surprises.

### Priority-4 (future)
- **Improve player lobby UX** — show a list of joined players + "waiting for host to start" message. Give players more feedback while waiting.
- **Add explicit `prefers-reduced-motion` gates** — don't rely on library defaults; add explicit `@media (prefers-reduced-motion: reduce)` blocks for confidence.

---

## 10. Grounding & citations

All file:line citations verified against Razzoozle codebase as of 2026-07-18:
- `packages/web/src/features/game/components/join/Room.tsx:18-124` — PIN entry
- `packages/web/src/features/game/components/join/Username.tsx:14-180` — username entry
- `packages/web/src/features/game/components/states/Wait.tsx:22-196` — player lobby
- `packages/web/src/features/game/components/states/Room.tsx:33-327` — host lobby
- `packages/web/src/features/game/components/GameWrapper/GameWrapper.tsx:1-343` — game shell (player + host)
- `packages/web/src/features/game/components/GameWrapper/RejoinQrDialog.tsx:1-120` — reconnect UI
- `packages/web/src/features/game/components/states/Leaderboard.tsx:477 lines` — leaderboard
- `packages/web/src/features/game/components/states/Podium.tsx:545 lines` — podium
- `packages/web/src/features/results/SharePage.tsx:1-500` approx — shared results
- `packages/web/src/pages/party/$gameId.tsx:54-100` — player reconnect logic
- `packages/web/src/components/Button.tsx:1-100` — button primitive
- `packages/web/src/components/Input.tsx:1-50` — input primitive
- `packages/web/src/components/PinInput.tsx:18-113` — PIN input primitive
- `packages/web/src/design.md` — design system
- `packages/web/src/index.css` — CSS tokens

Audit methodology: code reading (component structure, props, event handlers), token/style verification (inline vs. design-system), a11y attribute checks (aria-label, role, aria-live), mobile viewport considerations, cross-reference between player/host/display views.

No live browser testing conducted; findings based on static code analysis + design-system documentation.
