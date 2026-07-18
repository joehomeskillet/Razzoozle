# 01 — Current Game Architecture (Synthesis)

**Owner:** phase0-synthesis · **Status:** done · **Scope:** ties together the
8 phase-0 inventory docs (`02`, `05`, `06`, `07`, `08`, `09`, `19`, `20`,
`25`) into one coherent current-state picture: layers, MP/Solo round flows,
share-vs-diverge, server-authority boundaries, tech stack.

**Correction vs. the previous version of this file:** an earlier draft of
`01-current-game-architecture.md` used a stale `cd-src/rust/...` /
`cd-src/packages/...` path prefix throughout (35 occurrences), which does not
exist in the current tree (`rust/`, `packages/web/`, `packages/common/` hang
directly off repo root — confirmed by every phase-0 reader against the live
checkout on 2026-07-18). That draft is superseded by this document; all
paths below are relative to the repo root unless stated otherwise.

This doc makes no new claims — every fact below is sourced from `02`, `05`,
`06`, `07`, `08`, `09`, `19`, `20`, or `25`. Where two readers described the
same fact from different angles, both are cited.

---

## 1. Layer diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│ BROWSER — packages/web (React 18, TanStack Router, Zustand)               │
│                                                                             │
│ Routes (route.gen.ts, 17 paths — 02-flow-inventory.md §1)                 │
│  /                 join: Room.tsx (PIN) → Username.tsx (name)             │
│  /party/$gameId          MP player          /manager             host login│
│  /party/manager/$gameId  MP host (driver)   /manager/config      console  │
│  /display, /display/play kiosk (paired)     /satellite/$gameId   kiosk    │
│  /quizz/$id/solo         solo (REST-only)   /r/$id               public   │
│  /quizz/$id/assignment/$assignmentId        share/podium                  │
│  /submit  — UNRELATED: crowd-sourced question submission, NOT a join route│
│                                                                             │
│ ┌────────────────────────────┐   ┌──────────────────────────────────────┐ │
│ │ MP state (socket-driven)     │   │ Solo state (REST-driven)             │ │
│ │ socket-context.tsx (1 shared │   │ features/game/stores/solo.ts         │ │
│ │  socket.io client, main.tsx:12)│  │ SoloPhase FSM — client-only,        │ │
│ │ stores/{player,manager}.ts   │   │ 7 variants, ZERO server phase        │ │
│ │ GAME_STATE_COMPONENTS /      │   │ tracking, zero code/type sharing     │ │
│ │ _MANAGER (Status→component,  │   │ with the socket-driven machinery     │ │
│ │ utils/constants.ts:26-57)    │   │                                       │ │
│ └──────────────┬─────────────┘   └───────────────────┬───────────────────┘ │
└────────────────┼──────────────────────────────────────┼────────────────────┘
                  │ socket.io — stateful,                │ REST — stateless,
                  │ ~107 C2S / ~90+ S2C game:/player:     │ GET/POST /api/quizz,
                  │ events (20-game-state-and-event-inv.) │ /api/assignment,
                  │                                       │ /solo-score, /login
┌─────────────────▼──────────────────────────────────────▼────────────────┐
│ SERVER — rust/server/src (Axum + socketioxide)                          │
│                                                                           │
│ socket/  — 107 socket.on registrations, one-file-per-event pattern,     │
│   HandlerCtx{registry, io, client_id, db_pool} cloned per handler        │
│     player/{login,session,answer}.rs    manager/{game_flow,auth,classes}│
│     lifecycle/mod.rs — THE ONE task/game driving GamePhase transitions   │
│                                                                           │
│ http/  — 30 REST routes (08-api-and-data-contracts.md)                  │
│     solo.rs (check-answer, solo-score → server recomputes score, SEC-05)│
│     assignments.rs (validate-pin — built, rate-limited, orphaned:        │
│       nothing downstream ever reads the token it mints)                 │
│     login.rs, users.rs, submit.rs, observability.rs, emoji_pin.rs, ...  │
│                                                                           │
│ state/  — GameRegistry: Arc<RwLock<HashMap<gameId, Arc<Mutex<Game>>>>>   │
│   Game wraps engine::GameState + session metadata + Player rows in RAM  │
└─────────────────┬──────────────────────────────────────┬────────────────┘
                   │                                       │
┌──────────────────▼────────────────────┐   ┌─────────────▼───────────────┐
│ rust/engine/src (IO-free)               │   │ rust/protocol/src (wire types)│
│ GamePhase FSM, 8 variants (state/mod.rs)│   │ Status enum, 12 variants —   │
│ eval::evaluate_answer  ◄────────────────┼───┤ wire superset of GamePhase   │
│  SHARED by MP reveal() AND solo's       │   │ (status.rs:46-71)             │
│  check-answer handler — the ONE piece   │   │ Player{player_token           │
│  of scoring logic properly deduped      │   │  #[serde(skip)]} — no wire    │
└──────────────────────────────────────────┘   │ leak, confirmed              │
                                                 │ 35 class:/label:/user:       │
                                                 │ events + reconnect payloads  │
                                                 │ bypass typed structs via     │
                                                 │ ad-hoc serde_json::Value     │
                                                 └───────────────────────────────┘
                   │
┌──────────────────▼─────────────────────────────────────────────────────────┐
│ PostgreSQL — db/ (classes, pins, submissions, results, quizz, catalog,      │
│  labels, media, users; migrations 001–020). students.pin = plaintext        │
│  (explicit design intent). solo_results.assignment_id = bare text, no FK.   │
│  solo_sessions written once (db/pins.rs:52), read nowhere. version INT      │
│  column on every table, referenced by zero UPDATE statements.               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech stack

- **Backend — 3 Rust crates**: `razzoozle-server` (`rust/server/`, HTTP +
  socket.io server, Axum router), `razzoozle-engine` (`rust/engine/`,
  IO-free `GamePhase` state machine + scoring + eval + achievements),
  `razzoozle-protocol` (`rust/protocol/`, wire types: `Status`, `Player`,
  `Question`, socket event payloads). *(07-state-machine-and-events.md,
  08-api-and-data-contracts.md)*
- **Client**: React 18 + TanStack Router (file-based routes generated into
  `route.gen.ts`) + Zustand (8 stores under `features/game/stores`) +
  `socket.io-client` (one shared instance app-wide, `main.tsx:12`).
  *(02-flow-inventory.md, 20-game-state-and-event-inventory.md)*
- **Shared contracts — two parallel sources of truth, not one**:
  `packages/common/src/validators/*.ts` (zod) is the contract the client
  actually enforces at runtime; `rust/protocol/src/*.rs` derives `#[ts(export)]`
  (ts-rs) into `rust/protocol/bindings/*.ts` (~140 generated files) that
  **zero files under `packages/` import** — a dead codegen pipeline running
  in parallel to the real, hand-synced zod/Rust contract pair.
  *(08-api-and-data-contracts.md)*
- **DB**: PostgreSQL via `db/{classes,pins,submissions,results,config,
  quizz,catalog,labels,media,users}.rs` against `db/migrations/001-020`.
  *(08-api-and-data-contracts.md, classmode-emoji-pin reader)*
- **Auth — 3 coexisting header conventions**: `X-Manager-Token` (game-session,
  any role, `authorize_manager_request`, `http/mod.rs:98-117`),
  `Authorization: Bearer` (admin account routes only, `http/users.rs:37-74`),
  dev query-token/`X-Manager-Token` for ops (`authorize_dev_request`,
  defined **twice** independently: `http/mod.rs:152-179` and
  `observability.rs:484-544`, different precedence/signature).
  *(08-api-and-data-contracts.md)*

---

## 3. Multiplayer round — request/event flow

1. **Host login**: REST `POST /api/login` (username+password) → JWT stored
   client-side → socket `reconnect()` re-authenticates the handshake with
   the token → `MANAGER.GET_CONFIG`/`MANAGER.CONFIG` drives navigation to
   `/manager/config`. `ManagerPassword.tsx:25-71`,
   `pages/(auth)/manager/index.tsx:11-40`. *(02-flow-inventory.md)*
2. **Game create**: host picks a quiz + per-game mode toggles (incl.
   **Klassen-Modus** switch, `ConfigSelectQuizz.tsx:29,90-93,254-265`) →
   `socket.emit(GAME.CREATE, {quizzId, selectedModes})` →
   `rust/server/src/socket/game.rs:17` → `registry.create_game(quizz)`
   (random `game_id`, `invite_code`, `host_token`) → `MANAGER.GAME_CREATED`
   → `navigate("/party/manager/$gameId")`. *(02, 20)*
3. **Player join**: `/` → `Room.tsx` `PinInput` (6-char invite code) or
   `?pin=` deep-link → `PLAYER.JOIN` → `login.rs:10` `register_join` →
   `GAME.SUCCESS_ROOM{gameId, requireIdentifier}` — **`requireIdentifier`
   is hardcoded `Some(false)`** (`login.rs:34`, `// TODO(parity): read from
   live config file`) → `Username.tsx` free-text name (+ optional
   `identifier` field, only shown if `requireIdentifier` were ever true) →
   `PLAYER.LOGIN {gameId, data:{username, avatar, identifier?}}` →
   `login.rs:54` `register_login` parses **ad-hoc `serde_json::Value`, not
   the typed `PlayerLogin` struct** → `Game::add_player` dedups strictly on
   `client_id` (`state/game.rs:352-354`) → `GAME.SUCCESS_JOIN
   {gameId, playerToken}` (an object, not a bare string — corrects
   `docs/rust-port-event-inventory.md`) → client persists
   `player_token:<gameId>` to `localStorage`, navigates to
   `/party/$gameId`, status `WAIT`. *(02, 05, 06, 20)*
4. **Lobby → start**: host sees roster + PIN/QR on `SHOW_ROOM`
   (`states/Room.tsx:34,90-125`), clicks "Next" → `MANAGER.START_GAME`.
   *(02)*
5. **Question loop**: the lifecycle task (`socket/lifecycle/mod.rs`) drives
   `GamePhase` transitions — `ShowRoom → ShowStart → ShowQuestion →
   SelectAnswer → ShowResult → ShowRoundRecap → ShowLeaderboard →
   Finished` (`rust/engine/src/state/mod.rs:20-29`) — every mutator is
   phase-guarded (`GameError::InvalidTransition`,
   `engine/src/state/mod.rs:33`). Each transition broadcasts `GAME.STATUS`
   (`Status`, 12-variant wire superset, `protocol/src/status.rs:46-71`) via
   two shared helpers (`socket/status_emit.rs:27,40`) called from ~8 sites;
   client maps `Status.name` → React component via `GAME_STATE_COMPONENTS`
   / `_MANAGER` (`utils/constants.ts:26-57`). *(07, 20)*
6. **Answer submit**: player picks an answer → `PLAYER.SELECTED_ANSWER`
   (SEC-00 frozen typed contract, `protocol/src/player.rs:213-237`) →
   `socket/player/answer.rs:15` → double-answer guard
   (`current_answers.contains_key`, `state/mod.rs:243-247`) → engine
   mutator scores via `razzoozle_engine::eval::evaluate_answer` (the same
   function solo's REST handler calls) → `game:playerAnswer` running-count
   broadcast. *(07, 20)*
7. **Live-control interrupts** (skip/reveal/pause/abort): every manager
   control checks `engine.phase == expected_phase`
   (`request_abort`, `socket/lifecycle/timing.rs:14-21`) — a silent no-op if
   stale. Note: `manager:abortQuiz` is misleadingly named — it only calls
   `request_abort(SelectAnswer)`, identical in effect to skip/reveal; there
   is no distinct "kill game now" transition. *(07)*
8. **Leaderboard recap oddity**: `ShowRoundRecap` is reached by
   `lifecycle/mod.rs:356` mutating `game.engine.phase` **directly** (not via
   a guarded engine method), then resetting to `ShowResult`
   (`lifecycle/mod.rs:388`) so `leaderboard_view()`'s guard passes. *(07)*
9. **Finish**: `Finished` phase → host "Next" navigates to
   `/manager/config` + resets state; player sees `PlayerFinished`/`Podium`.
   Route `onLeave` always emits `MANAGER.LEAVE` / `PLAYER.LEAVE`. *(02)*
10. **Reconnect** (either role, any point above): player
    `PLAYER.RECONNECT{gameId, playerToken, lastServerSeq}` matched against
    `Player.player_token` (43-char random, minted once in `add_player`,
    `state/game.rs:356-368`) → socket id swapped in place, points/streak
    read straight from the engine (never reset) →
    `player:successReconnect` + `manager:playerReconnected`
    (`socket/player/session.rs:196-267`). Host/satellite/display reconnect
    share one hook, `useManagerGameSession.ts:35-71,99-102`, gated by
    `is_game_host` ownership check (`socket/manager/auth.rs:85-98`).
    *(07, 09, 20)*

---

## 4. Solo round — request/event flow

1. **Load**: `/quizz/$id/solo` → `GET /api/quizz/:id/solo` (REST, fully
   stateless — **no `Game`/`GameRegistry` entry is ever created for solo
   play**) → `useSoloStore` phase `idle → loading`.
   `features/game/stores/solo.ts:138-166`. *(02, 07)*
2. **Name entry**: phase `name` → `SoloNameScreen.tsx` — **raw hand-styled
   `<input>`/`<button>`, bypassing the shared `Input`/`Button`/`Card`
   primitives** that MP's `Username.tsx` correctly uses — empty name
   silently falls back to `"Anonym"`, no validation shown.
   `pages/quizz/$id/solo.tsx:118-127`. *(02, 19)*
3. **Question**: phase `question` — client-only cooldown timer
   auto-transitions to `answering`. No server involvement at all. *(02)*
4. **Answer**: phase `answering` → `POST /api/quizz/:id/check-answer
   {questionIndex, answerId?/answerIds?/answerText?}` →
   `http/solo.rs` calls the **same** `razzoozle_engine::eval::evaluate_answer`
   MP's reveal step uses → correct/points returned → phase `result`. On a
   non-ok response or thrown exception, the client **silently degrades to a
   wrong answer** (`correct:false, points:0`, streak reset) and still
   advances — no error toast, no retry (`solo.ts:176-277`, catch block
   `259-276`). *(02, 07)*
5. **Result**: feedback is rendered **inline**, via a `feedback` prop into
   the still-mounted `SoloAnswers` leaf components — not a separate state
   screen the way MP's `states/Result.tsx` is — specifically to avoid
   remounting/restarting the countdown (`SoloShell.tsx:20-26`). *(19)*
6. **Finish**: once (`finishedRef` guard) `POST /api/quizz/:id/solo-score`
   with the full answer log → `http/solo.rs:328` `handle_solo_score`
   **recomputes score server-side** via `compute_solo_score` (SEC-05),
   ignoring client `correct` flags and `payload.score` entirely, capped at
   `theoretical_max` → `INSERT INTO solo_results` (columns:
   `id/quiz_id/player_name/score/answered_at/assignment_id` — **no
   `student_id` column, no join to `students`**). Submit failure is caught
   and **silently swallowed** — screen still renders
   (`solo.ts:300-332`, `pages/quizz/$id/solo.tsx:77-84,130-143`). *(02, 08)*
7. **Assignment variant** (`/quizz/$id/assignment/$assignmentId`): adds a
   gate before step 1 — `GET /api/assignment/:id`, then a **client-side-only**
   deadline check — then goes straight to the same free-text
   `SoloNameScreen` (default `"Anonym"`). The fully-built, rate-limited
   (3 fails/60s, `state/rate_limit.rs:208-231`) PIN-verification endpoint
   `POST /api/assignment/:id/validate-pin` (`http/assignments.rs:178-228`)
   — which mints a `studentToken` and `INSERT`s into `solo_sessions`
   (`db/pins.rs:44-64`) — is **never called by the web client** (grep-verified
   zero hits for `validate-pin`/`studentToken` in `packages/web/src`), and
   `solo_sessions` is written once and **read nowhere** in the entire
   codebase. This scaffold is fully orphaned end-to-end. *(02, api-data
   reader, classmode-emoji-pin reader)*

---

## 5. Where Solo and Multiplayer share vs. diverge

**Shared (properly deduped):**
- `razzoozle_engine::eval::evaluate_answer` — the one piece of
  scoring/correctness logic genuinely shared between MP's `reveal()` and
  solo's `check-answer` handler. *(07)*
- Leaf answer-type input components — `ChoiceGrid`, `MultiSelectGrid`,
  `MathematikInput`, `SentenceBuilderBoard`, `SliderInput`,
  `TypeAnswerInput`, `WortartenPicker`, `CircularTimer`, `QuestionMedia` —
  reused correctly by both `Answers.tsx` (MP) and `SoloAnswers.tsx` (Solo).
  *(19)*
- `PinInput.tsx`, `AnswerButton.tsx`, `Avatar.tsx` as design primitives
  (used across both surfaces where they're used at all). *(19, 25)*

**Diverge — by design, self-documented:**
- Transport + state machine: MP is a server-authoritative, socket-driven
  `GamePhase` FSM (8 variants) with a wire-level `Status` superset (12
  variants); Solo is a **client-only** Zustand `SoloPhase` FSM (7 variants)
  talking to stateless REST — three independently hand-maintained phase
  taxonomies for what the charter's premise assumed was one machine. *(07,
  20)*
- Orchestration shells: `states/Answers.tsx` (724 lines, socket) vs.
  `features/game/components/solo/SoloAnswers.tsx` (431 lines, REST) — the
  latter's own header comment says it "mirrors the layout of Answers.tsx
  but uses REST instead of socket.emit"; `SoloShell.tsx` similarly
  self-documents as an **intentional** replacement for `GameWrapper` "to
  avoid socket coupling." Not accidental duplication — flagged so the
  modularization plan (`21`) doesn't naively merge them. *(19)*
- End-of-game richness: MP's `Podium.tsx`+`RecapSequence.tsx`+
  `TrophySticker.tsx`+`PlayerFinished.tsx` = 2029 combined lines vs. Solo's
  `SoloFinishedScreen.tsx`+`SoloLeaderboard.tsx` = 228 lines — an asymmetry
  flagged for the visual-consistency strand (`24`–`27`), not treated as a
  code-dup bug. *(19)*
- Identity binding: MP has `client_id` + server-minted `player_token` with
  anti-spoof reconnect checks; Solo/assignment play has **no identity
  binding at all** — a free-text `player_name` column never joined to
  `students`. *(05, 09)*
- Error surfacing: MP always toasts (`GAME.ERROR_MESSAGE`); Solo has two
  silent-degrade paths (§4.4, §4.6) with no MP equivalent. *(02, 07)*

---

## 6. Server-authority boundaries

**Server IS authoritative for:**
- Every `GamePhase` transition (phase-guarded, `GameError::InvalidTransition`
  on any out-of-order mutator call). *(07)*
- Scoring/correctness for both MP and solo (`eval::evaluate_answer`), and
  solo's final score is **recomputed** server-side regardless of what the
  client submits (`compute_solo_score`, SEC-05, `http/solo.rs:294-326`).
  *(07, 08)*
- Player identity within one game (`player_token`, `#[serde(skip)]`,
  confirmed no wire leak) and manager game ownership (`is_game_host`,
  closes the "Rust Ownership Gap" that `docs/design/auth-redesign-spec.md`
  had flagged as Critical Finding #1). *(07, 20)*
- Manager/teacher account credentials: argon2-hashed passwords, SHA-256-hashed
  session tokens (never the raw token stored server-side). *(05, 06)*

**Server is NOT authoritative for (open holes as of phase-0):**
- **Class-mode join.** `selectedModes.klassen` is captured once at
  `GAME.CREATE` (`socket/game.rs:72-77`, `state/snapshot.rs:82` — the only
  two references in the whole server) and **never read again** — not in
  `login.rs`, not in `session.rs`. `requireIdentifier` is hardcoded `false`
  and the `identifier` field the client can send is parsed into
  `let _identifier` and discarded (`login.rs:81-84`). Today, class-mode is
  a checkbox that changes which question types a host may *author*
  (client-side filter, `QuestionEditorType.tsx:110`) and nothing about who
  may *join*. *(02, 05, 06, 07, 20 — unanimous across every reader that
  touched this)*
- **Solo/assignment identity.** The PIN-verification endpoint exists and is
  rate-limited, but nothing downstream ever checks the token it mints (§4.7)
  — solo score submission takes no auth token of any kind. *(05, 06, 08)*
- **`/satellite/$gameId`'s auth mechanism.** The route emits `MANAGER.AUTH`
  with a `satelliteToken`, but grep confirms **zero** occurrences of
  `manager:auth` or `satellite` handling anywhere under `rust/server/src`
  — the emit appears to go into the void. *(20)*
- **Concurrency hygiene.** Every table carries a `version INT DEFAULT 0`
  optimistic-locking column (`db/README.md:101-109` documents the
  convention) but **no** `UPDATE` statement in `quizz.rs`/`classes.rs`/
  `results.rs`/`submissions.rs`/`catalog.rs`/`media.rs`/`labels.rs`/
  `config.rs` references it — last-write-wins in practice. *(08)*

---

## 7. Key facts (load-bearing file:line anchors)

**Routing & join**
- 17 routes, confirmed against `route.gen.ts:41-396`; join entry is `/`
  (`pages/(auth)/index.tsx:28-30`), **not** `/submit`
  (`pages/submit/index.tsx` → `features/submission/SubmitPage`, an
  unrelated crowd-sourced question form). *(02)*
- `Room.tsx:117-124` footer link is the only connection between join and
  `/submit` — a cross-link, not a shared flow. *(02, 05)*

**State machine**
- `GamePhase`: `rust/engine/src/state/mod.rs:20-29` (8 variants).
- `Status` wire enum: `rust/protocol/src/status.rs:46-71` (12 variants; 4
  — `ShowPrepared`/`ShowResponses`/`Wait`/`Paused` — have no `GamePhase`
  equivalent, per `socket/manager/game_flow/pacing.rs:165` comment). *(07)*
- Eviction TTL 300s (`state/mod.rs:35`); empty-grace 300s started / 60s
  lobby (`state/empty_grace.rs:8-9`), reapers tick every 60s
  (`main.rs:335-384`, panic-guarded). *(07)*

**Events/protocol**
- 107 `socket.on` C2S registrations + 135 client `socket.emit` sites.
  *(20)*
- `game:successJoin` is an **object** `{gameId, playerToken}`
  (`protocol/src/game.rs:185-193`), not a bare string as
  `docs/rust-port-event-inventory.md` had it. *(20)*
- `player:reconnect` and `manager:successReconnect` bypass their typed
  protocol structs via ad-hoc `serde_json::Value`
  (`socket/player/session.rs:170-178`) — the same drift pattern
  `player:selectedAnswer` already got frozen against (SEC-00). *(20)*
- 35 events (`class:*` ×23, `label:*` ×7, `user:*` ×5) have **zero** typed
  Rust protocol struct anywhere — all ad-hoc `serde_json::Value`. *(20)*

**REST/data**
- 30 REST routes (`http/mod.rs:219-277`). 3 coexisting auth-header
  conventions (`X-Manager-Token`, `Authorization: Bearer`, dev query-token)
  with `authorize_dev_request` **implemented twice** independently
  (`http/mod.rs:152-179` vs. `observability.rs:484-544`). *(08)*
- `solo_results.assignment_id` is bare `text`, no FK to `assignments.id`.
  `assignments.metadata` is one schemaless JSONB blob (deadline/
  maxAttempts/requireIdentifier/showCorrectAnswers), read side fails open
  (silent `None`) on type mismatch. *(08)*

**Class-mode / security**
- `students.pin TEXT` stored **plaintext by explicit design**
  (`db/migrations/015_student_pins.sql:1-2`, teacher-visible-by-design),
  verified via plain `==` (`db/pins.rs:92`) — contrasted with argon2+SHA-256
  for manager accounts (`db/users/mod.rs:43-46,161-184`). *(06)*
- `POST /api/assignment/:id/validate-pin` (`http/assignments.rs:178-228`)
  mints a `studentToken`, inserts into `solo_sessions` — grep-verified zero
  reads of that table anywhere; grep-verified zero client references to
  `validate-pin`/`studentToken`. *(05, 08)*
- Host-side Klassenmodus toggle exists and is fully wired to
  `GAME.CREATE` (`ConfigSelectQuizz.tsx:29,90-93,254-265`, gated on
  account-wide `config.klassenEnabled`); **no player-facing consumption
  exists anywhere.** *(02, 05, 06, 20, 25 — unanimous)*

**Components**
- Of 16 target primitives (`AnswerButton`, `Timer`, `PinInput`, `Avatar`,
  `Dialog`, `Toast`, `GameButton`, `IconButton`, `GameCodeInput`,
  `EmojiPinInput`, `ProgressBar`, `ScoreBadge`, `ConnectionIndicator`,
  `LoadingState`, `ErrorState`, `PlayerNameSelect`), only 6 exist as
  dedicated, correctly-named components; `EmojiPinInput` and
  `PlayerNameSelect` have **zero** client-side implementation. *(19)*

**Error/reconnect**
- No per-player reconnect TTL — a disconnected player's row survives as
  long as the *game* survives (game-level reapers only, keyed on
  manager-liveness). *(09)*
- Username validated as UTF-8 **bytes** server-side (min 4/max 20,
  `state/registry.rs:107-115`) vs. JS **chars** client-side
  (`Username.tsx:17,106`) — unit mismatch on multi-byte names; no
  uniqueness check anywhere. *(09)*

---

## Reconciled open questions

These are the open questions raised by 2+ readers, or that gate a
downstream doc; single-reader speculative questions are left in their
source doc.

1. **Should the class-mode-join flow gate live-multiplayer `player:login`
   via `selectedModes.klassen`, or only solo/assignment play?** Raised by
   `state-machine`, `error-reconnect`, and `classmode-emoji-pin` readers
   independently, with no consensus — must be adjudicated in `05`/`23`.
2. **Should `solo_sessions`/`validate-pin` be resurrected as the
   verification mechanism, or discarded in favor of something simpler
   (e.g. verifying inline at score-submission time)?** Raised by
   `classmode-emoji-pin` and `api-data` readers; both flag it as fully dead
   today either way.
3. **Should `player:reconnect`/`manager:successReconnect`'s ad-hoc JSON get
   the same SEC-00-style typed-struct freeze `player:selectedAnswer`
   already has, as a prerequisite before class-mode adds more join/reconnect
   fields?** Raised by `events` reader; directly blocks `06`/`23` if the
   answer is yes.
4. **Should `class:*`/`label:*`/`user:*` (35 untyped events) get typed
   protocol structs before class-mode-join is built**, given the join-time
   roster read needs to consume this data reliably? Raised by `events`
   reader, echoed by the untyped-data concern in `api-data`.
5. **Is `/satellite/$gameId` being intentionally retired in favor of
   `/display/*`, or does `manager:auth` need a real handler?** Raised by
   `events` and `error-reconnect` readers — determines whether this is a
   delete-WP or an implement-WP, and whether satellite's token-in-URL
   pattern is a precedent worth reusing for class-mode's PIN flow.
6. **Does the same-person-two-browsers / duplicate-username gap belong in
   scope for class-mode's identity work** (emoji-PIN as the natural
   cross-device dedup mechanism), or is it an explicitly separate,
   unscoped product decision? Raised by `error-reconnect` and echoed by
   `classmode-emoji-pin`'s "no student-role session type" gap.
7. **Was `POST /api/assignment` (create) and `validate-pin` ever wired to a
   UI that was since removed, or built ahead of the UI and never
   finished?** Raised by `api-data`; affects whether `05`/`23` reuse this
   scaffold or design fresh, per the charter's "PIN storage reused, not
   rebuilt" mandate.
8. **Is the GamePhase/Status/SoloPhase three-taxonomy split intentional
   (wire superset vs. engine subset vs. client-only solo) worth documenting
   as a deliberate pattern, or should `21` unify them?** Raised by
   `state-machine` reader, relevant to whether class-mode introduces a 4th
   taxonomy (a "verified" join state) or extends an existing one.
