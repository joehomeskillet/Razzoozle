# SDD: CSV Bulk Import (Questions)

**Status:** DESIGN (Wave 7) | **Scope-Frozen input:** `docs/wave6-7-sdd.md` R-W7-2  
**Implementation:** Wave 8 only — architecture + schema + effort. Zero product code.  
**Verified against:** `packages/common/src/constants.ts` `QUESTION_TYPES` (10), `packages/common/src/validators/quizz.ts`, `db/migrations/001` (`quizzes`, `media_assets`), quiz save path in Rust manager  
**Target LOC:** ≤450 | **Author:** grok-cli (Wave 7)

---

## 1. Problem

Creating 50+ questions by hand in the Quiz Editor is slow. Teachers need a **CSV bulk import** that:

1. Covers **all** product question types (canonical list = 10, not 9 — see §3).
2. Validates before write (**dry-run**).
3. Links media only via already-uploaded `/media/…` paths.
4. Appends questions into an existing quiz (or creates draft rows) under manager auth.

**Exists today:** CSV **export** of results (`resultExport.ts`) — export only, not import.  
**Does not exist:** question import endpoint, CSV parser, editor bulk UI.

---

## 2. User Flow

1. Manager → Quiz Editor → Questions tab → **Bulk Import**.
2. Modal: file picker (`.csv`), optional **Dry-run** checkbox (default on first click).
3. Upload → server validates every row → report table (row #, status, message).
4. If dry-run clean (or only warnings): user confirms **Import**.
5. Server appends valid rows as questions; invalid rows skipped with report (row-by-row, not all-or-nothing).
6. Editor refreshes question list; dirty state re-baselined like a normal save.

---

## 3. Canonical Question Types

From `packages/common/src/constants.ts` (`QUESTION_TYPES`):

| # | `type` value | Notes |
|---|---|---|
| 1 | `choice` | 2–4 answers, ≥1 solution index |
| 2 | `boolean` | typically 2 answers + 1 solution |
| 3 | `slider` | min/max/correct/step/unit |
| 4 | `poll` | answers, no solutions |
| 5 | `multiple-select` | ≥2 answers, ≥2 solutions |
| 6 | `type-answer` | acceptedAnswers + matchMode |
| 7 | `sentence-builder` | chunks (correct order) |
| 8 | `mathematik` | correct number + tolerance/decimals |
| 9 | `wortarten` | sentence, tokens, posSet, solutions |
| 10 | `sequencing` | items + correctOrder |

Parent wave doc said “9 types”; product has **10** including `sequencing`. CSV schema covers all 10.

---

## 4. CSV Schema

### 4.1 Format rules

- Encoding: UTF-8 (BOM allowed).
- Delimiter: `,` (RFC 4180 quoting; `"` escaped as `""`).
- Header row required; unknown columns → warning (ignored).
- Multi-value fields: pipe `|` separator (no bare commas inside unquoted multi-values).
- Empty cells → omitted optional fields.
- Row numbers in errors are **1-based data rows** (header = row 0, not counted).

### 4.2 Global columns (all types)

| Column | Required | Maps to | Notes |
|---|---|---|---|
| `type` | yes | `Question.type` | must be in `QUESTION_TYPES` |
| `question` | yes | `Question.question` | non-empty |
| `time` | no | `time` | default 20; clamp 5–120 |
| `cooldown` | no | `cooldown` | default 5; clamp 3–15 |
| `media_url` | no | `media.url` | see §5 |
| `media_type` | no | `media.type` | `image`\|`video`\|`audio`; default `image` if url set |
| `tags` | no | *reserved* | ignore in v1 or store later |
| `practice` | no | `practice` | `true`/`false` |
| `bonus` | no | `bonus` | `true`/`false` |

### 4.3 Type-specific columns

| type | Columns | Validation (mirror `questionValidator`) |
|---|---|---|
| `choice` | `answers`, `solutions` | answers 2–4 pipe-sep; solutions 0-based indices pipe-sep, ≥1 |
| `boolean` | `answers`, `solutions` | same as choice; recommend `Wahr\|Falsch` |
| `slider` | `min`, `max`, `correct`, `step?`, `unit?` | min < max; correct in range; step > 0 |
| `poll` | `answers` | ≥2 answers; no solutions |
| `multiple-select` | `answers`, `solutions` | ≥2 answers; ≥2 solution indices |
| `type-answer` | `accepted_answers`, `match_mode?` | ≥1 accepted; match_mode `exact`\|`normalized`\|`fuzzy` (default `normalized`) |
| `sentence-builder` | `chunks` | ≥2 pipe-sep chunks (correct order) |
| `mathematik` | `correct`, `tolerance?`, `decimals?` | correct number required |
| `wortarten` | `sentence`, `tokens`, `pos_set`, `solutions` | tokens pipe-sep; pos_set pipe-sep; solutions = pos index per token |
| `sequencing` | `items`, `correct_order` | items as `id:label` pipe-sep; correct_order = pipe-sep ids |

**Examples**

```csv
type,question,answers,solutions,time,cooldown
choice,Which planet is known as the Red Planet?,Venus|Mars|Jupiter|Mercury,1,10,5
boolean,Water boils at 100 °C at sea level.,Wahr|Falsch,0,10,5
```

```csv
type,question,min,max,correct,step,time,cooldown
slider,How many continents are there?,1,10,7,1,10,5
```

```csv
type,question,accepted_answers,match_mode,time,cooldown
type-answer,What is the capital of France?,Paris|paris,normalized,10,5
```

```csv
type,question,chunks,time,cooldown
sentence-builder,Order the words to form the quick brown fox,the|quick|brown|fox,10,5
```

```csv
type,question,items,correct_order,time,cooldown
sequencing,Order the steps of making a cup of tea,item-1:Boil water|item-2:Add tea bag|item-3:Pour hot water,item-1|item-3|item-2,15,5
```

```csv
type,question,sentence,tokens,pos_set,solutions,time,cooldown
wortarten,Bestimme die Wortarten.,Der Hund läuft schnell,Der|Hund|läuft|schnell,Nomen|Verb|Adjektiv|Artikel,3|0|1|2,45,5
```

Internal JSON field names stay camelCase (`acceptedAnswers`, `matchMode`, `correctOrder`, `posSet`) after parse — CSV uses snake_case headers for spreadsheet friendliness.

---

## 5. Media Linking

| Rule | Detail |
|---|---|
| Allowed prefixes | `/media/` and `/theme/` only (align with `questionMediaValidator`) |
| External URLs | **Reject** in import v1 (stricter than editor, which allows `https?://`) — reduces SSRF/content-risk in bulk |
| Path traversal | Reject `..` and non-matching patterns |
| Existence | Optional warning if file not in `media_assets` / disk (do not hard-fail if check is expensive) |
| Workflow | Teacher uploads media in Manager Media tab → copies path into CSV |

---

## 6. Validation & Error Handling

### 6.1 Modes

| Mode | Behavior |
|---|---|
| `dry_run=true` | Parse + validate all rows; **no** quiz mutation; return full report |
| `dry_run=false` | Same validation; insert **only valid** rows in one DB transaction for quiz JSON update; report includes skipped invalid rows |

### 6.2 Severity

| Level | Examples | Effect |
|---|---|---|
| error | missing `type`/`question`, bad type, out-of-range solutions, min≥max | row skipped |
| warning | unknown column, media not found on disk, defaulted time | row imported |
| info | defaults applied | row imported |

### 6.3 Response shape

```json
{
  "dryRun": true,
  "total": 50,
  "valid": 47,
  "invalid": 3,
  "imported": 0,
  "rows": [
    { "row": 1, "status": "ok" },
    { "row": 2, "status": "error", "messages": ["solutions index 9 out of range"] },
    { "row": 3, "status": "warning", "messages": ["media_url not found; kept path"] }
  ]
}
```

Cap report messages per row (e.g. 5) to keep payloads small.

### 6.4 Limits

| Limit | Value | Rationale |
|---|---|---|
| Max file size | 1 MiB | abuse |
| Max rows | 500 | editor usability |
| Max question length | same as product norms (~2k chars) | align validator |
| Auth | manager token, quiz owner or admin | SEC |

---

## 7. Server Architecture

### 7.1 Endpoint

```
POST /api/quizzes/:quizzId/import
Authorization: x-manager-token (admin | lehrkraft | owner)
Content-Type: multipart/form-data
  file: <csv>
  dry_run: "true" | "false"   (default true if omitted — safer)
```

Alternative if multipart is painful in current stack: `POST` with `{ csv: string, dryRun: bool }` JSON (UTF-8 body). Prefer multipart for real files.

### 7.2 Pipeline

1. Auth + load quiz by id (404 if missing).
2. Read CSV → rows (no new crate if possible: simple split with RFC4180; if Rust needs a crate, pin one small `csv` crate — **Wave 8 decision**, not this design).
3. Map each row → partial `Question` JSON.
4. Run same rules as `questionValidator` / server-side quiz validate (must not accept rows the editor would reject).
5. Dry-run → return report.
6. Import → append to `questions` array → persist via existing quizz save path (DB `quizzes` row / registry) inside a transaction.
7. Emit config refresh if manager sockets expect it (reuse `build_and_emit_config` pattern if applicable).

### 7.3 Reuse

| Asset | Path |
|---|---|
| Type list | `packages/common/src/constants.ts` `QUESTION_TYPES` |
| Client validator (mirror) | `packages/common/src/validators/quizz.ts` |
| Quiz persistence | Rust manager quizz save/update (`rust/server/src/socket/manager/quizz.rs` or HTTP equivalent) |
| Media table | `db/migrations/001` `media_assets` |
| CSV quoting precedent | `packages/web/src/features/manager/utils/resultExport.ts` (export-only) |

### 7.4 Non-goals on server

- XLSX/ODS.
- Auto-download remote images into `/media/`.
- AI “fix my CSV”.
- Catalog import (separate product path via `catalog_entries`).

---

## 8. Manager UI

| Element | Spec |
|---|---|
| Entry | Quiz Editor → Questions → button **Bulk Import** (`data-testid="quizz-bulk-import"`) |
| Modal | File input, Dry-run toggle, Validate, Import (disabled until last dry-run has `invalid===0` **or** user acknowledges partial) |
| Report | Scrollable table row/status/message |
| Empty state | Link to template CSV download (static example covering all 10 types) |
| i18n | New keys under `manager:import.*` ×6 locales (Wave 8) |

Partial import UX: default require clean dry-run; advanced “Import valid rows only” checkbox for power users.

---

## 9. Effort T-Shirt (Wave 8)

| Work item | Size | Est. h |
|---|---|---|
| CSV parse + column map (Rust or shared) | S–M | 4–6 |
| Per-type validation (mirror zod rules) | M | 6–8 |
| HTTP endpoint + auth + dry-run | M | 5–7 |
| Quiz append + transaction + emit | S–M | 3–5 |
| Manager modal UI | M | 6–8 |
| Template CSV + docs snippet | S | 1–2 |
| e2e Stagehand (dry-run + import + play one Q) | M | 4–6 |
| Locales ×6 | S | 2–3 |
| **Total** | | **~31–45 h** |

Parent estimate 39–49 h still OK if validation is thorough; lower bound if partial-import UX is minimal.

---

## 10. Non-Goals

- Implementing code in Wave 7 (this file only).
- New question types beyond the 10 in `QUESTION_TYPES`.
- External URL media fetch.
- Spreadsheet formula evaluation.
- Replacing the visual editor for single-question edits.
- Student-facing import.
- Import into catalog (only into a quiz).

---

## 11. Open Decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| OD-1 | Multipart vs JSON body | multipart file / raw CSV string | **Multipart**; JSON fallback if axum multipart cost high |
| OD-2 | Partial import default | strict clean / allow partial | Dry-run default; import requires confirm if any errors |
| OD-3 | External media URLs | allow like editor / reject | **Reject** in bulk for safety |
| OD-4 | Parser location | Rust only / shared TS pre-validate | Server authoritative; optional client pre-check with same column map |
| OD-5 | Replace vs append | replace all questions / append | **Append** only in v1 |
| OD-6 | Max rows 500 | 200 / 500 / 1000 | **500** |

---

## 12. Wave 8 Acceptance Criteria (preview)

1. Dry-run of a 10-type template CSV → `valid === total`, no DB change.
2. Deliberate bad row → `status: error` with row number; other rows importable.
3. Import appends N questions; editor + solo play see them.
4. `media_url=https://evil.example/x` → error; `/media/foo.webp` accepted when well-formed.
5. Unauthenticated call → 401; non-owner non-admin → 403.
6. File >1 MiB or >500 rows → 400 with clear message.

---

## 13. Verification Artifact (migrations / types)

```
# QUESTION_TYPES (10)
packages/common/src/constants.ts:468-479

# Validator fields used by schema
packages/common/src/validators/quizz.ts  (question, type, answers, solutions,
  min/max/correct/step, chunks, acceptedAnswers, matchMode, tolerance, decimals,
  sentence, tokens, posSet, items, correctOrder, media)

# quizzes + media_assets
db/migrations/001_initial_schema.sql  (quizzes, media_assets)

# No existing import endpoint (grep negative as of design date)
# POST /api/quizzes/:id/import — TO BE ADDED Wave 8
```

---

## 14. Infrastructure Map

| Concern | Path |
|---|---|
| Question types SSOT | `packages/common/src/constants.ts` |
| Zod rules | `packages/common/src/validators/quizz.ts` |
| Fixture covering types | `e2e/fixtures/all-types-quiz.json` |
| Result CSV (export only) | `packages/web/src/features/manager/utils/resultExport.ts` |
| Media metadata | `db/migrations/001` `media_assets` |
| Parent SDD | `docs/wave6-7-sdd.md` Teil B.3 |

---

**Document status:** READY FOR DESIGN REVIEW (Wave 7) · Implementation blocked until Wave 8 kickoff.
