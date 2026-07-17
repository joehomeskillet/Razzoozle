# 19 — Modularization Implementation Report + Final Review

**Date:** 2026-07-17 · **Result:** ACCEPTED · **Live:** rust.razzoozle.xyz (deployed + browser-verified)
**Range:** SDD baseline `eda1d962f` → `d8ac01e59` (46 commits) · origin + github mirror synced.

## What shipped (5 waves, each gated + deployed)

### Wave 1 — Primitive suite (new)
`Checkbox`, `Radio`+`RadioGroup`, `Select` (native), `DateInput`, `NumberInput` — all `forwardRef`, native-prop-extending, D7 focus, token-bound, 44px. `Input.tsx` focus fixed border-only → D7 outline.

### Wave 2 — Button migration + status
16 files: raw `<button>` → `Button` primitive (ghost/icon, secondary, primary, danger). **2 correct skips:** `SelectableRow` (role=radio widget), `AnimatedBackgroundControls` (role=switch). New `StatusBadge` (`--status-*` AA tokens); `BackendPanel` status migrated; `DisplayStatusCard` evaluated → kept (compact popover badge + card-state, not a pill). 3 focus-drift sites fixed (ConfigKlassen, CreateStudentDialog inputs; ConfigUsers select).

### Wave 3 — Form-control migration
16 files: 6 `<select>`→Select, 5 checkbox→Checkbox, 4 radio→Radio/RadioGroup, 3 date→DateInput, 3 number→NumberInput. Border token unified to `--border-hairline` across all 5 form primitives.

### Wave 4 — Component adoption (mostly already satisfied by #86)
`ConfigSchueler` page header → `PageHeader`. **Correct skips:** CatalogQuestionForm pill (multi-select assignment ≠ single-active FilterPill), radius normalization (YAGNI — `rounded-md/xl` not a flagged finding; blanket change = visual-regression risk). FilterPill (5 adopters), ListRow, Badge, EmptyState already widely adopted.

### Wave 5 — Hook consolidation → **evaluated, not extracted (documented decision)**
The audit's proposed monolithic `useCrudManager<T>` was **rejected** per the brief's own anti-over-abstraction rule: the 5 REST-CRUD managers (Label/Class/Quizz/Catalog/Schueler, ~114 LOC each) diverge heavily in domain logic (validation, error-code maps, entity shapes, optimistic details) — a generic hook would need ~8-10 config props ("mehr Konfigurations-Props als gemeinsame Logik"), a God-abstraction harder to understand than the per-domain hooks. `useOptimisticConfigToggle` is already a clean shared hook (socket-config, 12 uses). A small `useDeleteConfirmation<T>` micro-extraction is possible but marginal-value + would risk verified-working delete flows — **deferred** (optional follow-up).

## Quantified before/after
| Metric | Result |
|---|---|
| New reusable primitives | **6** (Checkbox, Radio+RadioGroup, Select, DateInput, NumberInput, StatusBadge) |
| Raw `<button>` migrated | 16 files (2 legit non-primitive widgets kept) |
| Raw form controls migrated | 6 select + 5 checkbox + 4 radio + 3 date + 3 number |
| Raw button/select/checkbox/radio **remaining** in manager | **0** (excl. 4 semantic widgets) |
| Manager files touched | 27 |
| Focus formula unified to D7 | Input primitive + 3 drift sites |
| Status → semantic `--status-*` tokens | BackendPanel (StatusBadge) |
| Page-header adoption | +1 (ConfigSchueler) |
| God-abstractions created | **0** (Wave-5 monolith correctly avoided) |
| Net LOC | negative (migrations drop local class-strings) |

## Verification
- `pnpm verify` green at every wave (171 tests: 150 web + 21 common); `check-manager-tokens.sh` 0 findings.
- **Codex** arch/dup audit + **Grok** element-matrix + 3 wave-reviews (behavior preservation CONFIRMED each wave; all findings addressed).
- **Browser-qa PASS** on the live twin (Waves 2+3): nav/drawer, migrated icon buttons (Media/Users/Classes), Select changes value, Checkbox toggles, Radio saves, Date/Number inputs, StatusBadge pills, focus rings — **0 console errors** (2 pre-existing unrelated 404s noted).
- No `backdrop-filter`/glass; no raw hex introduced; design guardrails hold.

## Accepted-open (documented, non-blocking)
1. **Wave-5 `useCrudManager` not extracted** — God-abstraction per brief; `useDeleteConfirmation<T>` micro-extraction deferred (marginal).
2. `--border-hairline` vs `--line` duality (46 sites) — pre-existing, out of scope; form primitives unified to `--border-hairline`.
3. Radius normalization (`rounded-md/xl`, 12 files) — YAGNI-skipped.
4. Dev-page 404s (`/api/openapi.json`, `/theme/skeleton.js`) — pre-existing, unrelated.

## Verdict
**ACCEPTED.** The manager form/control layer is fully migrated onto shared, token-bound, a11y-correct primitives; no local button/input/select rebuilds remain; behavior empirically preserved (browser-qa). The one non-extraction (Wave-5 monolith) is a deliberate, brief-compliant decision, not an omission.
