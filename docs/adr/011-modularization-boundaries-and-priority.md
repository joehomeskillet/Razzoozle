# ADR-011 — Modularization Boundaries and Priority

**Status:** Accepted · **Date:** 2026-07-29

---

## Context

Razzoozle's codebase contains 14 work packages pending modularization, but lack a consistent criterion for when and which files should be split. Current decisions rely on intuition rather than a reproducible principle, causing:

1. **Inconsistent splits:** `ConfigUsers.tsx` (2026-07-25, commit c00052715) was extracted into 6 files and lost API guarantees (layout canon, testid uniformity), causing regression #499.
2. **Risk uncertainty:** No agreed threshold for "large enough" to split or "coherent enough" to keep whole.
3. **Resource mismatch:** 14 pending work packages require prioritization by actual utility, not file size alone.

To enable safe modularization, we need:
- A **clear boundary rule** (based on responsibility, not just LOC)
- A **priority ranking** (based on change frequency + clarity + API stability risk)
- A **checklist of safeguards** (tests, API freeze, no behavior change)

---

## Decision

### 1. Modularization Boundary

A file is a candidate for splitting if **BOTH** conditions hold:

1. **Size threshold:** >600 lines of code (LOC is a trigger, not a decision rule).
2. **Responsibility condition:** The file contains two or more **cohesive, independently-viable subsystems** that could be tested, maintained, and deployed separately.

A "cohesive subsystem" is a group of functions/types with a single, clearly-bounded concern (e.g., "User CRUD operations" or "Student roster management") that:
- Has ≥1 independent public function or type alias
- Is not required to stay within the same file to preserve the public API
- Shares no internal state or mutable globals with other subsystems in the same file

**Corollary:** File size alone does not trigger a split. A 800-line file with one responsibility (e.g., a large state machine or evaluator) stays whole. A 500-line file with two independent subsystems may be split.

### 2. Prioritization by Utility

Candidates are ranked by **change frequency first**, then by **clarity** and **API risk**:

| Rank | Metric | Threshold | Rationale |
|------|--------|-----------|-----------|
| **Tier 1** (High utility) | Commits in past 6 mo. | >30 | Frequent changes = high pain from merge conflicts + regression risk. Splitting reduces churn. |
| | AND Lines of code | >700 | Large enough that refactors are visible; splits are justified. |
| | AND Responsibility clarity | Clear, non-overlapping boundaries | Low risk of breaking API contracts. |
| **Tier 2** (Medium) | Commits | 15–30 | Occasional changes; split has moderate benefit. |
| | AND Lines | >600 | Size justifies effort. |
| | AND Clarity | Some gray areas, but isolatable | Requires careful API review before split. |
| **Tier 3** (Low) | Commits | <15 | Stable file; split overhead outweighs benefit. |
| | OR Lines | <600 | Too small to split meaningfully. |

### 3. Candidate Files (Audited 2026-07-29)

| Rank | File | LOC | Commits | Subsystems | Decision |
|------|------|-----|---------|-----------|----------|
| 1 | `rust/server/src/db/classes.rs` | 1629 | 16 | Class CRUD ↔ Student roster (independent queries + lifecycle) | **ACCEPT for Tier 1 split.** Extract `students.rs`; keep re-export in `classes/mod.rs`. |
| 2 | `packages/web/src/features/game/components/states/Answers.tsx` | 996 | 61 | Render logic (ternary tower) ↔ Event handlers ↔ Store subscriptions | **ACCEPT for Tier 1 split.** Extract per-question-type render-variants; keep container in Answers.tsx. |
| 3 | `packages/common/src/types/game/socket.ts` | 774 | 77 | Student events ↔ Game events ↔ Manager events ↔ Config events (31 distinct types across 4 domains) | **DEFER to Tier 3** (risk: circular imports, no public API benefit). Stabilize via namespace `StudentEvents.*` / `GameEvents.*` within same file instead. |
| 4 | `rust/server/src/socket/reveal_helpers.rs` | 998 | 38 | Reveal logic (cohesive single responsibility) | **REJECT.** Despite high commit count, this is one integrated state machine. Splitting increases import chains without reducing complexity. |
| 5 | `rust/server/src/http/solo.rs` | 1229 | 19 | HTTP handlers for solo quiz mode (logically unified endpoint group) | **DEFER to Tier 2** (medium churn, single responsibility). Monitor for subsystem drift. |
| 6 | `rust/engine/src/eval.rs` | 1244 | 16 | Evaluation engine (core algorithm, not modulable without semantic loss) | **REJECT.** This is a single, complex algorithm. Splitting creates dependency chains that increase mental load. |

---

## Safeguards (Mandatory for All Splits)

Every split must follow this sequence **before committing to main**:

### Pre-Split (Characterization Tests)
1. Write characterizing tests for the **subsystem being extracted** (unit tests covering public API + edge cases).
2. Verify all tests pass with the **original, monolithic file**.
3. Document the public API contract in comments or a `mod.rs` module doc.

### Split (Surgical Extract)
4. Extract the subsystem into a new file.
5. Add a **re-export block** in the original file (or new `mod.rs`) that makes the public API **byte-identical** to the original.
6. Run full test suite (unit + integration + e2e where applicable).

### Post-Split (API Verification)
7. Grep codebase for all call sites of the extracted subsystem's public functions.
8. Verify each call site still works without modification.
9. Ensure **no behavior change** between monolithic and split versions (same output on identical input).

### Gate (Code Review)
10. **Cross-vendor code review:** Have at least one reviewer (preferably from a different lane/vendor) verify:
    - The extraction preserves the contract (no signature changes, re-exports correct).
    - No internal state leaks across the split boundary.
    - Integration tests still pass.
    - No unintended side effects (e.g., initialization order, module-level globals).

---

## Consequences

### Positive
- **Clarity:** Developers know which files are candidates for splitting and why.
- **Risk reduction:** Characterizing tests + API freeze make regressions detectable before main.
- **Prioritization:** 14 pending work packages can now be ordered by actual impact (change frequency + size).
- **Consistency:** Future splits follow the same playbook, avoiding ConfigUsers-style surprises.

### Negative
- **Process overhead:** Each split now requires 2–3 pre-split characterization passes (setup cost ~2–4 hours per file).
- **API burden:** Re-exports and `mod.rs` layers add a thin abstraction; developers must be disciplined about marking `pub` correctly.
- **Delayed wins:** Some low-hanging fruit (small, clear splits) are deferred because they don't meet the >30-commit threshold.

### Migration Headcount
- **Tier 1 splits** (2 files): 1 work package per split (~2 weeks total, including characterization + tests + review).
- **Tier 2 splits** (1 file, deferred): 1 work package, scheduled after Tier 1.
- **Tier 3 / REJECT** (3 files): Zero work; monitor for drift.

---

## Alternatives Considered

### 1. "Size threshold only" (400 or 600 lines)
Rejected: would have split `reveal_helpers.rs` (998 lines, single responsibility) and `eval.rs` (1244 lines, algorithm), both causing maintenance burden without benefit.

### 2. "Commit count threshold only" (>20 commits = split)
Rejected: would defer `db/classes.rs` (16 commits) which has the clearest split boundary, and would not account for false positives (e.g., many small fixes to a stable algorithm).

### 3. "Manual case-by-case review" (no rule)
Rejected: led to inconsistent ConfigUsers split (lost testid uniformity, layout canon) and 14 packages without clear prioritization.

### 4. "Refactor everything to ~300-line modules preemptively"
Rejected (YAGNI): Razzoozle is in active feature work; massive preemptive refactor would block shipping. Modularization is an **ongoing** discipline, not a one-time event.

---

## References

- **Incident:** `c00052715` (2026-07-25) ConfigUsers structural extraction → regression #499 (lost testid uniformity, layout canon).
- **WP Audit:** 14 pending modularization packages, ranked in candidate table above.
- **Logs:** `git log --oneline -n 500` for each candidate file (commit counts audited 2026-07-29).
- **Related ADRs:** None yet (this is ADR-011, inaugural).
