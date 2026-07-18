# 07 — Game State Machine + Lifecycle (server-authoritative, MP) + Solo (client-authoritative)

**Owner:** phase0 · **Status:** draft (Phase-0 inventory, read-only) · **Scope:** `rust/server/src/state/*`, `rust/server/src/socket/{game,cooldown,status_emit}.rs`, `rust/server/src/socket/lifecycle/*`, `rust/server/src/socket/player/*`, `rust/server/src/socket/manager/{auth,game_state,games_list,game_flow/*}.rs`, `rust/engine/src/{lib,scoring,eval,round_recap,state/mod}.rs`, `rust/protocol/src/{game,status,player}.rs`, client mirror in `packages/web/src/features/game`.

Reused grounding (not re-derived): `docs/rust-port-event-inventory.md` Part 3 (Status Sub-Machine, lines 347–395) for the wire-level `Status` enum; `docs/design/p2b-reconnect-spec.md` for reconnect history — **note: that doc is historical/superseded**, see §4.5.

---

## 0. The headline finding: TWO unrelated state machines, not one

The charter's "solo vs multiplayer differ in the same machine" premise does not hold at the code level:

- **Multiplayer** is a fully server-authoritative machine: `GamePhase` (`rust/engine/src/state/mod.rs:20-29`) inside `GameState` (`rust/engine/src/state/mod.rs:73-93`), driven by one long-lived tokio task per game (`rust/server/src/socket/lifecycle/mod.rs`), fanned out over `socket.io` events, mirrored 1:1 by the client via a `Status`→component lookup table.
- **Solo** has **no server phase at all**. It is a client-side Zustand store with its own `SoloPhase` union (`idle | loading | name | question | answering | result | finished`, `packages/web/src/features/game/stores/solo.ts:46-53`), talking to three **stateless REST** endpoints (`rust/server/src/http/solo.rs`) — no socket connection, no `Game`/`GameRegistry` entry, no `GamePhase`. The server only re-validates individual answers server-side (SEC-05 anti-cheat, `solo.ts:63-66` comment) and re-derives achievements; it never tracks "what phase is this solo run in."

This is the single biggest **duplication finding** for the modularization strand (doc 21): two independently-implemented phase enums (`GamePhase` 8 variants vs `SoloPhase` 7 variants), two independently-implemented reveal/scoring paths (`razzoozle_engine::state::GameState::reveal()` vs whatever solo's `/check-answer` handler does in `http/solo.rs`), zero shared state-machine code between them. See §3 for the full comparison table.

---

## 1. Every game PHASE/state — Rust type + file:line

### 1.1 `GamePhase` — the engine's authoritative phase (multiplayer only)

`rust/engine/src/state/mod.rs:19-29`:

```rust
pub enum GamePhase {
    ShowRoom, ShowStart, ShowQuestion, SelectAnswer,
    ShowResult, ShowRoundRecap, ShowLeaderboard, Finished,
}
```

8 variants. Lives on `GameState.phase` (`state/mod.rs:74`), which lives on `Game.engine` (`rust/server/src/state/game.rs:34`). This is the ONLY field the engine itself gates transitions on (`GameError::InvalidTransition{from,action}`, `state/mod.rs:33`).

### 1.2 `Status` — the wire-level status name (superset of `GamePhase`)

`rust/protocol/src/status.rs:46-71`: 12 variants — `ShowRoom, ShowStart, ShowPrepared, ShowQuestion, SelectAnswer, ShowResult, ShowResponses, ShowRoundRecap, ShowLeaderboard, Finished, Wait, Paused`.

`Status` has **4 members with no `GamePhase` equivalent**: `ShowPrepared`, `ShowResponses` (manager-only reveal view, same underlying phase as `ShowResult`), `Wait` (generic interstitial, e.g. post-join lobby wait, post-answer per-player wait), `Paused` (orthogonal boolean, see §1.4). Explicit code comment confirming this gap: `rust/server/src/socket/manager/game_flow/pacing.rs:165` — *"Note: ShowPrepared/Wait have no GamePhase equivalent in the Rust engine."* These extra states are emitted by the lifecycle driver as transient sub-broadcasts without ever touching `engine.phase`.

`Game::phase_wire_name()` (`rust/server/src/state/game.rs:212-224`) is the canonical `GamePhase → Status` wire-name mapping used for reconnect replay.

### 1.3 Per-phase mapping to the task's conceptual buckets

| Conceptual bucket | `GamePhase` | `Status` wire name(s) | Engine method (file:line) | Notes |
|---|---|---|---|---|
| config | *(none — pre-`Game`)* | — | `registry.create_game()` (`rust/server/src/state/registry.rs:156`) | Game doesn't exist yet; mode selection (`SelectedModes`) is snapshotted into `Game.selected_modes` at create time (`rust/server/src/socket/game.rs:143-151`), immutable for the game's life. |
| lobby | `ShowRoom` | `WAIT` / `SHOW_ROOM` (manager) | `GameState::new()` default (`state/mod.rs:98`) | Players join here (`player:login`); manager sees `ShowRoomData{invite_code,...}`. |
| question-active (announce) | `ShowQuestion` | `SHOW_QUESTION` (preceded by transient `SHOW_PREPARED`) | `GameState::show_question()` (`state/mod.rs:169-210`) | No answer window yet — `SHOW_PREPARED` (`ShowPreparedData`, `status.rs:96-100`) is emitted first, dwells `PREPARED_DWELL_SECS=2s` (`lifecycle/mod.rs:56,126`). |
| answers-locked (open window) | `SelectAnswer` | `SELECT_ANSWER` | `GameState::open_answers()` (`state/mod.rs:212-223`) | Despite the task's bucket name, this is the OPEN window, not a locked one — there is no separate "answers-locked" `GamePhase`; the window closes atomically into `ShowResult` via `reveal()`. |
| reveal/feedback | `ShowResult` | `SHOW_RESULT` (player) / `SHOW_RESPONSES` (manager) | `GameState::reveal()` (`state/mod.rs:294-657`) | Manager-only `SHOW_RESPONSES` is a different wire payload (`ShowResponsesData`, `status.rs:252`) for the SAME `GamePhase::ShowResult`. |
| interlude (per-round awards) | `ShowRoundRecap` | `SHOW_ROUND_RECAP` (manager-only) | **NOT an engine method** — directly mutated: `game.engine.phase = GamePhase::ShowRoundRecap` (`rust/server/src/socket/lifecycle/mod.rs:356`), then reset back to `ShowResult` at `mod.rs:388` so `leaderboard_view()`'s own guard is satisfied. | Skipped when `temp_round_recap` is empty or it's the last round (`mod.rs:343-347`). |
| leaderboard/interlude | `ShowLeaderboard` | `SHOW_LEADERBOARD` | `GameState::leaderboard_view()` (`state/mod.rs:659-698`) | Last-round shortcut: jumps straight to `Finished` inside this same call (`state/mod.rs:684-689`), skipping the leaderboard screen entirely. |
| ended | `Finished` | `FINISHED` | `GameState::next_or_finish()` (`state/mod.rs:700-716`) or the leaderboard last-round shortcut above | Terminal — `finish_and_broadcast()` persists + emits personalized recap per player (`lifecycle/mod.rs:507-603`). |
| disconnected | *(orthogonal, not a phase)* | — | `Player.connected: bool` (`rust/server/src/state/game.rs` via `razzoozle_protocol::player::Player`), flipped by `mark_player_disconnected()` (`rust/server/src/state/eviction.rs:131-183`) | Per-player flag, independent of `GamePhase`. See §4. |
| reconnecting | *(orthogonal, event-driven)* | — | `player:reconnect` handler (`rust/server/src/socket/player/session.rs:163-325`), `manager:reconnect` handler (`rust/server/src/socket/manager/auth.rs:44-173`) | Not a phase; a recovery event handled from whatever phase the game is already in. |
| error | *(orthogonal, terminal-per-connection)* | `game:reset` emissions | Multiple `RESET` emit sites — see §5.4 | Not a phase; an event telling ONE client to give up and navigate home. |
| PAUSED | *(orthogonal boolean over 3 phases)* | `PAUSED` | `Game.paused: bool` + `Game.paused_state: Option<(Status, Value)>` (`rust/server/src/state/game.rs:67-70`) | See §1.4. |

### 1.4 `PAUSED` — orthogonal flag, not a `GamePhase` member

`Game.paused` (`state/game.rs:68`) and `Game.paused_state` (`state/game.rs:70`) live beside `engine.phase`, not inside it. Pausable-phase whitelist (`rust/server/src/socket/manager/game_flow/pacing.rs:250-255`):

```rust
let is_pausable = matches!(game.engine.phase,
    GamePhase::ShowLeaderboard | GamePhase::ShowStart | GamePhase::ShowRoom);
```

Pause is rejected outside this whitelist (`pacing.rs:257-263`, silent no-op + log) and rejected if already paused (`pacing.rs:244-247`). `pause_resume: Arc<Notify>` (`game.rs:97`) wakes any dwell loop; every dwell path calls `wait_while_paused()` FIRST (`rust/server/src/socket/lifecycle/timing.rs:32-43`, invoked from `dwell_auto_or_manual` at `timing.rs:52-53`) — so a pause mid-cooldown is honored at the next dwell boundary, not instantly mid-countdown (the SELECT_ANSWER countdown itself is NOT in the pausable set).

### 1.5 Solo's client-only phase (for contrast — see §3 for full analysis)

`packages/web/src/features/game/stores/solo.ts:46-53`:

```ts
export type SoloPhase =
  | "idle" | "loading" | "name" | "question"
  | "answering" | "result" | "finished"
```

7 variants, zero overlap in name or semantics with `GamePhase`/`Status`. Owned entirely by a Zustand store (`solo.ts`), no server type exists for it at all — `rust/server/src/http/solo.rs` has no phase/status field in any of its request/response structs (checked: `SoloQuestion`, and the check-answer/score-submit structs further down the file carry only question data + score, never a phase).

---

## 2. Transition table (engine `GamePhase`, multiplayer only)

All engine transitions are phase-guarded: every method in `rust/engine/src/state/mod.rs` starts with `if self.phase != X { return Err(GameError::InvalidTransition{from,action}) }` (or a `matches!` allow-list for the two-source transitions). A rejected transition is a **silent `Err`** the caller must handle — most callers `warn!` + stop the lifecycle task rather than panicking (see `lifecycle/mod.rs:88-95`, `405-414`, `490-497`).

| # | From | Event (server trigger) | To | Guard (file:line) |
|---|---|---|---|---|
| 1 | `ShowRoom` | `manager:startGame` → `GameState::start()` | `ShowStart` | phase == `ShowRoom` else `InvalidTransition`; `!players.is_empty()` else `GameError::NoPlayers` (`state/mod.rs:148-157`). Handler-level: `is_game_host` ownership + `manager_socket_id` match (`game_flow/mod.rs:61-77`). |
| 2 | `ShowStart` / `ShowLeaderboard` | lifecycle `open_question()` after 3-2-1 intro (fresh start) or immediately (advance) → `GameState::show_question(idx)` | `ShowQuestion` | phase ∈ `{ShowStart, ShowLeaderboard}` else `InvalidTransition`; `question_index < quiz.questions.len()` else `InvalidQuestionIndex` (`state/mod.rs:169-186`). Idempotency fast-path: if already `ShowQuestion` at this exact index, re-transition is skipped, cached data is reused instead (`lifecycle/mod.rs:81-96`) — avoids the double-call-after-`next_or_finish()` self-rejection bug documented inline. |
| 3 | `ShowQuestion` | lifecycle, after `SHOW_PREPARED` + 2s dwell → `GameState::open_answers()` | `SelectAnswer` | phase == `ShowQuestion` else `InvalidTransition` (`state/mod.rs:212-218`). |
| 4 | `SelectAnswer` | `player:selectedAnswer` → `GameState::record_answer()` | `SelectAnswer` (self-loop) | phase == `SelectAnswer`; player known (`UnknownPlayer`); not already answered — `current_answers.contains_key` (`DuplicateAnswer`, `state/mod.rs:243-247`); per-type payload-shape guards (multi-select needs `answer_keys`, others must NOT carry it; type-answer/sentence-builder need non-empty trimmed text) (`state/mod.rs:249-276`). Handler-level token gate: `answer_token_gate()` (`rust/server/src/socket/player/answer.rs:260-265`). |
| 5 | `SelectAnswer` | cooldown timer elapses (question `time`s) **or** `manager:revealAnswer`/`manager:skipQuestion`/`manager:abortQuiz` (all three call `request_abort(SelectAnswer)`) **or** all-players-answered auto-advance → `GameState::reveal(scoring_mode)` | `ShowResult` | phase == `SelectAnswer` else `InvalidTransition` (`state/mod.rs:294-300`). `reveal()` is idempotent-safe: any racing path that already fired is a phase-guarded no-op (comment at `lifecycle/mod.rs:324-326`). |
| 6a | `ShowResult` | lifecycle direct mutation (not a guarded method) — only when `temp_round_recap` non-empty AND not the last round | `ShowRoundRecap` | Gate is at the call site, not the engine: `!is_last_round && temp_round_recap.is_some() && !empty` (`lifecycle/mod.rs:343-347`); phase set unconditionally at `mod.rs:356`. |
| 6b | `ShowRoundRecap` | lifecycle, after RESULT_DWELL_SECS=6s dwell (or `manager:showLeaderboard` interrupt) | `ShowResult` (reset, so `leaderboard_view()`'s own guard passes) | Direct mutation, `lifecycle/mod.rs:388`. |
| 7 | `ShowResult` | RESULT_DWELL_SECS=6s dwell elapses (or `manager:showLeaderboard` → `request_abort(ShowResult)` / `request_abort(ShowRoundRecap)`) → `GameState::leaderboard_view()` | `ShowLeaderboard` **or** `Finished` (last question) | phase == `ShowResult` else `InvalidTransition` (`state/mod.rs:660-665`); last-round shortcut `current_question_index+1 == quiz.questions.len()` → `Finished` instead of `ShowLeaderboard` (`state/mod.rs:684-689`). |
| 8 | `ShowLeaderboard` | LEADERBOARD_DWELL_SECS=5s dwell elapses (or `manager:nextQuestion` → `request_abort(ShowLeaderboard)`, no-op while `game.paused`) → `GameState::next_or_finish()` | `ShowQuestion` (next idx, via internal `show_question()` call) **or** `Finished` | phase == `ShowLeaderboard` else `InvalidTransition` (`state/mod.rs:701-706`); `next_index >= quiz.questions.len()` → `Finished` (`state/mod.rs:709-712`). |
| 9 | `Finished` | *(terminal)* | — | No engine method accepts this as a starting phase. Game object persists in the registry until `manager:leave` (`LeaveAction::EndNow` → immediate `remove_game`, `rust/server/src/socket/manager/games_list.rs:206-217`), TTL eviction, or `player:login` rejects new joiners with `errors:game.gameEnded` (`rust/server/src/socket/player/login.rs:126-131`). |

Orthogonal, non-phase-changing manager controls (do not appear in the table above because they never touch `engine.phase`):
- `manager:setAuto` — toggles `Game.auto_mode`; if flipped true during `ShowResult`, arms an `AUTO_RESULT_MS=6000`ms auto-advance task with its own pause-honoring loop (`game_flow/mod.rs:230-297`); during `ShowLeaderboard`, immediately fires `request_abort` (`game_flow/mod.rs:298-301`).
- `manager:adjustTimer` — shifts `deadline_ms`/`deadline_instant` in lockstep via `Game::shift_deadline()` (`state/game.rs:275-290`), never changes phase.
- `manager:pauseGame` / `manager:resumeGame` — see §1.4.
- `manager:abortQuiz` — misleadingly named: it does **not** jump to `Finished`. It's identical in effect to `skipQuestion`/`revealAnswer`: `request_abort(SelectAnswer)` only (`game_flow/mod.rs:600`), forcing an early reveal. There is no server-side "kill this game now" transition distinct from `manager:leave`.

---

## 3. Socket.IO event inventory (35+ events, C2S + S2C)

**Wire protocol:** all events use `socket.io-client` v4 (Node.js/browser agnostic), typed at `packages/common/src/types/game/socket.ts`. Event names live in `packages/common/src/constants.ts::EVENTS` object (single source of truth); Rust constants mirror them at `rust/server/src/...` (auto-generated via Codegen for compatibility).

### 3.1 Game lifecycle events (player + manager, status broadcast)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `game:status` | S→C | `{ name: Status, data: StatusDataMap[Status] }` | `broadcast_status()` (`rust/server/src/socket/status_emit.rs`) | The authoritative game-state broadcast. Server sends whenever a phase transition or data-dependent event fires. Clients render components based on this `name`. Contains typed data union per status. |
| `game:successRoom` | S→C | `{ gameId: string, requireIdentifier?: boolean }` | `rust/server/src/socket/player/login.rs:95-105` | Ack after `player:login` succeeds; tells client the joined game ID + whether roster/identifier is required (klassen mode). |
| `game:successJoin` | S→C | `{ gameId: string, playerToken?: string }` | `rust/server/src/socket/player/login.rs:90-95` | Player login success (low-latency only: includes `playerToken` for answer dedup). |
| `game:totalPlayers` | S→C | number | `broadcast_player_count()` (`state/registry.rs:300-312`) | Emitted after each login/leave/disconnect. Updated leaderboard player count. |
| `game:errorMessage` | S→C | string (error key) | Multiple sites: `socket/player/login.rs:128, 132, ...` | Error broadcast to a single player (e.g. game is full, game ended, invalid code). Tells client to show inline error, not navigate away. |
| `game:startCooldown` | S→C | (no payload) | `lifecycle/mod.rs:249-251` | Signals start of 3-2-1 intro (pre-Q1). Player receives, client starts countdown UI. |
| `game:cooldown` | S→C | number (seconds remaining) | `run_cooldown()` (`socket/cooldown.rs:2-48`) | Per-tick countdown update during 3-2-1 or per-question timer. Client renders the number. |
| `game:updateQuestion` | S→C | `{ current: i32, total: i32 }` | `lifecycle/mod.rs:113-118` | "Question N of M" metadata update. Emitted before SHOW_PREPARED dwell. |
| `game:playerAnswer` | S→C | number (answer count) | `reveal_helpers/mod.rs:459-460` (per-player emit) or `status_emit.rs` (broadcast) | Running tally of how many players have answered so far. Low-latency broadcasts on every answer; normal mode broadcasts after reveal. |
| `game:reset` | S→C | string (error key) | Multiple eviction/reconnect sites: `eviction.rs:88, empty_grace.rs:54, player/session.rs:314` | Terminal signal: tells one client the game is unrecoverable (manager gone, game timed out, etc.). Client navigates home. |

### 3.2 Player join/session events

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `player:join` | C→S | `{ gameId: string, playerName: string, pin?: string, [avatar]?, [team]? }` | `rust/server/src/socket/player/login.rs:10-54` | First login for a player (or tab 1 of multi-tab). Creates `Player` entry in `Game.players` if this is the first join or a ghost takeover. Locked/full/ended checks happen here. |
| `player:login` | C→S | `{ gameId: string, playerName: string, [avatar]?, [pin]?, [team]? }` | `rust/server/src/socket/player/login.rs:55-156` | Alias for `player:join` in most code paths (both call the same handler). Distinction historical; modern code treats them identically. |
| `player:reconnect` | C→S | `{ gameId: string, playerToken?: string, [fallback: clientId]? }` | `rust/server/src/socket/player/session.rs:163-325` | Re-establish a player's socket after transport disconnect. Token-gated (secure). Replays last-known game state + answer ack status (low-latency). |
| `player:leave` | C→S | `{ gameId: string }` | `rust/server/src/socket/player/session.rs:9-54` | Intentional disconnect (player clicking "Leave"). Hard-removes from roster if in `ShowRoom`, otherwise marks disconnected. |
| `player:setAvatar` | C→S | `{ gameId: string, avatar: string }` | `rust/server/src/socket/player/session.rs:110-161` | Change avatar mid-game. Broadcast updates to `game:status` + `manager:newPlayer`. |
| `player:selectTeam` | C→S | `{ gameId: string, teamId: string }` | `rust/server/src/socket/player/session.rs:57-107` | Team assignment (team-mode games). Checks roster is modifiable (lobby only?), broadcasts update. |

### 3.3 Answer submission events

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `player:selectedAnswer` | C→S | Variant: `{ answerIndex: i32 }` (single/multi), `{ answerText: string }` (type-answer), `{ answerKeys: [string] }` (multi-select), `{ chunks: [string] }` (sentence-builder), `[responseTime?: i32]`, `[playerToken?: string]`, `[clientMessageId?: string]` | `rust/server/src/socket/player/answer.rs:15-250` | Submit an answer during `SelectAnswer` phase. Answer-token gate checks impersonation (low-latency). Engine records it (or rejects: duplicate, wrong phase, invalid shape). Low-latency emit triggers immediate `player:answerAck`. Server broadcasts `game:playerAnswer` count. |
| `player:answerAck` | S→C | `{ accepted: bool, reason: AnswerAckReason, serverReceivedAtMs: i64, clientMessageId?: string }` | `answer.rs:221-223` (low-latency only) | Ack **sent immediately** after server receives answer (low-latency mode). Tells client whether this answer counted (`ok`) or was rejected (`duplicate`, `too_late`, etc.). Echoes `clientMessageId` for idempotency. |

### 3.4 Clock sync + metrics (low-latency observability)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `clock:ping` | C→S | `{ clientTime: i64, serverTime: i64 }` (client sends both; server ignores client's idea of server time and just echoes back the client time) | `rust/server/src/socket/clock_ping.rs:8-40` | Client-initiated clock sync probe (low-latency mode). Client measures round-trip and computes offset. Sent ~every 5s per low-latency-config. |
| `clock:pong` | S→C | `{ clientTime: i64, serverTime: i64 }` | `clock_ping.rs` emit site | Server ack. Client uses it to compute RTT + offset for metrics. |
| `metrics:report` | C→S | `{ kind: "rtt" \| "clockOffset" \| "answerAck", value: i32 }` | `rust/server/src/socket/metrics.rs:100-230` | Client reports a measured sample (RTT, clock offset, or answer-ack latency). Server rolls it into a per-room buffer (p50/p95 percentiles). |
| `metrics:subscribe` | C→S | `{ gameId: string }` (manager only) | `metrics.rs:232-245` | Manager opts into receiving health snapshots for their game. |
| `metrics:health` | S→C | `MetricsHealthSnapshot` (p50/p95 RTT, p50/p95 clockOffset, p50/p95 answerAck, reconnect count, rejected-reason histogram) | `metrics.rs:246-260` | Server sends health snapshot to subscribed manager ~every 1s (throttled). Feeds manager's low-latency widget. |

### 3.5 Manager authentication + game control

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `manager:auth` | C→S | `{ gameId: string, password: string }` | `rust/server/src/socket/manager/auth.rs:14-42` | (Legacy?) Host authenticates via password. Modern path uses `sessionToken` in socket.io handshake + `manager:reconnect`. |
| `manager:reconnect` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/auth.rs:44-173` | Manager re-establishes socket after transport disconnect. DB session required (`require_user()`). Checks game ownership (`is_game_host`). Reactivates from empty-grace if parked. |
| `manager:logout` | C→S | (no payload) | `rust/server/src/socket/manager/auth.rs:14-42` | Manager leaves (logs out). Fires `games_list.rs` logic to park or end the game (see §4.6). |
| `manager:leave` | C→S | `{ gameId: string }` | `rust/server/src/socket/manager/games_list.rs:153-202` | Manager leaves the game (terminates socket subscription). Triggers LeaveAction logic (see §4.6): `LobbyRemove` / `EndNow` / `Park` based on game phase. |
| `manager:startGame` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/mod.rs:41-148` | Transition `ShowRoom` → `ShowStart` (start 3-2-1 countdown). Spawns the per-game lifecycle task. Phase guard + ownership check. |
| `manager:nextQuestion` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/mod.rs:324-428` | Request transition from `ShowLeaderboard` → next `ShowQuestion`. Calls `request_abort()` to interrupt dwell. Stale-click guard. |
| `manager:skipQuestion` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/mod.rs:430-523` | Early reveal: force `SelectAnswer` → `ShowResult`. Calls `request_abort(SelectAnswer)`. |
| `manager:revealAnswer` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_state.rs:27-71` | Reveal the correct answer (manager-only `SHOW_RESPONSES` view). Same phase-guard as skipQuestion. |
| `manager:abortQuiz` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/mod.rs:525-601` | Abort current question (same effect as skipQuestion: `request_abort(SelectAnswer)`). Misleading name—does NOT end the game. |
| `manager:setAuto` | C→S | `{ gameId: string, hostToken?: string, enabled: bool }` | `rust/server/src/socket/manager/game_flow/mod.rs:149-322` | Toggle auto-advance mode. Arms/cancels auto-advance task. Pause-aware. |
| `manager:pauseGame` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/pacing.rs:168-322` | Pause game. Phase whitelist (`ShowRoom`, `ShowStart`, `ShowLeaderboard`). Sets `Game.paused` + broadcasts `PAUSED` status. |
| `manager:resumeGame` | C→S | `{ gameId: string, hostToken?: string }` | `rust/server/src/socket/manager/game_flow/pacing.rs:324-350` | Resume from pause. Clears `Game.paused`, replays last status, wakes pause_resume notify. |
| `manager:adjustTimer` | C→S | `{ gameId: string, hostToken?: string, deltaSeconds: i32 }` | `rust/server/src/socket/manager/game_flow/pacing.rs:27-166` | Extend/shorten current question's timer. Shifts `deadline_ms` + `deadline_instant` in lockstep. Re-emits `SELECT_ANSWER` with new deadline. |
| `manager:kickPlayer` | C→S | `{ gameId: string, playerId: string, hostToken?: string }` | `rust/server/src/socket/manager/players.rs:19-119` | Remove a player from the game. Removes from roster, broadcasts `manager:removePlayer`. |
| `manager:addBots` | C→S | `{ gameId: string, count: i32, hostToken?: string }` | `rust/server/src/socket/manager/players.rs:121-210` | Add simulated players (testing/demo). Creates bot `Player` entries + schedules answer submissions. |

### 3.6 Broadcast events (manager→all players, status updates)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `manager:statusUpdate` | S→C | (alias for `game:status`) | status_emit.rs | Broadcast to manager-room only (host sees `ShowResponses`, detailed recap). Same transport as player `game:status` but different payload structure. |
| `manager:newPlayer` | S→C | `Player` (partial: `name`, `avatar`, `team`, etc., no token) | `rust/server/src/socket/status_emit.rs:135-150` | Broadcast to manager room when a player joins. Lets host's roster display update in real-time. |
| `manager:removePlayer` | S→C | `{ playerId: string }` | `rust/server/src/socket/status_emit.rs:152-160` | Broadcast to manager room when a player leaves or is kicked. |
| `manager:playerReconnected` | S→C | `{ playerId: string }` | `rust/server/src/socket/status_emit.rs:162-170` | Broadcast to manager room when a disconnected player rejoins (reconnect). |
| `manager:unauthorized` | S→C | `[]` (empty array) | Multiple handlers emit this | Manager receives this if auth fails or hostToken is stale. Client should prompt re-auth. |
| `manager:errorMessage` | S→C | string (error key) | Multiple game_flow handlers | Host receives error (e.g., game already started, invalid state). |

### 3.7 Quiz/catalog management (manager-auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `quizz:get` | C→S | `{ id: string }` | `rust/server/src/socket/manager/quizz.rs:77-124` | Request to load a quiz for editing. Requires auth (`require_user`). |
| `quizz:data` | S→C | `QuizzWithId` | quizz.rs | Server returns full quiz (questions + metadata). |
| `quizz:save` | C→S | `QuizzPayload` (subject, questions, metadata) | `quizz.rs:125-224` | Save a new quiz. DB insert. Auth-gated. |
| `quizz:saveSuccess` | S→C | `{ id: string, subject: string }` | quizz.rs | Ack + return new quiz ID. |
| `quizz:update` | C→S | `{ id: string, ...QuizzPayload }` | `quizz.rs:225-317` | Update an existing quiz. DB update. Auth-gated. |
| `quizz:updateSuccess` | S→C | `{ id: string, subject: string }` | quizz.rs | Ack. |
| `quizz:delete` | C→S | `{ id: string }` | `quizz.rs:318-368` | Delete a quiz. Auth-gated. |
| `quizz:duplicate` | C→S | `{ id: string }` | `quizz.rs:370-449` | Server-side copy: read a quiz, save as new with "(Kopie)" suffix. Returns new ID. |
| `quizz:setArchived` | C→S | `{ id: string, archived: bool }` | `quizz.rs:451-508` | Toggle archive flag. Hides from play list without deleting. |
| `quizz:error` | S→C | string | quizz.rs | Error response (validation, DB, etc.). |
| `catalog:list` | C→S | (no payload) | `rust/server/src/socket/manager/catalog.rs:57-90` | Request list of approved questions in the public question bank. |
| `catalog:data` | S→C | `CatalogEntry[]` | catalog.rs | Returns array of reusable questions. |
| `catalog:add` | C→S | `CatalogEntry` | `catalog.rs:91-173` | Add a question to the catalog. Auth-gated. |
| `catalog:update` | C→S | `{ id: string, ...CatalogEntry }` | `catalog.rs:174-255` | Update a catalog entry. Auth-gated. |
| `catalog:delete` | C→S | `{ id: string }` | `catalog.rs:256-316` | Remove from catalog. Auth-gated. |
| `catalog:error` | S→C | string | catalog.rs | Error response. |

### 3.8 Media management (manager-auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `media:list` | C→S | (no payload) | `rust/server/src/socket/manager/media/mod.rs:63-96` | Request list of uploaded media (images/audio). Auth-gated. |
| `media:data` | S→C | `MediaMeta[]` | media/mod.rs | Returns array of media metadata. |
| `media:upload` | C→S | `{ filename: string, data: string (base64) }` | `media/mod.rs:97-242` | Upload new media. Validates MIME type, size. Stores file. Auth-gated. |
| `media:uploadSuccess` | S→C | `{ url: string, id: string }` | media/mod.rs | Ack + return media URL. |
| `media:delete` | C→S | `{ id: string }` | `media/mod.rs:243-289` | Delete uploaded media. Auth-gated. |
| `media:error` | S→C | string | media/mod.rs | Error response. |

### 3.9 Theme + design customization (manager-auth-gated or partially public)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `manager:getTheme` | C→S | (no payload) | `rust/server/src/socket/manager/public.rs:121-155` | Public: anyone can request a game's theme. No auth required. |
| `manager:theme` | S→C | `Theme` (colors, fonts, assets, skeleton CSS/JS, version) | public.rs | Server returns current theme for the game. |
| `manager:setTheme` | C→S | `{ gameId: string, theme: Theme }` | `rust/server/src/socket/manager/theme/apply.rs:90-152` | Manager sets game's theme. Auth-gated. Persists, broadcasts to game room. |
| `manager:setThemeSuccess` | S→C | (empty or `Theme`) | apply.rs | Ack. Clients re-render with new theme. |
| `manager:uploadBackground` | C→S | `{ filename: string, data: string (base64) }` | `rust/server/src/socket/manager/theme/uploads.rs:236-294` | Upload background image. Validates size, MIME. Auth-gated. |
| `manager:backgroundUploaded` | S→C | `{ url: string }` | uploads.rs | Ack + return background URL. |
| `manager:uploadSound` | C→S | `{ filename: string, data: string (base64) }` | `uploads.rs:295-350` | Upload sound effect. Validates MIME (audio/*). Auth-gated. |
| `manager:soundUploaded` | S→C | `{ url: string }` | uploads.rs | Ack + return sound URL. |
| `manager:themeError` | S→C | string | uploads.rs / apply.rs | Error response (validation, storage, etc.). |
| `manager:setSkeletonAsset` | C→S | `{ assetType: "css" \| "js", content: string }` | `rust/server/src/socket/manager/theme/skeleton.rs:102-214` | Manager edits custom CSS or JS overlay (skeleton). Auth-gated. Persists, toggles enabled flag, bumps skeletonVersion. |
| `manager:setSkeletonAssetSuccess` | S→C | (empty or updated `Theme`) | skeleton.rs | Ack. |
| `manager:resetSkeleton` | C→S | `{ gameId: string }` | `skeleton.rs:216-263` | Discard skeleton edits, revert to bundled default. Auth-gated. Snapshots prior theme to revision ring first. |
| `manager:resetSkeletonSuccess` | S→C | (empty or default `Theme`) | skeleton.rs | Ack. |
| `themeTemplate:list` | C→S | (no payload) | `rust/server/src/socket/manager/theme_templates.rs:59-86` | Request list of theme templates (presets). Auth-gated. |
| `themeTemplate:data` | S→C | `ThemeTemplate[]` | theme_templates.rs | Returns array of available templates. |
| `themeTemplate:save` | C→S | `{ name: string, theme: Theme }` | `theme_templates.rs:87-192` | Save current theme as a reusable template. Auth-gated. |
| `themeTemplate:saveSuccess` | S→C | `{ id: string, name: string }` | theme_templates.rs | Ack + return template ID. |
| `themeTemplate:delete` | C→S | `{ id: string }` | `theme_templates.rs:193-245` | Delete a template. Auth-gated. |
| `themeRevision:list` | C→S | (no payload) | `theme_templates.rs:247-272` | Request revision history for current game's theme. Auth-gated. |
| `themeRevision:data` | S→C | `ThemeRevision[]` | theme_templates.rs | Returns array of saved theme revisions (timestamps + diffs). |
| `themeRevision:restore` | C→S | `{ revisionId: string }` | `theme_templates.rs:274-322` | Restore theme to a prior revision. Auth-gated. |
| `themeRevision:restoreSuccess` | S→C | `{ theme: Theme }` | theme_templates.rs | Ack + return restored theme. |

### 3.10 AI-assisted question generation (auth-gated or public w/ throttle)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `ai:getSettings` | C→S | (no payload) | `rust/server/src/socket/ai.rs:14-36` | Request current AI provider config (user-level or admin-level). Auth-gated. |
| `ai:settings` | S→C | `AISettingsPublic` (providers list, active provider, keyConfigured flags) | ai.rs | Returns config. API keys are NEVER included (only `keyConfigured` boolean). |
| `ai:setSettings` | C→S | `{ activeProvider: string, ... }` | `ai.rs:37-73` | Update AI settings (switch provider, adjust model params). Auth-gated. |
| `ai:setSettingsSuccess` | S→C | (empty) | ai.rs | Ack. |
| `ai:setKey` | C→S | `{ provider: string, key: string }` | `ai.rs:74-112` | Set API key for a provider. Auth-gated. Server stores in `config/ai-secrets.json` (never echoed back). |
| `ai:testProvider` | C→S | `{ provider: string }` | `ai.rs:113-196` | Connectivity probe for active provider (validate key, quota, etc.). Auth + per-socket throttle. |
| `ai:testResult` | S→C | `AITestResult { success: bool, message?: string }` | ai.rs | Ack with success/failure + reason. |
| `ai:generateQuestion` | C→S | `{ prompt: string, [questionType]?, [provider]? }` | `ai.rs:197-247` | Generate a single question. Auth + per-socket throttle (3 req/min). |
| `ai:questionGenerated` | S→C | `Question` | ai.rs | Server returns generated question (subject, text, answers, etc.). |
| `ai:generateDistractors` | C→S | `{ correctAnswer: string, questionText: string, [count]?, [provider]? }` | `ai.rs:248-300` | Generate plausible wrong answers for a given correct answer. Auth + throttle. |
| `ai:distractorsGenerated` | S→C | `{ distractors: string[] }` | ai.rs | Returns array of generated distractor strings. |
| `ai:generateQuiz` | C→S | `{ subject: string, [count]?, [provider]? }` | `ai.rs:301-346` | Bulk-generate a full quiz. Auth + throttle. |
| `ai:quizGenerated` | S→C | `Quizz` | ai.rs | Returns full quiz (subject + question array). |
| `ai:error` | S→C | string (error key or message) | ai.rs | Error response (rate-limited, provider down, invalid key, etc.). |

### 3.11 Results + leaderboard persistence (public or auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `results:get` | C→S | `{ resultId: string }` | `rust/server/src/socket/results.rs:62-94` | Authenticated player/manager: fetch full result (questions included). Auth-gated. |
| `results:data` | S→C | `GameResult` (questions, player answers, scores, achievements) | results.rs | Returns full result record. |
| `results:getShared` | C→S | `{ resultId: string }` | `results.rs:23-61` | Public (no auth): fetch a shareable result. Questions are STRIPPED (only answers/scores visible). |
| `results:sharedData` | S→C | `SharedResult` (no `questions` field) | results.rs | Returns public result summary. |
| `results:delete` | C→S | `{ resultId: string }` | `results.rs:95-138` | Delete a result. Owner-only or admin. Auth-gated. |

### 3.12 Submissions moderation (admin-auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `manager:listSubmissions` | C→S | `{ [filter]? }` | `rust/server/src/socket/manager/submissions.rs:26-53` | Admin: request pending question submissions. Auth-gated (admin only). |
| `manager:submissionsData` | S→C | `Submission[]` | submissions.rs | Returns array of submitted questions (pending approval). |
| `manager:editSubmission` | C→S | `{ submissionId: string, ...fields }` | `submissions.rs:54-133` | Admin: edit a submission (e.g., fix text before approving). Auth-gated. |
| `manager:approveSubmission` | C→S | `{ submissionId: string }` | `submissions.rs:134-293` | Admin: approve a submission (moves to catalog). Auth-gated. Triggers `catalog:data` broadcast. |
| `manager:rejectSubmission` | C→S | `{ submissionId: string }` | `submissions.rs:295-357` | Admin: reject a submission (deletes it). Auth-gated. |
| `manager:submitQuestion` | C→S | `{ subject: string, answers: [...], [metadata]? }` | `rust/server/src/socket/manager/public.rs:156-176` | Public (no auth): submit a question to the moderation queue. Public throttle (hard-capped). |
| `manager:submitSuccess` | S→C | (empty) | public.rs | Ack: your submission is pending review. |
| `manager:submissionError` | S→C | string (error key) | submissions.rs / public.rs | Error response. |

### 3.13 Plugin system (manager-auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `manager:pluginConfig` | S→C | `InstalledPlugin[]` | `rust/server/src/socket/manager/plugins.rs` (periodic broadcast) | Server broadcasts list of installed plugins for the game (name, version, config schema). Emitted on `manager:reconnect` or after install/remove. |
| `manager:pluginInstall` | C→S | `{ name: string, data: string (base64 ZIP) }` | `plugins.rs:335-424` | Manager installs a plugin. Data is a base64-encoded ZIP. Validates manifest, extracts, stores. Auth-gated. |
| `manager:pluginRemove` | C→S | `{ id: string }` | `plugins.rs:426-483` | Remove an installed plugin. Auth-gated. |
| `manager:pluginSetConfig` | C→S | `{ id: string, config: Record<string, any> }` | `plugins.rs:485-533` | Update plugin-specific config. Auth-gated. |
| `manager:errorMessage` | S→C | string (error from plugin ops) | plugins.rs | Error response (invalid ZIP, missing manifest, etc.). |

### 3.14 Klassen roster management (teacher/manager-auth-gated)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `class:list` | C→S | (no payload) | `rust/server/src/socket/manager/classes.rs:49-75` | Request list of classes owned by current user. Auth-gated (`require_user`). |
| `class:data` | S→C | `Class[]` | classes.rs | Returns array of classes (id, name, student count, createdAt). |
| `class:create` | C→S | `{ name: string }` | `classes.rs:76-119` | Create a new class. Auth-gated. |
| `class:createSuccess` | S→C | `{ id: number, name: string, ... }` | classes.rs | Ack + return new class. |
| `class:update` | C→S | `{ id: number, name: string }` | `classes.rs:120-174` | Rename a class. Auth-gated (owner only). |
| `class:updateSuccess` | S→C | (empty or updated `Class`) | classes.rs | Ack. |
| `class:delete` | C→S | `{ id: number }` | `classes.rs:175-223` | Delete a class + orphan its students (or reassign?). Auth-gated (owner only). |
| `class:deleteSuccess` | S→C | (empty) | classes.rs | Ack. |
| `class:addStudent` | C→S | `{ classId: number, studentId: number }` | `classes.rs:225-289` | Enroll a student in a class. Auth-gated (owner of class + student). |
| `class:studentAdded` | S→C | `{ classId: number, studentId: number, joinedAt: string }` | classes.rs | Ack + return join timestamp. |
| `class:removeStudent` | C→S | `{ classId: number, studentId: number }` | `classes.rs:290-327` | Remove a student from a class. Auth-gated. |
| `class:studentRemoved` | S→C | `{ classId: number, studentId: number }` | classes.rs | Ack. |
| `class:moveStudent` | C→S | `{ studentId: number, classId: number }` | `classes.rs:443-511` | Enroll a student in an ADDITIONAL class (idempotent add, not replace). Auth-gated. |
| `class:studentMoved` | S→C | `{ studentId: number, classId: number, joinedAt: string }` | classes.rs | Ack. |
| `class:removeFromClass` | C→S | `{ studentId: number, classId: number }` | `classes.rs:513-567` | Remove from ONE class. If last class, orphan-delete student. Auth-gated. |
| `class:removedFromClass` | S→C | `{ studentId: number, classId: number, studentDeleted: bool }` | classes.rs | Ack + whether student was deleted. |
| `class:updateStudent` | C→S | `{ id: number, displayName?: string, firstName?: string, lastName?: string, birthdate?: string, classIds?: [number] }` | `classes.rs:329-411` | Update student metadata + class enrollments. Auth-gated (owner of student + target classes). |
| `class:studentUpdated` | S→C | `{ id: number, displayName: string, firstName?: string, lastName?: string, birthdate?: string, classes: [{id, name}] }` | classes.rs | Ack + return updated student. |
| `class:getStudents` | C→S | `{ classId: number }` | `classes.rs:413-441` | Request student list for a class. Auth-gated (class owner only). |
| `class:studentsData` | S→C | `Student[]` | classes.rs | Returns array of students in the class. |
| `class:listAllStudents` | C→S | (no payload) | `classes.rs:615-650` | Request ALL students owned by current user (across all classes). Auth-gated. |
| `class:allStudentsData` | S→C | `{ students: Student[] }` | classes.rs | Returns array of all user's students. |
| `class:createStudent` | C→S | `{ firstName: string, lastName: string, [classIds]?, [birthdate]? }` | `classes.rs:652-763` | Create a new student + auto-generate 4-emoji PIN. Auth-gated. Optionally enroll into classes. |
| `class:studentCreated` | S→C | `StudentCreatedData { id, displayName, firstName?, lastName?, pin (emoji string), labels (German words), symbols (emoji array), classes, birthdate }` | classes.rs | Ack + return new student with PIN. |
| `class:studentPin` | C→S | `{ studentId: number }` | `classes.rs:765-830` | Request a student's PIN (generates if missing). Auth-gated. |
| `class:studentPinData` | S→C | `{ studentId: number, pin: string, labels: [string], symbols: [string] }` | classes.rs | Returns PIN as emoji string, German labels, emoji symbols. |
| `class:regeneratePin` | C→S | `{ studentId: number }` | `classes.rs:832-879` | Regenerate a student's PIN. Auth-gated. |
| `class:pinRegenerated` | S→C | `{ studentId: number, pin: string, labels: [string], symbols: [string] }` | classes.rs | Returns new PIN. |
| `class:error` | S→C | string (error key) | classes.rs | Error response. |

### 3.15 Display + satellite pairing (W-15 public display feature)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `display:register` | C→S | `{ name: string, [token]? }` | `rust/server/src/socket/display.rs:241-261` | Display/satellite registers itself (e.g., kiosk booting up). Optional token for satellite auth. Creates `DisplayConnection` entry in registry. |
| `display:registered` | S→C | `{ displayId: string }` | display.rs | Ack + return display ID. |
| `display:pair` | C→S | `{ displayId: string, gameId: string }` | `display.rs:263-413` | Pair a display with a running game (start mirroring game status). Validates game exists, display auth. |
| `display:pairSuccess` | S→C | `{ gameId: string, status: Status & data }` | display.rs | Ack + return current game status (display starts rendering). |
| `display:pairError` | S→C | string (error key) | display.rs | Error response (game not found, auth failed, etc.). |
| `display:status` | S→C | `{ gameId: string, status: Status & data }` | display.rs (broadcast when game state changes) | Server broadcasts game status to all paired displays. Displays mirror the current screen in real-time. |
| `display:ping` | C→S | (no payload) | `display.rs:415-452` | Display heartbeat (keep-alive). |
| `display:disconnect` | C→S | `{ displayId: string }` | `display.rs:454-476` | Display unpairs/goes offline. Removes from registry. |

### 3.16 User-level AI credentials (per-user external keys, not admin/global)

| Event | Direction | Payload Type | Handler (Rust) | Notes |
|---|---|---|---|---|
| `user:setAiKey` | C→S | `{ provider: string, key: string }` | `rust/server/src/socket/manager/user_ai.rs:21-68` | User sets their own API key for a text-generation provider (e.g., OpenAI for personal use). Auth-gated (`require_user`). Stored per-user DB record. |
| `user:getAiKeyStatus` | C→S | (no payload) | `user_ai.rs:70-109` | Request which providers have keys configured (user's own). Auth-gated. |
| `user:aiKeyStatus` | S→C | `Record<providerId, bool>` (e.g., `{ "openai": true, "anthropic": false }`) | user_ai.rs | Returns key-configured status per provider. Keys are NEVER echoed back. |
| `user:deleteAiKey` | C→S | `{ provider: string }` | `user_ai.rs:111-156` | User deletes their stored key for a provider. Auth-gated. |
| `user:listExternalProviders` | C→S | (no payload) | `user_ai.rs:158-209` | Request list of EXTERNAL-only text providers (filters out local Ollama). Auth-gated. |
| `user:externalProviders` | S→C | `AIProviderConfig[]` | user_ai.rs | Returns array of external text-gen providers available. |

---

## 4. Reconnect / eviction / empty-grace rules

### 4.1 Player reconnect (`player:reconnect`)

Handler: `rust/server/src/socket/player/session.rs:163-325`.

- Lookup priority: **token-based** (`player_token` exact match, secure) first; falls back to **client_id-based** lookup only if no token was supplied (`session.rs:197-203`).
- Anti-spoof: if the client_id-matched player already has a minted token that does NOT match the supplied one (or none supplied), the match is rejected regardless of which lookup path found it (`session.rs:213-219`).
- On success: re-indexes `socket_id → game_id` (`registry.deindex_player_socket` + `index_player_socket`, `session.rs:274-278`), rejoins the socket.io room, replays `game.manager_reconnect_status()` (last broadcast status or a phase-derived fallback — `state/game.rs:226-236`), and — for low-latency games only — reports `already_answered` (`session.rs:257-261`).
- Failure: `game:reset` with `errors:game.playerNotFound` (unmatched) or `errors:game.notFound` (game gone) — `session.rs:314-319`. The client is expected to navigate home, not show an inline error.
- **Note:** `docs/design/p2b-reconnect-spec.md` describes an OLDER design (side-table token map, different line numbers in a pre-split `main.rs`/`state.rs`) that predates the current module split and the `#[serde(skip)]` field-on-`Player` approach actually shipped (`rust/protocol/src/player.rs:26-28`, confirmed no wire leak). Treat that doc as **historical context only** — the code above is current ground truth.

### 4.2 Manager reconnect (`manager:reconnect`)

Handler: `rust/server/src/socket/manager/auth.rs:44-173`.

- Requires a valid DB session (`ctx.require_user()`, `auth.rs:53-61`) — manager reconnect is auth-gated, unlike player reconnect.
- Ownership check via `is_game_host()` (`auth.rs:87-90`); refreshes `game.manager_client_id` to the reconnecting client on success (`auth.rs:100-109`) so ownership survives e.g. a cleared localStorage.
- **Double-manager guard:** rejects with `errors:game.managerAlreadyConnected` if a DIFFERENT manager socket is still resolvable/live (`auth.rs:113-134`) — prevents two host tabs fighting over the same game.
- Pulls the game out of empty-grace on success (`registry.reactivate_game()`, `auth.rs:103-105`, see §4.4).

### 4.3 Player disconnect / lobby-vs-mid-game split

`GameRegistry::mark_player_disconnected()` (`rust/server/src/state/eviction.rs:131-183`):

- **Lobby (`ShowRoom`) + intentional `player:leave`**: hard-remove (`lobby_hard_remove=true`, `eviction.rs:147-156`) — frees the slot.
- **Lobby + transport disconnect** (tab closed/network blip, `eviction.rs:158-163`): KEEP the slot, mark `connected=false` — a grace window so a flaky lobby connection doesn't lose the seat (comment: `session.rs:20-25`, `#83`). A fresh `player:login` from the same `client_id` later displaces this "ghost" row via `Game::take_over_ghost_slot()` (`state/game.rs:318-338`, called from `login.rs:151-155`), ShowRoom-only.
- **Mid-game (any other phase)**: always keep the slot, mark disconnected (`eviction.rs:158-163`) — score/streak survive, resumed by `player:reconnect`.

### 4.4 Empty-grace reaper (manager-less games)

`rust/server/src/state/empty_grace.rs`. Constants (`empty_grace.rs:8-9`):

```rust
const EMPTY_GAME_GRACE_MS: u64 = 300_000; // 5 min — started/in-progress games
const EMPTY_LOBBY_GRACE_MS: u64 = 60_000; // 1 min — host-less lobby
```

- Parked via `mark_game_as_empty()` (idempotent, `empty_grace.rs:13-21`) when a manager leaves a running or leaderboard-parked game (`LeaveAction::Park`, `games_list.rs:218-221` — see §4.6).
- Pulled back out via `reactivate_game()` on manager reconnect (`empty_grace.rs:24-26`).
- Swept every 60s (`main.rs:359-371`, `tokio::time::interval(Duration::from_secs(60))`) by `cleanup_empty_games()` (`empty_grace.rs:29-66`): grace window is `EMPTY_GAME_GRACE_MS` if `engine.phase != ShowRoom` (started) else `EMPTY_LOBBY_GRACE_MS`. Past-grace games get `game:reset "errors:game.managerDisconnected"` broadcast to the room, then `remove_game()`.

### 4.5 Stale-game eviction reaper (TTL, independent of empty-grace)

`rust/server/src/state/eviction.rs:9-97`, constant `GAME_EVICTION_TTL_MS = 300_000` (5 min, `rust/server/src/state/mod.rs:35`), checked via `Game::is_stale()` (`state/game.rs:293-295`, `now - last_activity_ms > TTL`). Swept every 60s (`main.rs:335-353`).

Guard nuance (`#85`, `eviction.rs:14-27`): staleness alone is not enough — a connected lobby player who never triggers an activity-touching event (join/answer/reveal) can go "stale" while perfectly alive. Eviction additionally requires **no connected players AND no live manager socket** (`eviction.rs:61-66`), UNLESS the game is in a running phase (`phase != ShowRoom && phase != Finished`) with an **unresolvable manager socket** — that combination evicts immediately regardless of connected players (`#128`, `eviction.rs:48-60`), broadcasting `game:reset "errors:game.managerDisconnected"` first (`eviction.rs:88-91`).

Both reapers are wrapped in `std::panic::catch_unwind` in `main.rs` (`main.rs:346-350`, `364-367`) so a single panicking tick cannot permanently kill the unsupervised background loop.

### 4.6 Manager `LEAVE` per-phase behavior (`LeaveAction`)

`rust/server/src/socket/manager/games_list.rs:13-23` (enum) + tests at `games_list.rs:233-255`:

| Phase at LEAVE | Action | Effect |
|---|---|---|
| `ShowRoom` | `LobbyRemove` | Game removed immediately (never started, nothing to lose) |
| `Finished` | `EndNow` | `game:reset` broadcast + immediate `remove_game()` (`#W4-2` zombie-game fix, `games_list.rs:206-217`) |
| Any other (`ShowStart`, `ShowQuestion`, `SelectAnswer`, `ShowResult`, `ShowRoundRecap`, `ShowLeaderboard`) | `Park` | `mark_game_as_empty()` — 5-minute grace for the manager to reconnect before the empty-grace reaper (§4.4) tears it down |

### 4.7 Crash-recovery resume (`ResumePlan`)

`rust/server/src/state/snapshot.rs:234-299`. Saved every 5s (`main.rs:241-247`, `save_snapshot`), loaded at boot (`main.rs:230-236`). `resume_plan_from_snapshot()` classifies the RAW (pre-reveal-collapse) snapshot phase:

- Not `started` (still `ShowRoom`) → `None`, nothing to resume.
- Pre-reveal (`SHOW_START`, `SHOW_QUESTION`, `SELECT_ANSWER`) → replay the SAME question index (`start_index = index`, `finish_now = false`) — safe because points weren't applied yet (`snapshot.rs:277-281`).
- Post-reveal (`SHOW_RESULT`, `SHOW_ROUND_RECAP`, `SHOW_LEADERBOARD`) → advance PAST it: `start_index = index + 1`, or `finish_now = true` if that was the last question (`snapshot.rs:282-296`) — prevents double-scoring a question that was already revealed pre-crash.
- `FINISHED` / unknown → `None`.

Separately, `restore_phase()` (`snapshot.rs:90-107`) collapses ANY running phase to `ShowLeaderboard` for the restored `Game.engine.phase` itself (a safe baseline for reconnect replay, independent of what the lifecycle-resume `ResumePlan` above does going forward). Resumed lifecycle tasks are (re-)spawned once per `ResumePlan` after the socket namespace exists (`main.rs:314-327`), via `resume_game_lifecycle()` (`lifecycle/mod.rs:611-644`) — no 3-2-1 intro on resume (`run_intro=false`).

---

## 5. Guards against invalid transitions, double-answer, double-join, stale events

### 5.1 Invalid phase transitions

Every `GameState` mutator is phase-guarded at the top (§2's guard column) and returns `GameError::InvalidTransition{from,action}` (`engine/src/state/mod.rs:33,44-46`) rather than panicking or silently proceeding. Socket handlers that call these either propagate the error to the client (`errors:game.*`) or, for the lifecycle-driven ones, `warn!` + abandon the driver task (`lifecycle/mod.rs:88-95, 405-414, 490-497`) — deliberately loud (comment at `mod.rs:409-412`: a silent return here is what made past driver deaths invisible).

### 5.2 Stale/racing manager controls — `request_abort`'s expected-phase gate

`rust/server/src/socket/lifecycle/timing.rs:14-21`:

```rust
pub fn request_abort(game_ref: &Arc<Mutex<Game>>, expected_phase: GamePhase) -> bool {
    let game = game_ref.lock().unwrap();
    if game.engine.phase != expected_phase { return false; }
    game.signal_abort();
    true
}
```

Every live-control handler (`revealAnswer`, `showLeaderboard`, `nextQuestion`, `skipQuestion`, `abortQuiz`, the auto-advance-arm task) calls this with the phase it expects — a stale click that arrives after the phase already moved on is a silent no-op (logged as such, e.g. `game_flow/mod.rs:405-409`, `game_state.rs:119-127`), never double-fires a transition. Ordering-race protection: the abort `Notify` handle is armed (`Game::arm_abort()`, `state/game.rs:240-244`) BEFORE the phase flip it guards, documented per-callsite (e.g. `lifecycle/mod.rs:311-321` "FIX #9", `393-395`) — arming after would let a `signal_abort()` land on an already-resolved (stale) `Notify` and be lost.

### 5.3 Double-answer

Engine-level, authoritative: `current_answers.contains_key(client_id)` → `GameError::DuplicateAnswer` (`engine/src/state/mod.rs:243-247`), checked inside the same phase-guarded `record_answer()` call — no separate socket-level dedup exists or is needed. Handler-level defense-in-depth: SEC-04 `answer_token_gate()` (`rust/server/src/socket/player/answer.rs:260-265`, unit-tested at `answer.rs:267-290`) rejects an answer whose `playerToken` doesn't match the stored one, preventing a second (impersonating) client from answering on a real player's behalf even before reaching the engine's dedup.

### 5.4 Double-join

- **Engine level** (`Game::add_player`, `state/game.rs:345-379`): rejects a `client_id` already present in `self.players` → `errors:game.playerAlreadyConnected` (`state/game.rs:352-354`) — this is the actual dedup authority.
- **Handler level, ShowRoom-only ghost takeover** (`login.rs:143-155`): a `connected=false` ghost row (left by a lobby transport-disconnect grace, §4.3) is proactively dropped via `take_over_ghost_slot()` BEFORE `add_player()` runs, so a legitimate re-login doesn't collide with the dedup guard above. A `connected=true` match (genuinely two open tabs) is left alone and correctly rejected by `add_player`'s guard.
- **Lock gate**: `join_locked` config is read once per login attempt; rejects NEW joiners (not already-joined reconnect-via-login) while locked (`login.rs:133-141`).
- **Manager double-connect**: see §4.2 (`managerAlreadyConnected` guard, `auth.rs:113-134`) — the equivalent guard for the single-manager-seat side.
- **Capacity**: `MAX_PLAYERS_PER_GAME` (200) checked before `add_player()` (`login.rs:157-162`); `MAX_ACTIVE_GAMES` (100) checked in `create_game()` (`rust/server/src/state/registry.rs:176`, both constants at `rust/server/src/state/mod.rs:23-24`).

### 5.5 Stale/finished-game rejection

`player:login` rejects any join attempt once `engine.phase == GamePhase::Finished` with `errors:game.gameEnded` (`login.rs:126-131`), checked before the ghost-takeover/add_player path — a client that still has an old invite code open cannot join a game that already ended.

### 5.6 Rate limiting (adjacent guard category, not phase-specific)

`rust/server/src/state/rate_limit.rs` — per-key sliding-window counters gate game-create (`GAME_CREATE_RATE_MAX_PER_USER=10/hour`, `state/mod.rs:85-86`, enforced at `socket/game.rs:50-54`), solo REST calls (`SOLO_RATE_MAX_PER_CLIENT=120/min`), auth failures, PIN attempts, and public question submissions — all keyed independently of `GamePhase`, so out of scope for the transition table above but relevant to the "stale events" guard category the task asked about (a client cannot brute-force game-creation or PIN guesses regardless of what phase any given game is in).

---

## 6. Client mirror (`packages/web/src/features/game`)

The client does not run its own state machine for multiplayer — it renders whatever `Status` name the server's `game:status` event carries, via a static lookup table:

`packages/web/src/features/game/utils/constants.ts:26-47`:
- `GAME_STATE_COMPONENTS` (player view): `SELECT_ANSWER→Answers, SHOW_QUESTION→Question, WAIT→Wait, SHOW_START→Start, SHOW_RESULT→Result, SHOW_PREPARED→Prepared, FINISHED→PlayerFinished, PAUSED→Paused`.
- `GAME_STATE_COMPONENTS_MANAGER` (host/presenter view): player map plus `SHOW_ROOM→Room, SHOW_RESPONSES→Responses, SHOW_ROUND_RECAP→RoundRecap, SHOW_LEADERBOARD→Leaderboard`, and overrides `FINISHED→Podium`.
- `MANAGER_SKIP_EVENTS` (`constants.ts:49-57`): maps the CURRENT status to which manager control event a "skip" action should emit (`SHOW_ROOM→startGame, SELECT_ANSWER→abortQuiz, SHOW_RESPONSES→showLeaderboard, SHOW_ROUND_RECAP→showLeaderboard, SHOW_LEADERBOARD→nextQuestion`) — a client-side mirror of the guard table in §2, used purely for UI-affordance (button label/enablement), never trusted as authorization (the server re-checks `is_game_host` + phase independently).

Page-level switch: `packages/web/src/pages/party/$gameId.tsx:176-198` (player) and `packages/web/src/pages/party/manager/$gameId.tsx` (manager) look up `status.name` in the relevant map and render the matched component; `GameWrapper` (`packages/web/src/features/game/components/GameWrapper/GameWrapper.tsx`) is a shared chrome shell (timer, controls, connection state), not itself a state machine.

Solo has an entirely separate render path keyed off its own `SoloPhase` (§1.5, §3) — no shared component map with the multiplayer states above.

---

## 7. Open items for later docs (not resolved here, flagged for the adjudicator)

- Doc 21 (modularization plan) should explicitly decide whether solo's phase handling stays a from-scratch client store (current state) or gets any shared abstraction with `GamePhase` — see §3's recommendation.
- Doc 09 (error/reconnect behaviour) should own the full `game:reset` reason-string catalog; this doc only enumerates the reset SITES relevant to phase/reconnect guards (§4.1, §4.4, §4.5, §5.5), not the complete list.
- Doc 20 (full event inventory) is authoritative for every event name; this doc cites only the subset needed to justify a transition or guard.
