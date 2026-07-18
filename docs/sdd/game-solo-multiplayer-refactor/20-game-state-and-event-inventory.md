# 20 — Game State & Event Inventory

**Status:** done (phase-0) · **Owner:** phase0 · **Scope:** socket-event graph + client-state inventory for the active game loop (join → lobby → question → reveal → leaderboard → finish → reconnect), plus the Klassenmodus-join gap this SDD program exists to close.

## 0. Method & Reuse

Base facts reused, not re-derived, from `docs/rust-port-event-inventory.md` (event constants, payload shapes, port-order). This doc corrects three points of drift against that source (Rust is now live, not planned) and adds everything the old doc could not have known: the actual Rust `socket.on(...)` registration sites, the client `features/game` state layer, and the Klassenmodus-join wiring gap. `docs/design/p2b-reconnect-spec.md` and `docs/design/auth-redesign-spec.md` are cited directly where their fixes are now visible in code. `docs/KAHOOT-GAP-ANALYSIS-v2.md` predates the Klassen/team-mode features and has no relevant content for §7; not reused for that reason.

**Corrections vs. `rust-port-event-inventory.md`:**
- `game:successJoin` is **not** a bare string. `rust/protocol/src/game.rs:185-193` (`GameSuccessJoin{gameId, playerToken}`); emitted as an object at `rust/server/src/socket/player/login.rs:209-217`. The old doc's "string (gameId)" row is stale (pre-dates the P2b reconnect-token fix).
- `manager:reconnect` / `manager:successReconnect` now carry ownership enforcement (`is_game_host`, `rust/server/src/socket/manager/auth.rs:85-98`) — closes the "Rust Ownership Gap" flagged as Critical Finding #1 in `docs/design/auth-redesign-spec.md:41-48`.
- Three domains are **new since the old doc** and entirely undocumented there: `class:*` (23 events, Klassen/Schüler admin — `rust/protocol/src/constants.rs:194-238`), `label:*` (7 events, tagging — `constants.rs:277-295`), `user:*` (5 events, per-user AI-key vault — `constants.rs:268-275`). All three are manager-admin CRUD, not part of the active game loop; see §4.

**Method for finding handler sites:** `rtk proxy grep -rn "socket.on(" rust/server/src/socket/` → 103 registrations + 4 in `rust/server/src/media_ai/handlers.rs` (image-gen, still main.rs-wired, not yet migrated into `socket/`) = **107 C2S handlers**, plus the framework's own `connect`/`disconnect`. Client emitter sites: `rtk proxy grep -rn "socket.emit(EVENTS\." packages/web/src` (135 call sites, tallied in §1–§4).

---

## 1. Event Graph — Core Game Loop (`game:`, `player:`, `clock:`, `metrics:`)

**C2S — Client → Server**

| Event | Emitter (client) | Handler (server) | Payload | Phase |
|---|---|---|---|---|
| `game:create` | `packages/web/src/features/manager/components/configurations/ConfigSelectQuizz.tsx:103,108` | `rust/server/src/socket/game.rs:17` | `GameCreate` (untagged: legacy `string` \| `CreateGamePayload{quizzId, selectedModes}`) — `rust/protocol/src/game.rs:44-62` | pre-lobby |
| `player:join` | `packages/web/src/features/game/components/join/Room.tsx:55` | `rust/server/src/socket/player/login.rs:10` (`register_join`) | `string` (6-char invite code) | join |
| `player:login` | `packages/web/src/features/game/components/join/Username.tsx:52` | `rust/server/src/socket/player/login.rs:54` (`register_login`) | `{gameId, data:{username, avatar?, identifier?}}` — server parses ad-hoc `serde_json::Value`, not the typed `PlayerLogin` struct (`game.rs:97-108`) | join |
| `player:reconnect` | `packages/web/src/pages/party/$gameId.tsx:58-62` | `rust/server/src/socket/player/session.rs:164` (`register_reconnect`) | client sends `{gameId, playerToken?, lastServerSeq?}`; **typed `PlayerReconnect` struct has no `playerToken` field** (`game.rs:111-119`) — handler bypasses the type and reads raw JSON (`session.rs:170-178`). See §6 finding D1. | reconnect |
| `player:leave` | `packages/web/src/pages/party/$gameId.tsx:205` (route `onLeave`) | `rust/server/src/socket/player/session.rs:9` (`register_leave`) | `{gameId}` | any |
| `player:selectedAnswer` | `packages/web/src/features/game/components/states/Answers.tsx:244,268,293,322,348,392,419` (one call site per question-type branch: choice/multi/slider/type-answer/sentence-builder/poll/wortarten) | `rust/server/src/socket/player/answer.rs:15` (`register_selected_answer`) | `PlayerSelectedAnswer{gameId, data:{answerKey?, answerKeys?, answerText?, clientMessageId?, playerToken?}}` — SEC-00 frozen contract, `player.rs:213-237` | SELECT_ANSWER |
| `player:setAvatar` | `packages/web/src/features/game/components/join/AvatarPicker.tsx:72` | `rust/server/src/socket/player/session.rs:110` (`register_set_avatar`) | `unknown` (`PlayerSetAvatar = serde_json::Value`) | lobby (WAIT/SHOW_ROOM) |
| `player:selectTeam` | `packages/web/src/features/game/components/states/Wait.tsx:142` | `rust/server/src/socket/player/session.rs:57` (`register_select_team`) | `{teamId}` | lobby (WAIT, team mode) |
| `clock:ping` | `packages/web/src/features/game/contexts/socket-context.tsx:550` (`useClockSync`, burst of 5 on low-latency detect) | `rust/server/src/socket/clock_ping.rs:8` | `{clientSendMonoMs}` | SELECT_ANSWER (low-latency only) |
| `metrics:report` | `socket-context.tsx:487,494` (rtt/clockOffset after sync burst); `states/Answers.tsx:533` (answerAck latency) | `rust/server/src/socket/metrics.rs:100` | `{kind: "rtt"\|"clockOffset"\|"answerAck", value}` | any (low-latency only) |
| `metrics:subscribe` | `features/game/components/LowLatencyHealth.tsx:72,78` | `rust/server/src/socket/metrics.rs:232` | `{gameId?}` | host-only observability widget |

**S2C — Server → Client**

| Event | Emitter (server, canonical) | Handler (client `useEvent`) | Payload | Phase |
|---|---|---|---|---|
| `game:status` | Two shared helpers `broadcast_status`/`send_status_to_manager` (`rust/server/src/socket/status_emit.rs:27,40`) called from ~8 sites (`game_flow/{pacing,mod}.rs`, `player/{login,answer}.rs`, `reveal_helpers.rs:459`); **one outlier bypasses the helper**: `lifecycle/mod.rs:596` emits `GameStatus::Finished` directly | Player: `packages/web/src/pages/party/$gameId.tsx:102`. Manager (shared): `features/game/hooks/useManagerGameSession.ts:45` | `GameStatus` discriminated union (`{name, data}`), 12 variants — `rust/protocol/src/status.rs:401-430` | all |
| `game:successRoom` | `rust/server/src/socket/player/login.rs:40` | `join/Room.tsx:68`, `join/Username.tsx:68` | `GameSuccessRoom{gameId, requireIdentifier?}` — `requireIdentifier` is **hardcoded `Some(false)`** (`login.rs:34`, `// TODO(parity): read from live config file`) | join |
| `game:successJoin` | `rust/server/src/socket/player/login.rs:209-217` | `join/Username.tsx:76` | `GameSuccessJoin{gameId, playerToken?}` (object; see §0 correction) | join |
| `game:totalPlayers` | 7 sites — `manager/players.rs:111,293`, `manager/auth.rs:168`, `player/session.rs:36,311`, `player/login.rs:250`, `game.rs:205` | `states/Room.tsx:112` | `number` | lobby |
| `game:errorMessage` | ~15 sites across `player/{login,answer,session}.rs`, `manager/game_flow/mod.rs:111`, `game.rs:52,167` | `GameWrapper.tsx:89`, `join/Room.tsx:80` | `string` (i18n key) | any |
| `game:startCooldown` | `lifecycle/mod.rs:250` | `states/Start.tsx:29` | (empty) | pre-Q1 intro |
| `game:cooldown` | `lifecycle/mod.rs:258,287`, `manager/game_flow/pacing.rs:150` (ADJUST_TIMER) | `states/Start.tsx:34`, `states/Answers.tsx:485` | `number` | intro + SELECT_ANSWER |
| `game:reset` | `state/eviction.rs:90`, `state/empty_grace.rs:62`, `manager/games_list.rs:140,198,210`, `manager/players.rs:100`, `manager/auth.rs:79,94`, `player/session.rs:315,319` | `useManagerGameSession.ts:88`, `pages/party/$gameId.tsx:141` | `string` (i18n key) | any (terminal) |
| `game:updateQuestion` | `lifecycle/mod.rs:113-118` | `GameWrapper.tsx:82`, `useManagerGameSession.ts:84` | `{current, total}` | SHOW_QUESTION+ |
| `game:playerAnswer` | `player/answer.rs:178,188`, `bot/manager.rs:268` (sim-mode bots) | `states/Answers.tsx:498` | `number` (running answer count) | SELECT_ANSWER |
| `player:successReconnect` | `player/session.rs:297` | `pages/party/$gameId.tsx:74-100` | `PlayerSuccessReconnect{gameId, status, player:{username,points}, currentQuestion, alreadyAnswered?}` — `player.rs:91-103` | reconnect |
| `player:updateLeaderboard` | `player/mod.rs:32-55` (`broadcast_player_update`, called only from avatar/team-change paths, `session.rs:102,156`) | `states/Wait.tsx:58` (`reconcileAvatar`) | `{leaderboard: Player[]}` | lobby only — **not** the SHOW_LEADERBOARD screen data; see §6 finding D2 |
| `player:answerAck` | `player/answer.rs:215` | `states/Answers.tsx:507` | `AnswerAck{accepted, reason, serverReceivedAtMs, clientMessageId?}` (low-latency only) | SELECT_ANSWER |
| `clock:pong` | `clock_ping.rs:55` | `socket-context.tsx:541` (`useClockSync`, internal) | `{clientSendMonoMs, serverNowMs}` | SELECT_ANSWER (low-latency) |
| `metrics:health` | `metrics.rs:218,286` | `LowLatencyHealth.tsx:84` | `MetricsHealthSnapshot` | host observability |

---

## 2. Event Graph — `manager:` (Host) Domain, Game-Loop Subset

Restricted to the events that drive the live game (auth, room lifecycle, pacing, roster). The admin-CRUD manager events (theme/plugins/submissions/games-admin/image-gen) are tallied in §4, not detailed here — they don't touch `GameStatus` or the player-facing loop.

**C2S**

| Event | Emitter (client) | Handler (server) | Payload | Phase |
|---|---|---|---|---|
| `manager:auth` | `pages/satellite/$gameId.tsx:59` (satellite token as password, on `connect`) | **none — no `socket.on(constants::manager::AUTH, ...)` registration exists anywhere in `rust/server/src/`** (confirmed: `rtk proxy grep -rn "constants::manager::AUTH\b" rust/server/src/` → 0 hits; manager password login has moved to HTTP `rust/server/src/http/login.rs`, mints the `sessionToken` `useManagerStore` persists) | `string` (password on the old flow; a satellite token on the only remaining emit site) | pre-session — **dead C2S event**, see §6 finding D8 |
| `manager:reconnect` | `features/game/hooks/useManagerGameSession.ts:61,69` | `manager/auth.rs:45` (`register_reconnect`) | `{gameId, hostToken?}` — `MessageGameId` now carries `host_token` (`manager.rs:22-29`, auth-redesign) | reconnect |
| `manager:leave` | `pages/display/play.tsx:113`, `pages/party/manager/$gameId.tsx:193`, `pages/satellite/$gameId.tsx:82` (route `onLeave`, all 3 manager-session routes) | `manager/games_list.rs:153` | `{gameId}` | any |
| `manager:kickPlayer` | `states/Room.tsx:121` | `manager/players.rs:19` | `{gameId, playerId}` | lobby/game |
| `manager:startGame` | (manager lobby "Start" button, `features/manager`) | `manager/game_flow/mod.rs:41` | `MessageGameId` | SHOW_ROOM → SHOW_START |
| `manager:setAuto` | `GameWrapper.tsx:67` (auto-advance toggle) | `manager/game_flow/mod.rs:149` | `{gameId?, auto}` | any |
| `manager:addBots` | `features/manager/components/SimControl.tsx:55` (sim-mode dev aid) | `manager/players.rs:121` | `{gameId?, count}` | lobby |
| `manager:abortQuiz` | (manager skip-map, `MANAGER_SKIP_EVENTS[SELECT_ANSWER]`, `utils/constants.ts:51`) | `manager/game_flow/mod.rs:525` | `MessageGameId` | SELECT_ANSWER |
| `manager:nextQuestion` | (`MANAGER_SKIP_EVENTS[SHOW_LEADERBOARD]`, `constants.ts:54`) | `manager/game_flow/mod.rs:324` | `MessageGameId` | SHOW_LEADERBOARD |
| `manager:showLeaderboard` | (`MANAGER_SKIP_EVENTS[SHOW_RESPONSES\|SHOW_ROUND_RECAP]`, `constants.ts:52-53`) | `manager/game_state.rs:73` | `MessageGameId` | SHOW_RESPONSES/ROUND_RECAP |
| `manager:skipQuestion` | (manager per-question skip button) | `manager/game_flow/mod.rs:430` | `MessageGameId` | SELECT_ANSWER |
| `manager:adjustTimer` | (manager +/-5s control) | `manager/game_flow/pacing.rs:27` | `{gameId?, deltaSeconds}` | SELECT_ANSWER |
| `manager:revealAnswer` | (manager manual-reveal control) | `manager/game_state.rs:27` | `MessageGameId` | SELECT_ANSWER |
| `manager:pauseGame` | `GameWrapper/RejoinQrDialog.tsx:34` | `manager/game_flow/pacing.rs:168` | `{gameId?}` | any → PAUSED |
| `manager:resumeGame` | `RejoinQrDialog.tsx:37` | `manager/game_flow/pacing.rs:324` | `{gameId?}` | PAUSED → prior |
| `manager:setGameConfig` | `features/manager/.../useOptimisticConfigToggle.ts:55` | `manager/config.rs:48` | `ManagerSetGameConfig{teamMode?, lowLatencyEnabled?, joinLocked?, randomizeAnswers?, scoringMode?, klassenEnabled?, endScreenModes?}` — **`klassenEnabled` is the global admin toggle**, `manager.rs:141-166` | pre-lobby (config panel) |
| `manager:getConfig` | `pages/(auth)/manager/index.tsx:21`, `pages/manager/quizz/layout.tsx:22` | `manager/config.rs:24` | (none) | dashboard mount |
| `manager:logout` | `features/manager/.../configurations/index.tsx:285` | `manager/auth.rs:14` | (none) | any |

**S2C**

| Event | Emitter | Handler (client) | Payload | Phase |
|---|---|---|---|---|
| `manager:successReconnect` | `manager/auth.rs:153-166` | `useManagerGameSession.ts:73-86` | `{gameId, currentQuestion, status, players}` — ad-hoc `serde_json::json!` (not the typed `ManagerSuccessReconnect` struct at `manager.rs:308-315`) | reconnect |
| `manager:config` | `manager/config_helper.rs:90` | (manager dashboard mount) | `ManagerConfig` — carries `klassenEnabled`, `submitToken`, `endScreenModes` (`manager.rs:326-360`) | dashboard |
| `manager:gameCreated` | `game.rs:162` | (`ConfigSelectQuizz.tsx` create flow) | `ManagerGameCreated{gameId, inviteCode, hostToken?}` — `manager.rs:389-398` | pre-lobby |
| `manager:newPlayer` | `player/login.rs:243`, `player/mod.rs:41`, `manager/players.rs:285` | `states/Room.tsx:90` | `Player` (full) | lobby |
| `manager:removePlayer` | `player/session.rs:46`, `player/login.rs:236`, `game.rs:212` | `states/Room.tsx:100`, `GameWrapper.tsx` (indirectly via player-count) | `string` (playerId) | lobby |
| `manager:errorMessage` | `manager/game_flow/mod.rs:111` (+ others) | (manager toast layer) | `string` (i18n key) | any |
| `manager:playerKicked` | `manager/players.rs:106` | `states/Room.tsx:104` | `string` (playerId) | lobby/game |
| `manager:unauthorized` | ~100 sites — every `require_user()`/`require_admin()` guard failure across `manager/*.rs`, `ai.rs`, `results.rs`, `game.rs` | (no client `useEvent` found under `features/game`; auth redirect presumably lives in the auth/session layer outside game feature scope) | (empty array/object, inconsistent shape per site — `json!([])` vs `json!({})` vs `""`) | any (auth gate) |
| `manager:playerReconnected` | `player/session.rs:302` | `GameWrapper.tsx:97`, `states/Room.tsx:108` | `{id, username}` (client destructures `{id, oldId}` in `Room.tsx:108` — **`oldId` is not on the wire struct**, see §6 finding D3) | reconnect |

---

## 3. Status Sub-Machine (`game:status` payload)

Reuse `rust-port-event-inventory.md` §Part 3 wholesale — the 12 `Status` variants and their data shapes are unchanged in substance. Deltas confirmed against current `rust/protocol/src/status.rs`:
- `FinishedData` gained `endScreen: Option<EndScreen>` (`status.rs:377-379`), echoing the host's `full`/`top3`/`private` end-screen choice from `SelectedModes` at create-time (`game.rs:83-91`).
- `PausedData{reason?}` and `ShowRoundRecapData{roundRecap}` confirmed unchanged (`status.rs:392-399`, `320-325`).
- Status → React component mapping is centralized in `packages/web/src/features/game/utils/constants.ts:26-47`: `GAME_STATE_COMPONENTS` (7 states + PAUSED, player-safe subset) is spread into `GAME_STATE_COMPONENTS_MANAGER` (+SHOW_ROOM, SHOW_RESPONSES, SHOW_ROUND_RECAP, SHOW_LEADERBOARD, and an **overridden** FINISHED: `PlayerFinished` for players vs `Podium` for managers, `constants.ts:33` vs `:46`).

---

## 4. Manager Admin/CRUD Surface (out of active-gameplay scope)

Listed for completeness only — none of these touch `GameStatus`, the player route, or the reconnect path. Full field-level detail already lives in `docs/rust-port-event-inventory.md` (`quizz:*`, `catalog:*`, `media:*`, `ai:*`, `theme*:*`, `results:*`, `display:*`, submissions, plugins) and is not re-derived here.

| Domain | Wire prefix | Events | Owning protocol file | Owning client dir |
|---|---|---|---|---|
| Quiz CRUD | `quizz:` | 10 | `rust/protocol/src/quizz.rs` | `features/quizz`, `features/manager/.../quizzes` |
| Question bank | `catalog:` | 7 | `quizz.rs` | `features/manager/.../catalog` |
| Media library | `media:` | 6 | `media_ai.rs` | `features/manager/.../ConfigMedia` |
| AI generation | `ai:` | 14 | `media_ai.rs` | `features/manager/.../ai`, `features/quizz/.../QuestionEditor*` |
| Theme + templates + revisions | `theme:` (via `manager:*theme*`), `themeTemplate:`, `themeRevision:` | 21 | `theme.rs` | `features/manager/.../theme`, `.../ConfigSkeleton` |
| Submissions | `manager:*Submission*` | 9 | `manager.rs` | `features/manager/.../submissions`, `features/submission` |
| Image-gen | `manager:generateImage/editImage/submitUploadImage/enhancePrompt` + 4 S2C | 8 | `media_ai.rs` | `features/quizz/.../useMediaGeneration.ts` |
| Games-admin panel | `manager:listGames/gamesData/endGame` | 3 | `manager.rs` | `features/manager/.../console/RunningGamesSection.tsx` |
| Plugin system | `manager:plugin*` | 4 | `manager.rs` | (config panel) |
| **Klassen/Schüler admin** | `class:` | **23** | *(not yet a typed protocol struct — `classes.rs` handlers parse raw `serde_json::Value`)* | `features/manager/.../klassen`, `.../schueler` (`useClassManager.ts`, `useSchuelerManager.ts`) |
| Labels/tagging | `label:` | 7 | *(untyped, same as class:*)* | `features/manager/.../labels/useLabelManager.ts` |
| Per-user AI keys | `user:` | 5 | *(untyped)* | `features/manager/.../ConfigProfile.tsx` |
| Results | `results:` | 5 | `results_display.rs` | `features/results/SharePage.tsx`, `ConfigResults.tsx` |
| Display/satellite | `display:` | 8 | `results_display.rs` | `states/Room.tsx` (PAIR), `pages/display/*`, `DisplayControl.tsx` |

`class:*`/`label:*`/`user:*` count: **35 events with no typed Rust payload struct** — every handler in `classes.rs`/`labels.rs` parses `Data::<serde_json::Value>` ad-hoc (confirmed via `rtk proxy grep -c "Data::<serde_json::Value>" rust/server/src/socket/manager/classes.rs` → non-zero across all 14 handlers). This is the largest single typing gap in the protocol crate; relevant to §7 because `class:*` is the CRUD backend the Klassenmodus-join feature would need to *read from* at join-time, and it currently has zero test-suite parity guarantees a typed struct would give.

---

## 5. Client-Side State Inventory

All under `packages/web/src/features/game/`, zustand `create()` stores unless noted.

| Store/Context | File | Shape | Consumers | Notes |
|---|---|---|---|---|
| `usePlayerStore` | `stores/player.ts:8-37` | `{gameId, player:{username,points,avatar}, status: Status<StatusDataMap>}` | `pages/party/$gameId.tsx` (sole driver) | Player's own copy of `GameStatus`, set via `setStatus(name,data)` (`player.ts:66`) from both `PLAYER.SUCCESS_RECONNECT` and `GAME.STATUS` handlers |
| `useManagerStore` | `stores/manager.ts:10-53` | `{config, gameId, inviteCode, status, players, password, token, role, username}` | `useManagerGameSession.ts` + all 3 manager-session routes + `GameWrapper.tsx` | **Doubles as the auth store** — `token`/`role`/`username` persisted to `sessionStorage` under `razzoozle_auth_state` (`manager.ts:55-103`), migrated off `localStorage` on read. `reset()` deliberately preserves auth fields, only `logout()` clears them (`manager.ts:161-180`) |
| `useQuestionStore` | `stores/question.ts:4-16` | `{questionStates: GameUpdateQuestion, displayOrder: number[]}` | both player + manager routes | Shared across roles — one store, no role split |
| `useAnswerStore` | `stores/answer.ts:11-36` | `{gameId, alreadyAnswered, submittedChunks?}` | `pages/party/$gameId.tsx` (bridges `SUCCESS_RECONNECT.alreadyAnswered` → Answers component), `states/Answers.tsx` | Player-only; keyed by `gameId` to guard cross-game leakage per its own comment (`answer.ts:8`) |
| `useLowLatencyStore` | `stores/lowLatency.ts:15-55` | `{active, offsetMs, rttMs, synced}` | `useClockSync()`, `LowLatencyHealth.tsx` | `active` is **sticky-latch** (never flips back false, `lowLatency.ts:43-44`) — detected purely from the presence of server-timing fields on `SELECT_ANSWER`, never a server-sent boolean |
| `useHapticsStore` | `stores/haptics.ts:28-41` | `{enabled}` | (device vibration feedback) | localStorage-only, no socket involvement |
| `useSoundStore` | `stores/sound.ts:25-38` | `{muted}` | (SFX mute toggle) | Structural twin of `useHapticsStore` — see §6 finding D4 |
| `useSoloStore` | `stores/solo.ts:71-111` | `{quizzId, phase: SoloPhase, questions, currentIndex, playerName, totalPoints, streak, lastResult, lastAchievements, answers, leaderboard, autoAdvance}` | Solo-only screens (`components/solo/*`) | **REST-only, zero socket usage** — own phase FSM (`idle→loading→name→question→answering→result→finished`, `solo.ts:46-53`) that shadows `GameStatus` without sharing any code with it. See §6 finding D5. |
| `SocketProvider`/`useSocket`/`useEvent` | `contexts/socket-context.tsx:87-414` | `{socket, isConnected, clientId, connect, disconnect, reconnect}` | app-wide | Owns: durable `clientId` (localStorage + 1yr cookie dual-write, `:112-126`), backend A/B pin (`rust.*`/`node.*` hostname → `:_rust/socket.io/` vs `/ws`, `:133-160`), connect/disconnect toast debounce (3-strike threshold, `:210,249-267`), page-visibility/online/pageshow-driven forced reconnect for mobile lock-screen WS zombies (`:309-339`) |
| `useClockSync` | `contexts/socket-context.tsx:436-577` | (no store; local refs) | `pages/party/$gameId.tsx:37` | Runs a 5-ping burst on low-latency detect, publishes into `useLowLatencyStore`, never persists |
| Route-local `useState`/refs | `pages/party/$gameId.tsx` | `endedMessage`, `lastServerSeqRef`, `reconnectTimeoutRef` | player route only | **No corresponding hook** — see §6 finding D6 |
| Route-local `useState` | `pages/party/manager/$gameId.tsx`, `pages/satellite/$gameId.tsx`, `pages/display/play.tsx` | role-specific UI toggles only | 3 manager-session routes | Shared logic already extracted into `useManagerGameSession` (§6 — the correctly-factored counterpart to D6) |
| URL state | TanStack Router | `/party/$gameId`, `pin` search param on `/(auth)/` (`join/Room.tsx:27`, auto-joins on mount `:85-92`), `?satellite=true&token=` (`socket-context.tsx:52-70`, stripped from history after read) | — | Invite-code deep-link (`?pin=`) and satellite kiosk boot are the two URL-driven join paths |
| Optimistic updates | `stores/manager.ts:120-132` (`patchQuizzLabels`) | patches `config.quizz[].labelIds` in place on `label:assigned` ack, ahead of the next full `manager:config` refresh | quiz-list label chips | Only confirmed optimistic-update pattern in the game feature tree |
| Timer state | Server-authoritative, no client store | `SelectAnswerData.{serverSeq, serverNowMs, questionStartAtServerMs, answerDeadlineAtServerMs}` (low-latency) rendered via `CircularTimer.tsx` + `useLowLatencyStore.offsetMs` | `states/Answers.tsx`, `CircularTimer.tsx` | Normal mode: `game:cooldown` tick count only, no client clock math |

---

## 6. Duplicate / Overlapping Handlers & Multiple State Mappings

**D1 — `player:reconnect` typed contract is stale (protocol drift).**
Client sends `playerToken` (`pages/party/$gameId.tsx:58-62`); the typed `PlayerReconnect` struct doesn't have that field (`rust/protocol/src/game.rs:111-119`); the handler silently works around it by parsing raw JSON (`rust/server/src/socket/player/session.rs:170,178`). Contrast with `player:selectedAnswer`, which got exactly this treatment (SEC-00 "Contract Freeze", `player.rs:210-237`) after being found the same way. `PlayerReconnect` needs the same freeze.

**D2 — Two different "leaderboard" channels with overlapping names.**
`player:updateLeaderboard` (`player/mod.rs:32-55`) fires only on avatar/team change and is consumed only by `Wait.tsx:58` for avatar reconciliation during the lobby wait screen. The actual leaderboard *screen* (`states/Leaderboard.tsx`, manager-only) reads `ShowLeaderboardData.leaderboard` off `game:status` instead (`status.rs:330-342`). A refactor naming pass should either rename `player:updateLeaderboard` to something that doesn't imply "the leaderboard" (e.g. `player:rosterSync`) or fold it into the status payload.

**D3 — `manager:playerReconnected` payload/consumer mismatch.**
Server emits `{id, username}` (`ManagerPlayerReconnected`, `manager.rs:413-419`, confirmed at emit site `player/session.rs:302`). Client destructures `{id, oldId}` at `states/Room.tsx:108` — `oldId` does not exist on the wire type; it evaluates to `undefined` at runtime. Low-severity (the field is apparently unused downstream) but a real type/runtime mismatch worth fixing in the same pass as D1.

**D4 — `useSoundStore`/`useHapticsStore` are a structural twin.**
Byte-for-byte identical shape (`stores/sound.ts:25-38` vs `stores/haptics.ts:28-41`): one boolean + one `toggle()`, one `localStorage` key read/write pair, same try/catch-swallow pattern. Low-priority YAGNI-scale finding — a shared `createLocalBooleanStore(key, invert?)` factory would remove ~25 duplicate lines, but the current form is trivial enough that inlining is also defensible. Flag only, no strong recommendation either way.

**D5 — Solo is a fully parallel, unshared state machine (the headline duplication finding).**
`useSoloStore` (`stores/solo.ts`) reimplements the entire game loop — join(name)→question→answer→reveal→next→finish — over REST (`/api/quizz/:id/solo`, `/check-answer`, `/solo-score`) with its own `SoloPhase` enum (`idle|loading|name|question|answering|result|finished`, `solo.ts:46-53`) that has **no code or type sharing** with `Status`/`GameStatus` (`status.rs`) or `GAME_STATE_COMPONENTS` (`utils/constants.ts:26`). Solo re-derives streak-badge thresholds client-side (`solo.ts:22-44`) that mirror server-side `round-manager` logic by convention/comment only, not by import. This is the primary Solo↔Multiplayer duplication surface the charter (`00-charter.md:10`) names as a modularization target — any shared primitive (a phase-agnostic `QuestionRenderer`, a shared streak-badge calculator) would need to bridge a REST-driven store and a socket-driven store, which is the actual architectural work, not a naming cleanup.

**D6 — Player route owns inline socket-session logic; Manager route has it extracted.**
`useManagerGameSession` (`features/game/hooks/useManagerGameSession.ts`) is a proper shared hook, correctly reused by all 3 manager-role routes (`party/manager/$gameId.tsx:95`, `satellite/$gameId.tsx:51`, `display/play.tsx:77`) — confirmed via `rtk proxy grep -rn "useManagerGameSession(" packages/web/src/`. The player route (`pages/party/$gameId.tsx`) implements the structurally identical pattern (connect→reconnect-emit→timeout-guard, `SUCCESS_RECONNECT`→store hydration, `GAME.STATUS`→store update, `GAME.RESET`→cleanup) **inline**, ~150 lines, with no hook extraction. Currently harmless (only one consumer), but breaks the pattern the codebase already established and blocks reuse if a second player-facing route ever needs the same wiring (e.g. a solo↔multiplayer bridge). A `usePlayerGameSession` hook mirroring `useManagerGameSession`'s shape is the natural modularization target alongside D5.

**D7 — `manager:unauthorized` has 3 different empty-payload shapes across ~100 emit sites.**
`json!([])` (majority — `manager/{quizz,catalog,submissions,classes,game_flow,players,game_state,config,games_list,theme_templates}.rs`, `ai.rs` uses `""`, `media/mod.rs` uses `&()`, `labels.rs` uses `json!({})`. All are functionally equivalent to the client (payload ignored — no `features/game` `useEvent(EVENTS.MANAGER.UNAUTHORIZED, ...)` call site was found; the auth redirect must live outside `features/game`, not traced further here as out of scope). Cosmetic inconsistency, zero functional impact; note only.

**D8 — `manager:auth` is a dead C2S event; `/satellite/$gameId` is likely a dead route on Rust.**
`pages/satellite/$gameId.tsx:53-59` sends the satellite token three ways belt-and-suspenders: handshake `auth.satelliteToken` (`socket-context.tsx:183-196`), the `X-Satellite-Token` HTTP header (`socket-context.tsx:200-202`), and an explicit `socket.emit(EVENTS.MANAGER.AUTH, satelliteToken)` on connect. `rtk proxy grep -rln "satellite" rust/server/src/` returns **zero files** — none of the three paths is consumed server-side; `manager:auth` has no handler at all (previous row). The comment at `socket-context.tsx:198-199` ("a server-side validator (separate WP) can read whichever it prefers") confirms this was left as a stub. By contrast, `/display/*` (`pages/display/index.tsx`, `pages/display/play.tsx`) uses `display:register`/`display:pair`/`display:ping`, which **are** fully implemented (`rust/server/src/socket/display.rs`) and is explicitly described in `display/play.tsx:29-31,74` as the "already display-authed" successor. This SDD should treat `/satellite/$gameId` as either (a) dead code to delete in favor of `/display/*`, or (b) a real gap to close — but not leave the client believing it authenticates when the server silently drops all three signals.

**Not a finding — correctly shared, worth calling out as the pattern to replicate:** `GameWrapper` (`features/game/components/GameWrapper/GameWrapper.tsx`) is imported by all 4 game-loop routes (player, manager host, satellite, display — confirmed via `rtk proxy grep -rln`) and reads both `usePlayerStore` and `useManagerStore` to branch its chrome by role. `GAME_STATE_COMPONENTS_MANAGER` spreading `GAME_STATE_COMPONENTS` (§3) is the same good pattern at the state-mapping level.

---

## 7. Join / Reconnect Events — and the Klassenmodus-Join Gap

**Join-related:** `player:join` → `game:successRoom` → `player:login` → `game:successJoin` → `game:totalPlayers` / `manager:newPlayer` (roster fan-out) → `player:setAvatar`, `player:selectTeam` (post-join lobby refinement). Entry points: PIN form (`join/Room.tsx`, 6-digit `PinInput`) and URL deep-link (`?pin=`, auto-submits, `join/Room.tsx:85-92`).

**Reconnect-related:** `connect` (framework) → `player:reconnect` / `manager:reconnect` → `player:successReconnect` / `manager:successReconnect` → `game:status` (resume) / `game:reset` (terminal failure, 8s timeout backstop on the player side, `pages/party/$gameId.tsx:64-70`). Adjacent: `manager:playerReconnected` (roster toast), `manager:pauseGame`/`resumeGame` + `RejoinQrDialog` (QR-encoded `buildJoinUrl()` so a disconnected player can re-scan back in during a host-initiated pause), `display:ping` (satellite kiosk heartbeat/re-pair).

### The Klassenmodus-join gap (charter item #4), traced end-to-end

The host-switch **exists and works**: `ConfigSelectQuizz.tsx:254-266` renders a klassen-mode toggle (gated on the admin-set `config.klassenEnabled`, itself set via `manager:setGameConfig{klassenEnabled}` → `manager/config.rs:104-105`), and sends it in `game:create`'s `selectedModes.klassen` (`ConfigSelectQuizz.tsx:90-91` → `SelectedModes.klassen`, `game.rs:77`).

The flag is **captured and then never read again**:
- `rust/server/src/socket/game.rs:72-77` computes `klassen = req_klassen && klassen_enabled` and stores it on `game.selected_modes.klassen`.
- The only other reference in the entire server is `state/snapshot.rs:82`, which just serializes it for persistence.
- `rtk proxy grep -rn "selected_modes.klassen" rust/server/src rust/engine/src` returns exactly those 2 lines — **zero read sites** in `player/login.rs`, `player/session.rs`, or anywhere else in the join/reconnect path.

Consequently, at `player:join`/`player:login` time:
- `game:successRoom`'s `requireIdentifier` is hardcoded `Some(false)` (`login.rs:34`), so `Username.tsx`'s conditional identifier field (`Username.tsx:120-138`) never renders in practice regardless of klassen mode.
- `player:login`'s `identifier` field, if it ever arrived, is extracted and **discarded**: `let _identifier = ...` (`login.rs:81-84`, underscore-prefixed = intentionally unused) — never hashed into `Player.identifier_hash`, a field that already exists on the wire type for exactly this purpose (`rust/protocol/src/player.rs:41-43`).
- Nothing in `login.rs` queries `class:*`/student roster tables, and nothing validates an emoji-PIN at join time.
- Client confirms the same emptiness: `rtk proxy grep -rin "klassen" packages/web/src/features/game/ packages/web/src/pages/party/` returns **zero hits**. The join screens (`join/Room.tsx`, `join/Username.tsx`) have no roster fetch, no name-list picker, no `PinInput` reuse for emoji-PIN entry — `PinInput.tsx` is only used for the 6-digit game code (`join/Room.tsx:101`) and, separately, in the admin student-PIN display (`features/manager/.../schueler`).

**Net effect: a klassen-mode game can be created, but every player who joins it — including students not on the roster — still gets the ordinary free-text `Username.tsx` screen with no roster gate and no PIN check.** The write side (host switch → per-game flag) is done; the entire read/enforcement side (join-time gate, roster-driven name picker, emoji-PIN verification) does not exist. This is a 0%-implemented feature on the consumption end, not a partial one — there is no fallback logic to harden, only new code to add. Existing, reusable building blocks confirmed present for that new code: `PinInput.tsx` (emoji-PIN input, already proven for admin display), `rust/server/src/http/emoji_pin.rs` + `db/pins.rs` (PIN mint/verify), `db/classes.rs` + `socket/manager/classes.rs` (roster data, currently admin-only and untyped — see §4), `Player.identifier_hash` (destination field, currently dead). The charter's own reuse-scan (`00-charter.md:25`) already names these; this section confirms by code trace that none of them are wired into the join path today.

---

## 8. Summary

| Metric | Count |
|---|---|
| C2S handlers registered (`socket.on`, incl. `media_ai`) | 107 |
| Domains with zero typed Rust payload struct | `class:*` (23), `label:*` (7), `user:*` (5) = 35 events |
| Client `useEvent(EVENTS...)` call sites under `features/game`/`pages/party`/`pages/display`/`pages/satellite` | 24 (§1–§2 tables) + `connect`/`disconnect` framework listeners |
| Client `socket.emit(EVENTS...)` call sites, whole `packages/web/src` | 135 (`socket-context.tsx`, `features/game`, `features/manager`, `features/quizz`, `features/results`, `features/submission`, `pages/*`) |
| zustand stores under `features/game/stores` | 8 |
| Fully parallel (non-socket) state machine | 1 (`useSoloStore`, D5) |
| Duplicate/overlap findings | 8 (D1–D8), ranked by severity in §6 |
| C2S events with wire constant but zero server handler | 1 (`manager:auth`, D8) |
| Klassenmodus-join implementation state | Write path 100% (host switch → per-game flag); read/enforcement path 0% (§7) |
