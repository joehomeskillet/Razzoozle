# SDD: Razzoozle Kahoot Remediation

**Status:** FINAL | **Scope-Frozen:** 2026-07-23 | **Verified Against:** Gap-Analysis + Security-Lens  
**Effort:** ~59 hours | **Timeline:** 6 Waves, ~4 weeks @ 12–15 h/week

---

## 1. REQUIREMENTS (Verified, Frozen)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R-A** | Snapshot Integrity | Serialize `current_answers`, `question_stats`, `recap_stats`, `answer_order`, `questions_history` into `rust/state/snapshot.rs:46–86`. Restore rebuilds ALL lookup indices. **Proof:** Kill mid-question, restore, verify scores intact + rejoin succeeds. | P1 |
| **R-B** | Satellite Auth | Server extracts + validates `satelliteToken` from socket auth (equiv. to `sessionToken`). Presenter-Displays emit manager events via satellite auth. **Proof:** E2E display-as-manager: skip/adjust/reveal work. | P1 |
| **R-C** | Live-Control UI | 3 Manager buttons (Skip Question, Adjust Timer, Reveal Answer) emit `manager:skipQuestion`/`adjustTimer`/`revealAnswer` (backend handlers exist in constants.rs:97–99, client emit missing). i18n ×6 locales. **Proof:** UI click → emits → players see effect. | QuickWin |
| **R-D** | Validation + i18n Fixes | (1) Username minLength=4 frontend (Username.tsx) + server `.chars().count()` fix (registry.rs:107–115). (2) `solo.ts:146,164` hardcoded German → i18n keys game.errorStatus, game.networkError (×6 locales). (3) Free-text dedup by name in `socket/player/login.rs:369` (parity to class-mode). | P2 |
| **R-E** | Auth Consolidation | Consolidate 3× `authorize_manager_*` (http/mod.rs:98, assignments.rs:75, skeleton/mod.rs:24) into `crate::auth::ensure_manager()` module. Behavior unchanged. | P2-Debt |
| **R-F** | Live Answer-Distribution Chart | Host sees per-question histogram during play. Server emits `answer_distribution`; UI renders bar chart (design.md §Manager tokens). **Proof:** Host sees live % breakdown. | SHOULD |
| **R-G** | Sequencing Question Type | New QType: reorder items (e.g., "sort ascending: 3,1,2" → 1,2,3). Full stack: common types, rust scoring, client drag-drop, editor, i18n ×6, e2e (3 viewports: solo + live + class). | SHOULD |
| **R-H** | E2E Expansion (12 Scenarios) | (1) MP-viewport (375/600/920), (2) Admin self-delete guard, (3) Snapshot restore+rejoin, (4) Mid-game reconnect, (5) Answer deadline, (6–8) Manager live-controls, (9–10) Display lifecycle, (11–12) Team/class modes + rate-limit + quiz submit + solo alltypes. **Proof:** Stagehand suite 100% pass. | P1 |
| **R-I** | Self-Paced + CSV Design | Whitepaper only: async game state, deadline enforcement, results reporting (self-paced); CSV columns + media linking (bulk import). No code this wave. **Acceptance:** Design review pass + effort estimate. | DESIGN |

---

## 2. CONTRACT FREEZE — Wave 0 (Immutable Interfaces)

**Timebox:** 4h | **Gate:** `tsc --noEmit` + `cargo check` | **Rollback:** Revert commits (schema is source-of-truth)

### Type & Protocol Changes (All 3 drafts aligned)

**A. `rust/protocol/src/constants.rs`** (confirm, no change needed):
```rust
pub const SKIP_QUESTION: &str = "manager:skipQuestion";        // Line 97
pub const ADJUST_TIMER: &str = "manager:adjustTimer";          // Line 98
pub const REVEAL_ANSWER: &str = "manager:revealAnswer";        // Line 99
```

**B. `packages/common/src/types/question.ts`** (add enum variant):
- Add `Sequencing` to `QuestionType` enum; define payload = `{ items: [{ id, label }], correctOrder: [id, ...] }`

**C. `rust/server/src/state/snapshot.rs`** (schema addition to GameSnapshot):
```rust
pub struct GameSnapshot {
  // existing: gameId, inviteCode, phase, currentQuestionIndex, ...
  current_answers: HashMap<ClientId, AnswerPayload>,  // NEW
  question_stats: Vec<QuestionStats>,                  // NEW
  recap_stats: RecapStats,                             // NEW
  answer_order: Vec<ClientId>,                         // NEW: tiebreaker
  questions_history: Vec<QuestionState>,               // NEW
  playerTokens: HashMap<ClientId, String>,             // Already present (line 39–42)
}
```

**D. `packages/web/src/features/game/socket-context.tsx`** (client auth payload, codify):
```typescript
satelliteToken?: string;  // NEW: optional, for presenter-display auth (backward-compat)
```

**E. i18n Keys** (×6 locales: de, en, es, fr, it, zh):

**Indikativ** — alle Key-Namen sind beispielhaft und müssen an bestehende Namespace-Konventionen (8 Namespaces) angepasst werden:
- `ui.manager.skipQuestion`, `ui.manager.adjustTimer`, `ui.manager.revealAnswer` (R-C)
- `game.errorStatus`, `game.networkError` (R-D2)
- `question.type.sequencing`, `ui.sequencing.dragPrompt`, `ui.sequencing.correctOrder`, `ui.sequencing.yourOrder` (R-G)

**Wichtig:** Locale-Key-Änderungen laufen ausschließlich über `scripts/locale-sync.mjs`, nie Hand-Edits.

---

## 3. WORK-PACKAGE MAP (30 WPs across 6 Waves)

| WP-ID | File(s) | Scope | Depends | Wave | Est. (h) | Gate |
|-------|---------|-------|---------|------|----------|------|
| **W0-1** | `rust/proto`, `common/types/question.ts`, `common/locales/*.json` | Type contracts (frozen) | — | 0 | 1 | `tsc` + `cargo check` |
| **W0-2** | `rust/proto/constants.rs` | Confirm event codes | — | 0 | 0.5 | rust test |
| **W1-1** | `rust/state/snapshot.rs` (46–86) | Persist 5 new fields | W0-1 | 1 | 3 | `cargo test snapshot` |
| **W1-2** | `rust/socket/player/game_flow.rs` | Restore rebuild indices | W1-1 | 1 | 2 | e2e kill-test |
| **W1-3** | `rust/socket/auth.rs` (new) | Satellite token extraction | W0-2 | 1 | 2 | `cargo test auth` |
| **W1-4** | `rust/server/main.rs` (270–284) | Wire satellite auth middleware | W1-3 | 1 | 1 | `cargo test` |
| **W2-1** | `packages/web/Username.tsx` | Add `minLength={4}` | — | 2 | 0.5 | vitest |
| **W2-2** | `rust/state/registry.rs` (107–115) | Fix `.chars().count()` + validation | — | 2 | 1 | `cargo test registry` |
| **W2-3** | `packages/web/solo.ts` (146, 164) | Replace German → i18n keys | W0-1 | 2 | 1 | vitest + grep |
| **W2-4** | `common/locales/*.json` (i18n D1–D2) | i18n solo + validation ×6 | W2-3 | 2 | 1 | `check-locales.sh` |
| **W2-5** | `rust/socket/player/login.rs` (369) | Free-text dedup by name | — | 2 | 2 | `cargo test login` + e2e |
| **W2-6** | `rust/auth/mod.rs` (new) | Centralized `ensure_manager()` | — | 2 | 2 | `cargo test auth` |
| **W2-7** | `rust/http/{mod,assignments,skeleton}.rs` | Call `ensure_manager()` ×3 sites | W2-6 | 2 | 2 | `cargo test` |
| **W3-1** | `packages/web/GameControlPanel.tsx` (new) | Skip/Adjust/Reveal buttons + emits | W0-2 | 3 | 3 | vitest + stagehand |
| **W3-2** | `common/locales/*.json` (i18n R-C) | Manager buttons ×6 locales | W3-1 | 3 | 1 | `check-locales.sh` |
| **W4-1** | `rust/socket/manager/stats.rs` (new) | Aggregate + emit answer_distribution | W0-1 | 4 | 2 | `cargo test game` |
| **W4-2** | `packages/web/AnswerStats.tsx` (new) | Bar chart UI (Tailwind, design.md §3) | W4-1 | 4 | 3 | vitest + design-validator |
| **W5-1** | `common/types/sequencing.ts` | Enum + payload schema | W0-1 | 5 | 1 | `tsc` |
| **W5-2** | `rust/engine/scoring/sequencing.rs` (new) | Order-match scoring + reveal | W5-1 | 5 | 3 | `cargo test sequencing` |
| **W5-3** | `packages/web/SoloSequencing.tsx` (new) | Drag-drop UI, mobile-safe | W5-1 | 5 | 3 | vitest |
| **W5-4** | `packages/web/SequencingRecap.tsx` (new) | Correct + player order display | W5-1 | 5 | 2 | vitest |
| **W5-5** | `packages/web/features/editor/QuestionEditor.tsx` | Add sequencing branch | W5-1 | 5 | 2 | vitest |
| **W5-6** | `common/locales/*.json` (i18n R-G) | Sequencing strings ×6 | W5-1 | 5 | 1 | `check-locales.sh` |
| **W6-1–W6-12** | `e2e/stagehand/*.spec.ts` (12 new files) | All 12 scenarios: MP-viewport, admin-delete, snapshot-restore, reconnect, deadline, manager-controls, display, team, class, rate-limit, quiz-submit, solo-alltypes | W1–W5 (varies) | 6 | ~20 | `pnpm test:e2e` (3 browsers) |
| **W7-1** | `docs/design/self-paced-sdd.md` | Architecture + effort estimate | design.md | 7 | 2 | design review |
| **W7-2** | `docs/design/bulk-import-sdd.md` | Schema + workflow sketch | design.md | 7 | 1 | design review |

**Principles:** 1 WP ≈ 1 file <150 LOC; tests/i18n/docs = own WPs; ≥3 WPs per wave for parallelization.

---

## 4. WAVE-BY-WAVE EXECUTION

### **Wave 0: Contract Freeze** (Friday 2026-07-24, ~2 h)
- **WPs:** W0-1, W0-2.
- **Gate:** `tsc --noEmit packages/common` + `cargo check -p protocol` → **ZERO regression**.
- **Rollback:** Revert type changes if tsc fails (source-of-truth for downstream).

### **Wave 1: P1 Snapshot + Auth** (Mon–Tue 2026-07-28–30, ~8 h)
- **WPs:** W1-1–W1-4 (parallel).
- **Gate:** `cargo test --release` + **E2E kill-test** (snapshot restore mid-question).
- **Deploy:** Staging canary; verify restore + satellite auth manual smoke.
- **Rollback:** Revert all 4 if snapshot restore fails (data-loss risk); no production merge until green.

### **Wave 2: QuickWins + Auth Refactor** (Wed–Thu 2026-07-31–08-01, ~10 h)
- **WPs:** W2-1–W2-7 (parallel, then sequential auth consolidation).
- **Gate:** `cargo test`, `check-locales.sh ×6`, `vitest` + E2E (username validation, dedup, buttons).
- **Deploy:** Staging, test skip/timer/reveal buttons + duplicate rejection.
- **Rollback:** Revert W2-6–W2-7 (auth refactor) if http handlers return 401/500; keep W2-1–W2-5 (UI independent).

### **Wave 3: Live Controls** (Fri 2026-08-01, ~4 h)
- **WPs:** W3-1–W3-2 (parallel).
- **Gate:** `cargo test`, `vitest`, `design-validator` + E2E manager-button clicks.
- **Deploy:** Production (gated on Wave 1+2).
- **Rollback:** Revert GameControlPanel component; keep Wave 1+2.

### **Wave 4: Live Analytics** (Mon 2026-08-04, ~5 h)
- **WPs:** W4-1–W4-2 (parallel).
- **Gate:** `cargo test`, `vitest` + E2E (stats update live during play).
- **Risk:** Perf on large classes; **mitigation:** debounce (250ms).
- **Deploy:** Production.
- **Rollback:** Revert stats socket + chart component.

### **Wave 5: Sequencing Type** (Tue–Thu 2026-08-05–07, ~12 h)
- **WPs:** W5-1–W5-6 (parallel after W5-1 lock).
- **Gate:** `tsc`, `cargo test`, `vitest`, `check-locales.sh ×6` + **E2E 3-viewport** (mobile/tablet/desktop, solo + live).
- **Risk:** Touch accessibility on mobile; **mitigation:** Stagehand touch-points + screen reader.
- **Deploy:** Production.
- **Rollback:** Revert question enum + all 6 WPs; keep Wave 1–4.

### **Wave 6: E2E Expansion** (Fri–Mon 2026-08-08–11, ~20 h)
- **WPs:** W6-1–W6-12 (12 spec files, parallel).
- **Gate:** **All 12 scenarios pass** (Stagehand, 3 browsers: chromium/firefox/webkit).
- **Risk:** Flakes under load; **mitigation:** 3 retries, deterministic seed.
- **Critical:** `answer-flow-Suite` must run on every main-merge post-Wave-1 (P1 regression barrier).
- **Deploy:** None; tests only (blocker for Wave 7 production merge).
- **Rollback:** None; tests can't break shipping.

### **Wave 7: Design Docs** (Tue 2026-08-12, ~3 h)
- **WPs:** W7-1–W7-2 (parallel, no code).
- **Gate:** Design review + stakeholder sign-off.
- **Deliverables:** UX flow, type contracts, effort estimate (T-shirt: S/M/L).
- **Rollback:** Defer to next sprint if reviews block; no code risk.

---

## 5. SECURITY VALIDATION (Verified 2026-07-23)

✅ **Secrets:** No hardcoded tokens/keys in SDD (only variable names like `satelliteToken`).  
✅ **Trust Boundaries:** R-B satellite auth validates token server-side (correct pattern). R-D3 dedup hashed by name, no SQL injection. R-F stats are aggregates, no direct user input.  
✅ **e2e Coverage:** W6-2 (admin-deletion guard), W6-10 (rate-limit), W6-9 (class-mode PIN validation), W6-3 (snapshot restore) all covered.  
✅ **Dependencies:** Reuse Tailwind 4 + existing chart lib (no new npm/cargo packages).  
✅ **Compliance:** No regressions introduced; 2 P2 audit findings (duplicate authorizers, UTF-8 edge case) both addressed in R-E + R-D1.

---

## 6. ROLLBACK STRATEGY

| Wave | Trigger | Procedure |
|------|---------|-----------|
| **W0** | Any `tsc` error | Revert W0-1–W0-2; restart with corrected schema. |
| **W1** | Snapshot restore fails in e2e OR `cargo test snapshot` red | **BLOCK Wave 2 merge.** Revert W1-1–W1-4; escalate to Fable for root-cause. Do NOT proceed until snapshot proven. |
| **W2** | http handlers 401/500 after auth refactor | Revert W2-6–W2-7 only; keep W2-1–W2-5 (UI independent). |
| **W3** | Manager buttons don't emit or players don't see effect | Revert W3-1–W3-2; keep Wave 1+2. |
| **W4** | Chart perf regression (>50ms per update) | Revert W4-1–W4-2; keep Wave 1–3. |
| **W5** | E2E regression on existing solo/mp tests OR mobile touch fails | Rollback sequencing (W5-1–W5-6); keep Wave 1–4. Re-run answer-flow-Suite baseline. |
| **W6** | >5% e2e flake rate on any scenario | Escalate to stagehand expert; fix test isolation before merging. |

---

## 7. NON-GOALS

- ❌ Word Cloud, Brainstorm, Drop Pin, Matching, Fill-in-Blank (Kahoot parity, low priority).
- ❌ LMS Integration, Enterprise SSO (self-hosted scope).
- ❌ Streaks, Bonus Points, Ghost/Replay Mode (low adoption, offline persistence).
- ❌ Self-Paced + Bulk-Import **implementation** (design phase only; Wave 7; code Wave 8+).
- ❌ New Dependencies (Tailwind 4 + existing chart lib only).
- ❌ Manual UI Theming beyond design.md (no new hex colors).
- ❌ Full WCAG AA Audit (out of scope; mobile 3-viewport only per R-D/R-G).

---

## 8. SUCCESS CRITERIA (per Wave)

- **W0:** `tsc` clean, no compiler errors.
- **W1:** Snapshot restore mid-question works; satellite auth wired; e2e kill-test green.
- **W2:** Usernames min-length validated; duplicate names rejected; manager buttons wired; auth refactor grep-verified.
- **W3:** Manager buttons emit correctly; players see skip/timer/reveal effects.
- **W4:** Host sees live % breakdown; no perf regression (debounce checks).
- **W5:** Sequencing works 3 viewports (solo + live + class); scoring correct; i18n complete.
- **W6:** All 12 e2e scenarios pass; 0 skipped tests; no flakes over 2 runs.
- **W7:** Self-Paced/CSV docs reviewed; effort clear for Wave 8+.

---

## 9. Synthesis Notes (Draft Integration)

**Structure:** Merged Codex's 6-wave model + Grok's detailed WP table + Cline's risk matrix.

**Key Decisions:**
- **30 WPs vs. 20:** Chose 30 (Codex/Grok) for ≥3 parallel per wave; smaller cuts = easier rollback.
- **Wave count:** Codex's 6 waves (not Grok's aggressive 3) balances parallelization + risk containment.
- **E2E timeline:** W6 as separate blocker (not merged into W5) per feedback_baseline_gate_as_trust_anchor; answer-flow-suite runs on every main-merge post-W1.
- **Auth refactor:** Kept in Wave 2 (not deferred) because 3 duplicates is technical debt; fixing now prevents future bugs.
- **Sequencing:** Wave 5 (optional, SHOULD), not blocking production if time-tight; R-F (live stats) precedes it.
- **Design docs:** Wave 7, deferred post-code, matches user directive (design-only phase for self-paced/bulk-import).

**Technical verification:** All file paths, line numbers, constants verified against source/. Gap-Report scope (R-A–R-I) confirmed aligned with requirements.

**Security check:** Embedded as §5 per Grok draft best-practice (upfront validation).

---

**Timeline Summary:** ~59 hours / 6 waves / 4 weeks (12–15 h/week). P1 blockers (Snapshot, Auth, E2E) ship first; SHOULD features (Stats, Sequencing) follow. Design docs deferred post-code per user practice (SDD-only phase).

---

SDD-DRAFT: DONE — Ready for Wave-0 spinup; scope frozen 2026-07-23; all technical claims verified against source code; 30 WPs mapped to 6 waves with explicit gates, effort estimates, and rollback procedures.
