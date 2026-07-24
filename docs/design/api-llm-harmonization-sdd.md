# SDD: API & LLM Harmonization — Question Types Unification

**Status:** FINAL | **Scope-Frozen:** 2026-07-24 | **Verified Against:** Code scan (ai-provider.ts, question-builder.ts, validators, socket API)  
**Effort:** ~43 hours | **Timeline:** 4 Waves, ~3 weeks @ 12–15 h/week

---

## 1. REQUIREMENTS (Verified, Frozen)

### Core Issue
The AI Quiz Generator and LLM backend support **only 4 question types** (choice, boolean, multiple-select, type-answer). The full platform knows **10 types** (including sequencing, sentence-builder, mathematik, wortarten) plus **3 planned new types** (fill-blank, matching, drop-pin). **Blind spots:** the new types cannot round-trip through generate→create→store→play→result, API validators are missing, and LLM prompt templates don't exist.

### Requirements

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R-A** | LLM Generator Extension | Extend `packages/mcp/src/ai-provider.ts::generateQuestion()` to emit valid schemas for ALL 10 existing types (sequencing, sentence-builder, mathematik, wortarten) + stubs for 3 planned (fill-blank, matching, drop-pin). Per-type prompt templates + JSON output parsing. **Proof:** `generate_question(topic="Ordnen Sie", type="sequencing")` returns `{ items: [...], correctOrder: [...] }` validated by questionValidator. | P1 |
| **R-B** | Question-Builder Completeness | Extend `question-builder.ts::buildQuestion()` switch-case to handle all 10 types + 3 planned, with sensible defaults per type (e.g., sequencing needs items + correctOrder, fill-blank needs sentence + blanks array, matching needs pairs). **Proof:** `create_question(type="sequencing", ...)` + `add_question(type="fill-blank", ...)` pass validation. | P1 |
| **R-C** | Validator Completeness | Audit `common/validators/quizz.ts::questionValidator.superRefine()` to confirm all 13 types are handled (not "permissive stub"). Particularly: sequencing (items / correctOrder constraints), sentence-builder (chunks / correctOrder), fill-blank (sentence / blanks / solutions), matching (pairs / correctIndexes), mathematik (tolerance / decimals), wortarten (sentence / tokens / posSet / disabledTokens), drop-pin (canvas dims / pins / correctPositions). **Proof:** Invalid questions (e.g., sequencing with 0 items, fill-blank with mismatched solutions) reject. | P1 |
| **R-D** | Socket API Question Events | Confirm round-trip for all 13 types: create (MCP) → store (disk/DB) → load (socket emit `quizz:data`) → play (render type-specific UI) → answer (socket emit `player:answer` + type-specific payloads) → result (record `PlayerAnswerRecord` with type-specific fields: `answerIds`, `answerText`, `answerOrder`, etc.) → recap (display score). **Proof:** E2E solo + live for all 13 types (3 viewports each = 39 e2e cases). | P1 |
| **R-E** | HTTP Quiz CRUD | Confirm `/api/skeleton/import` + `/api/plugins/import` can accept quizzes with all 13 types. **Proof:** Import a skeleton with a fill-blank question; verify it plays end-to-end. | P2 |
| **R-F** | LLM Output Robustness | LLM may hallucinate invalid JSON or miss required fields. Add retry + fallback logic: (1) parse JSON, (2) validate against schema, (3) on fail, retry with tighter prompt + N retries (default 2), (4) on exhaustion, throw with helpful error. Secret-scan every LLM output (existing: ai-provider.ts:30–37). **Proof:** Inject malformed LLM output; API recovers or fails gracefully. | P2 |
| **R-G** | Distractor Generation for New Types | Extend `generateDistractors()` to support fill-blank, matching, drop-pin (or document why it doesn't apply). **Proof:** `generate_distractors(question="Fill: The capital of ...", correct="France", type="fill-blank")` works. | SHOULD |
| **R-H** | Documentation + Templates | Maintain prompt templates in code comments (one per type, e.g., "JSON shape: {\"items\": [...], \"correctOrder\": [ids]}" for sequencing) and update design.md to document round-trip expectations per type. **Proof:** docs/design/api-llm-harmonization-sdd.md + design.md cross-link. | SHOULD |

---

## 2. API BLIND SPOTS (Audit Findings)

**Discovered gaps in current codebase (pre-fix):**

| Finding | Location | Impact | Status |
|---------|----------|--------|--------|
| **F-1** | `ai-provider.ts::generateQuestion()` line 258: type union is `"choice" | "boolean" | "multiple-select" | "type-answer"` — missing sequencing, sentence-builder, mathematik, wortarten, fill-blank, matching, drop-pin. | LLM cannot generate new types; fallback to user manual entry (OK for now, but not scalable). | WP-1 |
| **F-2** | `question-builder.ts` line 73–138: switch-case default handles only choice-like types; no branches for sequencing, sentence-builder, fill-blank, matching, etc. Relies on default logic which assumes `answers` + `solutions` fields. | MCP `create_question` and `add_question` will fail validation for sequencing/sentence-builder if used. | WP-2 |
| **F-3** | `validators/quizz.ts` line 137–139: sequencing superRefine is `// Sequencing: item reordering (permissive stub for now)` — accepts ANY sequencing question without validating items/correctOrder lengths or uniqueness. Allows invalid downstream. | Invalid sequencing questions persist to disk; play-time errors possible. | WP-3 |
| **F-4** | Same file line 135–136: mathematik + wortarten are also stubs. No validation of token count, POS set consistency, tolerance bounds, decimals. | Invalid questions slip through. | WP-3 |
| **F-5** | `mcp/src/tools/ai.ts` line 22–26: `generate_question` inputSchema type enum is static string list — updating it requires code change + redeploy MCP server, not config-driven. | Adding new type support isn't dynamic; requires codebase change. | DESIGN |
| **F-6** | Socket types `packages/common/src/types/game/socket.ts`: `PlayerAnswerRecord` (line 89–96) has `answerText`, `answerIds`, `answerOrder` for some types, but the full set for fill-blank (blank_index + filled_text), matching (pair_matches), drop-pin (pin_coordinates) is not documented. | Unclear what fields multi-select, sentence-builder, mathematik, fill-blank, matching, drop-pin should use. | WP-4 |
| **F-7** | `Rust engine/scoring`: No evidence of scoring handlers for sequencing, fill-blank, matching, drop-pin. Presumed not wired (sequencing only partially implemented per wave-5 SDD). | Questions of these types cannot score. | External (depends on type-specific WPs) |
| **F-8** | `packages/mcp/src/tools/ai.ts::generateDistractors()` line 76–99: only supports answer + question (implies choice-like types). No branch for fill-blank, matching, drop-pin. | Distractor gen isn't available for new types; users must author by hand. | WP-5 |

---

## 3. CONTRACT FREEZE — Wave 0 (Immutable Interfaces)

**Timebox:** 3h | **Gate:** `tsc --noEmit` + `cargo check` + `pnpm test:mcp:validate-schemas` | **Rollback:** Revert type/validator changes.

### Type & Protocol Changes (All sources aligned)

**A. `packages/common/src/constants.ts`** (expand QUESTION_TYPES if needed):
```typescript
export const QUESTION_TYPES = [
  "choice",
  "boolean",
  "slider",
  "poll",
  "multiple-select",
  "type-answer",
  "sentence-builder",
  "mathematik",
  "wortarten",
  "sequencing",
  // Planned (stubs, not in playable set yet):
  // "fill-blank",
  // "matching",
  // "drop-pin",
] as const
```
*(No change needed if planned types are NOT added to the playable list yet; document as "OPEN DECISION" below.)*

**B. `packages/common/src/types/game/index.ts`** — Confirm type exports:
```typescript
export type Question = z.infer<typeof questionValidator>
export type Quizz = z.infer<typeof quizzValidator>
```
*(These are inferred from validators; no manual change needed if validators are correct.)*

**C. `packages/common/src/types/game/socket.ts`** — Extend `PlayerAnswerRecord` if needed:
```typescript
export interface PlayerAnswerRecord {
  playerName: string
  answerId: number | null
  // Existing fields (all types):
  answerIds?: number[] | null              // multiple-select
  answerText?: string | null               // type-answer
  answerOrder?: string[] | null            // sequencing
  // NEW candidates (document per type):
  sentenceFragments?: string[] | null      // sentence-builder (ordered chunks)
  mathematikValue?: number | null          // mathematik (numeric answer)
  wortartenTokenTags?: string[] | null     // wortarten (POS tags per token)
  fillBlankAnswers?: string[] | null       // fill-blank (per-blank answers)
  matchingPairs?: number[] | null          // matching (match pairs as indices)
  dropPinCoordinates?: { x: number; y: number }[] | null  // drop-pin (pixel coords)
  responseMs?: number | null               // all types
}
```
*(Fields are optional; presence depends on type. Document in comments which type uses which field.)*

**D. `packages/common/src/validators/quizz.ts`** — Confirm validator structure (no change to signature):
```typescript
export const questionValidator = z.object({
  // ... existing fields
}).superRefine((q, ctx) => {
  // ... type-specific validation branches
})
```

**E. `packages/mcp/src/tools/ai.ts`** — Expand `generate_question` inputSchema:
```typescript
server.registerTool("generate_question", {
  // ...
  inputSchema: {
    topic: z.string().min(1).max(200),
    type: z
      .enum([
        "choice",
        "boolean",
        "multiple-select",
        "type-answer",
        "sequencing",           // NEW
        "sentence-builder",     // NEW
        "mathematik",           // NEW
        "wortarten",            // NEW
        // Planned (do NOT enable until stubs are removed):
        // "fill-blank",
        // "matching",
        // "drop-pin",
      ])
      .optional()
      .describe("Question kind to author (default choice)."),
    language: z.string().min(2).max(8).optional(),
  },
})
```

**F. i18n Keys** (×6 locales: de, en, es, fr, it, zh) — Document expected keys (no code change):
- `question.type.sequencing`, `question.type.sentenceBuilder`, `question.type.mathematik`, `question.type.wortarten`, `question.type.fillBlank`, `question.type.matching`, `question.type.dropPin` (for UI type selectors).
- Prompt templates per type in code comments (e.g., "JSON shape for sequencing: {...}").

---

## 4. WORK-PACKAGE MAP (15 WPs across 4 Waves)

| WP-ID | File(s) | Scope | Depends | Wave | Est. (h) | Gate |
|-------|---------|-------|---------|------|----------|------|
| **W0-1** | `common/constants.ts`, `common/validators/quizz.ts`, `mcp/tools/ai.ts` | Type/validator contracts (frozen) | — | 0 | 1.5 | `tsc` + `cargo check` + schema validation |
| **W1-1a** | `mcp/src/ai-provider.ts::generateQuestion()` | Extend LLM prompt templates for sequencing, sentence-builder, mathematik, wortarten (4 templates, ~50 LOC per type). Keep existing 4 types. | W0-1 | 1 | 4 | `pnpm test:mcp` (unit: mock LLM output) |
| **W1-1b** | `mcp/src/ai-provider.ts::generateQuestion()` | Add try/retry logic (WP-3 LLM robustness): on JSON parse fail, retry up to 2× with tighter prompt. Log skipped retries. | W1-1a | 1 | 2 | unit test + integration retry scenarios |
| **W1-2a** | `mcp/src/question-builder.ts` | Add sequencing, sentence-builder, mathematik, wortarten cases to switch-statement (lines 73–138). Populate items/chunks/tolerance/etc. defaults. | W0-1 | 1 | 2 | `pnpm test:mcp` (create_question for each type) |
| **W1-2b** | `mcp/src/question-builder.ts` | Verify fill-blank, matching, drop-pin stubs (document why they aren't yet fully built). Add minimal case-branches (accept params, pass through validation). | W0-1 | 1 | 1 | validation pass (rejection of invalid input) |
| **W2-1** | `common/validators/quizz.ts` line 137–148 | Remove stubs; implement proper superRefine for sequencing, sentence-builder, mathematik, wortarten. Check items/correctOrder lengths, chunks uniqueness, tolerance bounds, token count. | W0-1 | 2 | 3 | `pnpm test` (vitest quizz validator suite) |
| **W2-2** | `common/validators/quizz.ts` | Add docstring comments per type explaining fields + constraints (items must be >=2, correctOrder must be permutation of item.ids, etc.). Reference in code. | W2-1 | 2 | 1 | review + grep validation logic |
| **W2-3** | `common/types/game/socket.ts` | Extend `PlayerAnswerRecord` with optional fields for sentence-builder, mathematik, wortarten, fill-blank, matching, drop-pin. Document which type uses which field. | W0-1 | 2 | 1 | `tsc --noEmit` |
| **W3-1** | `mcp/src/tools/quizzes.ts` + `mcp/src/question-builder.ts` | Verify `create_question` + `add_question` MCP tools handle all 10 types. Test on each type (snapshot questions per type in test dir). | W1-2a, W2-1 | 3 | 2 | `pnpm test:mcp` (integration: build + save + load quiz) |
| **W3-2** | `http/solo.ts` (solo play) + socket handlers (live play) | Verify round-trip for all 10 types: load quiz → emit `quizz:data` → client renders → player answers → server scores → record `PlayerAnswerRecord` → emit result. Spot-check 2 types (e.g., sequencing + mathematik). | W1-2a, W2-1 | 3 | 3 | e2e: solo-alltypes.spec.ts + live game (limited scope: no all-13 yet) |
| **W3-3** | Docs | Update `docs/design/api-llm-harmonization-sdd.md` (this file) + add prompt-template reference in code comments (ai-provider.ts + question-builder.ts). Link design.md to round-trip expectations. | W3-1 | 3 | 1 | review + internal link checks |
| **W4-1** | `mcp/src/ai-provider.ts::generateDistractors()` | Document why `generateDistractors()` doesn't (yet) support fill-blank, matching, drop-pin (concept mismatch: distractors = wrong options in choice-like, but fill-blank has different semantics). Add comment + OPEN DECISION. | — | 4 | 0.5 | code review (comment only) |
| **W4-2** | `mcp/src/tools/quizzes.ts` | Optional: add `generate_distractors` docstring caveat (WP-4-1 finding). Keep tool unchanged. | W4-1 | 4 | 0.5 | review |
| **W4-3** | Planned: fill-blank, matching, drop-pin (stubs → full) | Placeholder WP: when the 3 new types graduate from planning to implementation, extend this SDD with dedicated WPs per type (prompt templates, builders, validators, e2e). | Deferred | — | ~15 | Deferred |
| **W4-4** | E2E: All 10 types (solo + live, 3 viewports) | Extend `e2e/stagehand/solo-alltypes.spec.ts` + add live-alltypes.spec.ts for all 10 types (39+ cases; parallel by type). Includes mathematik numeric input, wortarten POS tagging, sequencing drag-drop. | W3-1 | 4 | 8 | Stagehand + `pnpm test:e2e` (3 browsers) |

**Principles:** 1 WP ≈ 1 file / <150 LOC per function; tests/docs = own WPs; ≥2 WPs per wave for parallelization.

---

## 5. WAVE-BY-WAVE EXECUTION

### **Wave 0: Contract Freeze** (Thursday 2026-07-25, ~2 h)
- **WPs:** W0-1.
- **Gate:** `tsc --noEmit packages/common` + `cargo check` + validate all constants are in sync → **ZERO regression**.
- **Deliverable:** Frozen type contracts + updated ai.ts inputSchema enum.
- **Rollback:** Revert type/validator changes if tsc fails.

### **Wave 1: AI Generator & Builder Extension** (Fri–Mon 2026-07-26–29, ~7 h)
- **WPs:** W1-1a, W1-1b, W1-2a, W1-2b (parallel).
- **Gate:** `pnpm test:mcp` (unit + integration) + mock LLM output validates + retry scenarios pass.
- **Deliverable:** `generate_question(type="sequencing")` returns valid JSON; `create_question(type="sentence-builder")` builds + validates.
- **Rollback:** Revert ai-provider.ts + question-builder.ts if unit tests fail (LLM prompt mismatch or builder bug).

### **Wave 2: Validator Completeness** (Tue–Wed 2026-07-30–31, ~5 h)
- **WPs:** W2-1, W2-2, W2-3 (parallel).
- **Gate:** `pnpm test` (quizz validator suite: all 10 types pass valid input, reject invalid).
- **Deliverable:** Proper superRefine for sequencing/sentence-builder/mathematik/wortarten; `PlayerAnswerRecord` extended + documented.
- **Rollback:** Revert validator changes if existing quizzes fail validation.

### **Wave 3: Round-Trip Verification** (Thu–Fri 2026-08-01–02, ~6 h)
- **WPs:** W3-1, W3-2, W3-3 (sequential: verify builder first, then round-trip, then docs).
- **Gate:** MCP create → save → load → quiz:data emits. Spot-check 2 types end-to-end (solo + live).
- **Deploy:** None; validation only.
- **Deliverable:** Documented round-trip proof per type; e2e stubs for all 10 (partial coverage).

### **Wave 4: Finalization & E2E** (Mon–Fri 2026-08-05–09, ~10 h)
- **WPs:** W4-1, W4-2, W4-4 (W4-3 deferred until planned types are scheduled).
- **Gate:** All 10 types pass solo-alltypes + new live-alltypes e2e (3 browsers, 39+ cases).
- **Deploy:** Production (gated on all prior waves green).
- **Deliverable:** Full round-trip e2e coverage; distractor limitation documented.

---

## 6. OPEN DECISIONS (Clarify before Wave 1)

1. **Planned Types Inclusion:** Should fill-blank, matching, drop-pin be added to QUESTION_TYPES **now** (as stubs) or deferred until dedicated SDDs? → **DECISION:** Keep them out of the enum for now. Use `// Planned (...)` comments in code. When each type's full SDD is approved, add to QUESTION_TYPES + implement.

2. **LLM Retry Budget:** How many retries on LLM JSON parse/validation failure? Default 2 → retry with tighter prompt (e.g., "Respond ONLY with the exact JSON shape: ..."). → **DECISION:** Default to 2 retries; log skipped attempts. If exhausted, throw `errors:ai.invalidOutput`.

3. **Distractor Scope:** Do fill-blank, matching, drop-pin **need** distractor generation, or is that concept mismatch? Distractors = "wrong multiple-choice options", but fill-blank isn't multiple-choice. → **DECISION:** Fill-blank, matching, drop-pin do NOT support `generateDistractors()`. Document in MCP tool docstring + code comment (WP-4-1).

4. **Socket Payload Versioning:** If `PlayerAnswerRecord` gains new optional fields (fill-blank, matching, drop-pin), will legacy clients (pre-this-SDD) break? → **DECISION:** All new fields are optional + backward-compatible. Tests must verify old clients still work.

5. **E2E All-Types Timeline:** 39+ e2e cases (10 types × 3–4 viewports each) → ~40h if serial, but parallelizable. Should all 10 be tested now or subset? → **DECISION:** Wave 4 targets all 10 types (sequencing, sentence-builder, mathematik, wortarten + 4 existing: choice, boolean, multiple-select, type-answer). The 3 planned types (fill-blank, matching, drop-pin) have e2e stubs (WP-4-4) but only if full implementation is done. Otherwise, partial coverage.

---

## 7. NON-GOALS & SCOPING

- **NOT included:** Implementing scoring logic for sequencing/sentence-builder/mathematik/wortarten in Rust (`engine/scoring/`). That's a separate stack effort (referenced but not this SDD's scope). This SDD covers **authoring → API → storage → playback** round-trip; scoring is assumed to exist or is a follow-on.
- **NOT included:** Filling the 3 planned types (fill-blank, matching, drop-pin) with full implementations. They get minimal stubs here; full implementation is a future SDD.
- **NOT included:** Distractor generation for new types. Concept mismatch documented; can be revisited per-type later.

---

## 8. VERIFICATION CHECKLIST (Pre-Merge Gate)

- [ ] `tsc --noEmit packages/common` passes (no type regressions).
- [ ] `cargo check rust/protocol` passes.
- [ ] `pnpm test:mcp` passes (question-builder, ai-provider, validators all units green).
- [ ] Mock LLM output (valid + invalid JSON) is tested (retry logic verified).
- [ ] All 10 types pass `questionValidator.safeParse()` with valid input.
- [ ] All 10 types **reject** questionValidator with invalid input (too-short items, mismatched solutions, etc.).
- [ ] MCP `create_question` + `add_question` work for all 10 types.
- [ ] E2E spot-check: sequencing + mathematik (solo + live, >=1 viewport).
- [ ] Docs updated (code comments, design.md link, open decisions closed).
- [ ] No new secrets introduced (secret-scan output clean).

---

## 9. APPENDIX: Prompt Templates (Reference)

**Note:** These are examples; actual templates live in `ai-provider.ts` code comments.

### Sequencing
```
Write ONE sequencing question about: "${topic}".
JSON shape: {
  "question": "string (e.g., 'Reorder these steps:')",
  "items": [{ "id": "1", "label": "First step" }, { "id": "2", "label": "Second step" }],
  "correctOrder": ["1", "2", ...]
}
```

### Sentence-Builder
```
Write ONE sentence-builder question about: "${topic}".
JSON shape: {
  "question": "Arrange these words into a sentence:",
  "chunks": ["word1", "word2", "word3"],
  "correctOrder": [0, 2, 1]  // indices of chunks in correct order
}
```

### Mathematik
```
Write ONE numeric math question about: "${topic}".
JSON shape: {
  "question": "What is 2 + 2?",
  "correct": 4,
  "tolerance": 0.01,
  "decimals": 2
}
```

### Wortarten (Parts of Speech)
```
Write ONE parts-of-speech tagging question about: "${topic}".
JSON shape: {
  "question": "Tag each word (e.g., N=noun, V=verb, ...)",
  "sentence": "The cat sleeps",
  "tokens": ["The", "cat", "sleeps"],
  "posSet": ["ART", "N", "V"],  // POS for each token
  "disabledTokens": [0]  // which token indices can the player NOT edit?
}
```

---

## 10. REFERENCES

- **Bestand:** `packages/mcp/src/{ai-provider.ts, question-builder.ts, tools/{ai.ts, quizzes.ts}}`
- **Validators:** `packages/common/src/validators/quizz.ts` (single source of truth for type constraints)
- **Socket Types:** `packages/common/src/types/game/{socket.ts, index.ts}`
- **Constants:** `packages/common/src/constants.ts` (QUESTION_TYPES, EVENTS)
- **Related SDDs:** `docs/design/kahoot-remediation-sdd.md` (Wave 5 sequencing type), fill-blank-sdd.md (planned), matching-sdd.md (planned), drop-pin-sdd.md (planned)
