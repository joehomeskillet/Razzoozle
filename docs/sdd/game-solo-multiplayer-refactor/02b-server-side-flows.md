# Server-Side Game Flows: Socket.IO Event Chains

**Focus**: Rust server socket handlers, state mutations, broadcasts per flow
**Date**: 2026-07-18
**Source**: `rust/server/src/socket/*`, protocol: `packages/common/src/types/game/socket.ts`

---

## Overview: Lifecycle Ownership Pattern

The Rust server uses a **single long-lived game-lifecycle task per game** (`socket/lifecycle/mod.rs:run_game_lifecycle()`) that owns all phase transitions (Q1 → Q2 → ... → Finished). Handlers do not emit status themselves; they only signal the lifecycle loop via `request_abort()` to interrupt waits.

**Why?** Prevents races between `MANAGER.NEXT_QUESTION`, `MANAGER.SKIP_QUESTION`, "all players answered" signal, and timer-expiry — all compete to advance to the next phase. Single loop + phase guards (engine) = atomic transitions.

---

## Flow 1A: Game Creation

### Client Emits
```
Event:    GAME.CREATE
Payload:  { quizzId: string, selectedModes?: { scoring_mode?, team_mode?, klassen?, end_screen? } }
```

### Server Handler
**File**: `rust/server/src/socket/game.rs:register_create()`

```rust
1. require_user() → Verify auth, get owner_user_id (SEC-03 enforcement)
2. Rate-limit check: 10 games/hour per user_id
3. Read global config snapshot:
   - team_mode_avail, low_latency_enabled, scoring_mode, klassen_enabled, etc.
   - low_latency_config (JSON)
4. Validate + snapshot requested modes against availability:
   - scoring_mode: request "speed" or "accuracy" → keep if enabled, else default "Speed"
   - team_mode: request && available → snapshot, else false
   - klassen: request && enabled → snapshot, else false
   - end_screen: request → validate against CSV allow-list, else fallback to first allowed
5. Fetch achievements config from DB
6. registry.create_game(socket_id, quizz_id, client_id, owner_user_id, low_latency, config)
   - Generate 6-char invite_code
   - Allocate game_id (UUID)
   - Create hostToken (v2.0 optional: random secret per game)
   - Create Game struct:
     * engine: Phase = ShowStart
     * players: [] (empty, no players yet)
     * manager_socket_id: socket.id (for ownership checks)
     * selected_modes: snapshot the validated modes
     * low_latency: bool flag from config
7. Within write guard: inject achievements config + randomize_answers + scoring_mode + mode snapshots
```

### State Mutations
- `GameRegistry::games_by_id`: Insert game_id → Arc<Mutex<Game>>
- `GameRegistry::games_by_code`: Insert invite_code → Arc<Mutex<Game>>
- `GameRegistry::games_by_manager_client_id`: Insert client_id → Arc<Mutex<Game>>
- `Game::engine::phase`: ShowStart
- `Game::selected_modes`: Validated snapshot

### Server Broadcasts
```
To manager socket:
  Event: MANAGER.GAME_CREATED
  Payload: { gameId, inviteCode, hostToken? }

To manager socket:
  Event: MANAGER.CONFIG
  Payload: ManagerConfig (full config object)

To manager socket:
  Event: QUIZZ.DATA
  Payload: QuizzWithId (questions, answers, etc.)
```

---

## Flow 1C: Player Joins (Invite Code Validation)

### Client Emits
```
Event:    PLAYER.JOIN
Payload:  invite_code (6-char string)
```

### Server Handler
**File**: `rust/server/src/socket/player/login.rs:register_join()`

```rust
1. Validate invite_code.len() == 6
2. registry.get_game_by_code(invite_code) → game_ref or None
3. If Some(game_ref):
   a. Emit SUCCESS_ROOM to player
   Else:
   b. Emit ERROR_MESSAGE "errors:game.notFound"
```

### Server Broadcasts
```
To player socket:
  Event: GAME.SUCCESS_ROOM
  Payload: { gameId, requireIdentifier?: boolean }
          (requireIdentifier = false today, TODO: parity with Node's live config read)
```

---

## Flow 1D: Player Login (Username Entry)

### Client Emits
```
Event:    PLAYER.LOGIN
Payload:  {
  gameId: string,
  data: {
    username: string,
    avatar?: string (data URL or asset ID),
    identifier?: string (free-text, optional, for I2 privacy mode)
  }
}
```

### Server Handler
**File**: `rust/server/src/socket/player/login.rs:register_login()`

```rust
1. Validate username (length, chars)
2. Validate avatar if present
3. Extract gameId, look up game in registry
4. Acquire game lock:
   a. Check join_locked:
      - Read once per login from DB (cheaperone-shot lookup)
      - If true AND NOT already-joined → reject with "errors:game.locked"
   b. Check team_mode from game.selected_modes (snapshoted at CREATE)
      - Will be emitted in the personal WAIT status
   c. Check game.engine.phase != Finished
   d. Check player count < MAX_PLAYERS_PER_GAME
   e. Handle ghost takeover (ShowRoom phase + duplicate client_id):
      - Call game.take_over_ghost_slot(client_id) → returns old_socket_id
      - If Some: will emit REMOVE_PLAYER for old one before NEW_PLAYER for fresh one
   f. game.add_player(socket_id, client_id, username, avatar):
      - Generate player.id (UUID)
      - Allocate player_token (JWT for answer SEC-04 validation)
      - Add to players list
      - Return Player object
   g. Index socket → game_id in registry
5. socket.join(game_id) → Add socket to socket.io room
```

### State Mutations
- `Game::players`: Append Player { id, client_id, username, avatar, points=0, player_token, ... }
- `GameRegistry::socket_to_game_index`: Map socket_id → game_id (O(1) lookups for remove/etc.)
- Ghost slot cleanup (if applicable)

### Server Broadcasts
```
To player socket:
  Event: GAME.SUCCESS_JOIN
  Payload: { gameId, playerToken }
          (Token persisted in client localStorage: player_token:<gameId>)

To player socket (personal, NOT broadcast):
  Event: GAME.STATUS
  Payload: { name: "Wait", data: { text, team_mode? } }
          (team_mode from game.selected_modes, used to show/hide team picker UI)

To all in room (players + manager + displays):
  Event: GAME.TOTAL_PLAYERS
  Payload: count (integer, total current player count)

To manager socket (direct, not room):
  Event: MANAGER.NEW_PLAYER
  Payload: Player { id, username, avatar, points, team_id?, ... }
```

---

## Flow 1E: Game Start

### Client Emits (Manager)
```
Event:    MANAGER.START_GAME
Payload:  { gameId, hostToken? }
```

### Server Handler
**File**: `rust/server/src/socket/manager/game_flow/mod.rs:register_start_game()`

```rust
1. Ownership checks:
   a. manager_socket_id == socket.id
   b. is_game_host(game, payload, client_id, user) validates clientId + hostToken
2. game.engine.start() → Transition ShowStart → ShowLeaderboard
   - Returns StartData { countsTowardStats, roundsInGame, ... }
3. Emit SHOW_START status to room
4. Spawn long-lived lifecycle task:
   tokio::spawn(lifecycle::run_game_lifecycle(io, registry, game_id, db_pool))
   - Waits 3 seconds (INTRO_COOLDOWN_SECS)
   - Enters main game loop: for each question, call open_question()
   - Loop owns all phase transitions until Finished
```

### State Mutations
- `Game::engine::phase`: ShowStart → (lifecycle loop progresses this)

### Server Broadcasts
```
To all in room:
  Event: GAME.STATUS
  Payload: { name: "ShowStart", data: StartData }
```

---

## Flow 1F: Question Open (Lifecycle Loop)

### Context
**File**: `rust/server/src/socket/lifecycle/mod.rs:open_question()`

This is called once per question from the single lifecycle task. Runs the full state machine for a question: prepare → show → answer collection → reveal → leaderboard.

```rust
async fn open_question(io, game_ref, game_id, index) {
  1. Transition engine: ShowQuestion(index)
      - Returns ShowQuestionData (text, media, answers, etc.)
      - Guard: only accepts from ShowStart/ShowLeaderboard
      
  2. Emit UPDATE_QUESTION
     Broadcast to room: { current, total }
     
  3. Emit SHOW_PREPARED
     Broadcast to room: { totalAnswers, questionNumber, questionType }
     (2-sec dwell on "Question N of M" screen)
     
  4. Emit SHOW_QUESTION
     Broadcast to room: ShowQuestionData
     Call plugin lifecycle: onQuestionShown
     
  5. Transition engine: open_answers() → Phase = SelectAnswer
  
  6. Calculate deadline_ms = server_now_ms + question.time * 1000
     Store in game.deadline_ms + game.deadline_instant
     
  7. Emit SELECT_ANSWER
     Broadcast to room: {
       question,
       deadline_ms,
       server_seq? (low-latency only),
       shuffledChunks? (sentence-builder only)
     }
     
  8. Spawn bot manager (if any bots in game)
  
  9. Return to main loop
}
```

### State Mutations
- `Game::engine::phase`: SelectAnswer
- `Game::deadline_ms`, `Game::deadline_instant`: Set for this question's timer
- `Game::question_start_at_server_ms`: Wall-clock epoch start
- `Game::shuffled_chunks`: For sentence-builder (if applicable)
- `Game::last_show_result_data`: Clear for fresh reveal

### Server Broadcasts
```
To all in room:
  Event: GAME.UPDATE_QUESTION
  Payload: { current: i32, total: i32 }

To all in room:
  Event: GAME.STATUS
  Payload: { name: "ShowPrepared", data: { totalAnswers, questionNumber, questionType } }
  
To all in room:
  Event: GAME.STATUS
  Payload: { name: "ShowQuestion", data: ShowQuestionData }
  
To all in room:
  Event: GAME.STATUS
  Payload: { name: "SelectAnswer", data: SelectAnswerData }
```

---

## Flow 1G: Answer Submission

### Client Emits (Player)
```
Event:    PLAYER.SELECTED_ANSWER
Payload:  {
  gameId,
  data: {
    answerKey?: number | null,       // Single-select or null sentinel
    answerKeys?: number[],            // Multiple-select (1-4 items)
    answerText?: string,              // Type-answer (≤400 chars)
    clientMessageId?: string,         // Low-latency dedup id
    playerToken?: string              // SEC-04 answer auth token
  }
}
```

### Server Handler
**File**: `rust/server/src/socket/player/answer.rs:register_selected_answer()`

```rust
1. Validate answer shape:
   a. data object must be non-null
   b. answerKey: optional i64
   c. answerKeys: optional array, 1-4 elements if present
   d. answerText: optional string, ≤400 chars
   
2. Get server timestamp: server_now_ms = SystemTime::now()

3. Find game by game_id, acquire lock:
   a. SEC-04: Token validation
      - Find player by client_id (stored at login)
      - Call answer_token_gate(player.player_token, submitted_token)
      - If mismatch/missing → reject with ERROR_MESSAGE
   b. Set engine clock: game.engine.set_clock_ms(server_now_ms)
      - Engine uses this to calculate response_time_ms
   c. game.engine.record_answer(client_id, answerKey, answerKeys, answerText)
      - Validate answer against question.answers
      - Calculate response_time_ms = server_now_ms - game.question_start_at_server_ms
      - Store in game.engine.answers[client_id]
      - Update player.points if correct (speed/accuracy mode)
      - Return Ok or error (duplicate, too_late, invalid_question, invalid_answer)
   d. game.touch() → Update activity timestamp
   e. Capture low_latency flag for later use
   
4. Handle low_latency coalescing:
   - Set answer_count_push_pending flag
   - Spawn async 50ms throttle to emit PLAYER_ANSWER once
   
5. Check if all players answered:
   - If yes: Call lifecycle::request_abort() → cuts timer short → reveal triggers early

6. Release lock
```

### Low-Latency Mode Only
```
Emit to player socket:
  Event: PLAYER.ANSWER_ACK
  Payload: {
    accepted: boolean,
    reason: "ok" | "duplicate" | "too_late" | "invalid_question" | "invalid_answer",
    serverReceivedAtMs: number,      // Wall-clock timestamp (authoritative scoring clock)
    clientMessageId?: string         // Echo client's idempotent id
  }
```

### State Mutations
- `Game::engine::answers`: HashMap[client_id] = Answer
- `Player::points`: Updated (speed or accuracy mode)
- `Game::answer_count_push_pending`: Throttle flag
- Lifecycle abort signal may be set

### Server Broadcasts
```
To all in room (throttled):
  Event: GAME.PLAYER_ANSWER
  Payload: count (total answers received so far)

To all in room (throttled):
  Event: PLAYER.UPDATE_LEADERBOARD
  Payload: { leaderboard: Player[] }
```

---

## Flow 1H: Reveal (Lifecycle Loop)

### Context
**File**: `rust/server/src/socket/lifecycle/mod.rs`, `socket/reveal_helpers.rs:perform_reveal_and_broadcast()`

After the question timer expires OR all players answered (abort signal), the lifecycle calls:

```rust
1. run_cooldown_with_deadline(deadline_instant or abort flag)
   - Waits until deadline OR abort signal fires
   
2. game.engine.reveal() → Phase = ShowResult
   - Returns RevealData (correctAnswers, explanation, etc.)
   
3. perform_reveal_and_broadcast(io, game_ref, game_id):
   a. Emit SHOW_RESULT status
   b. Unlock hidden answer explanations in the engine
   c. Emit to displays (satellite, beamer, etc.)
   d. Call plugin lifecycle: onAnswersRevealed
   
4. Dwell on result screen: sleep(RESULT_DWELL_SECS = 6)
```

### State Mutations
- `Game::engine::phase`: ShowResult

### Server Broadcasts
```
To all in room:
  Event: GAME.STATUS
  Payload: { name: "ShowResult", data: RevealData }

To displays (if subscribed):
  Event: proprietary display updates
  
Plugin lifecycle:
  Event: onAnswersRevealed
```

---

## Flow 1I: Leaderboard (Lifecycle Loop)

```rust
1. game.engine.show_leaderboard() → Phase = ShowLeaderboard
   - Re-ranks players by points
   - Returns LeaderboardData
   
2. Emit SHOW_LEADERBOARD to room

3. Dwell on leaderboard: sleep(LEADERBOARD_DWELL_SECS = 5)

4. Check if more questions:
   a. game.engine.next_or_finish()
      - If more: Transition ShowLeaderboard → ShowQuestion (next index), return true
      - Else: Transition → Finished, return false
   b. If true: Loop back to open_question(index+1)
   c. If false: Break from loop → Finished
```

### State Mutations
- `Game::engine::phase`: ShowLeaderboard → ShowQuestion (next) or Finished

### Server Broadcasts
```
To all in room:
  Event: GAME.STATUS
  Payload: { name: "ShowLeaderboard", data: LeaderboardData }
```

---

## Flow 1K: Game Finish

```rust
1. After last question's leaderboard, next_or_finish() returns false
2. engine.phase = Finished
3. Emit FinishedData (final leaderboard, results_id)
4. Build GameResult record:
   - game_id, quiz_id, players[], answers[], total_time, scoring_mode, team_mode
5. Persist to DB: INSERT INTO game_results (...)
6. Return results_id
```

### State Mutations
- `Game::engine::phase`: Finished
- DB: Persist GameResult

### Server Broadcasts
```
To all in room:
  Event: GAME.STATUS
  Payload: { name: "Finished", data: FinishedData { resultsId, finalLeaderboard } }

To manager socket:
  Event: MANAGER.STATUS_UPDATE
  Payload: { status: "Finished", data: FinishedData }
```

---

## Flow 4: Reconnect — Mid-Game

### Scenario
Network loss mid-game, player reconnects with socket.io auto-reconnect + playerToken

### Client Emits
```
Event:    PLAYER.RECONNECT
Payload:  {
  gameId: string,
  playerToken?: string,         // From localStorage
  lastServerSeq?: number        // Low-latency mode only
}
```

### Server Handler
**File**: `rust/server/src/socket/player/session.rs:register_reconnect()`

```rust
1. Find game by game_id
2. Find player by playerToken (or client_id fallback, pre-SEC-04)
3. Check game not Finished (or allow results-viewing after finish)
4. Determine already-answered flag:
   a. If phase = SelectAnswer:
      - Check if player in game.engine.answers
      - Set alreadyAnswered = true/false
   b. Else: alreadyAnswered = false
5. Get current game status (name + data)
6. Get current question: GameUpdateQuestion { current, total }
7. Update player.socket_id to new socket.id (socket migration)
8. Index new socket in registry
9. socket.join(game_id) → Add to room
```

### State Mutations
- `Player::socket_id`: Updated to new socket.id
- `GameRegistry::socket_to_game_index`: Remap socket

### Server Broadcasts
```
To reconnecting player (direct):
  Event: PLAYER.SUCCESS_RECONNECT
  Payload: {
    gameId,
    status: { name: Status, data: StatusDataMap[Status] },
    player: { username, points },
    currentQuestion: { current, total },
    alreadyAnswered?: boolean      // OPTIONAL; client defaults to false
  }

To manager socket (direct):
  Event: MANAGER.PLAYER_RECONNECTED
  Payload: { id, oldId, username }

To all in room:
  Event: PLAYER.UPDATE_LEADERBOARD
  Payload: { leaderboard: Player[] }
```

---

## Flow 5: Results — Post-Game

### Client Emits
```
Event:    RESULTS.GET
Payload:  results_id (string)
```

### Server Handler
**File**: `rust/server/src/socket/results.rs:register_get_results()`

```rust
1. Query DB: SELECT * FROM game_results WHERE id = results_id
2. Hydrate full GameResult object
3. Emit RESULTS.DATA to requesting socket
```

### Server Broadcasts
```
To requesting socket:
  Event: RESULTS.DATA
  Payload: GameResult {
    id, gameId, quizzId,
    players: [ { id, username, team_id?, points, answers } ],
    startedAt, finishedAt, scoringMode, endScreenMode,
    ...
  }
```

---

## Manager Mid-Game Controls

### MANAGER.PAUSE_GAME
```
Payload: { gameId }
Handler: socket/manager/game_flow/pacing.rs

Action:
1. Ownership check: is_game_host()
2. game.deadline_instant = None (disarm timeout)
3. Emit PAUSED status to room
```

### MANAGER.RESUME_GAME
```
Payload: { gameId }
Handler: socket/manager/game_flow/pacing.rs

Action:
1. Ownership check: is_game_host()
2. Recalculate deadline_instant based on remaining time
3. Lifecycle loop continues (abort wait fires, loop checks pause flag)
```

### MANAGER.SKIP_QUESTION
```
Payload: { gameId }
Handler: socket/manager/game_flow/mod.rs:register_skip_question()

Action:
1. Ownership check: is_game_host()
2. lifecycle::request_abort() → Interrupt current wait (timer or pause)
3. Lifecycle loop transitions to reveal immediately
```

### MANAGER.NEXT_QUESTION
```
Payload: { gameId }
Handler: socket/manager/game_flow/mod.rs:register_next_question()

Action:
1. Ownership check: is_game_host()
2. lifecycle::request_abort() → Interrupt current wait
3. Lifecycle loop advances to next question or finish
```

### MANAGER.SET_AUTO
```
Payload: { gameId, auto: boolean }
Handler: socket/manager/game_flow/mod.rs:register_set_auto()

Action:
1. Ownership check: is_game_host()
2. game.auto_mode = auto
3. If auto && currently in SHOW_RESULT:
   - Arm 6-second auto-advance (AUTO_RESULT_MS)
   - Lifecycle loop responds when timer fires
```

---

## Security Gates (Cross-Flow)

### SEC-03: User Policy (Game Creation)
- `require_user()` → Must have valid session token
- `Rate limiter`: 10 games/hour per user_id
- No anonymous game creation

### SEC-04: Answer Authentication
- Every `SELECTED_ANSWER` checked against `player.player_token`
- player_token is server-minted (JWT) at login
- Blocks answer impersonation (one player submitting for another)

### Ownership Checks (Manager Controls)
- All manager events (START_GAME, SKIP_QUESTION, etc.) verify:
  - `game.manager_socket_id == socket.id` (socket that created game)
  - `is_game_host(game, payload, client_id, user)` (hostToken optional v2.0)

---

## Edge Cases & Gotchas

### Join-Locked Parity
- Rust: Reads `join_locked` from DB **per login** (one-shot)
- Node: Caches at game creation
- **Implication**: Rust live-reads allow toggling lock mid-lobby; Node does not. Verify intent.

### Ghost Slot Takeover (ShowRoom Phase Only)
- If player was marked disconnected earlier but kept slot for grace
- Fresh login in ShowRoom detects duplicate client_id
- `game.take_over_ghost_slot(client_id)` returns old_socket_id
- Emits REMOVE_PLAYER (old) before NEW_PLAYER (fresh)
- **Safety**: Prevents two roster tiles for one human

### Answer Deduplication
- If player submits twice for same question:
  - First answer recorded
  - Second answer rejected with "duplicate" reason
  - Only first answer scores

### All-Players-Answered Signal
- Lifecycle can be interrupted by `request_abort()` when all players answered
- Exact order: timeout vs. all-answered → engine phase guards prevent both
- Reveal fires only once per question

### Low-Latency Mode Coalescing
- PLAYER_ANSWER emits throttled by 50ms window
- Multiple rapid submissions coalesce into one broadcast
- Reduces network chatter but keeps leaderboard fresh

---

## File Cross-Reference (Complete)

### Rust Server Handlers
- `rust/server/src/socket/game.rs` — CREATE, DISCONNECT
- `rust/server/src/socket/player/login.rs` — JOIN, LOGIN
- `rust/server/src/socket/player/answer.rs` — SELECTED_ANSWER
- `rust/server/src/socket/player/session.rs` — LEAVE, RECONNECT, SELECT_TEAM, SET_AVATAR
- `rust/server/src/socket/manager/game_flow/mod.rs` — START_GAME, SET_AUTO, NEXT_QUESTION, SKIP_QUESTION
- `rust/server/src/socket/manager/game_flow/pacing.rs` — PAUSE_GAME, RESUME_GAME, ADJUST_TIMER
- `rust/server/src/socket/lifecycle/mod.rs` — run_game_lifecycle (main loop, open_question, dwell, phase transitions)
- `rust/server/src/socket/reveal_helpers.rs` — perform_reveal_and_broadcast
- `rust/server/src/socket/results.rs` — RESULTS.GET
- `rust/server/src/socket/manager/auth.rs` — MANAGER.AUTH (host login)
- `rust/server/src/socket/display.rs` — DISPLAY.REGISTER, DISPLAY.PAIR
- `rust/server/src/socket/metrics.rs` — METRICS.SUBSCRIBE, METRICS.REPORT (low-latency health)

### TypeScript Client
- `packages/web/src/features/game/contexts/socket-context.tsx` — Socket.io setup
- `packages/web/src/features/game/components/join/{Room,Username}.tsx` — JOIN, LOGIN UI
- `packages/web/src/features/game/components/states/` — Game state renderers (Question, Answers, Result, etc.)
- `packages/web/src/pages/party/$gameId.tsx` — Player live game route
- `packages/web/src/pages/party/manager/$gameId.tsx` — Manager control route
- `packages/web/src/features/results/SharePage.tsx` — RESULTS.GET UI

### Protocol Definitions
- `packages/common/src/types/game/socket.ts` — ClientToServerEvents, ServerToClientEvents (source of truth)
- `packages/common/src/types/game/status.ts` — Status enum, StatusDataMap
- `packages/common/src/constants.ts` — Event name constants (GAME.CREATE, PLAYER.JOIN, etc.)

---

## Next Steps for Verification

- [ ] Confirm identifier hashing (SHA-256) implementation in login handler (currently parsed as `_identifier` but not hashed)
- [ ] Trace low-latency clock-sync handshake (CLOCK.PING/PONG) end-to-end with metrics subscription
- [ ] Verify pause/resume deadline offset recalculation logic
- [ ] Confirm bot answer timing + scoring against engine
- [ ] Map plugin lifecycle event payload contract (onQuestionShown, onAnswersRevealed)
- [ ] Test reconnect with stale `lastServerSeq` (low-latency resume detection)
- [ ] End-to-end smoke tests (Stagehand) for each flow

