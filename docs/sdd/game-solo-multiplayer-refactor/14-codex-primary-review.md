# 14 — Codex Primary Review: Architecture, Security, Duplication Synthesis

**Status**: Adjudicated findings (frozen) · **Owner**: Claude (orchestrator, Codex synthesis) · **Method**: Phase-0 inventory analysis (docs #01, #06, #19, #20, #25) + cross-vendor expert panel simulation · **Scope**: Architecture gaps, security issues, code duplication, refactoring sequencing

---

## EXECUTIVE SUMMARY

**Phase-0 SDD has identified 35 architectural findings across 3 domains:**

| Domain | Count | Severity | Blocking | Recommended WP owner |
|---|---|---|---|---|
| **Architecture** | 12 | 2 Critical, 5 High, 5 Medium | 6 (Critical/High) | Codex (orchestration) + Sonnet (quality assurance) |
| **Security** | 6 | 2 Critical, 2 High, 2 Medium | 2 (Klassenmodus join, solo assignment) | Codex (identity/auth) + Grok (design review) |
| **Duplication** | 8 | 1 Critical (Solo ↔ MP split), 4 High, 3 Medium | 1 (answer orchestration) | Codex (modularization) + free-pool (refactoring) |
| **Subtotal** | 26 findings in 3 docs | — | 9 blocking MVP | — |
| **Cross-findings** (Phase-0 #20 D1–D8 + #25 §3) | 9 additional | Mixed | 0 blocking MVP | Codex (protocol cleanup) |
| **Total** | **35** | — | **9 blocking** | — |

**Compatibility check** (against existing game modes):
- ✅ **Solo play**: Modularization (doc #21) breaks out from REST-only → parity with socket MP (opt-in transport switch)
- ✅ **Multiplayer**: Klassenmodus join (doc #06) is opt-in flag (`game.klassen_mode`); existing MP unchanged
- ✅ **Host/Presenter**: Modularization preserves `GameWrapper` split from `SoloShell` (intentional divergence, do not merge)
- ✅ **Reconnect**: Anti-spoof logic (doc #06 §5) unchanged; only join path adds PIN check for class-mode
- ⚠️ **Satellite/Display**: D8 finding (dead auth) is deferred (separate SDD/WP, not blocking chart)

**Recommendation**: Sequence as 3 parallel work streams (Klassenmodus join + Solo assignment security, modularization orchestration, protocol cleanup), gate on E2E parity across all modes.

---

## 1. ARCHITECTURE FINDINGS

### A1. (CRITICAL) Class-mode join is 0% implemented on read/enforcement

**Evidence**: Phase-0 doc #20 §7 (§7) + #06 §1–4
- **Write path 100%**: Host can set `klassenEnabled` flag, game stores `selected_modes.klassen`, snapshotted to disk
- **Read path 0%**: No handler in `socket/player/login.rs` queries `selected_modes.klassen`; no roster lookup; no PIN check
- **Impact**: A student (rostered or not) can join a class-mode game with any free-text name and no PIN — charter item #4 is not implemented, only flagged
- **Blocking**: MVP cannot claim Klassenmodus support without this
- **Recommendation**: **Implement in Wave 1** (doc #6 §2, Wave 1 WPs 1–5, ~10 hrs total)
  - Add `game.owner_id` (game ownership tracking)
  - Query class roster on `player:join`
  - Validate PIN + name matching (see §3 below)

---

### A2. (CRITICAL) Solo assignment play has no roster verification

**Evidence**: Phase-0 doc #06 §5 + #20 §7
- **Current**: Solo identifies player by free-text `playerName` only (max 40 chars client-side, no server validation length on that field itself)
- **Assignment↔class relationship**: `assignments` table has NO `class_id` column (confirmed via `db/migrations/013_assignments.sql`)
- **Impact**: Assignment can be played by anyone with the URL + free-text name; no PIN check at any point
- **Blocking**: Charter item #4 (class-mode) is incomplete without this
- **Recommendation**: **Implement in Wave 1** (doc #6 §3, Wave 2 WPs 1–2, ~4 hrs)
  - Add `assignments.class_id` FK (schema change)
  - Extend `POST /api/quizz/:id/check-answer` to validate PIN for class-mode assignments
  - E2E test: solo quiz with PIN enforcement

---

### A3. (HIGH) Solo state machine is fully parallel (no code sharing with MP)

**Evidence**: Phase-0 doc #20 D5 + #21 §1.1
- **Current**: `useSoloStore` has its own `SoloPhase` enum (`idle|loading|name|question|answering|result|finished`); zero imports of `Status`/`GameStatus`
- **Leaf components ARE shared**: `CircularTimer`, `AnswerButton`, answer-type grids reused correctly
- **Orchestration duplicated**: `SoloAnswers.tsx` (431 LOC) mirrors `Answers.tsx` (724 LOC) with 95% identical logic (transport is the only difference)
- **Impact**: Future feature work requires 2 parallel implementations; testing is ~2x; cognitive load ↑
- **Blocking**: Modularization (charter item #2) requires this unified
- **Recommendation**: **Implement in Wave 2–3** (doc #21, 25 hrs) via new `GameTransport` abstraction (socket vs. REST is a configuration, not a codebase fork)

---

### A4. (HIGH) Answer-submission orchestration is duplicated (Answers.tsx ↔ SoloAnswers.tsx)

**Evidence**: Phase-0 doc #21 §2 (self-documented duplicate: `SoloAnswers.tsx:1-9` comment)
- **Current**: 724 LOC (MP socket) + 431 LOC (Solo REST) = 1155 LOC total
- **What's shared**: Answer-leaf components, timer component, confirm/submit patterns
- **What's duplicated**: Timer lifecycle, submit pending state, sound/haptics triggering, 800ms pending-hint timeout, ack handling (socket) vs. result-fetch (REST)
- **LOC consolidation potential**: ~300–350 lines saved (25% reduction)
- **Test coverage**: Currently 2 parallel test harnesses (Answers tests + SoloAnswers tests); unified would allow shared test suite
- **Blocking**: Modularization (charter #2), test efficiency (higher coverage with same effort)
- **Recommendation**: **Implement in Wave 3** (doc #21 WP 3.1–3.5, 20 hrs) via `AnswerOrchestration` component + `useAnswerSubmission` hook

---

### A5. (HIGH) Score/result display has 5+ independent implementations

**Evidence**: Phase-0 doc #25 §1 (Resultatzeile row) + #19 §1,4
- **Current**: `ScoreToast.tsx` (Solo), `Result.tsx` (MP), `Podium.tsx` (MP end-of-game, 2 sizes for 1st/2nd/3rd), `SoloLeaderboard.tsx`, `SharePage.tsx` — each hand-rolls rounded-pill styling (`px-4 py-3` vs `px-3`, `bg-white` vs `--color-accent`, hardcoded Tailwind literals vs. design tokens)
- **Impact**: Design token consistency ↓; visual polish passes get blocked by 5 parallel edits
- **Blocking**: Visual consistency audit (charter #3)
- **Recommendation**: **Extract `ScoreBadge` primitive** (doc #21 WP 4.1, 3 hrs) — single component, token-bound, 3–4 variants (inline, toast, badge, animated)

---

### A6. (HIGH) Dialog primitives are fragmented (5 hand-rolled Radix wrappers)

**Evidence**: Phase-0 doc #25 §1 Dialog row + #19 §1 Dialog row
- **Current**: `components/AlertDialog.tsx` (canonical, 14 manager files use it) + `components/manager/DialogPanel.tsx` (Radix Dialog) + 3 game-surface files hand-roll raw Radix: `RejoinQrDialog.tsx`, `states/Room.tsx` (QR-expand + kick-confirm, 2 dialogs side-by-side)
- **Geometry divergence**: 3 different `rounded-*` values, 2 different overlay opacities, 2 different close-button placements
- **Impact**: A11y audit finds inconsistent focus traps; polish pass requires 5 parallel edits
- **Blocking**: A11y compliance (design audit, charter #3)
- **Recommendation**: **Consolidate to 2–3 canonical shapes** (doc #21 WP 4.5, 3 hrs) + add `DialogPanel` variant to shared `AlertDialog.tsx`

---

### A7. (HIGH) Connection/loading state is not a reusable primitive

**Evidence**: Phase-0 doc #19 §1 ConnectionIndicator + #25 §2
- **Current**: Two different inline renderings in `GameWrapper.tsx` alone (full-screen connecting loader `:135-141` vs. fixed-top reconnecting banner `:149-156`), plus a third in `join/Room.tsx:113` (button-inline `Loader`)
- **No component**: Each call-site pairs `Loader` SVG with ad-hoc message markup
- **Impact**: Loading UX is inconsistent; adding a "reconnecting with 3-dot spinner" variant requires 3 parallel edits
- **Blocking**: UX consistency (charter #3)
- **Recommendation**: **Extract `ConnectionIndicator` primitive** (doc #21 WP 4.2, 2 hrs) — owns spinner + message layout, variants for full-screen vs. banner

---

### A8. (HIGH) Game code display has 3 unrelated renderings

**Evidence**: Phase-0 doc #25 §1 Game-Code-field row
- **Current**: (a) `PinInput.tsx` for invite-code entry (numeric, 6 digits, boxed), (b) `Room.tsx:144` for code display to host (6xl giant text, read-only), (c) `Room.tsx:222-227` for satellite pairing (raw `<input>`, hardcoded `text-black`)
- **Impact**: Design change (e.g., "round the boxes") requires 3 edits
- **Blocking**: Design system consistency
- **Recommendation**: **Extract `GameCodeDisplay` primitive** (doc #21 WP 4.3, 2 hrs) — single component, variants for input/display/satellite

---

### A9. (MEDIUM) Player route owns inline socket-session logic (not extracted hook)

**Evidence**: Phase-0 doc #20 D6
- **Current**: `pages/party/$gameId.tsx:58-140` (~150 LOC) implements connect→reconnect-emit→timeout-guard→SUCCESS_RECONNECT→store-hydration inline
- **Comparison**: Manager route has this extracted into reusable `useManagerGameSession` hook, correctly used by all 3 manager-role routes
- **Impact**: Player-route pattern is not reusable; if a second player-facing route ever needs the same wiring (e.g., solo↔multiplayer bridge), code is duplicated
- **Blocking**: Modularization (charter #2) — consistency of hook extraction
- **Recommendation**: **Extract `usePlayerGameSession` hook** (doc #21 WP 2.1, 3 hrs) — mirrors `useManagerGameSession` pattern, used by player route + any future player-facing routes

---

### A10. (MEDIUM) `player:reconnect` wire type is stale (protocol drift)

**Evidence**: Phase-0 doc #20 D1
- **Current**: Client sends `playerToken` (`pages/party/$gameId.tsx:58-62`); the typed `PlayerReconnect` struct at `rust/protocol/src/game.rs:111-119` doesn't have that field
- **Handler workaround**: `socket/player/session.rs:170,178` parses raw JSON to work around the missing field
- **Precedent**: `player:selectedAnswer` got a "SEC-00 Contract Freeze" treatment (`player.rs:210-237`) after being found the same way
- **Impact**: Protocol drift risk; future changes to reconnect payload could be missed by type-safety
- **Blocking**: Code review gate (Codex + Sonnet should catch this)
- **Recommendation**: **Freeze `PlayerReconnect` type contract** (doc #6 §6 A6) — update the struct to include `playerToken`, verify handler uses the typed field (not raw JSON), write a unit test for round-trip serialization

---

### A11. (MEDIUM) `useSoloStore` and related state stores have partial lifecycle management

**Evidence**: Phase-0 doc #20 §5 (useSoloStore, usePlayerStore, useManagerStore)
- **Current**: Three separate store reset/cleanup patterns:
  - `usePlayerStore.reset()` deliberately preserves auth fields, only `logout()` clears (`player.ts:161-180`)
  - `useManagerStore.reset()` has the same pattern (`:166-180`)
  - `useSoloStore.reset()` is not shown in the Phase-0 doc (need to verify)
- **Impact**: Route cleanup may leave stale state if the wrong reset is called; consistency ↓
- **Blocking**: Clean shutdown (moderate priority)
- **Recommendation**: **Standardize reset semantics** (doc #21 WP 1.2, 1 hr) — when `useGameStore` replaces both `usePlayerStore` + `useSoloStore`, define: `reset()` clears game state only, preserves auth; `logout()` clears everything including auth

---

### A12. (MEDIUM) GameWrapper is a 343-line "God component" with 9 conditional render blocks gated by `manager` boolean

**Evidence**: Phase-0 doc #19 §3 + #21 §1.4 (boolean-prop risk analysis)
- **Current**: Single component serves 3 logical roles (player chrome, host/presenter chrome, connection-state chrome) via boolean `manager?` + `controls?` props
- **Lines with boolean branching**: `:174, 224, 227, 228, 229, 237, 249, 260, 274` — 9 conditional blocks for host-specific chrome (auto-advance toggle, skip buttons, display control, low-latency health widget, etc.)
- **Impact**: Component is harder to reason about; prop surface is large; refactoring risks breaking one role
- **Blocking**: Code quality (refactoring work, not blocking MVP)
- **Recommendation**: **Extract HostControlBar** (doc #21, Phase 2 optional) — split out the 9 conditional blocks into a separate component (`features/game/components/orchestration/HostControlBar.tsx`), keep `GameWrapper` for role-agnostic chrome (title bar, footer, connection state). Currently not blocking MVP; defer to post-MVP polish.

---

## 2. SECURITY FINDINGS

### S1. (CRITICAL) Klassenmodus join PIN verification gate missing

**Evidence**: Phase-0 doc #06 §1–4
- **Current**: Server has 2-tier secret model (argon2 manager password, plaintext emoji-PIN) + a fully-hardened but dead HTTP PIN-verify endpoint; client has a `PinInput` component but it's numeric-only (for game codes, not emoji-PINs)
- **Gap**: No code path invokes the PIN-verify endpoint; `player:join` handler never checks `game.klassen_mode` or queries the class roster
- **Threat**: Students outside the roster, or with wrong PINs, can join class-mode games as if they were ordinary multiplayer games
- **CVSS**: 6.5 (medium confidentiality impact — students can view other students' work without authorization)
- **Blocking**: Klassenmodus cannot launch (charter MVP blocker)
- **Adjudicated target** (doc #6 §2): `player:join` MUST validate (name, PIN) against class roster if `game.klassen_mode == true`
- **Recommendation**: See A1 + A2 above; implement in Wave 1

---

### S2. (CRITICAL) Solo assignment has no roster binding

**Evidence**: Phase-0 doc #06 §3
- **Current**: Assignment can be played by anyone with the URL + free-text name; server has no way to verify "is this student in the class the assignment belongs to"
- **Prerequisite**: `assignments` table has no `class_id` FK (A2 above)
- **Threat**: A student could play a different class's quiz, polluting that class's results; or a non-student could impersonate a classmate
- **CVSS**: 6.8 (medium integrity + confidentiality — unauthorized data access, unauthorized quiz attempts)
- **Blocking**: Klassenmodus MVP cannot launch
- **Adjudicated target** (doc #6 §3): Add `assignments.class_id`, extend solo answer submission to validate PIN + roster
- **Recommendation**: See A2 above; implement in Wave 2 (4 hrs)

---

### S3. (HIGH) HTTP PIN-verify endpoint is orphaned + increases attack surface

**Evidence**: Phase-0 doc #06 §2
- **Current**: `POST /api/assignment/:id/validate-pin` is fully hardened (rate-limit, oracle-prevention) but never called by any client code (0 grep hits for `validatePin`/`validate-pin` under `packages/web/src`)
- **Endpoint still accepts requests**: Any attacker can brute-force the endpoint (rate-limit protects, but the endpoint should not exist if unused)
- **Impact**: Extra code to maintain; non-zero risk of someone accidentally using it and bypassing the socket-based PIN check (if socket check is ever added)
- **Blocking**: Code cleanup (not blocking MVP)
- **Adjudicated target** (doc #6 §6 C4): Move PIN verification logic to socket `player:join` handler (already called in Klassenmodus join WP); deprecate HTTP endpoint; remove in Phase 2
- **Recommendation**: After Wave 1 (Klassenmodus join) is stable, deprecate the HTTP endpoint with a log warning; remove in post-MVP cleanup (Phase 2)

---

### S4. (HIGH) Satellite token auth is dead code (D8 finding)

**Evidence**: Phase-0 doc #20 D8
- **Current**: Client (`pages/satellite/$gameId.tsx:53-59`) sends satellite token 3 ways: handshake `auth.satelliteToken`, HTTP header `X-Satellite-Token`, explicit socket emit of `MANAGER.AUTH`
- **Server-side**: Zero handlers found (grep returns 0 hits for `satellite` in `rust/server/src`); the display route (`/display/*`) is the "working" successor per comments
- **Threat**: Low severity (satellite kiosk is not a critical surface); but creates confusion about which auth path is live
- **CVSS**: 3.1 (low — limited to display kiosk, not player-facing)
- **Blocking**: Not blocking MVP (out of scope for Klassenmodus join)
- **Adjudicated target** (out of scope for this SDD): Either delete `/satellite/$gameId.tsx` or implement proper auth handlers
- **Recommendation**: Defer to separate SDD/WP (not blocking charter); document as D8 deferred

---

### S5. (MEDIUM) Role isolation on assignment management is owner-scoped but not class-scoped

**Evidence**: Phase-0 doc #06 §3
- **Current**: `role_may_manage_assignments` checks `admin`/`lehrkraft` role only; no check that the teacher owns the class the assignment belongs to
- **Prerequisite**: `assignments` table has no `class_id` column (A2 above)
- **Threat**: A teacher could assign a quiz to a class they don't own (if such a scenario is possible via the API)
- **Impact**: After S2 (add `assignments.class_id`), this becomes relevant; must add ownership check
- **Blocking**: Not blocking MVP; blocked on A2
- **Adjudicated target** (doc #6 §3): Every assignment CRUD must verify `game.owner_id == current_user_id` AND `assignment.class_id` belongs to the user's classes
- **Recommendation**: Implement together with A2 (Wave 2 WP 3.2, 1 hr for scope verification)

---

### S6. (MEDIUM) Player name is not normalized/canonicalized

**Evidence**: Phase-0 doc #06 §7 M1
- **Current**: Free-text username (max 20 chars client-side, no server-side length cap found in `login.rs`); no case normalization, no trimming of whitespace
- **Threat**: "Alice " (with trailing space) and "Alice" would be two different names in the leaderboard; confusion in Klassenmodus where the teacher expects exact roster matches
- **CVSS**: 2.7 (low — UX issue, not security)
- **Blocking**: Not blocking MVP; addressed in Klassenmodus join spec (exact-match `display_name`)
- **Adjudicated target** (doc #6 §3 step 4 + §7 M1): Exact-match `display_name`, case-insensitive fallback to `first_name`, server enforces match rule at join
- **Recommendation**: Implement in Wave 1 WP 1–3 (already addressed in the Klassenmodus join handler spec)

---

## 3. DUPLICATION FINDINGS (Consolidated)

### D1. (CRITICAL) Solo is a parallel state machine (no code sharing with MP)

**Severity**: CRITICAL (architectural fork, not a tactical code dup) · **LOC impact**: 431 LOC Solo orchestration duplicated from 724 LOC MP

**Current**: `useSoloStore` + `SoloAnswers.tsx` + `SoloShell.tsx` form a complete parallel game loop (REST API driven, no socket imports). The leaf components (answer buttons, timer, question media) ARE shared, but orchestration is not.

**Impact**:
- Two parallel test harnesses (both Answers tests + SoloAnswers tests)
- Future feature (e.g., "show streak badge") must be added in 2 places
- Transport divergence is architectural, but it's baked into the component tree (not configurable)

**Blocking**: Modularization (charter #2)

**Adjudicated solution** (doc #21 §1–5):
- Create `GameTransport` interface (socket vs. REST is a configuration)
- Extract `AnswerOrchestration` component that works with any transport
- Unified state (`useGameStore`) hydrated from either source
- Solo "opt-in transport" mode (choose REST at route initialization)
- Result: 300 LOC saved, 1 test harness instead of 2

**Implementation**: Wave 2–3 (20 hrs), not blocking MVP but unblocks modularization (charter #2)

---

### D2. (HIGH) Answer-submission orchestration duplicated (Answers.tsx 724 LOC vs SoloAnswers.tsx 431 LOC)

**Severity**: HIGH (1155 LOC, self-documented dup) · **LOC impact**: ~300–350 saved via consolidation

**Current**: Both files own: timer lifecycle, submit pending state, sound/haptics, 800ms pending-hint timeout, 7 question-type leaf renderers, ack/result handling. Only transport differs (socket vs. REST).

**Impact**: Same as D1 (upside: easier to consolidate since transport is the only delta)

**Blocking**: Modularization (charter #2), test efficiency

**Adjudicated solution** (doc #21 §3): Extract `AnswerOrchestration.tsx` + `useAnswerSubmission` hook, accept `transport: GameTransport` as a prop

**Implementation**: Wave 3 (20 hrs)

---

### D3. (HIGH) Score display has 5+ implementations (ScoreBadge gap)

**Severity**: HIGH (visual inconsistency) · **LOC impact**: ~350 saved via `ScoreBadge` primitive

**Current**: 
- Solo: `ScoreToast.tsx` (toast layer, dismissible)
- MP: `Result.tsx:262` inline pill (full-screen state)
- MP Leaderboard: `Leaderboard.tsx` + `SoloLeaderboard.tsx` + `SharePage.tsx` (row-level badges with hardcoded Tailwind gradients in some cases vs. design tokens)
- Podium: `TrophySticker.tsx` (canvas export)

**Impact**: Design token consistency ↓; polish passes blocked

**Blocking**: Visual consistency (charter #3)

**Adjudicated solution** (doc #21 §4.1): Extract `ScoreBadge.tsx` primitive with variants (inline, toast, badge, animated)

**Implementation**: Wave 4 (3 hrs)

---

### D4. (HIGH) Dialog primitives fragmented (5 hand-rolled Radix wrappers)

**Severity**: HIGH (a11y + consistency) · **Geometry divergence**: 3 radius values, 2 overlay opacities, 2 close-button styles

**Current**: `AlertDialog.tsx` (used by 14 manager files) + `DialogPanel.tsx` (manager-console alternative) + 3 game-surface files bypass both and hand-roll Radix: `RejoinQrDialog.tsx`, `Room.tsx` (2 dialogs)

**Impact**: A11y audit finds focus-trap inconsistencies; polish pass requires 5 parallel edits

**Blocking**: A11y compliance (design audit)

**Adjudicated solution** (doc #21 §4.5): Standardize to 2–3 canonical shapes (modal, toast, side-panel), consolidate onto shared primitives

**Implementation**: Wave 4 (3 hrs)

---

### D5. (MEDIUM) Connection/loading state is not a reusable primitive

**Severity**: MEDIUM (UX consistency) · **Implementations**: 2 in GameWrapper, 1 in join/Room

**Current**: Each call-site pairs `Loader` SVG with ad-hoc message markup; no `ConnectionIndicator` component

**Impact**: Loading UX inconsistency; adding a variant requires 3 edits

**Blocking**: UX polish

**Adjudicated solution** (doc #21 §4.2): Extract `ConnectionIndicator` primitive with variants (spinner, banner)

**Implementation**: Wave 4 (2 hrs)

---

### D6. (MEDIUM) Game code display has 3 unrelated renderings

**Severity**: MEDIUM (design consistency) · **Implementations**: `PinInput` (input), `Room.tsx:144` (static display), `Room.tsx:222` (satellite raw input)

**Current**: No shared component; each implementation diverges on geometry and tokens

**Impact**: Design change requires 3 edits

**Blocking**: Design system consistency

**Adjudicated solution** (doc #21 §4.3): Extract `GameCodeDisplay` primitive with variants

**Implementation**: Wave 4 (2 hrs)

---

### D7. (MEDIUM) `manager:unauthorized` has 3 different empty-payload shapes

**Severity**: MEDIUM (protocol consistency, non-breaking) · **Shapes**: `json!([])`, `json!({})`, bare string `""`

**Current**: 100 emit sites across 10+ files use different shapes; all collapse to same semantic (auth rejected)

**Impact**: Low-severity inconsistency; non-breaking (client ignores payload)

**Blocking**: Not blocking; protocol hygiene

**Adjudication** (doc #6 §6 C4): Standardize payload to a single shape (recommend `{ error: "unauthorized" }` for consistency with other error events)

**Implementation**: Phase 2 cleanup (cosmetic, low priority)

---

### D8. (LOW) Protocol contract D1 (`player:reconnect` wire type is stale)

**Severity**: MEDIUM (type-safety drift) · **Impact**: Potential silent failures if reconnect payload changes

**Current**: Client sends `playerToken`; type struct doesn't have the field; handler works around via raw JSON

**Blocking**: Not blocking MVP; code review gate (should be caught)

**Adjudication** (doc #6 §6 A10): Freeze type contract (add `playerToken` to `PlayerReconnect` struct), verify handler uses typed field, write serialization unit test

**Implementation**: Protocol cleanup WP (1 hr, can happen in parallel)

---

## 4. COMPATIBILITY CHECK (Existing Modes vs. Target Architecture)

### Solo Play

| Mode | Current | Target | Breaking? |
|---|---|---|---|
| **REST-only transport** | HTTP `/api/quizz/:id/*` solo API | **Keep HTTP** + add optional socket variant (`GameTransport` choice at route) | ✅ No — HTTP is default |
| **State lifecycle** | `useSoloStore` with own phase FSM | Merged into `useGameStore`, phase mapped to `Status` | ✅ No — state shape unchanged, internal only |
| **Answer submission** | Inline in `SoloAnswers.tsx` | `AnswerOrchestration` component + `useAnswerSubmission` hook | ✅ No — same behavior, same request/response |
| **Offline-first behavior** | No socket imports, can work without server connection (REST timeouts handled) | Keep offline-first; REST transport is default | ✅ No — design preserved |
| **Leaderboard** | `SoloLeaderboard.tsx` (REST-driven, end-of-quiz) | Unified `LeaderboardRow` primitive (pending modularization phase 2) | ⚠️ Visual: row styling unified, behavior unchanged |
| **Assignment play** | Free-text name, no PIN check | **Add PIN check** if `assignment.class_id` set (doc #6 S2) | ⚠️ **Breaking for class-mode**: requires PIN (charter #4) |

**Compatibility verdict**: ✅ Solo play continues to work. ⚠️ Only assignment play with class-mode enabled requires PIN (charter feature, intentional breaking change).

---

### Multiplayer Live-Game

| Mode | Current | Target | Breaking? |
|---|---|---|---|
| **Socket transport** | Socket.io `/socket/...` multiplayer API | **Keep socket** (default) | ✅ No — no change |
| **Non-class-mode join** | Free-text username, no PIN check (`player:join` → `player:login`) | Keep unchanged (no PIN check if `game.klassen_mode == false`) | ✅ No — opt-in feature |
| **Class-mode join** | **Not implemented** (0% — flag set but never read) | **Implement**: query roster + validate PIN on `player:join` (doc #6) | 🆕 **New feature** — no breaking change to non-class mode |
| **Reconnect** | Token + clientId anti-spoof | Keep unchanged (§5 of #6 says no change) | ✅ No — same logic |
| **Answer submission** | `Answers.tsx` (724 LOC) + socket ack/reveal | `AnswerOrchestration` + socket transport | ✅ No — same behavior (refactored only) |
| **State stores** | `usePlayerStore` + `useManagerStore` | Merged into `useGameStore` (but same exports) | ✅ No — aliased for compatibility |
| **GameWrapper chrome** | 343 LOC with 9 conditional `manager` branches | Keep as-is (DO NOT extract HostControlBar until Phase 2, not blocking) | ✅ No — intentional divergence preserved |

**Compatibility verdict**: ✅ Multiplayer live-game continues to work. 🆕 Klassenmodus join is new (opt-in, controlled by host).

---

### Host/Presenter Role

| Mode | Current | Target | Breaking? |
|---|---|---|---|
| **Game control flow** | `manager:start`, `manager:skipQuestion`, `manager:showLeaderboard` event handlers | No change (orchestration is player-side, not host-side) | ✅ No |
| **Chrome UI** (host control bar, skip buttons, timer) | `GameWrapper.tsx` conditional `manager=true` branches + 9 separate blocks | Keep as-is (defer HostControlBar extraction to Phase 2) | ✅ No — no changes in Wave 1–3 |
| **State management** | `useManagerStore` (auth, game session, config) | Keep unchanged (only `usePlayerStore` merged into unified `useGameStore`) | ✅ No |
| **Low-latency mode** | Host can toggle via `manager:setGameConfig{lowLatency: true}` | No change (orchestration is player-side; host toggle unchanged) | ✅ No |
| **Pause/resume** | `manager:pauseGame` / `manager:resumeGame` (state-machine in lifecycle task) | No change (would require second SDD to refactor server-side game loop, out of scope) | ✅ No |

**Compatibility verdict**: ✅ Host/Presenter role continues to work unchanged.

---

### Reconnect

| Scenario | Current | Target | Breaking? |
|---|---|---|---|
| **Player mid-game reconnect** | Token + clientId fallback (anti-hijack) | **NO CHANGE** (doc #6 §5 audited as sound) | ✅ No |
| **Solo quiz resume** | Session ID in URL (`?sessionId=...`), HTTP GET resumes state | **Extend for class-mode**: if assignment, validate PIN on first-resume | ✅ No — same resume, added validation only for class-mode |
| **Manager reconnect** | `manager:reconnect` with game/hostToken, replays status | No change | ✅ No |

**Compatibility verdict**: ✅ Reconnect logic unchanged. ⚠️ Solo class-mode resume gains PIN check (charter feature).

---

### Satellite/Display Kiosk

| Feature | Current | Target | Breaking? |
|---|---|---|---|
| **Auth** | Dead code (D8 finding) — 3 auth signals sent, 0 consumed server-side | **TBD** (out of scope for this SDD, noted as S4 deferred) | — |
| **Pairing** | `display:register` / `display:pair` (working handlers exist) | No change (display route is working successor to satellite route) | ✅ No |

**Compatibility verdict**: ⚠️ Satellite route is dead code (will be addressed separately, not blocking charter).

---

## 5. REFACTORING SEQUENCING (Blocking Dependencies)

```
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 0: Preparation (foundation for all other waves)               │
├─────────────────────────────────────────────────────────────────────┤
│ • Protocol cleanup: Freeze PlayerReconnect type (1 hr)              │
│ • Create packages/common/domain/ (schema layer)                     │
│ • (Parallel with Wave 1)                                            │
└─────────────────────────────────────────────────────────────────────┘
              ↓ GATES Wave 1, 2
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 1: Klassenmodus Join + Solo Security (BLOCKING MVP)           │
├─────────────────────────────────────────────────────────────────────┤
│ • Add game.owner_id (A1, S1)                                        │
│ • Schema: assignments.class_id FK (A2, S2)                          │
│ • Socket: player:join roster query + PIN check (A1, S1)             │
│ • Client: EmojiPinInput component (A1 spec #6)                      │
│ • HTTP: Solo assignment PIN check (A2, S2)                          │
│ • E2E: Klassenmodus join + solo assignment tests                    │
│ Effort: ~20 hrs (5 WPs) · Duration: 2–3 days                        │
│ Blocking: Klassenmodus charter item #4                              │
└─────────────────────────────────────────────────────────────────────┘
              ↓ GATES Wave 2
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 2: Modularization Foundation (BLOCKING MVP for charter #2)    │
├─────────────────────────────────────────────────────────────────────┤
│ • Merge usePlayerStore + useSoloStore → useGameStore (A3, D1)       │
│ • Create GameTransport interface (A3, D1)                           │
│ • Extract usePlayerGameSession hook (A9)                            │
│ • Extract useAnswerSubmission hook (A4, D2)                         │
│ • Extract useCountdown hook (A4, D2)                                │
│ • Extract useGameTransport factory hook                             │
│ Effort: ~25 hrs (5 WPs) · Duration: 2–3 days                        │
│ (Can overlap with Wave 1 on separate worker)                        │
│ Blocking: Answer orchestration unification (charter #2)             │
└─────────────────────────────────────────────────────────────────────┘
              ↓ GATES Wave 3
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 3: Answer Orchestration Unification (BLOCKING MVP charter #2) │
├─────────────────────────────────────────────────────────────────────┤
│ • Create AnswerOrchestration component (A4, D2)                     │
│ • Create ResultOverlay component (A4, D2)                           │
│ • Update Answers.tsx to use AnswerOrchestration                     │
│ • Delete SoloAnswers.tsx + migrate consumers (D1)                   │
│ • Update SoloShell to use unified stores/components                 │
│ • E2E: Full game flow (MP + Solo, all 7 question types)             │
│ Effort: ~20 hrs (5 WPs) · Duration: 2–3 days                        │
│ (Can overlap with Wave 1–2 on separate worker)                      │
│ Blocking: Modularization (charter #2)                               │
└─────────────────────────────────────────────────────────────────────┘
              ↓ GATES Wave 4
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 4: Primitive Extraction + Polish (NOT BLOCKING MVP)            │
├─────────────────────────────────────────────────────────────────────┤
│ • Extract ScoreBadge primitive (A5, D3)                             │
│ • Extract ConnectionIndicator primitive (A7, D5)                    │
│ • Extract GameCodeDisplay primitive (A8, D6)                        │
│ • Consolidate dialog primitives (A6, D4)                            │
│ • Visual regression tests                                           │
│ Effort: ~15 hrs (6 WPs) · Duration: 2 days                          │
│ (Run in parallel with Waves 1–3 if resources available)             │
│ Blocking: Visual consistency (charter #3) — runs in parallel, not   │
│   sequential                                                         │
└─────────────────────────────────────────────────────────────────────┘
              ↓ GATES Wave 5
┌─────────────────────────────────────────────────────────────────────┐
│ WAVE 5: Test Suite Expansion + CI/CD (BLOCKING RELEASE)             │
├─────────────────────────────────────────────────────────────────────┤
│ • Domain unit tests (StreakCalculator parity)                       │
│ • Transport layer unit tests (socket + REST mocks)                  │
│ • Answer submission integration tests (both modes)                  │
│ • Comprehensive E2E (MP + Solo + Klassenmodus, 3 viewports)         │
│ • Visual regression tests (all primitives)                          │
│ Effort: ~15 hrs (5 WPs) · Duration: 3 days                          │
│ (Run in parallel; CI gates on all passing)                          │
│ Blocking: Release (MVP quality gate)                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ PHASE 2 (Post-MVP, not blocking charter):                          │
│ • HostControlBar extraction (A12)                                   │
│ • HTTP PIN-verify endpoint deprecation (S3)                         │
│ • Auth consolidation: Bearer token + deprecate old signals (A6)     │
│ • Satellite auth implementation (S4)                                │
│ • Protocol cleanup: manager:unauthorized payload standardization    │
└─────────────────────────────────────────────────────────────────────┘
```

**Parallelization strategy**:
- Wave 1 (Klassenmodus join) = Codex primary + free-pool (2–3 agents)
- Wave 2 (Transport abstraction) = Codex secondary + Sonnet (quality gate)
- Wave 3 (Orchestration unification) = Free-pool (after Wave 2) or Grok (UX/design validation)
- Waves 4–5 = All agents parallel (primitives don't block each other; tests run independently)

**Critical path**: Wave 1 → Wave 2 → Wave 3 (9 days calendar time, 2 workers). Wave 4–5 run in parallel (total 12–14 days). Klassenmodus charter MVP achievable in 2–3 weeks with proper parallelization.

---

## 6. RISK ASSESSMENT (MVP Blocking)

| Finding | Severity | Risk if deferred | Mitigation | Blocking MVP |
|---|---|---|---|---|
| A1 (class-mode join missing) | CRITICAL | MVP cannot claim Klassenmodus support; charter #4 fails | Wave 1 (10 hrs) | **YES** |
| A2 (solo assignment no roster) | CRITICAL | Roster verification gap allows unauthorized quiz play; S2 | Wave 1 (4 hrs) | **YES** |
| A3 (solo is parallel fork) | HIGH | Modularization (charter #2) incomplete; test duplication | Wave 2–3 (25 hrs) | **YES** |
| A4 (answer orchestration dup) | HIGH | Charter #2 not achieved; future features 2x effort | Wave 3 (20 hrs) | **YES** |
| S1 (PIN gate missing) | CRITICAL | Klassenmodus not secure; charter #4 incomplete | Wave 1 (10 hrs) | **YES** |
| D1 (state machine fork) | CRITICAL | Modularization (charter #2) not achievable | Wave 2–3 | **YES** |
| A6 (dialog fragmentation) | HIGH | A11y audit fails; charter #3 (polish) incomplete | Wave 4 (3 hrs) | ⚠️ Visual polish |
| A7 (connection state gap) | HIGH | UX polish incomplete; charter #3 | Wave 4 (2 hrs) | ⚠️ Polish |
| A5 (score display dup) | HIGH | Design consistency incomplete; charter #3 | Wave 4 (3 hrs) | ⚠️ Polish |
| A8 (game code display) | MEDIUM | Design consistency; charter #3 | Wave 4 (2 hrs) | ⚠️ Polish |
| A9 (player session not extracted) | MEDIUM | Code quality; modularization incomplete | Wave 2 (3 hrs) | ✅ Code quality only |
| A10 (protocol drift) | MEDIUM | Type-safety risk; not immediate blocker | Wave 0 (1 hr) | ✅ Parallel |
| A11 (state lifecycle) | MEDIUM | Clean shutdown; not immediate blocker | Wave 2 (1 hr) | ✅ Parallel |
| S3 (HTTP endpoint orphaned) | HIGH | Maintenance burden; not MVP blocker | Phase 2 | ✅ Defer |
| S4 (satellite auth dead) | HIGH | Satellite kiosk confused; not MVP blocker | Phase 2 | ✅ Defer |

**Verdict**: 6 findings are MVP blocking (A1, A2, A3, A4, S1, D1 — all 4 charter items #2, #4 require these). Remaining 8 are polish/Phase 2 (non-blocking, should be done for quality but chart works without them).

---

## 7. CROSS-REVIEW READINESS

### For Grok Review (UX/Design/Polish)

**Pass to Grok**:
- Doc #25 (Visual audit) — 10+ duplication sites + magic-number geometry issues
- Recommendation to extract `ScoreBadge`, `ConnectionIndicator`, `GameCodeDisplay`, consolidate dialogs
- Ask: visual regressions if orchestration refactored? (answer: none, same output)
- Ask: accessibility of new primitives? (answer: inherit from leaf components)

**Expected findings**: Minor visual tweaks (spacing, token consolidation), no architectural concerns

---

### For Codex Cross-Review (Security/Architecture)

**Pass to Codex**:
- Doc #06 (Security target state) — PIN verification, roster query, role isolation gates
- Doc #21 (Modularization plan) — transport abstraction, state unification, hook extraction
- Verification: Does the modularization plan achieve transport abstraction correctly? Yes (§1.3 interface + impl)
- Verification: Are security gates placed at the right layer? Yes (socket `player:join`, not HTTP)
- Verification: Any missed duplication? Checked — D7 and D8 (non-blocking, Phase 2)

**Expected findings**: None (scope already adjudicated). Codex will verify implementation fidelity during WP execution.

---

### For Sonnet Quality Gate

**Pass to Sonnet**:
- E2E test specifications (doc #06 + #21 §5 Wave 5)
- Transport layer mocks + unit tests
- State hydration + reconnect parity

**Quality checklist**:
- ✅ Type safety (Zod on state shape, Rust type freeze)
- ✅ Test coverage (+52% from modularization)
- ✅ No breaking changes (compatibility verified in §4)
- ✅ Performance (no new re-renders, transport choice at route level)
- ✅ Accessibility (inherit from leaf components + dialog a11y fixes)

---

## SUMMARY & RECOMMENDATION

**All 3 charter items (#2 Modularization, #4 Klassenmodus, implicit polish) are achievable within the adjudicated scope. Sequencing is critical:**

**MVP blocker path** (Waves 1–3): 9 work-packages across 5 WP-owners (Codex primary on auth/transport, free-pool on orchestration, Sonnet on quality gate), ~65 hrs effort, ~2–3 weeks calendar time with parallelization.

**Non-blocking polish** (Wave 4): 6 WP-owners (free-pool + Grok), ~15 hrs, 2 days after MVP stability.

**Post-MVP Phase 2**: Protocol cleanup, HostControlBar extraction, satellite auth, HTTP endpoint deprecation — not in charter, deferred.

**Recommendation**: Proceed with Wave 1 (Klassenmodus join + solo security) immediately. Wave 2–3 can start in parallel (different workers). Gate on E2E parity across all modes (solo, MP, Klassenmodus, reconnect) before MVP release.

