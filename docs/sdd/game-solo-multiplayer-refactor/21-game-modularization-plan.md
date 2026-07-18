# 21 — Game Modularization Plan

**Status**: Target architecture (adjudicated, frozen) · **Owner**: Claude (orchestrator) · **Scope**: Refactor Solo↔Multiplayer code duplication (orchestration, primitives, hooks, services), modular domain/state/event/component structure · **Reference**: Charter item #2, Phase-0 docs #19 (component inventory, D5 duplication findings), #20 (event/state inventory)

---

## EXECUTIVE SUMMARY

**Current duplication** (from Phase-0 doc #20):
- **Answer-screen orchestration**: `Answers.tsx` (724 LOC, socket-driven) vs `SoloAnswers.tsx` (431 LOC, REST-driven) — leaf components ARE shared, orchestration shell is duplicated
- **Score display**: 5+ independent implementations (`Result.tsx`, `SoloShell`, `SoloLeaderboard`, `Podium`, `SharePage`)
- **Button implementations**: Primary (`Button.tsx`, reused) + 3 hand-rolled dialogs bypassing `AlertDialog.tsx`
- **Connection/loading states**: 2 implementations in `GameWrapper`, 1 in `join/Room`
- **Solo state machine**: Completely parallel to MP (no code sharing with `GameStatus`/`GAME_STATE_COMPONENTS`)

**Target architecture**: Extract reusable primitives (GameButton, ScoreBadge, EmojiPinInput, useCountdown, ConnectionIndicator), unify answer submission + reveal orchestration (both modes use same hooks + shared Answer submission engine), Solo uses socket API instead of REST (parity with MP), modular domain/state/event structure for testability.

**Impact**: ~800–1200 LOC consolidated, test coverage +40%, reduced cognitive load for future feature work.

---

## 1. TARGET ARCHITECTURE

### 1.1 Domain layer (Game rules, state shape) — `packages/common/src/domain/`

**Purpose**: Shared enums and data types used by both Solo and Multiplayer; live in `packages/common` so backend and frontend share them.

**Current state**: `Status` enum lives in `razzoozle-protocol::status` (Rust); JS version is in `packages/common/src/types/game/status.ts`. Solo reimplements its own `SoloPhase` enum (`features/game/stores/solo.ts:46-53`), which has **no code or type sharing** with `Status`.

**Target state**:
- **Keep `Status`** as the canonical multiplayer game phase (ShowRoom, ShowQuestion, SelectAnswer, ShowResult, ShowLeaderboard, Finished, etc.) — no change
- **Align Solo phases to Status** (create a SoloStatus type alias that maps Solo's internal phase to an equivalent Status for rendering):
  ```typescript
  // packages/common/src/domain/game-phases.ts (NEW)
  export enum GamePhase {
    LOBBY = "lobby",              // Solo's "name" screen
    PLAYING = "playing",          // Solo's "question" + "answering" 
    RESULT = "result",            // Solo's "result" — but MP transitions to different screen
    FINISHED = "finished",
  }
  
  export const SOLO_PHASE_TO_STATUS = {
    name: Status.SHOW_ROOM,       // Reuse shared room-screen component
    question: Status.SHOW_QUESTION,
    answering: Status.SELECT_ANSWER,
    result: Status.SELECT_ANSWER, // Keep in-place, no screen transition
    finished: Status.FINISHED,
  };
  ```
- **Streak badges**: Merge `solo.ts:22-44` (client-side calculation) with server-side `round_recap.rs` logic (Rust) into a shared `StreakCalculator` utility in `packages/common/src/domain/scoring.ts`
- **Create achievement constants**: Consolidate achievement tier thresholds (`TIER_*`, `ACHIEVEMENT_META` from `PlayerFinished.tsx:8-14`) into `packages/common/src/domain/achievements.ts` so both client components reference the same thresholds

### 1.2 State layer (Zustand stores, actions) — `packages/web/src/features/game/stores/`

**Purpose**: Centralize game loop state management so both Solo and Multiplayer use the same stores (with different hydration sources: socket vs. HTTP).

**Current state** (Phase-0 #20 §5):
- `usePlayerStore`: status + username + points + gameId (shared, but only populated by MP via socket)
- `useSoloStore`: separate phase FSM, questions, currentIndex, playerName, totalPoints (REST-driven, no socket imports)
- 8 stores total, no cross-use between Solo and MP

**Target state**:
- **Unify status storage**: Extend `usePlayerStore` to carry BOTH socket-driven (MP) and HTTP-driven (Solo) status
  ```typescript
  // stores/game.ts (RENAME from player.ts + merge useSoloStore)
  interface GameState {
    gameId?: string;
    quizId?: string;          // Solo-specific
    status: Status | undefined;
    phase: GamePhase;         // Unified: maps Status → GamePhase
    player: { username, points, avatar };
    questions: Question[];
    currentQuestion: Question | undefined;
    currentQuestionIndex: number;
    alreadyAnswered: boolean;
    // ... rest of player.ts
  }
  
  export const useGameStore = create<GameState>(...)
  ```
- **Separate transport concerns from state**:
  - `useGameStore` owns state (what we know)
  - `useGameTransport` owns the *how* (socket vs. HTTP) — see §1.3
- **Delete `useSoloStore`** entirely; migrate consumers to `useGameStore`

### 1.3 Services layer (Transport abstraction) — `packages/web/src/features/game/services/`

**Purpose**: Abstract socket vs. REST transport so answer submission, phase transitions, and state hydration work the same way for both.

**New structure**:
```typescript
// services/game-transport.ts (NEW)
export interface GameTransport {
  hydrate(): Promise<void>;           // Load initial game state
  submitAnswer(answer: Answer): Promise<SubmitResult>;
  goToNextPhase(): Promise<void>;
  handleReconnect(): Promise<void>;
  // ... event listener registration
}

// services/socket-transport.ts (NEW)
export class SocketTransport implements GameTransport {
  // Uses socket.emit, listens to socket.on
  // Replaces inline socket logic from Answers.tsx, SoloAnswers.tsx
}

// services/rest-transport.ts (NEW)
export class RestTransport implements GameTransport {
  // Uses fetch to /api/quizz/:id/*
  // Replaces inline HTTP logic from SoloAnswers.tsx
}

// Instantiate in route:
const transport = isSocket ? new SocketTransport(...) : new RestTransport(...);
```

### 1.4 Component layer (Presentation, reusable leaves)

**Leaf primitives** (already reused or to-be-extracted): AnswerButton, CircularTimer, Card, Button, PinInput, EmojiPinInput (new), ConnectionIndicator (new), ScoreBadge (new), GameCodeDisplay (new).

**Orchestration components** (currently duplicated, to unify):
- `AnswerOrchestration.tsx` (NEW) — replaces both `Answers.tsx` + `SoloAnswers.tsx`
  - Props: `transport: GameTransport`, `question: Question`, `answerTypes: QuestionType[]`
  - Owns: timer lifecycle, submit handling, pending state, sound/haptics, leaf selection
  - Exports: a single component that both Socket and REST drivers wrap
- `ResultOverlay.tsx` (NEW) — replaces `Result.tsx` (MP) + inline feedback in `SoloAnswers.tsx` (Solo)
  - Props: `feedback: FeedbackData`, `isInline?: boolean`
  - Variant: `isInline=false` (full-screen, MP) vs `isInline=true` (overlay, Solo)

**Route-level shells** (intentional divergence, DO NOT MERGE):
- `GameWrapper.tsx` (MP, socket + manager chrome) — keep as-is
- `SoloShell.tsx` (Solo, offline-first, no socket coupling) — keep as-is, but use unified `useGameStore` + `AnswerOrchestration`

### 1.5 Hooks layer (Business logic, subscriptions)

**Current hooks** (Phase-0 #20 §5):
- `useEvent` — socket listener (socket-specific, cannot be generalized)
- `useClockSync` — low-latency timing (socket-specific)
- `useManagerGameSession` — manager session binding (extracted, reused correctly)
- `usePlayerGameSession` (MISSING) — player session binding (see Phase-0 #20 D6 finding)

**Target hooks** (new + refactored):
- **`useGameTransport(mode: 'socket' | 'rest')`** (NEW)
  - Returns a `GameTransport` instance configured for the mode
  - Owns connection setup, lifecycle listeners, error handling
  - Replaces inline socket setup in `pages/party/$gameId.tsx` (~150 LOC of inline logic per D6)

- **`useAnswerSubmission(transport: GameTransport)`** (NEW)
  - Orchestrates answer validation, pending state, server ack (low-latency) or next-status wait
  - Used by `AnswerOrchestration` to unify `Answers.tsx` + `SoloAnswers.tsx` submit paths
  - Owns: 800ms pending-hint timeout, sound/haptics triggers, error toast

- **`useCountdown(seconds: number, onTick?: (remaining) => void)`** (NEW)
  - Extracts timer logic from `CircularTimer` and `Answers.tsx`
  - Used by `AnswerOrchestration` + manager pause/resume logic
  - Owns: server-authoritative countdown (low-latency offset) vs. client-side (fallback)

- **`usePlayerGameSession(gameId: string)`** (NEW, extracted from D6)
  - Player route equivalent of `useManagerGameSession`
  - Owns: reconnect emit, timeout guard, status hydration, cleanup
  - Estimate: 30–50 LOC extracted from `pages/party/$gameId.tsx:58-140`

---

## 2. MODULE STRUCTURE

```
packages/common/
  src/
    domain/
      game-phases.ts          # GamePhase enum, phase-to-status mapping
      scoring.ts              # StreakCalculator, achievement thresholds
      achievements.ts         # Tier gradients, badge metadata
      index.ts                # Re-export all domain types

packages/web/
  src/
    features/game/
      services/
        game-transport.ts     # Interface definition
        socket-transport.ts   # Socket.io implementation
        rest-transport.ts     # HTTP implementation
        index.ts
      
      hooks/
        use-game-transport.ts
        use-answer-submission.ts
        use-countdown.ts
        use-player-game-session.ts  # Extracted from page
        use-manager-game-session.ts # (existing, no change)
        index.ts
      
      components/
        primitives/
          GameButton.tsx      # Alias to Button.tsx, explicit name
          ScoreBadge.tsx      # NEW
          ConnectionIndicator.tsx  # NEW (replaces 2 in GameWrapper)
          GameCodeDisplay.tsx # NEW (consolidates 3 code renderings)
          EmojiPinInput.tsx   # NEW (for Klassenmodus, doc #6)
          
        orchestration/
          AnswerOrchestration.tsx  # Replaces Answers.tsx + SoloAnswers.tsx
          ResultOverlay.tsx        # Replaces Result.tsx + inline feedback
          
        states/
          Question.tsx        # (existing, no change)
          Wait.tsx            # (existing, no change)
          Leaderboard.tsx     # (existing, no change)
          Podium.tsx          # (existing, no change)
          # ... other states
      
      stores/
        game.ts               # Merged usePlayerStore + useSoloStore
        question.ts           # (existing, no change)
        answer.ts             # (existing, no change)
        lowLatency.ts         # (existing, socket-specific, no change)
        manager.ts            # (existing, no change)
        sound.ts              # (existing, no change)
        haptics.ts            # (existing, no change)
```

**Deprecations**:
- `stores/solo.ts` — DELETED (merged into `stores/game.ts`)
- `features/game/components/states/SoloAnswers.tsx` — DELETED (merged into `orchestration/AnswerOrchestration.tsx`)

---

## 3. CONSOLIDATION TARGETS (Quantified)

| Item | Current | Target | LOC saved | Test coverage ↑ | Priority |
|---|---|---|---|---|---|
| **Answer orchestration** | 724 (`Answers.tsx`) + 431 (`SoloAnswers.tsx`) = 1155 LOC | 400 LOC unified orchestration + 200 LOC per-transport (socket/REST = 800 total, 355 saved) | ~300 | +20% (shared answer-flow tests) | **P0** |
| **Score badge** | 5 independent implementations (~80 LOC each, 400 total) | 1 `ScoreBadge.tsx` (~50 LOC) + design-token reuse | ~350 | +5% | **P1** |
| **Connection state** | 2 in `GameWrapper`, 1 in `join/Room` (~60 LOC ad-hoc) | 1 `ConnectionIndicator.tsx` (~40 LOC) + hook abstraction | ~20 | +2% | **P2** |
| **Game code display** | 3 unrelated renderings (`PinInput`, `Room.tsx` static, satellite raw input, ~80 LOC) | 1 `GameCodeDisplay.tsx` (token-bound, ~40 LOC) | ~40 | +2% | **P2** |
| **Dialog primitives** | 5 hand-rolled Radix wrappers + `AlertDialog.tsx` bypassed | Audit + standardize 2–3 dialog shapes (§3 of #25) | ~100 | +5% (consistent a11y) | **P1** |
| **Solo state machine** | `useSoloStore` + 8 stores total = 150 LOC | Merged into `useGameStore` (~50 LOC in unified game.ts) | ~100 | +10% (state integration tests) | **P0** |
| **Streak calculation** | Client inline + server implicit (~50 LOC client-side comment only) | Shared `StreakCalculator` in `packages/common` (~30 LOC) + domain tests | ~20 | +8% (domain unit tests) | **P1** |
| **Subtotal** | ~1840 LOC | ~1200 LOC | ~830 | +52% | — |
| **Estimated total with full test suite** | — | — | **~1200–1400** | — | **P0** |

---

## 4. DEPENDENCY GRAPH (Architectural Constraints)

```
┌─────────────────────────────────────────────────────┐
│ DOMAIN LAYER (packages/common)                      │
│ - GamePhase, Status, StreakCalculator, Achievements│
└─────────────────────────────────────────────────────┘
               ↑ (imports)
┌─────────────────────────────────────────────────────┐
│ STATE LAYER (stores/)                               │
│ - useGameStore (unified), useQuestionStore, etc.   │
└─────────────────────────────────────────────────────┘
               ↑ (uses)
┌─────────────────────────────────────────────────────┐
│ SERVICES LAYER (services/)                          │
│ - GameTransport (interface)                         │
│ - SocketTransport, RestTransport (implementations)  │
└─────────────────────────────────────────────────────┘
               ↑ (uses)
┌─────────────────────────────────────────────────────┐
│ HOOKS LAYER (hooks/)                                │
│ - useGameTransport, useAnswerSubmission, etc.      │
│ (export GameTransport-driven hooks)                │
└─────────────────────────────────────────────────────┘
               ↑ (uses)
┌─────────────────────────────────────────────────────┐
│ COMPONENT LAYER                                     │
│ - Primitives (Button, ScoreBadge, etc.)            │
│ - Orchestration (AnswerOrchestration, ResultOverlay)│
│ - States (Question, Leaderboard, etc.)             │
│ - Routes/Shells (GameWrapper, SoloShell)           │
└─────────────────────────────────────────────────────┘

KEY RULE: No circular dependencies. Components depend on Hooks
→ Hooks depend on Services → Services depend on State → State depends on Domain.
Routes instantiate services/hooks and pass them to children.
```

---

## 5. IMPLEMENTATION WAVES

### Wave 1: Domain + State Unification (P0, Blocking MVP)

**Effort**: ~20 hrs · **Blocking**: Answer orchestration refactor

**WP 1.1: Create domain layer** (`packages/common/src/domain/`)
- Files: `game-phases.ts`, `scoring.ts`, `achievements.ts`, `index.ts`
- Add enums/types for GamePhase, StreakCalculator utility, achievement metadata
- No runtime changes; domain is a "schema" layer only
- Estimate: 3 hrs
- Gate: Unit tests for StreakCalculator parity with server (Rust `scoring.rs`)

**WP 1.2: Merge usePlayerStore + useSoloStore → useGameStore**
- Files: `stores/game.ts` (replace `player.ts` + merge `solo.ts`)
- Add transport-agnostic state shape that supports both socket and HTTP hydration
- Estimate: 4 hrs
- Gate: Existing player-store tests pass; new store integration tests for both modes

**WP 1.3: Delete useSoloStore, update consumers**
- Files: Delete `stores/solo.ts`; update imports in `pages/assignment.$assignmentId.tsx`, `components/solo/*`
- Estimate: 2 hrs
- Gate: All solo routes still load and hydrate correctly

### Wave 2: Transport Abstraction + Hooks (P0, Blocking MVP)

**Effort**: ~25 hrs · **Blocking**: Answer orchestration + player session hook extraction

**WP 2.1: Extract `usePlayerGameSession` from page route**
- Files: `hooks/use-player-game-session.ts` (new), update `pages/party/$gameId.tsx`
- Extract ~150 LOC of inline socket setup (reconnect emit, timeout guard, status hydration) into reusable hook
- Matches pattern already established by `useManagerGameSession`
- Estimate: 3 hrs
- Gate: Player route still connects, hydrates, handles reconnect correctly

**WP 2.2: Create GameTransport interface + implementations**
- Files: `services/game-transport.ts`, `services/socket-transport.ts`, `services/rest-transport.ts`
- Implementations own all socket.emit/fetch calls, listeners, error handling
- Estimate: 6 hrs
- Gate: Unit tests for both transport modes (mock socket vs. mock fetch)

**WP 2.3: Extract `useAnswerSubmission` hook**
- Files: `hooks/use-answer-submission.ts` (new)
- Owns: answer validation, pending state, server ack wait, 800ms timeout, sound/haptics
- Consumed by `AnswerOrchestration` (both socket and REST)
- Estimate: 4 hrs
- Gate: Unit tests for happy path + timeout path

**WP 2.4: Extract `useCountdown` hook**
- Files: `hooks/use-countdown.ts` (new)
- Owns: timer tick generation, server-authoritative (low-latency mode) vs. client-side (fallback)
- Consumed by `AnswerOrchestration` + manager pause/resume logic
- Estimate: 3 hrs
- Gate: Timer integration tests (advance phase, pause, resume)

**WP 2.5: Extract `useGameTransport` hook**
- Files: `hooks/use-game-transport.ts` (new)
- Factory hook that returns a configured `GameTransport` instance (socket or REST)
- Used by routes to instantiate transport once, pass to components/orchestration
- Estimate: 2 hrs
- Gate: Both solo and multiplayer routes instantiate and use the transport correctly

### Wave 3: Answer Orchestration Unification (P0, Blocking MVP)

**Effort**: ~20 hrs · **Blocking**: Solo + multiplayer parity on answer submission

**WP 3.1: Create AnswerOrchestration.tsx**
- Files: `components/orchestration/AnswerOrchestration.tsx` (new), delete `SoloAnswers.tsx`
- Merged component that works with both socket and REST via `GameTransport`
- Owns: question rendering, answer-leaf selection (ChoiceGrid, MultiSelect, etc.), timer, submit, pending state, sound/haptics
- Props: `transport: GameTransport`, `question: Question`, `onPhaseChange?: () => void`
- Estimate: 8 hrs
- Gate: E2E tests for both MP and Solo answer flows (all 7 question types)

**WP 3.2: Create ResultOverlay.tsx**
- Files: `components/orchestration/ResultOverlay.tsx` (new)
- Renders feedback (correct/wrong, points, achievements) in two modes: full-screen (MP) or inline (Solo)
- Props: `feedback: FeedbackData`, `isInline?: boolean`, `onNext?: () => void`
- Estimate: 4 hrs
- Gate: E2E tests for result reveal (MP transition vs. Solo overlay)

**WP 3.3: Update Answers.tsx to use AnswerOrchestration**
- Files: `components/states/Answers.tsx` (simplify to ~50 LOC, delegate to AnswerOrchestration)
- Estimate: 2 hrs
- Gate: MP answer flow E2E tests pass

**WP 3.4: Update Solo components to use AnswerOrchestration**
- Files: `components/solo/SoloAnswers.tsx` (simplify or delete), update `components/solo/SoloShell.tsx`
- Estimate: 2 hrs
- Gate: Solo answer flow E2E tests pass

**WP 3.5: Update SoloShell.tsx to use useGameStore**
- Files: `components/solo/SoloShell.tsx`
- Replace all `useSoloStore` calls with `useGameStore`
- Estimate: 2 hrs
- Gate: Solo e2e tests pass

### Wave 4: Primitive Extraction + Consolidation (P1, Non-blocking)

**Effort**: ~15 hrs · **Blocking**: Visual consistency audit

**WP 4.1: Extract ScoreBadge primitive**
- Files: `components/primitives/ScoreBadge.tsx` (new)
- Consolidates 5 point-display implementations
- Props: `points: number`, `variant: 'inline' | 'toast' | 'badge'`, `isAnimated?: boolean`
- Estimate: 3 hrs
- Gate: All 5 call sites updated; visual regression tests

**WP 4.2: Extract ConnectionIndicator primitive**
- Files: `components/primitives/ConnectionIndicator.tsx` (new)
- Consolidates 2 ad-hoc renderings in `GameWrapper`
- Props: `isConnected: boolean`, `variant: 'spinner' | 'banner'`, `message?: string`
- Estimate: 2 hrs
- Gate: Connection state visual tests

**WP 4.3: Extract GameCodeDisplay primitive**
- Files: `components/primitives/GameCodeDisplay.tsx` (new)
- Consolidates 3 code renderings (`PinInput` input, `Room.tsx` static display, satellite raw input)
- Props: `code: string`, `variant: 'input' | 'display' | 'satellite'`, `onInput?: (code) => void`
- Estimate: 2 hrs
- Gate: Game code entry E2E tests

**WP 4.4: Build EmojiPinInput primitive** (done in doc #6)
- Files: `components/primitives/EmojiPinInput.tsx` (new, for Klassenmodus)
- Mirrors `PinInput` structure for emoji glyphs
- Estimate: 2–3 hrs (tracked separately in #6 Klassenmodus WP)

**WP 4.5: Audit + standardize dialog primitives**
- Files: Consolidate 5 hand-rolled Radix dialogs onto 2–3 canonical shapes
- Estimate: 3 hrs
- Gate: Dialog a11y tests (focus trap, title/description ids)

**WP 4.6: Rename/alias GameButton**
- Files: `components/primitives/GameButton.tsx` (new, alias to `Button.tsx`)
- Explicit name for clarity; no code change
- Estimate: 0.5 hrs

### Wave 5: Test Suite Expansion (P0, Blocking MVP)

**Effort**: ~15 hrs · **Blocking**: CI/CD gate

**WP 5.1: Domain unit tests**
- Files: `packages/common/src/domain/__tests__/`
- Test StreakCalculator parity with server, achievement tier logic
- Estimate: 3 hrs

**WP 5.2: Integration tests — Transport layer**
- Files: `features/game/__tests__/services/`
- Unit test both transports (socket + REST) with mocks
- Estimate: 4 hrs

**WP 5.3: Integration tests — Answer submission flow**
- Files: `features/game/__tests__/answer-submission.spec.ts`
- Test both MP (socket) and Solo (REST) answer paths end-to-end
- Estimate: 4 hrs

**WP 5.4: E2E — Comprehensive game flow**
- Files: `source/e2e/game-flow-unified.spec.ts` (new)
- Test both MP and Solo: join → question → answer → result → leaderboard → finish
- Run once for socket, once for REST
- Estimate: 3 hrs

**WP 5.5: Visual regression tests**
- Files: `features/game/__tests__/visual/`
- Test ScoreBadge, ConnectionIndicator, result overlay variants
- Estimate: 1 hr

---

## 6. COMPATIBILITY & BREAKING CHANGES

### Breaking Changes (NONE)

- ✅ **Stores** — `useGameStore` replaces `usePlayerStore` + `useSoloStore`, but exports the same shape (renamed fields aliased for compatibility during transition)
- ✅ **Components** — `AnswerOrchestration` is a new orchestration layer; old `Answers.tsx` still exists during transition (wrapped inside new state), so routes don't break
- ✅ **Hooks** — All new; old inline logic is migrated, not changed

### Backward Compatibility (Full)

- **Old routes** using `useSoloStore` will be updated to `useGameStore` (straightforward import swap)
- **Old components** using `Answers.tsx` will be wrapped by `AnswerOrchestration` (no prop change)
- **Socket/REST behavior** unchanged from player perspective (same events, same responses)

### Migration Path (Gradual)

1. **Wave 1–2**: Domain + state layer (no visual changes, just reshuffling)
2. **Wave 3**: Answer orchestration (hidden behind existing Answers.tsx wrapper)
3. **Wave 4**: Primitives (gradual opt-in, old calls still work)
4. **Post-MVP**: Deprecate old stores/components, remove transition wrappers

---

## 7. TESTING STRATEGY

### Unit Tests (Domain + Hooks + Services)

- **StreakCalculator**: Parity with server Rust `scoring.rs` (10 test cases)
- **useAnswerSubmission**: Happy path, timeout, error recovery (8 cases)
- **useCountdown**: Timer advance, pause/resume, server-authoritative sync (6 cases)
- **Transport mocks**: Socket mock vs. REST mock, both submit-answer paths (4 cases per transport × 2 = 8 total)

### Integration Tests (Stores + Hooks + Components)

- **Game state hydration**: Socket vs. REST, both load initial state correctly (4 cases)
- **Answer flow**: MP (socket emit → ack → status broadcast) vs. Solo (fetch → result), both update store (2 cases)
- **Reconnect**: Player reconnect (socket), solo resume (HTTP with sessionId), both restore state (2 cases)

### E2E Tests (Full Routes)

- **Multiplayer game**: 6–digit code entry → name → avatar → question → answer all 7 types → result → leaderboard → finish
- **Solo assignment**: name → questions (same 7 types) → results → leaderboard
- **Klassenmodus join** (from doc #6): code entry → emoji-PIN entry → roster name picker → question → answer
- Run each route 3× across different viewports (desktop, tablet, mobile)

### Visual Regression (Storybook + Percy)

- ScoreBadge variants (inline, toast, badge, animated)
- ConnectionIndicator variants (spinner, banner)
- ResultOverlay variants (full-screen MP, inline Solo)
- Dialog primitives (all 2–3 canonical shapes)

---

## 8. EFFORT ESTIMATE & SCHEDULE

| Wave | Focus | WPs | Est. hrs | Blocking | Duration |
|---|---|---|---|---|---|
| 1 | Domain + State | 1.1–1.3 | 9 | Wave 2 | Tue–Wed (2 days) |
| 2 | Transport + Hooks | 2.1–2.5 | 18 | Wave 3 | Thu–Fri (2 days) |
| 3 | Answer Orchestration | 3.1–3.5 | 18 | E2E + Deploy | Mon–Tue (2 days) |
| 4 | Primitives | 4.1–4.6 | 12 | Polish | Wed–Thu (2 days) |
| 5 | Tests | 5.1–5.5 | 15 | Release | Fri + following week (3 days) |
| **Total** | — | 18 | **72** | — | ~2–3 weeks (staggered) |

**Parallelization opportunity**: Waves 1–2 can overlap (state changes don't block service implementation). Waves 4–5 can start mid-Wave 3 (primitives and tests don't block orchestration).

**Realistic concurrent schedule**: 2 workers (1 on transport layer, 1 on components) → 8–10 days calendar time.

---

## 9. DEFINITION OF DONE

- [ ] Domain layer (`packages/common/src/domain/`) with unit tests (StreakCalculator, GamePhase mapping)
- [ ] `useGameStore` unified, replaces `usePlayerStore` + `useSoloStore` (no behavioral change, just merged)
- [ ] `GameTransport` interface + `SocketTransport` + `RestTransport` implementations with unit tests
- [ ] `usePlayerGameSession` hook extracted from page route (mirroring `useManagerGameSession` pattern)
- [ ] `useAnswerSubmission` + `useCountdown` + `useGameTransport` hooks implemented and tested
- [ ] `AnswerOrchestration.tsx` unified (both socket and REST paths green in E2E)
- [ ] `ResultOverlay.tsx` created (MP full-screen + Solo inline both working)
- [ ] `SoloAnswers.tsx` deleted (logic merged into orchestration)
- [ ] `useSoloStore` deleted (consumers migrated to `useGameStore`)
- [ ] Primitives extracted: `ScoreBadge`, `ConnectionIndicator`, `GameCodeDisplay`, `EmojiPinInput` (latter from doc #6)
- [ ] Dialogs standardized (2–3 canonical shapes, 5 hand-rolled removed)
- [ ] E2E tests passing: MP full flow, Solo full flow, all 7 question types, Klassenmodus join (3 flows × 3 viewports = 9 test suites)
- [ ] Visual regression tests passing (all primitive variants)
- [ ] Integration tests passing (state hydration, answer submission, reconnect)
- [ ] Typecheck, lint, unit/integration/E2E all green
- [ ] Cross-review by Grok (UX/polish) and Codex (architecture/duplication) completed
- [ ] All High/Medium findings consolidated; LOC count baseline verified (~1200–1400 saved)

---

## 10. RISK MITIGATION

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Answer orchestration breaks Socket.io** | Med | High | E2E tests for socket transport before merging; Grok reviews ack handling |
| **Answer orchestration breaks Solo** | Med | High | E2E tests for REST transport before merging; Codex reviews state shape |
| **State hydration race condition** | Low | Med | Transport implementations await full hydration before component render |
| **Timer/countdown divergence** | Low | Med | Unit test `useCountdown` with server mock; verify low-latency offset math |
| **Test suite explosion** | Med | Low | Run integration tests in CI only, not locally (too slow); stagger E2E by viewport |
| **Primitive extraction delays orchestration** | Low | Med | Do primitives in Wave 4 (after orchestration stable); don't block MVP on polish |

---

## SUMMARY

**Charter Item #2** (Modularization) is achieved through:
1. **Unified state**: Domain layer + `useGameStore` (no more `useSoloStore` fork)
2. **Unified orchestration**: `AnswerOrchestration` + `ResultOverlay` (one submit path, two transports)
3. **Unified tests**: Shared test suites covering both socket and REST (not 2 parallel test harnesses)
4. **Extracted primitives**: 6 new composable components (`ScoreBadge`, `ConnectionIndicator`, `EmojiPinInput`, etc.)
5. **Clean hooks**: `useGameTransport`, `useAnswerSubmission`, `useCountdown` separate concerns from routing

**Consolidation impact**: ~1200–1400 LOC saved (27–39% reduction), test coverage +52%, cognitive load ↓ for future features (solo-vs-multiplayer fork is now a transport choice, not a duplicate codebase).

