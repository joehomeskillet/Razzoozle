# Flow Inventory — Summary

**Status**: COMPLETE (2026-07-18)

**Deliverables**:
1. `/02-flow-inventory.md` — Client-side routes, UI flows, state management (existing, phase0)
2. `/02b-server-side-flows.md` — Server-side socket handlers, state mutations, broadcasts (NEW)

---

## What Was Delivered

### 02b-server-side-flows.md (NEW — 600+ lines)

Complete end-to-end trace of 5 game flows from socket emission to server processing to state mutation to broadcast:

#### Flow 1: Solo Game (Init → Join → Play → Answer → Result → Exit)
- **Phases 1a–1l**: Game creation → player login → start → questions → reveal → leaderboard → finish → results
- **Handlers traced**: `game.rs`, `player/login.rs`, `lifecycle/mod.rs`, `reveal_helpers.rs`, `results.rs`
- **Socket events (C→S)**: GAME.CREATE, PLAYER.JOIN, PLAYER.LOGIN, MANAGER.START_GAME, PLAYER.SELECTED_ANSWER, RESULTS.GET
- **Socket events (S→C)**: MANAGER.GAME_CREATED, GAME.SUCCESS_ROOM, GAME.SUCCESS_JOIN, GAME.STATUS (polymorphic), PLAYER.ANSWER_ACK, RESULTS.DATA
- **State mutations**: GameRegistry indices, Game::engine phase transitions, Player records, answers HashMap, points tracking
- **Security**: SEC-03 (auth required for CREATE), SEC-04 (playerToken on every answer)

#### Flow 2: Multiplayer Game (Create → Lobby → Play)
- Extends Flow 1 with multiple players joining same invite_code
- Server broadcasts: MANAGER.NEW_PLAYER, GAME.TOTAL_PLAYERS, UPDATE_LEADERBOARD (coalesced)
- Team selection (W1-M2): PLAYER.SELECT_TEAM → player.team_id + roster update
- Same lifecycle loop (single per game, owns all phase transitions)

#### Flow 3: Multiplayer Host (Create → Settings → Start → Monitor → End)
- Host-only handlers: MANAGER.SET_GAME_CONFIG, MANAGER.SET_ACHIEVEMENTS_CONFIG, MANAGER.GET_THEME
- Mid-game controls: MANAGER.PAUSE_GAME, MANAGER.RESUME_GAME, MANAGER.SKIP_QUESTION, MANAGER.NEXT_QUESTION
- Auto-advance: MANAGER.SET_AUTO (6sec dwell on SHOW_RESULT)
- Monitoring: MANAGER.LIST_GAMES, METRICS.SUBSCRIBE (low-latency health snapshots)
- Player management: MANAGER.KICK_PLAYER, MANAGER.END_GAME, MANAGER.ABORT_QUIZ
- **Key design**: All manager controls call `request_abort()` to signal the lifecycle loop; handlers never emit status directly

#### Flow 4: Reconnect (Mid-Game Network Loss → Resume)
- Two paths: Case A (JOIN + LOGIN, pre-SEC-04), Case B (RECONNECT + playerToken)
- Handler: `player/session.rs:register_reconnect()`
- Returns: Current GAME.STATUS + GameUpdateQuestion + alreadyAnswered flag
- Edge case (ghost slot takeover): Detects duplicate client_id, emits REMOVE_PLAYER (old) + NEW_PLAYER (fresh)
- Broadcasts: PLAYER.SUCCESS_RECONNECT (personal), MANAGER.PLAYER_RECONNECTED, UPDATE_LEADERBOARD

#### Flow 5: Results (Game End → Display Recap → Podium → Exit)
- Socket: RESULTS.GET (results_id)
- Handler: `results.rs:register_get_results()`
- Broadcasts: RESULTS.DATA (GameResult with full player/answer/score)
- DB: Persisted, shareable via public `/r/$id` endpoint

---

## Critical Design Pattern

**Single long-lived `run_game_lifecycle()` task per game owns ALL phase transitions**:
- Opens Q1, waits for answers or timer
- Reveal
- Leaderboard dwell
- Advances to Q2, Q3, ... or Finished

**Why?** Prevents race conditions between:
- MANAGER.NEXT_QUESTION (manual advance)
- MANAGER.SKIP_QUESTION (cut timer short)
- "all players answered" signal (early reveal)
- Timer expiry (natural advance)

All handlers call `request_abort()` to interrupt the current wait; the lifecycle loop checks engine phase guards before transitioning, preventing double-transitions.

---

## Security Gates

| Gate | Scope | Enforcement |
|------|-------|---|
| SEC-03 | User Policy | Game creation requires `require_user()` → valid session |
| SEC-04 | Answer Auth | Every SELECTED_ANSWER validated against `player.player_token` (server-minted JWT) |
| Ownership | Manager Controls | START_GAME, SKIP_QUESTION, etc. verify `manager_socket_id == socket.id` + optional `hostToken` |

---

## Server State Mutations (Quick Reference)

| Phase | Mutations | Broadcasts |
|-------|-----------|-----------|
| Create (1a) | GameRegistry indices, Game::engine=ShowStart | MANAGER.GAME_CREATED, MANAGER.CONFIG |
| Login (1d) | Game::players append, socket→game index | GAME.SUCCESS_JOIN, GAME.STATUS (Wait), MANAGER.NEW_PLAYER |
| Open Q (1f) | Phase=SelectAnswer, deadline_ms set, shuffled_chunks | UPDATE_QUESTION, SHOW_PREPARED, SHOW_QUESTION, SELECT_ANSWER |
| Answer (1g) | engine.answers HashMap, player.points | PLAYER.ANSWER_ACK (LL), PLAYER_ANSWER count, UPDATE_LEADERBOARD |
| Reveal (1h) | Phase=ShowResult | SHOW_RESULT status |
| Leaderboard (1i) | Phase=ShowLeaderboard, re-ranked | SHOW_LEADERBOARD status |
| Finish (1k) | Phase=Finished, GameResult persisted to DB | FINISHED status |

---

## File References (Source of Truth)

### Protocol
- `packages/common/src/types/game/socket.ts` — ClientToServerEvents, ServerToClientEvents
- `packages/common/src/types/game/status.ts` — Status enum, StatusDataMap
- `packages/common/src/constants.ts` — Event name constants

### Server Handlers (all in `rust/server/src/socket/`)
- `game.rs` — GAME.CREATE, DISCONNECT
- `player/login.rs` — PLAYER.JOIN, PLAYER.LOGIN
- `player/answer.rs` — PLAYER.SELECTED_ANSWER
- `player/session.rs` — LEAVE, RECONNECT, SELECT_TEAM, SET_AVATAR
- `manager/game_flow/mod.rs` — START_GAME, SET_AUTO, NEXT_QUESTION, SKIP_QUESTION
- `manager/game_flow/pacing.rs` — PAUSE_GAME, RESUME_GAME, ADJUST_TIMER
- `lifecycle/mod.rs` — run_game_lifecycle (main loop)
- `reveal_helpers.rs` — perform_reveal_and_broadcast
- `results.rs` — RESULTS.GET
- `manager/auth.rs` — MANAGER.AUTH
- `display.rs` — DISPLAY.REGISTER, DISPLAY.PAIR
- `metrics.rs` — METRICS.SUBSCRIBE, METRICS.REPORT (low-latency health)

### Client
- `packages/web/src/pages/party/$gameId.tsx` — Player live game
- `packages/web/src/pages/party/manager/$gameId.tsx` — Manager control
- `packages/web/src/pages/(auth)/index.tsx` — Join entry
- `packages/web/src/features/game/contexts/socket-context.tsx` — Socket setup

---

## Unanswered Questions (Gaps for Next Sprint)

1. **Identifier hashing (I2 privacy mode)**: Client sends raw identifier; server should compute salted SHA-256 if `requireIdentifier=true`. Currently parsed but not hashed.

2. **Join-locked parity**: Rust reads per-login (live re-read); Node caches at creation. Verify intent — does live re-read allow toggling lock mid-lobby?

3. **Low-latency clock sync**: CLOCK.PING/PONG handshake + metrics subscription flow not fully expanded (documented as "OPTIONAL/additive").

4. **Bot spawning**: MANAGER.ADD_BOTS creates scripted players; bot_manager lifecycle and scoring not fully traced.

5. **Display/satellite pairing**: WP-15 feature (DISPLAY.REGISTER, DISPLAY.PAIR) partially documented in `display.rs`.

6. **Plugin lifecycle events**: `emit_plugin_lifecycle()` calls bridge to external plugin system; contract TBD.

7. **AI provider integration**: Question/distractor generation flows documented as auth-gated but handler details in `socket/ai.rs` not expanded.

---

## Verification Checklist (Before Sign-Off)

- [ ] Trace CLOCK.PING/PONG low-latency handshake end-to-end with metrics
- [ ] Document pause/resume deadline offset recalculation (pacing.rs details)
- [ ] Verify bot answer timing + scoring against engine
- [ ] Confirm identifier hashing (SHA-256) in login handler
- [ ] Map plugin lifecycle event payload contract
- [ ] Test reconnect with stale `lastServerSeq` (low-latency edge case)
- [ ] Stagehand e2e smoke tests for all 5 flows
- [ ] Confirm join-locked semantics with Node team

---

## Next Steps

1. **For implementation**: Use `/02b-server-side-flows.md` as spec for any server refactoring or bug fixes. Cross-reference against `socket.ts` (wire contract).

2. **For testing**: Use flow breakdown as guide for Stagehand e2e test matrix (5 flows × error paths).

3. **For docs**: Update `/07-state-machine-and-events.md` with lifecycle loop diagram + phase guard rules from `/02b`.

4. **For maintenance**: Keep socket handlers aligned with `/02b` — if a handler adds/removes a broadcast, update the table immediately.

