# SDD: Fill-in-Blank + Matching Question Types

**Status:** FINAL | **Scope-Frozen:** 2026-07-24 | **Verified Against:** Freigegebenes Slot-Design (Duplo-Transport, gemeinsames Scoring)  
**Effort:** ~44 hours | **Timeline:** 5 Waves, ~3 weeks @ 12–15 h/week

---

## 1. REQUIREMENTS (Verified, Frozen)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R-A** | Fill-Blank Payload & Editor | Payload: Text-Segmente + Slot-{options: string[], correctIndex}. Editor-Panel: Satz mit Lücken-Markern, je Lücke Optionen eingeben. Speichern erzeugt Slot-Array. **Proof:** Quiz mit 3 Lücken editable + playable. | P1 |
| **R-B** | Matching Payload & Editor | Payload: leftItems: [{label, options: string[], correctIndex}]. Editor-Panel: Paare (label ↔ options) als Reihen. **Proof:** Quiz mit 4 Matches editable + playable. | P1 |
| **R-C** | Slot-Scoring-Arm (gemeinsam) | Per-Slot Index-Match scoring: `selected[i] == correctIndex[i]` → +1 Punkt. Gesamt = (korrekte Slots / Gesamt-Slots) × Basiswert, dann Speed-Bonus. **Proof:** 2 von 3 Slots korrekt = 2/3 = 0.667 base. | P1 |
| **R-D** | Answer-UI & Transport | Antwort BEIDER Typen: `selectedIndices: number[]` (je Slot ein Index), transportiert als `answerText = JSON.stringify(selectedIndices)`. Answer-Komponente teilt SlotDropdownBoard (Dropdowns). **Proof:** Spieler wählt alle Slots, kein Fehler, Score korrekt. | P1 |
| **R-E** | Reveal & Display | Pro Slot grün/rot Markierung + korrekte Option anzeigen. Fill-blank: Slot-Reveal zwischen Satz-Segmenten. Matching: per leftItem Reveal + korrekte Option. **Proof:** Nach Reveal: alle Slots grün/rot + correct visible. | P1 |
| **R-F** | Editor-Framework Integration | Neue Branches in QuestionEditorType.tsx (setType dispatch). Mount beider Editor-Panels in QuestionEditor/index.tsx. Preview in QuizzEditorCard zeigt Fragenpaar. **Proof:** Admin sieht beide Editor-Types im Dropdown + Save funktioniert. | P1 |
| **R-G** | i18n ×6 Locales | `question.type.fill-blank`, `question.type.matching`, `ui.fillblank.addSlot`, `ui.matching.addItem`, Reveal-Keys, Optionen-Placeholder ×6 (de, en, es, fr, it, zh). **Proof:** alle Strings in `common/locales/*.json` + keine Hard-Codes in .tsx. | P2 |
| **R-H** | E2E Coverage (Solo, Live, Class) | 3 viewports (375/600/920), both types correct/partial/wrong, Solo-Flow, Live-Voting, Class-Mode. **Proof:** Stagehand suite 100% pass. | P1 |
| **R-I** | Type Registry & Slot-Defaults | QuestionType enum + "fill-blank", "matching" in QUESTION_TYPES array. Default payload: 1 Slot (fill-blank), 1 Pair (matching). **Proof:** New quiz defaults nicht leer. | P1 |

---

## 2. CONTRACT FREEZE — Wave 0 (Immutable Interfaces)

**Timebox:** 5h | **Gate:** `tsc --noEmit` + `cargo check` | **Rollback:** Revert commits (schema is source-of-truth)

### Type & Protocol Changes (All 3 drafts aligned)

**A. `packages/common/src/constants.ts`** (add QuestionType enum variants):
```typescript
export const QUESTION_TYPES = [
  // ... existing 10 types ...
  "fill-blank",    // NEW
  "matching",      // NEW
] as const
```

**B. `packages/common/src/types/game/index.ts`** (Answer interface):
```typescript
export interface Answer {
  clientId: string
  answerId: number
  answerIds?: number[]           // multiple-select
  answerText?: string            // type-answer, sequencing, fill-blank, matching
  answerOrder?: string[]         // sequencing (LEGACY, kept for back-compat)
  points: number
}
```
*(answerText für fill-blank + matching = JSON.stringify(selectedIndices: number[])*

**C. `packages/common/src/validators/quizz.ts`** (Question payload validator):
```typescript
// Fill-Blank: segment array + slot array
const fillBlankPayload = z.object({
  segments: z.array(z.string()),  // text oder null für Slot
  slots: z.array(z.object({
    options: z.array(z.string()),
    correctIndex: z.number().min(0),
  })),
})

// Matching: leftItems array
const matchingPayload = z.object({
  leftItems: z.array(z.object({
    label: z.string(),
    options: z.array(z.string()),
    correctIndex: z.number().min(0),
  })),
})

// Union in questionValidator
payload: z.union([fillBlankPayload, matchingPayload, ...existing])
```

**D. `rust/protocol/src/quizz.rs`** (Rust struct mirroring TypeScript):
```rust
pub struct FillBlankQuestion {
    pub segments: Vec<String>,  // null encoded as empty string or Vec<Option<String>>
    pub slots: Vec<Slot>,
}

pub struct MatchingQuestion {
    pub left_items: Vec<MatchingItem>,
}

pub struct Slot {
    pub options: Vec<String>,
    pub correct_index: i32,
}

pub struct MatchingItem {
    pub label: String,
    pub options: Vec<String>,
    pub correct_index: i32,
}
```

**E. i18n Keys** (×6 locales: de, en, es, fr, it, zh):
```json
{
  "question": {
    "type": {
      "fill-blank": "Lückenfüller / Fill in the Blank / ...",
      "matching": "Zuordnung / Matching / ..."
    }
  },
  "ui": {
    "fillblank": {
      "addSlot": "Lücke hinzufügen / Add slot / ...",
      "placeholder": "Text oder [Lücke] / Text or [Blank] / ...",
      "optionPlaceholder": "Option / Option / ..."
    },
    "matching": {
      "addItem": "Paar hinzufügen / Add pair / ...",
      "labelPlaceholder": "Linker Text / Left label / ...",
      "optionPlaceholder": "Rechte Option / Right option / ..."
    }
  },
  "game": {
    "slotCorrect": "Korrekt / Correct / ...",
    "slotWrong": "Falsch / Wrong / ...",
    "correctAnswer": "Richtige Antwort: {option} / Correct: {option} / ..."
  }
}
```

---

## 3. WORK-PACKAGE MAP (19 WPs across 5 Waves)

| WP-ID | File(s) | Scope | Depends | Wave | Est. (h) | Gate |
|-------|---------|-------|---------|------|----------|------|
| **W0-1** | `common/constants.ts`, `common/types/game/index.ts`, `common/validators/quizz.ts`, `rust/protocol/src/quizz.rs` | Type contracts (frozen) | — | 0 | 2 | `tsc --noEmit` + `cargo check` |
| **W0-2** | `common/locales/*.json` (Skeleton × 6) | i18n keys (frozen) | W0-1 | 0 | 1 | `scripts/check-locales.sh` |
| **W1-1** | `rust/engine/src/eval.rs` (extend) | Slot-scoring logic (fill-blank + matching, shared arm) | W0-1 | 1 | 3 | `cargo test slot_scoring` |
| **W1-2** | `rust/engine/src/scoring.rs` (extend) | Partial-credit calculation for slot count + speed bonus | W1-1 | 1 | 2 | `cargo test partial_credit` |
| **W2-1** | `packages/web/src/features/game/stores/question.ts` (extend) | Answer parsing: deserialize answerText as selectedIndices | W0-1 | 2 | 1 | `vitest` |
| **W2-2** | `packages/web/src/components/game/SlotDropdownBoard.tsx` (new) | Shared Answer-UI: dropdown per slot, no-submit guard, mobile-safe | W0-1 | 2 | 3 | `vitest + design-validator` |
| **W2-3** | `packages/web/src/components/game/FillBlankDisplay.tsx` (new) | Render segments + inline SlotDropdownBoard during play | W2-2 | 2 | 2 | `vitest` |
| **W2-4** | `packages/web/src/components/game/MatchingDisplay.tsx` (new) | Render leftItems as rows + SlotDropdownBoard per item | W2-2 | 2 | 2 | `vitest` |
| **W3-1** | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorFillBlank.tsx` (new) | Editor: segment/slot builder, Slot-Options-Sub-Panel shared | W0-1 | 3 | 4 | `vitest` |
| **W3-2** | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorMatching.tsx` (new) | Editor: leftItems builder, reuse Slot-Options-Sub-Panel | W0-1 | 3 | 4 | `vitest` |
| **W3-3** | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorSlotOptions.tsx` (new) | Sub-panel: options array + correctIndex picker (shared for both editors) | W0-1 | 3 | 2 | `vitest` |
| **W3-4** | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorType.tsx` (extend) | Add "fill-blank", "matching" branches in setType dispatch | W0-1 | 3 | 1 | `vitest` |
| **W3-5** | `packages/web/src/features/quizz/components/QuestionEditor/index.tsx` (extend) | Mount both new editor components (QuestionEditorFillBlank, QuestionEditorMatching) | W3-1, W3-2 | 3 | 1 | `vitest` |
| **W4-1** | `packages/web/src/components/game/SlotRevealPanel.tsx` (new) | Reveal-UI: per-slot green/red + correct option display | W2-2 | 4 | 2 | `vitest` |
| **W4-2** | `common/locales/*.json` (i18n W1–W4) | Complete all strings for editors + reveal + play × 6 | W4-1 | 4 | 2 | `scripts/check-locales.sh` |
| **W5-1** | `e2e/stagehand/fill-blank.spec.ts` (new) | 3 viewports × 3 scenarios (correct, partial, wrong); solo + live + class | W2-3, W3-1, W4-1 | 5 | 4 | `pnpm test:e2e` (3 browsers) |
| **W5-2** | `e2e/stagehand/matching.spec.ts` (new) | 3 viewports × 3 scenarios (correct, partial, wrong); solo + live + class | W2-4, W3-2, W4-1 | 5 | 4 | `pnpm test:e2e` (3 browsers) |
| **W5-3** | `docs/design/fill-blank-matching-sdd.md` (this file) | SDD finalize + ADR archival | W0–W4 | 5 | 1 | peer review |

**Principles:** 1 WP ≈ 1 file <150 LOC; tests/i18n/docs = own WPs; ≥3 WPs per wave for parallelization.

---

## 4. WAVE BREAKDOWN & GATES

### Wave 0: Contract Freeze (Immutable Interfaces)
- **Inputs:** Freigegebenes Design (Payload + Slot-Scoring + Transport)
- **Gate:** `tsc --noEmit`, `cargo check`, `scripts/check-locales.sh` (skeleton)
- **Rollback:** Revert commits to `main`
- **Output:** Type files + stub i18n keys ready for impl.

### Wave 1: Rust Scoring Core
- **Inputs:** W0 frozen schema
- **Gate:** `cargo test slot_scoring`, `cargo test partial_credit`
- **Rollback:** Revert scoring logic, tests still pass (old types)
- **Output:** Scoring arm in eval.rs + partial-credit calc

### Wave 2: TypeScript Wire & Answer-UI
- **Inputs:** W1 scoring, W0 types
- **Gate:** `vitest`, `design-validator` on SlotDropdownBoard
- **Rollback:** Revert .tsx files, types + types still check
- **Output:** SlotDropdownBoard + FillBlankDisplay + MatchingDisplay + answer parsing

### Wave 3: Editor Framework
- **Inputs:** W2 UI, W0 types
- **Gate:** `vitest` per editor component
- **Rollback:** Remove editor branches, type check still passes
- **Output:** QuestionEditorFillBlank + QuestionEditorMatching + QuestionEditorSlotOptions

### Wave 4: Reveal & i18n Completion
- **Inputs:** W3 editors, W2 displays
- **Gate:** `vitest` + `scripts/check-locales.sh` (full)
- **Rollback:** Revert reveal panel + i18n updates
- **Output:** SlotRevealPanel + all 6 locales complete

### Wave 5: E2E Coverage
- **Inputs:** W4 complete, all WPs passing
- **Gate:** `pnpm test:e2e` fill-blank + matching suites (100% pass, 3 browsers)
- **Rollback:** Delete .spec.ts files, e2e still green (no regressions)
- **Output:** E2E coverage for both types + SDD finalized

---

## 5. SUB-WAVE PARALLELIZATION

### Wave 2–4 Parallel Sub-Waves (Same Day Merge, No Blocking)

**2A: SlotDropdownBoard** (W2-2)
→ FillBlankDisplay (W2-3), MatchingDisplay (W2-4) depend on it

**3A: FillBlankEditor** (W3-1)
→ QuestionEditorFillBlank spawns independently

**3B: MatchingEditor** (W3-2)
→ QuestionEditorMatching spawns independently

**3C: Slot-Options-Sub-Panel** (W3-3)
→ used by both W3-1 + W3-2 (shared code)

**4A: Reveal Panel** (W4-1)
→ pulls from W2-3 + W2-4 (both displays set up reveal hooks)

**4B: i18n Completion** (W4-2)
→ collects all W1–W4 string keys, fills ×6 locales

**5A: Fill-Blank E2E** (W5-1)
→ independent test suite

**5B: Matching E2E** (W5-2)
→ independent test suite

---

## 6. NON-GOALS

- **Freitext-Slots:** Nur Dropdown-Auswahl aus Optionen (kein Input-Feld).
- **Drag-Drop für Matching:** Matching = Dropdowns, keine Drag-Zielzone (sequencing benutzt bereits Drag-Drop).
- **Conditional Branching:** Keine Abhängigkeiten zwischen Slots.
- **Audio/Video in Slots:** Nur Text-Optionen und Labels.
- **Mobile Touch-Optimize für Drag:** N/A (Dropdown-only).

---

## 7. ACCEPTANCE CRITERIA

✅ **Type System:**
- `fill-blank`, `matching` in QUESTION_TYPES
- Quiz speichern/laden roundtrips Payloads verlustfrei
- TypeScript + Rust Schemata identisch (cross-vendor verifiziert)

✅ **Scoring:**
- Slot-Matching: `selected[i] == correctIndex[i]` → +1 pro Slot
- Partial Credit: (correct_slots / total_slots) × base_points
- Speed Bonus: +bis zu 30% auf Basis, fallend nach Zeit
- E2E Test: 2 von 3 Slots = 67% Score verified

✅ **Answer-UI:**
- SlotDropdownBoard: alle Optionen wählbar, mobile click-safe
- Fill-Blank: Dropdown inline im Satz
- Matching: Dropdown pro leftItem
- No-Submit Guard: keine Submit bis alle Slots gefüllt

✅ **Editor:**
- Admin kann 3+ Slots/Pairs erstellen + bearbeiten
- Slot-Optionen-Panel: options array + correctIndex-picker
- Preview zeigt aktuellen Zustand (live update)
- Save speichert, Load lädt korrekt

✅ **Reveal:**
- Farben: grün (korrekt), rot (falsch)
- Correct Option angezeigt
- Layout: inline (fill-blank), per-row (matching)

✅ **i18n:**
- `scripts/check-locales.sh` grün ×6 locales
- Keine Hardcodes in .tsx (alle Strings aus i18n)
- Microcopy deutsch-wärm, konsistent mit Brand

✅ **E2E:**
- Fill-Blank: solo (correct/partial/wrong), live 2P, class (3 spieler)
- Matching: solo (correct/partial/wrong), live 2P, class (3 spieler)
- Viewports: 375, 600, 920
- Browsers: Chromium, Firefox, WebKit

---

## 8. ROLLBACK STRATEGY

| Phase | Rollback | Time | Data Loss |
|-------|----------|------|-----------|
| **W0 Type Failure** | `git revert W0-1..W0-2` | 5 min | None (before impl) |
| **W1 Scoring Bug** | `git revert W1-1..W1-2` | 10 min | None (tests define contract) |
| **W2–W4 UI/Editor** | `git revert <WP-range>` | 15 min | None (deployed feature not gated) |
| **W5 E2E Regression** | `git revert W5-1..W5-2` | 10 min | None (tests only) |
| **Production Hotfix** | Disable types in QUESTION_TYPES, restore old quiz versions | 30 min | Users cannot create new fill-blank/matching |

---

## 9. TESTING STRATEGY

### Unit Tests (Wave 1–4)
- `cargo test slot_scoring` — Slot-Index-Match logic
- `cargo test partial_credit` — Scoring formula (2/3 slots = 0.667)
- `vitest QuestionEditor*` — Editor components create+save valid payloads
- `vitest SlotDropdown*` — No-submit guard, option selection

### Integration Tests (Wave 2–4)
- Answer parsing: `answerText` → `selectedIndices` array roundtrip
- Display rendering: segments + slots (fill-blank), leftItems + slots (matching)
- Editor→Display: create question in editor, play it, verify display matches

### E2E Tests (Wave 5)
- **Solo Flow:** answer both types, submit, reveal correct
- **Live Voting:** host + 2 players answer, voting phase, reveal
- **Class Mode:** 3+ students, score calculation, leaderboard update
- **Partial Correctness:** 2/3 slots right = X% score, speed bonus applied
- **Mobile:** tap dropdowns on 375px viewport, no layout shift

---

## 10. DEPLOYMENT & RUNTIME BEHAVIOR

### Feature Flag
- No flag needed; types live in QUESTION_TYPES immediately after W0
- Quiz.load() will deserialize payloads correctly if type == "fill-blank" | "matching"

### Backward Compatibility
- Quizzes without fill-blank/matching unaffected
- Snapshots ignore unknown types (graceful degrade)
- Player clients that don't render new types will error → must upgrade (no backcompat required, client always upgraded first)

### Monitoring
- Log score calculations for new types (detect drift vs. expected 0–1 range)
- Monitor E2E failure rate (missing Reveal panel, broken editor)
- Alert on i18n missing keys (check-locales.sh integration test)

---

## 11. ADR BACKLINKS & RELATED SDDS

- [SDD: Kahoot Remediation](kahoot-remediation-sdd.md) — W0 type contracts reference
- [AGENTS.md](../AGENTS.md) § Sequencing-Type → Fill-Blank Scoring shares structure (partial credit)
- design.md § Manager/Client/Presentator surface tokens — SlotDropdownBoard theming
- [feedback: e2e-solo-coverage](../../memory/feedback_e2e_solo_coverage.md) — 3-viewport e2e mandate

