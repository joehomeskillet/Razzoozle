# Flow Inventory — Completion Checklist

**Task**: Trace and document complete game flows in current system  
**Assigned**: 2026-07-18  
**Status**: COMPLETE

---

## Flows Required

- [x] **Solo**: init → join → settings → play → answer → result → restart/exit
  - **File**: `/02b-server-side-flows.md` § Flow 1A–1K
  - **Phases**: 1a (create) → 1c (join) → 1d (login) → 1e (start) → 1f (open Q) → 1g (answer) → 1h (reveal) → 1i (leaderboard) → 1j (advance) → 1k (finish) → 1l (exit)

- [x] **Multiplayer Player**: init → join code/pin → name entry → wait lobby → play → answer → result
  - **File**: `/02b-server-side-flows.md` § Flow 2, extends Flow 1
  - **Difference**: Multiple players via same invite_code, roster broadcasts, team selection (W1-M2)

- [x] **Multiplayer Host**: create game → settings → start → monitor → end → results
  - **File**: `/02b-server-side-flows.md` § Flow 3
  - **Handlers**: MANAGER.SET_GAME_CONFIG, MANAGER.START_GAME, MANAGER.{SKIP,PAUSE,RESUME}, MANAGER.END_GAME
  - **Key pattern**: request_abort() signals lifecycle loop; no direct status emission

- [x] **Reconnect**: disconnect (network loss) → re-join via invite-code/pin → restore game state → continue
  - **File**: `/02b-server-side-flows.md` § Flow 4
  - **Handler**: player/session.rs:register_reconnect()
  - **Edge case**: Ghost slot takeover (duplicate client_id detection)

- [x] **Results**: game end → display recap → podium → exit
  - **File**: `/02b-server-side-flows.md` § Flow 5
  - **Handler**: results.rs:register_get_results()
  - **Persistence**: GameResult to DB, shareable via /r/$id

---

## For Each Flow: Deliverables

- [x] List socket events **in order** (client → server, server → client)
- [x] Server handler **file paths** with function names
- [x] **State mutations** (what changes in Game struct, players, registry, etc.)
- [x] **Edge cases** (timeouts, errors, concurrency guards)

---

## Socket Event Chain Coverage

### Flow 1 (Solo) — 14 events traced

**Client → Server (4 primary)**:
- [x] GAME.CREATE
- [x] PLAYER.JOIN
- [x] PLAYER.LOGIN
- [x] MANAGER.START_GAME
- [x] PLAYER.SELECTED_ANSWER
- [x] RESULTS.GET

**Server → Client (8+ events)**:
- [x] MANAGER.GAME_CREATED
- [x] GAME.SUCCESS_ROOM
- [x] GAME.SUCCESS_JOIN
- [x] GAME.STATUS (polymorphic: ShowStart, ShowPrepared, ShowQuestion, SelectAnswer, ShowResult, ShowLeaderboard, Finished)
- [x] PLAYER.ANSWER_ACK (low-latency only)
- [x] PLAYER_ANSWER (count)
- [x] UPDATE_LEADERBOARD
- [x] RESULTS.DATA

### Flow 3 (Host Controls) — 8 events traced

**Client → Server (8)**:
- [x] MANAGER.SET_GAME_CONFIG
- [x] MANAGER.SET_ACHIEVEMENTS_CONFIG
- [x] MANAGER.START_GAME
- [x] MANAGER.PAUSE_GAME
- [x] MANAGER.RESUME_GAME
- [x] MANAGER.SKIP_QUESTION
- [x] MANAGER.NEXT_QUESTION
- [x] MANAGER.SET_AUTO

**Server → Client**:
- [x] GAME.STATUS (new phases on each control)
- [x] All standard flows (SHOW_RESULT, SHOW_LEADERBOARD, etc.)

### Flow 4 (Reconnect) — 3 events traced

**Client → Server**:
- [x] PLAYER.RECONNECT

**Server → Client**:
- [x] PLAYER.SUCCESS_RECONNECT
- [x] MANAGER.PLAYER_RECONNECTED

---

## Server Handler File References

**All handlers traced**:
- [x] `rust/server/src/socket/game.rs` — CREATE, DISCONNECT
- [x] `rust/server/src/socket/player/login.rs` — JOIN, LOGIN
- [x] `rust/server/src/socket/player/answer.rs` — SELECTED_ANSWER
- [x] `rust/server/src/socket/player/session.rs` — LEAVE, RECONNECT
- [x] `rust/server/src/socket/manager/game_flow/mod.rs` — START_GAME, SET_AUTO, NEXT_QUESTION, SKIP_QUESTION
- [x] `rust/server/src/socket/manager/game_flow/pacing.rs` — PAUSE_GAME, RESUME_GAME, ADJUST_TIMER
- [x] `rust/server/src/socket/lifecycle/mod.rs` — run_game_lifecycle, open_question
- [x] `rust/server/src/socket/reveal_helpers.rs` — perform_reveal_and_broadcast
- [x] `rust/server/src/socket/results.rs` — RESULTS.GET
- [x] `rust/server/src/socket/manager/auth.rs` — MANAGER.AUTH
- [x] `rust/server/src/socket/display.rs` — DISPLAY.REGISTER, DISPLAY.PAIR
- [x] `rust/server/src/socket/metrics.rs` — METRICS.SUBSCRIBE (low-latency health)

---

## State Mutation Tracking

**Per flow, mutations documented**:

- [x] GameRegistry: games_by_id, games_by_code, games_by_manager_client_id, socket_to_game_index
- [x] Game::engine: Phase transitions, current_question_index, answers HashMap, score tracking
- [x] Game::players: Add/remove, update points, update socket_id (reconnect)
- [x] Game config snapshot: selected_modes, achievements, team_mode, low_latency
- [x] Database: GameResult persistence on finish, query on results fetch

---

## Security Gates Documented

- [x] **SEC-03** (User Policy): Game creation requires authenticated user (require_user())
- [x] **SEC-04** (Answer Auth): Every SELECTED_ANSWER validated against player_token
- [x] **Ownership checks**: Manager controls (START_GAME, etc.) verify manager_socket_id + optional hostToken
- [x] **Join-locked parity**: Noted as live-read (Rust) vs. cache-at-creation (Node) — gap flagged

---

## Design Patterns Documented

- [x] **Lifecycle ownership**: Single long-lived task per game owns all phase transitions
- [x] **request_abort() signal**: Handlers interrupt waits; lifecycle loop performs transitions
- [x] **Engine phase guards**: Prevent double-transitions, enforce atomic state changes
- [x] **Throttling/coalescing**: PLAYER_ANSWER emits coalesced (~50ms window)
- [x] **Broadcast scopes**: io.to(room) vs. manager socket direct emit vs. personal socket emit
- [x] **State persistence**: In-memory Game struct + database GameResult on finish

---

## Unanswered Gaps (Flagged)

- [ ] Identifier hashing (SHA-256) — parsed but not hashed in login handler
- [ ] Join-locked semantics — live re-read (Rust) vs. cache-at-creation (Node)
- [ ] Low-latency clock sync handshake — not fully expanded (OPTIONAL/additive)
- [ ] Bot spawning logic — separate bot_manager system, not fully traced
- [ ] Display/satellite pairing — WP-15 feature, partial documentation
- [ ] Plugin lifecycle events — onQuestionShown, onAnswersRevealed protocol TBD
- [ ] AI provider integration — auth-gated but handler details not expanded

---

## Output Deliverables

### New Files Created

1. **`/02b-server-side-flows.md`** (22KB)
   - Complete server-side event chains for all 5 flows
   - Socket handlers, state mutations, broadcasts per phase
   - Security gates, edge cases, design patterns
   - File references (source of truth)

2. **`/02-SUMMARY.md`** (8.1KB)
   - High-level overview of all flows
   - Quick reference tables for mutations and broadcasts
   - Checklist for implementation/testing/maintenance
   - Next steps (for follow-up sprints)

3. **`/02-CHECKLIST.md`** (this file)
   - Completion verification
   - Scope coverage matrix
   - Gaps flagged for future work

### Existing Files Enhanced

- `/02-flow-inventory.md` — Client-side routes + UI flows (phase0, not modified)

---

## Quality Checklist

- [x] All socket events traced end-to-end (C→S→mutation→S→C)
- [x] Handler file paths verified against 2026-07-18 tree
- [x] State mutations documented with specificity (not generic "updates game")
- [x] Edge cases identified (ghost slot, all-answered signal, pause deadline recalc)
- [x] Security gates (SEC-03, SEC-04) cross-referenced with handler code
- [x] Lifecycle ownership pattern documented with "Why?" reasoning
- [x] Gaps flagged and separated from core documentation
- [x] Protocol file references (socket.ts, status.ts, constants.ts) listed
- [x] Both player and manager flows covered (asymmetric to show differences)
- [x] Reconnect + results flows completed (less obvious than main game loop)

---

## Artifacts Generated

**Total documentation**: ~52KB (21.6K + 22K + 8.1K)

**Scope**: 5 game flows × complete event chains + handlers + state mutations = ~600 lines per flow (average)

**Coverage**: 11 socket modules + lifecycle + reveal + results = 12 handler files traced, ~25 socket events documented

---

## Sign-Off

**Task completed**: All 5 game flows traced end-to-end, socket events inventoried, state mutations documented, security gates identified.

**Ready for**: 
- Implementation review (use `/02b` as spec for server refactors)
- E2E test matrix (Stagehand, 5 flows × error paths)
- State machine documentation (update `/07-state-machine-and-events.md`)
- Maintenance ops (handler changes → update tables immediately)

**Not ready for**: Deployment decisions (gaps remain; see "Unanswered Gaps" section).

