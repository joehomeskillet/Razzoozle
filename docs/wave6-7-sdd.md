# SDD: Wave 6 & 7 — e2e-Ausbau + Self-Paced/Bulk-Import-Design

**Status:** FINAL (Wave 6 e2e) + DESIGN-PHASE (Wave 7) | **Scope-Frozen:** 2026-07-24  
**Verified Against:** Bestand-Scan + 12 SDD-Szenarien (W6), Gap-Analysis + DB Migrations (W7)  
**Deliverables:** 11 new e2e .spec.ts (W6) + 2 Design SDDs (W7 only, no implementation)  
**Timeline:** Wave 6 ~20 h parallel (1 week), Wave 7 ~4 h design-authoring  

---

## EXECUTIVE SUMMARY

**Wave 6:** e2e-Test-Ausbau — 12 neue Szenarien (MP-Viewports, Admin-Guards, Manager-Controls, Reconnect, Team-Mode, Class-Mode, sequencing-LIVE) covering 15 frozen requirements. All tests serialized via shared Chrome profile (workers=1). Baseline gate: answer-flow + solo-types CI-blocked post-W1.

**Wave 7:** Design-Phase only — 2 SDDs author specifications for:
1. **Self-Paced/Homework Mode** — async assignment gameplay with deadline + class reporting
2. **CSV Bulk Import** — question import schema covering all 9 types

Wave 7 produces design documents (no code, no migrations). Wave 8 implements both features.

---

## UMGEBUNG & GROK-CLI-AUSFÜHRUNGSREGELN (Unified)

### Arbeitsmodus (STRIKTE Einhaltung)

**Worktree-Isolation:**
```bash
# Wave 6 (e2e):
git worktree add .claude/worktrees/wave6-wp<N> origin/main -b wave6-wp<N>
cd .claude/worktrees/wave6-wp<N>/source
pnpm install --ignore-workspace  # e2e liegt außerhalb Workspace

# Wave 7 (design):
git worktree add .claude/worktrees/wave7-design origin/main -b wave7-design-sdds
cd .claude/worktrees/wave7-design/source
# (no pnpm install needed — authoring only)
```

**Serialisierung (Browser-Host-Last):**
- 1 Browser-Prozess pro `npx tsx` Lauf (workers=1, shared Chrome-Profile)
- Mehrere `npx tsx` nacheinander, NICHT gleichzeitig (Port-Clash, Chrome-Deadlock)
- Stagehand teilt sich Profile/Prozess; kein Parallelismus

**Umgebung (Wave 6 e2e nur):**
```bash
export E2E_BASE_URL="http://localhost:3000"
export E2E_PW="<admin-password>"
export E2E_USER="admin"
```

**Output-Handling:**
- Nach jedem Lauf: **KOMPLETTER Output drucken** (stderr + stdout, exit code)
- Kein Summary-Wrapper — verbatim Prozess-Output
- Timeouts: 60s (einzelne Szenarien), 480s (answer-flow falls aktiviert)

**Commit-Konvention (pro WP):**
```
feat(e2e): <WP-ID> <Scenario> — <1-Satz Zweck>
# Wave 6 Beispiele:
feat(e2e): W6-1 snapshot-restore — verify player state persists after kill
feat(e2e): W6-10 sequencing-live — 8-item order test, first live execution

# Wave 7 Beispiel:
docs: wave7 self-paced and bulk-import sdds
```

**Fixture-Locking:**
- Wave 6: Nutze nur `all-types-quiz.json` (10 Fragen, Q8=Sequencing)
- Wave 7: Verifiziere gegen live db/migrations/* (source of truth)

---

## TEIL A: WAVE 6 — E2E-TEST-AUSBAU (15 Requirements)

### A.1 Requirements (Verified, Frozen)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R1** | MP-Viewport 375/600/920 | `mp-loop.spec.ts` + `snapshot-restore.spec.ts` laufen auf 3 Viewports. Keine Layout-Squish, Leserlichkeit bei 375px. **Proof:** 3× run, alle grün, visuelle Inspektion. | P1 |
| **R2** | Admin Self-Delete Guard | Manager-UI: Delete Button DISABLED für Self. API: DELETE /api/admin/{self-id} → 400. Rust auth.rs P0-Gate + Client UIGuard. | P1 |
| **R3** | Snapshot Restore + Kill-Rejoin | Host snapshots mid-Q1, Game wird killed, Player rejoint mit PIN. Server rebuild Indices. Beide Seiten: Q1-Punkte persistent, Q2 konsistent. | P1 |
| **R4** | Mid-Game Reconnect | Player Socket disconnected, rejoint → sieht Q1-Ergebnis, NICHT Q2. playerToken/player-identity erkannt. | P1 |
| **R5** | Answer Deadline (Submit nach Ablauf) | Frage mit 5s Timeout. P1 antwortet in 3s (✓). P2 wartet bis 5.5s, klick ignoriert. Server sendet "deadline" Event 4–6s. | P2 |
| **R6** | Manager skipQuestion | Host klickt Skip Button, Client emits `manager:skipQuestion`, Server springt zu Q2. Beide Player sehen Q2 sofort. | P1 |
| **R7** | Manager adjustTimer | Host klickt +10s, Client emits `manager:adjustTimer`, Server-Handler erhöht deadline. Player-Countdown aktualisiert live. | P1 |
| **R8** | Manager revealAnswer | Host klickt Reveal vor Deadline, Server sendet REVEAL_ANSWER Event. Player sieht korrekte Antwort + Highlighting sofort. | P1 |
| **R9** | Display Lifecycle | Presenter-Display emits manager events via `satelliteToken`. manager-media-tab.spec.ts + display-refresh-cycle vollständig. | P2 |
| **R10** | Team-Mode | Quiz teamMode=true. Player1+Player2=Team A, Player3=Team B. Q1: nur einer klickt, zählt für Team. Leaderboard: Team A vs B. | P3 |
| **R11** | Class-Mode-Join-Enforcement | Quiz classMode=true + enrolled: ["Alice", "Bob"]. Unbekannter Player → 403. Alice → OK. Manager sieht nur enrolled. | P1 |
| **R12** | Sequencing LIVE (8-Item Durchlauf) ⚠️ | Sequencing Q8: P1 richtig (1,2,...,8), P2 falsch. Reveal: P1 +5, P2 +0. **KRITISCH:** Noch nie LIVE getestet. | P1 |
| **R13** | Duplicate Player Name Reject | Player1 "Alice", Player2 "Alice" → Server lehnt ab (400) ODER "-2" suffix. | P3 |
| **R14** | AI Rate-Limit (optional) | AI-Feature: 5× Spam → 4 erfolg, 5. → "Rate limited". | P3 |
| **R15** | Solo alltypes (Baseline) | answer-flow.spec.ts + solo-types für JEDEN main-Merge. 10 Fragetypen, keine Skips, 0 skipped. | P1 |

### A.2 Work-Package Map (Wave 6 — 11 neue + 2 Extended)

| WP-ID | Datei | Szenario | Priorität | Gate | Est. (h) |
|-------|-------|----------|-----------|------|----------|
| **W6-1** | snapshot-restore.spec.ts | R3: Kill-Restore | P1 | e2e grün, Leaderboard persist | 2.5 |
| **W6-2** | admin-self-delete-guard.spec.ts | R2: Self-Delete | P1 | 400 API + UI DISABLED | 1.5 |
| **W6-3** | manager-live-controls.spec.ts | R6–R8: skip/adjust/reveal | P1 | Button-click → Player-update live | 3 |
| **W6-4** | mid-game-reconnect.spec.ts | R4: Reconnect | P1 | Socket-DC → rejoin → consistent | 2 |
| **W6-5** | answer-deadline.spec.ts | R5: Timeout-Gate | P2 | Late-click ignored | 1.5 |
| **W6-6** | class-mode-enforcement.spec.ts | R11: Enrolled-Only | P1 | 403 unauthorized → Alice OK | 2 |
| **W6-7** | team-mode.spec.ts | R10: Team-Aggregat | P3 | Team-Leaderboard | 2 |
| **W6-8** | duplicate-name-reject.spec.ts | R13: Name-Dedup | P3 | 400 \| "-2" suffix | 1 |
| **W6-9** | ai-rate-limit.spec.ts | R14: AI-Flood | P3 | 5× Spam → 4✓ + 1 limited | 1.5 |
| **W6-10** | sequencing-live.spec.ts | R12: 8-Item Q8 ⚠️ | **P1** | P1 order, P2 wrong, reveal score | 2.5 |
| **W6-11** | display-lifecycle-extended.spec.ts | R9: Satellite Auth | P2 | Display emits via token | 1.5 |
| **W6-MP** | mp-loop.spec.ts (extended) | R1: Viewports 600/920 | P1 | 3× run all grün | 2 |
| **W6-BASELINE** | answer-flow.spec.ts + solo-types | R15: CI-Blocker | P1 | 0 skipped | — |

### A.3 Gates & Abnahme (Wave 6)

```bash
# Pre-Merge Gate:
cd source
pnpm verify                          # typecheck + oxlint + vitest (GREEN)
bash rust/gate.sh                    # Rust determinism
scripts/check-locales.sh             # Alle 6 Locales
npx tsx e2e/stagehand/solo-types.spec.ts
npx tsx e2e/stagehand/snapshot-restore.spec.ts
npx tsx e2e/stagehand/sequencing-live.spec.ts  # P1 Critical
# ... alle 11 + extended
```

**Rollback-Trigger:**
- Sequencing-Live (W6-10) RED: BLOCK Merge
- >5% Flake-Rate: Lock WP
- Answer-Flow Regression: BLOCK PROD

---

## TEIL B: WAVE 7 — SELF-PACED & BULK-IMPORT DESIGN (Design-Phase Only)

### B.1 Requirements (Design-Phase Specs)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R-W7-1** | Self-Paced SDD Authoring | Produce `docs/design/self-paced-sdd.md` (≤500 LOC): Problem, User Flows, Data Model Extensions, Server Architecture, Client Architecture, Deadline Enforcement, Effort T-Shirt, Non-Goals, Open Decisions. **Proof:** Design review pass. | P1 |
| **R-W7-2** | CSV-Import SDD Authoring | Produce `docs/design/bulk-import-sdd.md` (≤450 LOC): CSV Schema (all 9 types), Media Linking, Validation + Error Handling, Server Architecture, Manager UI, Effort T-Shirt, Non-Goals, Open Decisions. **Proof:** Design review pass, schema covers all 9 types. | P1 |
| **R-W7-3** | Data Model Verification | Both SDDs verify column/table names against live `db/migrations/*.sql`. **Proof:** grep output in design-review. | P2 |
| **R-W7-4** | Non-Implementation Boundary | SDDs contain architecture + flows + effort ONLY. Zero code, zero Rust, zero TypeScript. | P2 |
| **R-W7-5** | Existing Infrastructure Mapping | Both SDDs map to existing code: assignments.rs, solo_results schema, classes/class_students. **Proof:** File paths + line references. | P2 |

### B.2 Self-Paced (W7-1) — Design Overview

**Problem:** Razzoozle has Solo (untimed) + Assignments API (exists). Gap: no class-tie + deadline enforcement.

**User Flows:**
1. **Teacher:** Quiz → Assign Homework → pick class → set deadline → Create → students see in lobby
2. **Student:** Joins lobby → sees Assigned Homework with countdown → clicks → solo gameplay → score
3. **Deadline Enforcement:** Server check (NOW() > deadline → reject). Client lock: buttons grayed, timer red.

**Data Model Extensions:**
- `assignments` table: NEW `class_id (FK → classes.id)`, NEW `assignment_type ('live'/'self_paced')`
- `solo_results`: Unchanged (already has `assignment_id` FK from migration 005)

**Server Architecture:**
- New socket events: `manager:createHomework`, `player:startHomework`
- Extend `POST /assignments` with `class_id`, `assignment_type`
- New `GET /assignments/:id/results` for teacher results view
- Validation: deadline check, class membership check

**Client Architecture:**
- Manager: New "Homework" tab with quiz/class/deadline inputs
- Player Lobby: New "📚 Assigned Homework" section with deadline countdown + Play button

**Effort (Wave 8 implementation):** ~38–49 h (DB Migration S, Server Endpoints M, Socket Events M, Deadline Validation S, Manager UI M, Lobby Section S, Results Dashboard L)

### B.3 Bulk-Import (W7-2) — Design Overview

**Problem:** Creating 50+ questions manually is tedious.

**CSV Schema (all 9 types):**

Global: `type` (required), `question` (required), `media_url` (optional), `time_limit` (optional), `tags` (optional)

Type-specific (examples):
- `choice`: `answers` (pipe-sep), `correct_indices`, `explanation`
- `boolean`: `correct` (true/false)
- `type-answer`: `answers`, `case_insensitive`
- `slider`: `min`, `max`, `step`, `correct_value`, `unit`, `decimals`
- `sentence-builder`: `sentence`, `tokens`, `correct_indices`
- `sequencing`: `items`, `correct_order`

**Media Linking:** Whitelist `/media/` prefix only. No external URLs. Teacher pre-uploads → pastes URL into CSV.

**Validation & Error Handling:**
- Dry-Run mode: POST with dry_run=true → validate all rows, return report, don't insert
- Row-by-row validation (not all-or-nothing)
- Missing required cols → error. Type mismatch → error. Media URL invalid → warning.

**Server Architecture:**
- New endpoint: `POST /quizzes/:quizzId/import`
- Headers: Manager auth token
- Body: multipart/form-data { `file: <CSV>`, `dry_run?: true` }
- Transaction-wrapped row-insert

**Manager UI Entry Point:**
- Quiz Editor → Questions tab → "Bulk Import" button → modal
- File input + columns preview + validate button + import button

**Effort (Wave 8 implementation):** ~39–49 h (CSV parser S, Row validation M, Server endpoint M, Error reporting S, Manager Modal M, E2E tests M)

### B.4 Work-Package Map (Wave 7 — Design-Only)

| WP-ID | Target File | Deliverable | Priority | Est. (h) |
|-------|---|---|---|---|
| **W7-1** | `docs/design/self-paced-sdd.md` | Self-Paced SDD (9 sections + data model verified) | P1 | 2 |
| **W7-2** | `docs/design/bulk-import-sdd.md` | Bulk-Import SDD (8 sections + CSV schema complete) | P1 | 1.5 |
| **W7-3** | `docs/design/*.md` (both) | Verification artifact (grep output, migrations verified) | P2 | 0.5 |

---

## GEMEINSAME ABSCHNITTE

### Reihenfolge-Empfehlung

1. **Wave 6 (e2e expansion) zuerst:** 1 Woche, parallel per grok-CLI (11 neue .spec.ts), serialisiert Browser. P1-Gate ermöglicht Baseline-Aktivierung.
2. **Wave 7 (design) parallel:** ~4 Tage design-authoring + review. Kein Blocker für W6.
3. **Merge-Sequenz:** W6 → main (nach e2e-Gate + locale-check), dann W7 → main (nach design-review).

### Wave-by-Wave Execution

**Wave 6 (Mo–Fr ~20 h):**
- Tag 1: P1-Starts (WP-1,2,3,10 parallel) → P1-Gate
- Tag 2–3: P2-Wave parallel
- Tag 4: P3-Wave + Extended
- Tag 5: Merge-Sequence + Final-Gate

**Wave 7 (parallel, ~4 h):**
- Phase 1 (~3 h): Parallel SDD Authoring (worktree)
- Phase 2 (~1 h): Design Review + Approval
- Phase 3 (~15 min): Merge worktree → main

### Non-Goals (Combined)

**Wave 6:**
- ❌ Weitere Fragetypen (nur 10 bestehende + Sequencing)
- ❌ Node-Backend e2e (nur Rust)
- ❌ Parallele Browser-Tests
- ❌ Neue Dependencies
- ❌ WCAG-Audit
- ❌ Streaks, Bonus, Ghost, LMS (Wave 8+)

**Wave 7:**
- ❌ Implementation code (ZERO .rs, .tsx, .ts, .sql)
- ❌ Type contracts/schema migrations (Wave 8)
- ❌ UI/UX prototypes (flows + text only)
- ❌ Security audit (design-phase validation only)
- ❌ Performance modeling
- ❌ Multi-language i18n keys (Wave 8)

### Success Criteria (Combined)

**Wave 6:**
- ✅ Alle 11 neuen .spec.ts: 0 skip, 100% pass, <1% flake
- ✅ R1 MP-Viewports: 375/600/920 keine Regressionen
- ✅ R2–R5 P1-Szenarien: grün
- ✅ R12 Sequencing-Live: 8-Item erstmals LIVE, KEINE Panics
- ✅ R15 Baseline-Gate: answer-flow + solo-types als CI-Blocker post-W1
- ✅ 0 Locale-Regressions

**Wave 7:**
- ✅ `docs/design/self-paced-sdd.md` approved (all 9 sections, data model verified, effort breakdown)
- ✅ `docs/design/bulk-import-sdd.md` approved (all 8 sections, CSV schema complete, effort breakdown)
- ✅ Both SDDs: zero product code, migrations verified via grep
- ✅ Wave 8 uses W7 SDDs as sole input (no back-to-design loops)

---

## Gotchas & Memory-Referenzen

1. **Stagehand v3 Locators:** Raw-CSS + click/fill/isVisible
2. **e2e außerhalb Workspace:** `pnpm install --ignore-workspace`
3. **Shared Chrome-Profile:** 1 `npx tsx` gleichzeitig
4. **Snapshot-Kill-Restore:** Server rebuild ALLE Lookup-Indizes
5. **socketioxide no-payload:** Bare `|socket: SocketRef|`
6. **Locale-Validierung:** Alle 6 Locales in Keys
7. **Wave 7 Data Model:** Verified against migrations 001–005, 011–014; assignments.rs existing

---

**Document Status:** FINAL (Scope Frozen 2026-07-24) | **Consolidated from:** wave6-sdd.md (270 Z) + wave7-sdd.md (383 Z)
