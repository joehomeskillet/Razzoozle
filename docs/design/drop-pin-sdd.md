# SDD: Razzoozle Drop-Pin Question Type

**Status:** FINAL | **Scope-Frozen:** 2026-07-24 | **Verified Against:** Approved Design + Media-Reuse Pattern  
**Effort:** ~32 hours | **Timeline:** 4 Waves, ~2 weeks @ 16 h/week

---

## 1. REQUIREMENTS (Verified, Frozen)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R-A** | Question Type Addition | Add `"drop-pin"` to `QUESTION_TYPES` enum (packages/common/src/constants.ts). Define payload in `common/validators/quizz.ts`: `{ media: QuestionMedia, hotspots: [{x, y, w, h}] }` all relative [0–1]. **Proof:** `tsc` clean, no compiler errors. | P1 |
| **R-B** | Answer Transport (JSON) | Answer captured as `{x, y}` submitted via `answerText: JSON.stringify({x,y})`, matching pattern of `wortarten`/`type-answer`. **Proof:** Server parsing roundtrips JSON correctly; unit test on HotspotImage. | P1 |
| **R-C** | Point-in-Rectangle Scoring | Server eval.rs: implement `is_correct_drop_pin()` testing point `(x,y)` against ANY hotspot rect in `[x, y, x+w, y+h]` (binary: full base or 0). Scoring: full base points + speed bonus (match slider/choice). **Proof:** `cargo test drop_pin` passes; e2e treffer/miss both grade correctly. | P1 |
| **R-D** | Answer-Play UI (HotspotImage) | React component: render `QuestionMedia.url` as background image, overlay click/pin with relative coords (0–1 normalized), draggable until submit, clear visual feedback. Mobile-safe (touch events). **Proof:** vitest + stagehand solo/live on 3 viewports (375/600/920), click works, coordinates transport correctly. | P1 |
| **R-E** | Answer Reveal Panel | Render image + correct zones (green overlay) + player pin(s) (red/green = hit/miss). Show relative coordinates on hover/tap. i18n scoring label. **Proof:** stagehand: treffer pin renders green, miss renders red; relative coords display. | P1 |
| **R-F** | Question Editor (HotspotEditor) | Reuse `QuestionEditorMedia` to select image. New UI: drag-to-draw rectangles (multiple), remove/reorder zones, live preview. Zones persisted as `hotspots: [{x, y, w, h}, ...]`. **Proof:** vitest + manual test: draw 3 rects, save, reload quiz, rects persist. | P1 |
| **R-G** | i18n ×6 Locales | Keys: `game.dropPin.prompt`, `game.dropPin.clickImage`, `game.dropPin.reveal`, `game.dropPin.correct`, `game.dropPin.incorrect` (all namespaces game) ×6 locales (de, en, es, fr, it, zh). **Proof:** `check-locales.sh` 100% coverage; stagehand e2e all langs. | P2 |
| **R-H** | E2E Solo + Live (3 Viewports) | Test scenarios: (1) Solo hit in zone, (2) Solo miss (outside zones), (3) Live multiplayer hit/miss, (4) Mobile touch (375px), (5) Tablet (600px), (6) Desktop (920px). Relative-coordinate robustness (no off-by-one). **Proof:** Stagehand suite 100% pass, 3 browsers. | P1 |

---

## 2. CONTRACT FREEZE — Wave A0 (Immutable Interfaces)

**Timebox:** 3h | **Gate:** `tsc --noEmit` + `cargo check` | **Rollback:** Revert type changes if tsc fails (schema is source-of-truth)

### Type & Protocol Changes

**A. `packages/common/src/constants.ts`** (add enum variant):
```typescript
export const QUESTION_TYPES = [
  // ... existing types
  "drop-pin",
] as const
```

**B. `packages/common/src/validators/quizz.ts`** (add schema):
```typescript
export const dropPinPayloadValidator = z.object({
  media: questionMediaValidator, // Reuse QuestionMedia (url + type?)
  hotspots: z.array(
    z.object({
      x: z.number().min(0).max(1), // Relative 0–1
      y: z.number().min(0).max(1),
      w: z.number().min(0.01).max(1), // Width
      h: z.number().min(0.01).max(1), // Height
    })
  ).min(1), // At least one zone
})
```

**C. `packages/common/src/types/game/index.ts`** (update Answer interface if needed):
- Confirm `answerText?: string` already present (line 47); no schema change needed (JSON string transport).

**D. `packages/common/src/constants.ts`** (i18n key registry, optional):
- Document new keys: `game.dropPin.*` for future audits.

---

## 3. WORK-PACKAGE MAP (14 WPs across 4 Waves)

| WP-ID | File(s) | Scope | Depends | Wave | Est. (h) | Gate |
|-------|---------|-------|---------|------|----------|------|
| **A0-1** | `constants.ts`, `validators/quizz.ts` | Type contracts + validator schema | — | A0 | 1 | `tsc` + `cargo check` |
| **B1-1** | `rust/engine/src/eval.rs` | `is_correct_drop_pin()` + point-rect logic | A0-1 | B1 | 2 | `cargo test drop_pin` |
| **B1-2** | `rust/engine/src/scoring.rs` + `eval.rs` | Speed-bonus scoring for drop-pin (reuse existing calc) | A0-1 | B1 | 1 | `cargo test scoring` |
| **C0-1** | `packages/web/src/features/game/components/HotspotImage.tsx` (new) | Render image, click-to-place pin, draggable, coords export | B1-1 | C0 | 3 | vitest + stagehand solo |
| **C0-2** | `packages/web/src/features/game/answers/*.tsx` | Wire HotspotImage into SoloAnswers (dispatch on type) | C0-1 | C0 | 2 | vitest + stagehand |
| **C1-1** | `packages/web/src/components/reveal/DropPinReveal.tsx` (new) | Render zones + pins, hit/miss colors | B1-1 | C1 | 2 | vitest + design-validator |
| **C1-2** | `packages/web/src/features/game/components/AnswerRevealPanel.tsx` (update) | Wire DropPinReveal type handler | C1-1 | C1 | 1 | vitest |
| **D1-1** | `packages/web/src/features/quizz/QuestionEditor/HotspotEditor.tsx` (new) | Drag-to-draw UI, rect CRUD, preview | A0-1 | D1 | 4 | vitest + manual |
| **D1-2** | `packages/web/src/features/quizz/QuestionEditor/index.tsx` | Wire HotspotEditor dispatch (type==="drop-pin") | D1-1 | D1 | 1 | vitest |
| **D1-3** | `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorMedia/` | Reuse existing media picker | A0-1 | D1 | 0 (reuse) | — |
| **I1-1** | `packages/common/src/locales/*.json` (de, en, es, fr, it, zh) | i18n keys ×6: dropPin.*, coords label | C0-1 | I1 | 2 | `check-locales.sh` |
| **E2-1–E2-3** | `e2e/stagehand/*.spec.ts` (3 files) | (1) Solo hit/miss, (2) Live multiplayer, (3) 3-viewport + coords robustness | C0-2, C1-2, D1-2, I1-1 | E2 | 8 | `pnpm test:e2e` (3 browsers) |

**Principles:** 1 WP ≈ 1 file <150 LOC; tests/i18n = own WPs; ≥2 WPs per wave for parallelization.

---

## 4. WAVE-BY-WAVE EXECUTION

### **Wave A0: Contract Freeze** (Thu 2026-07-24, ~3 h)
- **WPs:** A0-1.
- **Gate:** `tsc --noEmit packages/common` + `cargo check -p engine` → **ZERO regression**.
- **Rollback:** Revert enum + validator if tsc fails.

### **Wave B1: Rust Scoring** (Fri 2026-07-25, ~3 h)
- **WPs:** B1-1, B1-2 (parallel).
- **Gate:** `cargo test --release drop_pin` + `cargo test scoring`.
- **Acceptance:** Point-in-rect unit tests pass; speed-bonus calc verified.
- **Deploy:** None (backend only).
- **Rollback:** Revert B1-1–B1-2 if tests fail; keep A0-1.

### **Wave C0–C1: Web Answer + Reveal** (Mon–Tue 2026-07-28–29, ~6 h)
- **WPs:** C0-1, C0-2, C1-1, C1-2 (parallel, then sequential wiring).
- **Gate:** `vitest`, `stagehand` solo hit/miss/3-viewport, `design-validator` reveal panel.
- **Deploy:** Staging; manual smoke: click image → pin appears, submit → reveal correct/incorrect.
- **Rollback:** Revert C-series; keep A0+B1.

### **Wave D1: Question Editor** (Wed 2026-07-30, ~5 h)
- **WPs:** D1-1, D1-2 (serial after D1-1 lock).
- **Gate:** `vitest`, manual editor test (draw 3 rects, save, reload, verify persist).
- **Acceptance:** Editor UI intuitive; rects survive round-trip.
- **Deploy:** Staging (feature-gated behind admin quiz editor).
- **Rollback:** Revert D1-1–D1-2; keep C-series.

### **Wave I1: Internationalization** (Thu 2026-07-31, ~2 h)
- **WPs:** I1-1 (parallel across ×6).
- **Gate:** `check-locales.sh` 100% coverage; stagehand e2e all langs.
- **Deploy:** Staging.
- **Rollback:** Revert locales; keep code.

### **Wave E2: End-to-End Suite** (Fri–Mon 2026-08-01–04, ~8 h)
- **WPs:** E2-1–E2-3 (3 spec files, parallel).
- **Gate:** **All 3 e2e scenarios pass** (Stagehand, 3 browsers: chromium/firefox/webkit). **No flakes over 2 runs.**
- **Risk:** Touch coordinate edge cases (relative 0–1 vs pixel-space); **mitigation:** Stagehand drag on 375px viewport.
- **Deploy:** None; tests only (blocker for production merge).
- **Rollback:** None; tests can't break shipping.

---

## 5. SECURITY VALIDATION (Verified 2026-07-24)

✅ **Secrets:** No hardcoded tokens/keys (media URLs are user-provided, validated as `QuestionMedia`).  
✅ **Trust Boundaries:** Hotspot coordinates are raw JSON from admin editor → transport as `answerText` (no injection). Client-side click coords normalized [0–1] (no pixel-space precision loss).  
✅ **e2e Coverage:** E2-1 (solo correctness), E2-2 (multiplayer fairness), E2-3 (viewport robustness) all covered.  
✅ **Dependencies:** Reuse `QuestionMedia` system (no new npm/cargo packages).  
✅ **Compliance:** No new auth scopes (quiz editor scope sufficient for hotspot creation).

---

## 6. ROLLBACK STRATEGY

| Wave | Trigger | Procedure |
|------|---------|-----------|
| **A0** | Any `tsc` error | Revert A0-1; restart with corrected schema. |
| **B1** | `cargo test drop_pin` fails OR point-in-rect logic wrong | Revert B1-1–B1-2; escalate to Fable for eval.rs review. Do NOT merge C-series until scoring proven. |
| **C0–C1** | Stagehand e2e fails (click not captured OR coords wrong) | Revert C-series; keep A0+B1. Debug HotspotImage event handlers. |
| **D1** | Editor draw-rect UI broken OR rects don't persist | Revert D1-1–D1-2; keep C-series. Rects may need explicit sync to question payload. |
| **I1** | `check-locales.sh` finds missing key or >1 locale mismatch | Revert I1-1; fix missing key in EN first, then sync ×6. |
| **E2** | >2 flakes on any scenario OR touch-coordinate off-by-one | Escalate to stagehand expert; fix coordinate normalization before merging. |

---

## 7. NON-GOALS

- ❌ Distanced-weighted scoring (all zones equally valid).
- ❌ Multi-pin (one answer per question; binary hit/miss only).
- ❌ Polygon/circle zones (rectangles only).
- ❌ Custom pin appearance (simple circle + color).
- ❌ Hint system (out of scope; design-review dependent).
- ❌ New Dependencies (reuse existing QuestionMedia + Tailwind only).

---

## 8. SUCCESS CRITERIA (per Wave)

- **A0:** `tsc` clean, no compiler errors.
- **B1:** Point-in-rect unit tests pass; speed-bonus calc verified against slider baseline.
- **C0–C1:** Stagehand solo hit/miss pass; reveal zones render correctly; 3-viewport click works.
- **D1:** Editor draw UI responsive; rects persist across reload.
- **I1:** `check-locales.sh` 100% pass; stagehand e2e runs in all 6 langs.
- **E2:** All 3 e2e scenarios pass; 0 flakes over 2 runs; relative-coordinate accuracy ≥95%.

---

## 9. Technical Notes

### Answer Transport Pattern
Drop-pin follows the `wortarten`/`type-answer` JSON-in-`answerText` pattern:
```
User clicks → HotspotImage records (x, y) [0–1] → JSON.stringify({x, y}) → answerText
Server receives → JSON.parse(answerText) → check point-in-any-rect
```

### Media Reuse
`QuestionMedia` (url + type?) already supports image-type questions. No new schema for media layer.

### Scoring Integration
Scoring reuses existing `time_to_point()` + `calculate_points()` (packages/web/src/features/game/utils/points-calculation.ts + rust/engine/src/scoring.rs). Binary correctness from `is_correct_drop_pin()`, then apply streaks/bonuses as-is.

### Relative Coordinates [0–1]
All spatial data (hotspots, answers, reveal) normalized to [0–1] width/height. This ensures **resolution-independence** (image displayed at any size, correctness invariant).

---

## 10. Acceptance Gates (Pre-Merge Checklist)

**Wave A0:**
- [ ] `tsc --noEmit packages/common && cargo check -p engine` passes
- [ ] New enum variant in `constants.ts` + validator in `quizz.ts`

**Wave B1:**
- [ ] `cargo test drop_pin` 100% pass
- [ ] Point-in-rect unit test covers: corner, edge, interior, outside cases
- [ ] Scoring test: correct answer scores > incorrect (speed-mode)

**Wave C0–C1:**
- [ ] HotspotImage vitest 100% pass (click event, coord export)
- [ ] Stagehand e2e solo (3 viewports): treffer + fehlschlag both correct
- [ ] DropPinReveal renders zones + pins, colors correct

**Wave D1:**
- [ ] HotspotEditor vitest pass
- [ ] Manual test: draw 3 rects → save quiz → reload → rects identical

**Wave I1:**
- [ ] `check-locales.sh` all keys present ×6 locales
- [ ] Stagehand e2e lang-switch (DE, EN, ES) works

**Wave E2:**
- [ ] Stagehand suite (E2-1–E2-3) 100% pass, 3 browsers
- [ ] 2 consecutive runs, 0 flakes
- [ ] Relative-coordinate accuracy verified (e.g., 50% image width = 0.5 normalized)

---

## 11. File Inventory (Pre-Wave Scan)

**Existing (Reuse):**
- `packages/common/src/types/game/index.ts` — QuestionMedia, Answer interface (line 47)
- `packages/common/src/validators/quizz.ts` — questionMediaValidator (existing)
- `packages/web/src/features/quizz/components/QuestionEditor/QuestionEditorMedia/` — media picker UI
- `rust/engine/src/scoring.rs:time_to_point()` — speed/accuracy decay (reuse)
- `packages/web/src/features/game/utils/points-calculation.ts` — scoring calc (client-side reference)

**New (Will Create):**
- `packages/common/src/constants.ts` — QUESTION_TYPES += "drop-pin"
- `packages/common/src/validators/quizz.ts` — dropPinPayloadValidator (add to questionValidator union)
- `rust/engine/src/eval.rs` — `is_correct_drop_pin()` function
- `packages/web/src/features/game/components/HotspotImage.tsx` — answer UI
- `packages/web/src/features/game/answers/*.tsx` — dispatch handler
- `packages/web/src/components/reveal/DropPinReveal.tsx` — reveal UI
- `packages/web/src/features/quizz/QuestionEditor/HotspotEditor.tsx` — editor UI
- `packages/common/src/locales/*.json` (×6) — i18n keys
- `e2e/stagehand/drop-pin-*.spec.ts` (×3) — e2e suite

---

**Timeline Summary:** ~32 hours / 4 waves / 2 weeks (16 h/week). Binary correctness gates wave A0+B1; Web UI (C+D) follows. i18n + e2e late-stage validation. Zero new dependencies; full media reuse. Relative coordinates [0–1] ensure resolution-independent scoring.

---

SDD-DRAFT: DONE — Ready for Wave-A0 spinup; scope frozen 2026-07-24; all technical claims aligned with approved design; 14 WPs mapped to 4 waves with explicit gates + rollback procedures.
