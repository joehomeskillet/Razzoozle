# Host & Analytics Features — System Design Document

**Version:** 1.0  
**Status:** Specification  
**Priority:** P1–P3 (mixed)

---

## Overview

This SDD consolidates six backlog features spanning game configuration (Streaks/Bonuses, Randomize), analytics (Time-to-Answer), data export (PNG/PDF), and operational controls (Participant Cap, Session Timeout). Each feature is scoped to isolation, reusing existing infrastructure (scoring, result pipelines, manager config).

---

## 1. Streaks & Bonus Points

### Requirement

Award bonus points for consecutive correct answers within a single game session.

### Current State & Shipped Truth

- **SHIPPED:** Streak tracking and bonus-point scoring are fully integrated:
  - `ShowResultData.streak?: number` (type definition in `common/src/types/game/status.ts`)
  - `ShowResultData.streakBonus?: boolean` (visual flag)
  - `STREAK_STEP` multiplier and hard cap of 200 points applied in scoring engine.
  - Achievements: `streak_3`, `streak_5`, `streak_10` in `common/src/achievements.ts`.
  - Client displays flame badge and streak bonus breakdown on leaderboard & results CSV.

### Design

#### Scoring Formula

When `achievement.streak` ≥ threshold (e.g., 3 consecutive correct):
```
bonus_points = streak_length × multiplier
base_score = normal_score_for_round
total_score = base_score + bonus_points
```

Suggested multiplier: **10 points/streak** (e.g., 5-streak = 50 bonus). Configurable per achievement in manager.

#### Schema Changes

**Database:** Add column to `results_questions` (nullable, performance OK):
```sql
ALTER TABLE results_questions ADD COLUMN bonus_points INT DEFAULT 0;
```

**Protocol** (`rust/protocol/src/results_display.rs`):
```rust
pub struct PlayerAnswerRecord {
  // ... existing fields ...
  bonus_points: Option<i32>,  // Added
}
```

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| `rust/engine/src/scoring.rs` — Apply multiplier | Scoring WP | Low |
| Protocol binding (`PlayerAnswerRecord.ts`) | Contract WP | Low |
| Display (Result Modal header) | Manager UI WP | Low |
| Achievement unlock logic | Server WP | Low |

#### Acceptance Criteria

- ✅ After 3 consecutive correct answers, next correct answer grants base + bonus.
- ✅ Streak breaks on incorrect/unanswered question.
- ✅ Bonus appears in result CSV export & result modal.
- ✅ Achievements unlock per configurable thresholds.

#### Non-Goals

- Streak visualization during live game (only post-result).
- Streak decay over time (always resets per game).
- Cross-game streak tracking.

---

## 2. Time-to-Answer Analytics

### Requirement

Track and export average response time per question across all players; support per-player response time analysis.

### Current State

- **Complete:** Infrastructure already exists:
  - `PlayerAnswerRecord.responseMs?: i32` captured in `rust/engine/src/state/mod.rs` (from `answer.response_time_ms`)
  - Persisted in result protocol & database
  - CSV export includes column (manager/utils/resultExport.ts: `pa.responseMs ?? ""`)
  - Manager result modal displays "Response Time" column

- **Gap:** **Aggregate analytics missing:** no per-question average or histogram. No dashboard widget. Export always includes raw response time per player (sufficient for external analytics tools), but no built-in time-grouping or performance percentile.

### Design

#### Report Scope

Two levels (MVP):

1. **Per-Question Summary** (new result-modal panel):
   ```
   Question #1: Avg 3.2 sec | Median 2.8 sec | Min 0.5 sec | Max 12.3 sec | Responses 24
   ```

2. **Per-Player Timeline** (new export CSV column—optional):
   ```
   Player | Q1 (ms) | Q2 (ms) | Q3 (ms) | ... | Avg (ms)
   ```

#### Schema Changes

None required; raw `responseMs` values already persisted.

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| Result-modal analytics panel (compute avg/median) | Manager UI WP | Low |
| Timeline CSV export (conditional column) | Export utils WP | Low |
| No backend; all client-side aggregation | — | — |

#### Acceptance Criteria

- ✅ Result modal shows per-question average response time.
- ✅ CSV export includes response times per player per question (already done; verify format).
- ✅ Percentile bands (P50, P75, P90) optional but nice-to-have.

#### Non-Goals

- Real-time response-time streaming during game.
- Machine-learning anomaly detection on outliers.
- Timezone/locale-aware time formatting (use raw ms).

---

## 3. Results Export (PNG/PDF)

### Requirement

Enable managers to export final leaderboard and/or per-question results as image (PNG) or PDF file for sharing/archiving.

### Current State

- **Partial:** CSV & JSON export exist:
  - `exportResultCsv()`, `exportQuestionsCsv()`, `exportResultJson()` in `web/src/features/manager/utils/resultExport.ts`
  - Manager UI has "Download CSV" / "Download JSON" buttons in result modal
  - No image or PDF export

- **Gap:** Image/PDF rendering pipeline does not exist. Requires headless browser or canvas rendering library (e.g., html2pdf, puppeteer, canvas-based).

### Design

#### Scope: Leaderboard Only (MVP)

Export final rank/player/points table as PNG or PDF:

```
┌─────────────────────────────┐
│ Quiz Name │ 2026-07-24      │
├─────────────────────────────┤
│ Rank │ Player    │ Points    │
├──────┼───────────┼───────────┤
│ 1    │ Alice     │ 4500      │
│ 2    │ Bob       │ 3200      │
│ 3    │ Charlie   │ 2100      │
└─────────────────────────────┘
```

#### Library Choice

**Recommended:** Use `html2pdf.js` (client-side, zero backend dependency) or `jsPDF` + `html2canvas`:
- Zero backend overhead.
- Works offline (leaderboard data already in browser).
- Familiar in web community.

**Alternative:** `puppeteer` (backend HTML → PDF) if brand/styling precision critical, but adds complexity + cost.

#### Scope NOT Included

- Per-question breakdown (complex multi-page PDF; defer to Wave-N).
- Signature / certificate fields (design gate).
- QR-code link to full results JSON (nice-to-have).

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| Add `jsPDF` + `html2canvas` to package.json | Deps WP | Minimal |
| `exportLeaderboardPng()` / `exportLeaderboardPdf()` in resultExport.ts | Export WP | Medium |
| Manager UI: "Download as PNG / PDF" button trio | Manager UI WP | Low |
| Styling: ensure print-friendly CSS (no dark background, good contrast) | CSS WP | Low |

#### Acceptance Criteria

- ✅ PNG export renders leaderboard at 1920×1080 (or A4-equivalent 1500×1900 for PDF).
- ✅ PDF includes title (quiz name) + date + player rank/name/points.
- ✅ Anonymise toggle respected (displays "Player 1" if toggled).
- ✅ No external API calls; client-only.

#### Non-Goals

- Per-question export (defer).
- Certificate generation (design scope).
- Watermark / branding overlay (brand-team decision).

---

## 4. Participant Cap

### Requirement

Limit the maximum number of players allowed to join a single game session.

### Current State

- **None:** No max-participant limit exists. Server accepts unlimited join attempts.
- Server tracks active players via `game.players` map (socket.io rooms), but never gates on count.

### Design

#### Config Flow

1. **Manager Config** (new field):
   ```typescript
   // Added to ManagerConfig:
   maxParticipants?: number  // e.g., 30. Absent/null → unlimited.
   ```

2. **Game Setup** (before lobby starts):
   - Manager sets max in settings UI (new widget).
   - Server persists in memory for the session (or DB if persistence needed).

3. **Join Gate** (socket join handler):
   ```rust
   if game.players.len() >= max_participants {
     deny with "Game is full" error
   }
   ```

#### Schema Changes

**Database:** Add optional column to `games`:
```sql
ALTER TABLE games ADD COLUMN max_participants INT;
```

**Protocol** (`rust/protocol/src/game_config.rs`):
```rust
#[derive(Serialize, Deserialize)]
pub struct GameConfig {
  max_participants: Option<u32>,
}
```

**Manager Type** (`common/src/types/manager.ts`):
```typescript
export interface ManagerConfig {
  // ...
  maxParticipants?: number
}
```

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| ManagerConfig type + socket event | Contract WP | Low |
| Manager UI: number input (1–1000 range) | Manager UI WP | Low |
| Socket join-gate logic (rust/socket/handlers.rs) | Socket WP | Low |
| Error message i18n ×6 locales | Locale WP | Low |

#### Acceptance Criteria

- ✅ Manager can set max participants (1–1000 range).
- ✅ Game rejects joins when cap is reached.
- ✅ Error message displays in player's browser.
- ✅ Reconnecting players (existing members) bypass cap.
- ✅ After game ends, cap resets (or is configurable for next game).

#### Non-Goals

- Waitlist / queue on cap exceed.
- Dynamic cap changes mid-game.
- Per-team max (only global).

---

## 5. Session Timeout

### Requirement

Automatically end a game session after prolonged inactivity (e.g., 30 minutes with no player input).

### Current State

- **None:** No session timeout exists. Games remain active indefinitely unless manually closed by manager.

### Design

#### Timeout Model

1. **Idle Clock:** Reset on every **substantive event** (player answer, manager action, game state change).
   - Ping/heartbeat ≠ activity; does not reset clock.

2. **Threshold:** Configurable per game (default: 30 min). After threshold passes:
   - Server emits `SESSION_TIMEOUT` to all players + manager.
   - Game transitions to `finished` state.
   - Results are saved as-is (no data loss).

3. **Grace Period:** Optional 60-sec warning before force-close (UX).

#### Schema Changes

**Database:** Add columns to `games`:
```sql
ALTER TABLE games 
  ADD COLUMN session_timeout_minutes INT DEFAULT 30,
  ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();
```

**Manager Config** (new field):
```typescript
sessionTimeoutMinutes?: number  // Default 30; absent → 30.
```

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| Manager UI: timeout config widget (dropdown: 15/30/60/120 min) | Manager UI WP | Low |
| Rust: idle-timer logic + event emitter | Socket WP | Medium |
| Database: last_activity_at tracking | Schema WP | Low |
| Client: SESSION_TIMEOUT handler (warn + graceful close) | Client UI WP | Low |
| i18n message ("Game ended due to inactivity") ×6 | Locale WP | Low |

#### Acceptance Criteria

- ✅ Manager configures timeout at game start.
- ✅ Game auto-ends when idle threshold exceeded.
- ✅ Results auto-saved with final state.
- ✅ Players receive notification (optional warning before force-close).
- ✅ Timeout does not trigger on idle *presentation* view (only player activity).

#### Non-Goals

- Per-player timeout (only game-wide).
- Timeout suspension during specific game phases.
- Reconnection grace period (separate concern).

---

## 6. Randomize Questions

### Requirement

Randomize the order of questions for each game session, and/or randomize the order of answer options within each question.

### Current State

- **Partial (answers only):**
  - `ManagerConfig.randomizeAnswers?: boolean` already exists.
  - Server permutes answer indices when enabled (protocol: `ShuffleAnswerIndices`).
  - Client receives permutation and renders answer tiles in shuffled order.
  - Scoring always uses canonical indices (no confusion).

- **Gap:** Question order is **always canonical** (loaded in definition order). No server-side question shuffling.

### Design

#### Two-Tier Randomization

1. **Answer Randomize** (already done):
   - ✅ Existing `randomizeAnswers` flag; no changes needed.

2. **Question Randomize** (new):
   - New flag: `randomizeQuestions?: boolean`
   - Server shuffles question sequence before sending to client.
   - Scoring references canonical IDs (not shuffled order) so results are always aligned.

#### Shuffling Method

Use Fisher-Yates shuffle seeded by game ID for determinism:
```rust
// Pseudocode
let mut shuffled_q_ids = question_ids.clone();
let seed = u64::from_be_bytes(game_id.as_bytes()[..8].try_into()?);
let mut rng = StdRng::seed_from_u64(seed);
shuffled_q_ids.shuffle(&mut rng);
// Send shuffled_q_ids to client; scoring uses original IDs
```

Benefit: If client reconnects mid-game, server can re-send the same shuffle order.

#### Schema Changes

**Manager Config** (`common/src/types/manager.ts`):
```typescript
randomizeQuestions?: boolean
```

**Protocol** (`rust/protocol/src/game_config.rs`):
New field or expand existing `GameConfig`:
```rust
pub randomize_questions: bool,
pub randomize_answers: bool,
```

#### Implementation Scope

| Component | Owner | Effort |
|-----------|-------|--------|
| Manager UI: checkbox "Randomize Questions" | Manager UI WP | Low |
| Socket handler: apply Fisher-Yates shuffle | Socket WP | Low |
| Protocol: question-order field in game-start event | Contract WP | Low |
| Client: render questions in server-provided order | Client UI WP | Low |
| Scoring: always use canonical Q-ID (no changes) | Scoring WP | None |

#### Acceptance Criteria

- ✅ Manager can toggle randomize-questions independently of randomize-answers.
- ✅ Questions appear in random order for each player (deterministic per game).
- ✅ Scoring always references original question canonical ID.
- ✅ Results CSV/JSON maintain original question order (not shuffled).
- ✅ Player reconnect preserves same shuffle order.

#### Non-Goals

- Per-player question order (always same order for all players in session).
- Shuffle seed customization (use game ID only).
- Weighted randomization (all questions equal probability).

---

## Priority & Wave Assignment

| Feature | P | Effort | Wave | Notes |
|---------|---|--------|------|-------|
| **Streaks & Bonus** | P1 | Low | W7 | Scoring gap + achievement unlock; reuse existing streak type |
| **Time-to-Answer** | P1 | Low | W7 | Analytics panel only; data already exists |
| **Results Export (PNG/PDF)** | P2 | Medium | W8 | New library; client-only; no backend burden |
| **Participant Cap** | P2 | Low | W8 | Simple gate + UI; backward compatible |
| **Session Timeout** | P2 | Medium | W8 | Idle timer + state machine; moderate complexity |
| **Randomize Questions** | P3 | Low | W9 | Isolated feature; reuse shuffle utilities |

---

## Implementation Strategy

### Wave 0: Contracts & Schemas

**Single WP:** Bump protocol bindings, add config types, DB migrations.
- Affect: PlayerAnswerRecord (bonus_points field), ManagerConfig (6 new fields), games table (4 new columns).
- Gate: TypeScript validation + sqlx compile-time checks.

### Waves 1–3: Backend Workers

Each feature spawns **separate CLI WP** (streak scoring, timeout timer, question shuffle).
- Parallel: no dependencies between features.
- Use existing utilities: chunks.rs for shuffle; scoring.rs entry point for bonus.

### Waves 4–5: Manager UI

Manager UI WP for config widgets (5 new inputs: max_participants, session_timeout_minutes, randomizeQuestions, etc.).
- One unified UI WP vs. separate per-feature (TBD).
- Validation: ranges (1–1000 for cap, 1–480 for timeout).

### Wave 6: Client & Result Rendering

Results modal enhancements (analytics panel, bonus display, export buttons).
- PNG/PDF: add jsPDF + html2canvas.
- Response-time averages: client-side aggregation only.

### Wave 7: QA & Smoke

`stagehand` e2e suite:
- Streak unlock after 3 correct.
- Timeout after 30 min (or mock clock in test).
- Participant cap reject on 31st join.
- Randomize: verify question order varies per session (deterministic per game ID).
- Export: verify PNG/PDF renders leaderboard and anonymise flag.

---

## Unknowns & Open Decisions

1. **Streak multiplier:** Default to 10 pt/streak? Config-per-achievement? (Manager decision)
2. **Timeout grace period:** Include 60-sec warning? (UX decision)
3. **Export format:** PNG width/height, PDF orientation, font choice? (Brand/design decision)
4. **Participant cap upper bound:** 1000 or 100? (Product decision)
5. **Question randomize + question groups:** Do question groups (e.g., "Wortarten") randomize as units or individual questions? (Product scope)

---

## File & WP Table

| Backlog Feature | Implementation Files | WP ID | Status |
|-----------------|----------------------|-------|--------|
| **Streaks & Bonus** | rust/engine/src/scoring.rs, rust/protocol/src/results_display.rs, packages/web/ResultModal.tsx | TBD | Pending |
| **Time-to-Answer** | packages/web/src/features/manager/components/AnalyticsPanel.tsx (new), resultExport.ts (update) | TBD | Pending |
| **Results Export** | packages/web/src/features/manager/utils/resultExport.ts, ResultModal.tsx (button trio) | TBD | Pending |
| **Participant Cap** | rust/server/src/socket/handlers.rs, common/src/types/manager.ts, packages/web/.../SettingsWidget.tsx | TBD | Pending |
| **Session Timeout** | rust/server/src/timers.rs (new), packages/web/GameSessionHandler.tsx, common/types/socket.ts (SESSION_TIMEOUT event) | TBD | Pending |
| **Randomize Questions** | rust/engine/src/shuffle.rs, rust/protocol/src/game_config.rs, packages/web/GameLoader.tsx | TBD | Pending |

---

## Testing Strategy

### Unit

- Shuffle algorithm: determinism test (same game ID = same order).
- Scoring: streak bonus application edge cases (breaks on unanswered).
- CSV export: null responseMs handling, anonymise toggle.

### Integration

- Timeout + game-end: saves final results, emits SESSION_TIMEOUT.
- Cap + join gate: 30th player accepted, 31st denied.
- Randomize + reconnect: same question order after reconnect.

### E2E (Stagehand)

- Streak unlock after 3 correct answers (verify badge + points).
- Export PNG: render + download in browser.
- Timeout: advance clock 31 min, verify game auto-closed.
- Participant cap: multi-user test with 31 browsers.

---

## References

- [Current Streak Tracking](../achievements.ts) — existing threshold config
- [Result Export Utils](../packages/web/src/features/manager/utils/resultExport.ts) — CSV/JSON builders
- [ManagerConfig Type](../packages/common/src/types/manager.ts) — existing config fields
- [Shuffle Utilities](../packages/common/src/utils/chunks.ts) — reusable Fisher-Yates

---

**Document Status:** Spec ready for Wave routing. Features are disjunct; parallel WP execution recommended after Contract-Wave gates.
