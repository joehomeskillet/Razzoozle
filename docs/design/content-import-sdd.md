# SDD: Content & Import Features (Template-Library, PPTX/PDF, AI-Extractor)

**Status:** DESIGN (Wave 8–9) | **Scope-Frozen:** 2026-07-24 | **Verified against:** `quizzes` table schema, `quizz:duplicate` handler, Theme-Template patterns, Plugin ZIP pipeline  
**Effort:** ~120–140 h (3 features, 20–22 WPs) | **Timeline:** 2 waves, ~6 weeks @ 15–20 h/week  
**Author:** Claude Fable 5 | **Related:** `docs/design/api-llm-harmonization-sdd.md` (Generator API), `docs/design/bulk-import-sdd.md` (CSV import)

---

## 1. REQUIREMENTS (Verified, Scope-Frozen)

| Req | Title | Acceptance Criteria | Severity |
|-----|-------|---------------------|----------|
| **R1-A** | Template-Library UI | Manager → Quiz List → **Create from Template** button → Modal lists category (Math/Sprachen/Geschichte/custom) + preview (title, question-count, tags, duration-avg) + **Duplicate** CTA. Duplicated quiz loads in Editor with "(Vorlage: Template-Name)" suffix. **Proof:** Create 3 templates (Math/Sprachen/other), test clone-and-edit workflow. | P1 |
| **R1-B** | Template-Storage Schema | Database: `quiz_templates` table (id, category, name, description, questions_snapshot JSONB, tag JSONB, created_at). Synonym-check: no duplicate template names per category. **Proof:** Verify via ERD + SQL schema gates. | P1 |
| **R1-C** | Template-Seeding | Seed 5 built-in templates on schema migration (Math: `quad-formula`, `probability-basics`; Sprachen: `vocab-common`, `past-tense`; custom: `icebreaker-poll`). Managers can create/edit/delete custom templates (save-as-template from existing quiz). **Proof:** DB query lists all 5 + manager UI add/edit gates. | P1 |
| **R2-A** | PPTX/PDF File Upload | Manager → Quiz Editor → **Import from File** button → file picker (`.pptx`, `.pdf` only) → upload (max 50 MB, virus-scan optional, draft mode). Server validates MIME, unpacks, parses text/table structure. **Proof:** Upload 3 files (1 PPTX, 2 PDFs), verify parse summary (slide #, extracted text count). | P1 |
| **R2-B** | PPTX/PDF Parsing Engine | Node/Rust library (decision: `pptx` npm + `pdfjs-dist` for Node OR `pdf-extract` rust crate + via HTTP bridge). Parses slides (PPTX) or pages (PDF) → extracted text + table cells. Output: `{ slides: [{ text, tables: [{rows}] }] }`. Handles UTF-8, special chars, embedded images (skip, metadata only). **Proof:** Parse 2 PPTX + 2 PDFs; output JSON valid against schema. | P1 |
| **R2-C** | Question Preview & Mapping | Server emit extracted text → Manager UI preview pane (live scroll through slides/pages) + **AI Extract** button or **Manual Map** fallback (drag text → question fields: title + answers). Validation: min 2 answers per question, max 1 solution marked. **Proof:** Upload → preview, extract 5 questions via AI, validate count + structure. | P1 |
| **R2-D** | Questions Append to Quiz | Extract → Confirm → Server bulk-append to `quizzes.questions` JSONB (same pipeline as CSV bulk-import, R-validation same). Update version/updated_at. **Proof:** Append 5 questions → verify in Editor + live-play all questions. | P2 |
| **R3-A** | AI-Question-Extractor API | Manager → **Extract Questions (AI)** → text input or drag-paste text file (`.txt`) → LLM call (Claude API, model TBD per api-llm-harmonization-sdd.md). Payload: `{ text, language, quizType?, count? }` → response `{ questions: [{ text, answers: [{text, isCorrect}] }] }`. Dry-run + cost/quota preview. **Proof:** Extract from 3 different texts, validate output structure + token usage. | SHOULD |
| **R3-B** | AI-Extractor Integration with PPTX/PDF | PPTX/PDF parse → extracted text → **AI Extract** route (shares R3-A API). Fallback: manual mapping if AI fails (quota/error). Extracted AI questions + manual fallback = combined queue for review. **Proof:** Upload PDF → trigger AI extract, verify question structure, fallback manual-map works. | SHOULD |
| **R3-C** | Preview, Review & Batch Confirm | Extracted questions (AI + manual) in review pane: card layout per question (title, answers highlighted, isCorrect indicator) → swipe/check confidence + **Append All** or **Discard**. User can edit text inline before confirm. i18n ×6 locales. **Proof:** Extract 10 questions, edit 2, append 8, verify in Editor. | SHOULD |
| **R4-A** | i18n Content Keys | Template UI (R1-A): `templates.createFromTemplate`, `templates.previewModal`, `templates.duplicateCTA`. PPTX/PDF (R2-A/R2-C): `import.fromFile`, `import.extractButton`, `import.manualMapButton`. AI (R3-A/R3-C): `ai.extractButton`, `ai.previewReview`, `ai.costWarning`, `ai.confirmAppend`. ×6 locales (de, en, es, fr, it, zh). **Proof:** `check-locales.sh` passes all 6; UI renders correct locale. | P2 |
| **R4-B** | Error Handling & UX Fallback | PPTX parse fails → user prompted to manual-map or discard. AI quota/timeout → fallback to manual-map. File too large → reject with byte-count message. No network → queue for retry. **Proof:** Trigger 3 failure modes, verify user sees actionable error + fallback path. | P2 |

---

## 2. NON-GOALS (Scope Boundary)

- **CSV Bulk Import:** Separate feature in `bulk-import-sdd.md` (Wave 7 design, Wave 8 code).
- **Generator API Harmonization:** Handled by `api-llm-harmonization-sdd.md` (LLM model choice, token/cost tracking, caching). This SDD imports the finalized API; no API design here.
- **Media Extraction from PPTX/PDF:** Images/videos embedded in slides → metadata only (skip download/store), reference as "image on slide N" in extracted text. Full media import = separate feature.
- **Approval Workflow for Extracted Questions:** Extracted questions go straight to quiz (no submission queue). Future feature: save-to-catalog + approval (separate WP).
- **DOCX/PPT Import:** Start with PPTX (native ZIP structure, OPC standard) + PDF (well-established). DOCX similar complexity, deferred to Wave 10.

---

## 3. CONTRACT FREEZE — Wave 8 (Immutable Interfaces)

**Timebox:** 6h | **Gate:** `tsc --noEmit` + `cargo check` | **Rollback:** Revert type changes if tsc fails

### Type & Protocol Changes (3 areas)

**A. `packages/common/src/types/quiz.ts`** (add template types):
```typescript
export interface QuizTemplate {
  id: string;  // safe_id
  category: "math" | "sprachen" | "geschichte" | "custom";
  name: string;
  description?: string;
  questionsSnapshot: Question[];  // frozen snapshot
  tags?: string[];  // e.g. ["algebra", "beginner"]
  createdAt: Date;
}

export interface TemplatePreview {
  id: string;
  name: string;
  category: string;
  questionCount: number;
  tags?: string[];
  averageDurationSec?: number;
}
```

**B. `packages/common/src/types/import.ts`** (new file — PPTX/PDF + AI):
```typescript
export interface FileImportPayload {
  fileData: string;  // base64-encoded file bytes
  filename: string;
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/pdf";
}

export interface ParsedDocument {
  format: "pptx" | "pdf";
  slides: Array<{
    index: number;
    text: string;  // extracted text from slide/page
    tables?: Array<{ rows: string[][] }>;  // table cells if found
  }>;
  rawByteLength: number;
}

export interface AIExtractRequest {
  text: string;
  language: "de" | "en" | "es" | "fr" | "it" | "zh";
  quizType?: string;  // e.g. "math", "languages"
  targetCount?: number;  // hint to LLM (default 10)
}

export interface AIExtractResponse {
  questions: Array<{
    text: string;  // question body
    answers: Array<{ text: string; isCorrect: boolean }>;
    confidence?: number;  // 0–1, LLM-reported
  }>;
  tokensUsed: number;
  estimatedCost?: number;  // USD
}
```

**C. `packages/common/src/types/socket.ts`** (add event constants):
```typescript
TEMPLATE: {
  LIST: "quizTemplate:list",
  CREATE_FROM: "quizTemplate:createFrom",
  SAVE_AS: "quizTemplate:saveAs",
  DELETE: "quizTemplate:delete",
},
IMPORT: {
  PARSE_FILE: "import:parseFile",
  EXTRACT_AI: "import:extractAI",
  APPEND_QUESTIONS: "import:appendQuestions",
},
```

**D. Database schema (migrations/020_quiz_templates.sql)**:
```sql
CREATE TABLE IF NOT EXISTS quiz_templates (
  id safe_id PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  questions_snapshot JSONB NOT NULL DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE (category, name)
);
CREATE INDEX idx_quiz_templates_category ON quiz_templates(category);
```

**E. i18n Keys** (×6 locales, examples):
- `templates.createFromTemplate`, `templates.previewModal`, `templates.duplicateCTA`
- `import.fromFile`, `import.fileTypeHint`, `import.extractButton`, `import.manualMapButton`, `import.sizeWarning`
- `ai.extractButton`, `ai.previewReview`, `ai.costWarning`, `ai.quotaExceeded`, `ai.confirmAppend`

---

## 4. WORK-PACKAGE MAP (22 WPs across 2 Waves)

| WP-ID | File(s) | Scope | Depends | Wave | Est. (h) | Gate |
|-------|---------|-------|---------|------|----------|------|
| **W8-1** | `packages/common/src/types/quiz.ts`, `types/import.ts` (new), `types/socket.ts` | Type contracts (frozen) + event codes | — | 8 | 2 | `tsc --noEmit` |
| **W8-2** | `db/migrations/020_quiz_templates.sql` | Schema + seeding (5 built-in templates) | W8-1 | 8 | 1 | `psql` schema validation |
| **W8-3** | `rust/server/src/socket/manager/templates.rs` (new) | Handler: LIST, CREATE_FROM (duplicate), SAVE_AS, DELETE | W8-1 | 8 | 4 | `cargo test templates` |
| **W8-4** | `packages/web/src/features/manager/TemplateLibraryModal.tsx` (new) | UI: category picker, preview grid, duplicate CTA, i18n | W8-1 | 8 | 3 | vitest + design-validator |
| **W8-5** | `packages/web/src/features/manager/QuizEditorHeader.tsx` (modify) | Add **Create from Template** button + wire to W8-4 modal | W8-4 | 8 | 1 | vitest |
| **W8-6** | `packages/common/src/locales/*.json` (i18n) | Template strings ×6 locales (R4-A) | W8-4 | 8 | 1 | `check-locales.sh` |
| **W8-7** | `packages/web/src/features/import/FileImportModal.tsx` (new) | UI: file picker, upload handler, parse summary display | — | 8 | 2 | vitest |
| **W8-8** | `rust/server/src/socket/manager/import.rs` (new) | Handler: PARSE_FILE (PPTX/PDF → ParsedDocument) | W8-1 | 8 | 5 | `cargo test import` |
| **W8-9** | `packages/web/src/features/import/DocumentPreview.tsx` (new) | Live preview pane (scroll slides/pages), render extracted text | W8-7, W8-8 | 8 | 2 | vitest |
| **W8-10** | `packages/web/src/features/import/ManualMapping.tsx` (new) | Fallback UI: drag text → question fields, validation | W8-9 | 8 | 2 | vitest |
| **W8-11** | `rust/server/src/socket/manager/import_append.rs` (new) | Handler: APPEND_QUESTIONS (bulk append to quiz.questions, dedup check) | W8-3 | 8 | 2 | `cargo test import_append` |
| **W8-12** | `packages/common/src/locales/*.json` (i18n) | File import strings ×6 locales (R4-A) | W8-7 | 8 | 1 | `check-locales.sh` |
| **W9-1** | `rust/server/src/http/ai_extract.rs` (new) | POST /api/ai/extract-questions: proxy to Claude API (per api-llm-harmonization-sdd.md) | — | 9 | 3 | `cargo test ai_extract` |
| **W9-2** | `packages/web/src/features/import/AIExtractModal.tsx` (new) | UI: text input, paste-file, cost/quota preview, trigger W9-1 | W9-1 | 9 | 3 | vitest |
| **W9-3** | `rust/server/src/socket/manager/import_ai.rs` (new) | Handler: EXTRACT_AI + integration with W8-8 (pipe PPTX/PDF text to W9-1) | W9-1 | 9 | 3 | `cargo test import_ai` |
| **W9-4** | `packages/web/src/features/import/ExtractedQuestionsReview.tsx` (new) | Card layout, edit inline, confidence indicator, batch confirm (R3-C) | W9-2, W9-3 | 9 | 3 | vitest + design-validator |
| **W9-5** | `packages/web/src/features/manager/QuizEditorHeader.tsx` (modify) | Add **Extract from File** + **Extract via AI** buttons, wire to W8-7/W9-2 | W8-5, W9-2 | 9 | 1 | vitest |
| **W9-6** | `packages/common/src/locales/*.json` (i18n) | AI extract strings ×6 locales (R4-A) | W9-2 | 9 | 1 | `check-locales.sh` |
| **W9-7** | `rust/server/src/http/error_handlers.rs` (modify) | Add handlers for: FILE_TOO_LARGE, PARSE_FAILED, AI_QUOTA_EXCEEDED, AI_TIMEOUT (R4-B) | — | 9 | 1 | `cargo test error_handlers` |
| **W9-8** | `packages/web/src/features/import/ErrorFallback.tsx` (new) | UX: error card + fallback route (manual-map or discard) | W9-7 | 9 | 1 | vitest |
| **W9-9** | `e2e/stagehand/import-*.spec.ts` (3 new files) | E2E: template duplicate workflow, PPTX parse + AI extract, error fallback | W8–W9 (varies) | 9 | ~6 | `pnpm test:e2e` |
| **W9-10** | `docs/design/content-import-sdd.md` (this file) | Scope-freeze proof + effort recap | — | 9 | 1 | design review |

**Principles:** 1 WP ≈ 1 file <150 LOC; tests/i18n/docs = own WPs; ≥3 WPs per wave for parallelization.

---

## 5. WAVE-BY-WAVE EXECUTION

### **Wave 8: Template-Library + File Upload Parser** (Mon–Fri 2026-08-04–08-08, ~35 h)

**WPs:** W8-1–W8-12.

**Deliverables:**
1. ✅ Type contracts frozen (W8-1).
2. ✅ `quiz_templates` table seeded with 5 built-in templates (W8-2).
3. ✅ Manager UI: Template-Library modal (W8-4–W8-5) + localization (W8-6).
4. ✅ File import UI (W8-7) + document preview pane (W8-9).
5. ✅ PPTX/PDF parser backend (W8-8) + manual mapping fallback (W8-10).
6. ✅ Questions append handler (W8-11) + localization (W8-12).

**Gate:** 
- `tsc --noEmit packages/common` + `cargo check -p protocol` (W8-1).
- `cargo test --release` all import handlers (W8-3, W8-8, W8-11).
- `check-locales.sh ×6` (W8-6, W8-12).
- Smoke e2e: create quiz from template, upload PPTX, verify questions added.

**Deploy:** Staging canary; verify template UI + file upload handler; no breaking changes.

### **Wave 9: AI-Question-Extractor + Integration** (Mon–Fri 2026-08-11–08-15, ~30 h)

**WPs:** W9-1–W9-10.

**Deliverables:**
1. ✅ AI-Extractor API (W9-1) wired to Claude API (per api-llm-harmonization-sdd.md).
2. ✅ Manager UI: AI-Extract modal (W9-2) + review pane (W9-4).
3. ✅ Integration: PPTX/PDF text → AI-Extractor → review → append (W9-3).
4. ✅ Error handling + fallback UX (W9-7, W9-8).
5. ✅ Full i18n ×6 locales (W9-6).
6. ✅ E2E test coverage: 3 scenarios (W9-9).

**Gate:**
- `cargo test --release` all AI handlers (W9-1, W9-3, W9-7).
- `check-locales.sh ×6` (W9-6).
- E2E: template workflow, file upload + AI extract, error fallback + manual map.
- **Critical:** AI API quota verification (dry-run mode, cost preview).

**Deploy:** Production after W9 gate pass; monitor AI API usage + error rates.

---

## 6. OPEN DECISIONS (Document, Decide Before Code)

| Decision | Options | Impact | Recommendation |
|----------|---------|--------|---|
| **PPTX/PDF Library** | (A) Node: `pptx` npm + `pdfjs-dist` | Token cost, build size. Node libs = larger bundle. | Use Node libs + HTTP bridge from Rust. Simplifies maintainability. |
| | (B) Rust: `pdf-extract` crate + Node bridge | Rust maintainability, but binary size for Wasm-like targets. | |
| | (C) Cloud service (e.g. AWS Textract) | Cost per file, no offline. | Avoid; template SDD targets Razzoozle standalone. |
| **AI Model Choice** | (A) Claude API (openai-compatible) | Via api-llm-harmonization-sdd.md. Preferred. | **Chosen:** Claude API. Deferred spec in api-llm-harmonization-sdd.md. |
| | (B) GPT-4 fallback | Separate quota, cost. | Use as fallback if Claude quota exhausted (future). |
| **File Size Limit** | (A) 10 MB | Most PPTX/PDFs fit. Safer parsing. | **Chosen:** 50 MB (R2-A). Allows large presentations with embedded media. |
| | (B) 50 MB | Covers edge cases. Slower parsing. | |
| | (C) 100+ MB | Parsing complexity, timeout risk. | |
| **Virus Scan** | (A) Local ClamAV / Yara | Overhead, false positives. | Skip v1 (R2-A). Add in Wave 10 if needed. |
| | (B) Cloud scanning (e.g. VirusTotal API) | Cost per file. | |
| | (C) Skip | Assume files from trusted teachers only. | |
| **Template Sharing** | (A) Built-in only (5 seeded) | Limited, no user customization. | **Chosen (v1):** Built-in + user custom (no public sharing yet). Future: admin-managed catalog. |
| | (B) User custom + public catalog | Social features, moderation burden. | |

---

## 7. RISK & MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| AI API quota exhausted mid-test | Medium | E2E blocked; LLM calls expensive. | Dry-run mode (R3-A) with cost preview before confirm. Rate-limit per manager (5 extracts/hour). |
| PPTX/PDF parse timeout on large files | Low | UI hangs, user frustrated. | 30-sec timeout per file; fallback to manual-map. Async parsing with progress bar. |
| LLM-generated questions low quality | Medium | User has to edit heavily. | Add confidence score (R3-C); user can edit inline before append. Fallback to manual-map always available. |
| Duplicate template names create confusion | Low | UX clutter, hard to find. | Database UNIQUE(category, name); UI prevents save if name exists. |
| File upload security (XSS, zip-slip) | Low | Security hole. | Validate MIME type + file magic bytes. Unzip with path-traversal guards (mirrors plugin ZIP pipeline). No script execution. |

---

## 8. VERIFICATION CHECKLIST (Pre-Wave-8 Gate)

- [ ] `quiz_templates` schema migrated + 5 built-in templates seeded.
- [ ] `QuizTemplate` + `ParsedDocument` + `AIExtractRequest/Response` types finalized + tsc passes.
- [ ] PPTX/PDF library decision locked (choice A/B + npm audit).
- [ ] Claude API integration finalized per api-llm-harmonization-sdd.md (model, token tracking, cost).
- [ ] Figma mocks: Template-Library modal, File-Import preview, AI-Extract review card.
- [ ] i18n keys (all 8 namespaces, ×6 locales) drafted in spreadsheet.
- [ ] Error message hierarchy (FILE_TOO_LARGE, PARSE_FAILED, AI_QUOTA) + fallback flows mapped.
- [ ] E2E test outline: 3 scenarios (template clone, PPTX parse, AI extract + edit + append).

---

## 9. RELATED SPECS & NOTES

**Overlaps & Boundaries:**
- **api-llm-harmonization-sdd.md** (parallel): Defines Claude API integration, token tracking, cost model. This SDD **imports** the finalized API (R3-A uses `POST /api/ai/extract-questions`). No duplication.
- **bulk-import-sdd.md** (complete): CSV import done; this SDD handles files + AI. Both append to `quiz.questions` via same validation pipeline.

**Patterns Borrowed:**
- Template system mirrors `ThemeTemplate` (packages/common/src/types/theme.ts) for UI consistency.
- ZIP-unpack guards from `socket/manager/plugins_zip.rs:57–68` (path-traversal protection).
- File upload validation from `socket/manager/media/validate.rs` (MIME, size, magic bytes).

**Future (Wave 10+):**
- DOCX support (similar parsing, lower priority).
- Public template catalog + approval workflow.
- Template versioning + update-in-place.
- Batch AI-extraction with queue management.
- Media extraction from PPTX (images → media_assets, link in questions).

---

**Total LOC Estimate:** ~2800 (new code) + ~800 (tests/e2e) + ~200 (i18n keys) = **~3800 LOC** across 22 WPs.  
**Quality Gate:** `tsc --noEmit` + `cargo test --release` + `pnpm test:e2e` + `check-locales.sh ×6` (100% green before merge).  
**Rollback:** Type-change failure → revert W8-1; API integration failure → revert W9-1–W9-3; UI gates sufficient (no schema risk).

