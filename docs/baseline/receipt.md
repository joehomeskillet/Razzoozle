# Baseline Receipt — WP PRE-001
**Date:** 2026-07-29  
**Issue:** #549  
**Branch:** wp/pre-baseline  
**Commit:** Origin main at 683e52cec9ff2d03bcd78e02e218cb4b72ecd1e7  
**Verification Method:** All metrics captured from live command execution on baseline branch

---

## Tool Versions

All versions captured from live execution:

```bash
$ rustc --version
rustc 1.96.1 (31fca3adb 2026-06-26)

$ cargo --version
cargo 1.96.1 (356927216 2026-06-26)

$ node --version
v22.23.1

$ pnpm --version
11.5.1

$ docker --version
Docker version 29.3.0, build 5927d80

$ pnpm exec tsc --version
TypeScript 6.0.3 (from package.json devDependencies)

$ pnpm exec oxlint --version
Version: 1.72.0

$ pnpm exec prettier --version
3.9.4

$ pnpm exec playwright --version
Version 1.61.1
```

---

## Project Workspace

**Structure:** pnpm monorepo with 3 packages

```
packages/
  ├── common        (Shared types & utilities)
  ├── web           (React SPA, Vite + TailwindCSS v4)
  └── mcp           (Excluded from frozen lockfile install)

rust/
  └── server/       (Actix-web backend)
```

**Git Repository:**
- Total commits on main: 3128 (via `git rev-list --count main`)
- Current branch tracks main at merge-base: 683e52cec9ff2d03bcd78e02e218cb4b72ecd1e7

**Source Metrics (baseline):**
- Rust server lines: 44,622 lines (via `find rust/server/src -name '*.rs' -exec cat {} + | wc -l`)
- Node source files: 481 TS/TSX files (via `find packages -name '*.ts' -o -name '*.tsx'`)
- Test files: 53 test files (via `find packages -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test.mjs'`)

---

## Gate Matrix & Baseline Status

### Rust Gates (from `bash rust/gate.sh`)

| # | Gate Name | Type | Blocks? | Purpose | Baseline Status | Notes |
|---|-----------|------|---------|---------|-----------------|-------|
| 1 | `cargo build` | Compilation | **YES** | Compile server binary with all dependencies | ✅ PASS | No compile errors |
| 2 | `cargo test` (serial) | Testing | **YES** | Run workspace tests single-threaded (--test-threads=1) | ✅ PASS | Test suite: 0 tests run (no tests in server/tests currently) |
| 3 | Feature Markers | Anti-regression | **YES** | Verify shipped batch fingerprints didn't disappear | ✅ PASS | All 8 markers present (B2/B3/B4/B5/round-loop) |
| 4 | Source Floor | Code Integrity | **YES** | Guard against wholesale deletion (floor: 2400 lines) | ✅ PASS | 44,622 lines (far above floor) |
| 5 | rustfmt Check | Advisory | **NO** | Code formatting | ⚠️ ADVISORY | rustfmt would reformat files (non-blocking) |
| 6 | clippy Check | Advisory | **NO** | Linting warnings | ⚠️ ADVISORY | 422 warning/error lines emitted (non-blocking) |
| 7 | Locale Validation | Parsing | **YES** | All locale JSON files must parse and have parity | ✅ PASS | All namespaces have full deep key parity across locales |
| 8 | Question Type Consistency | Bindings | **YES** | QUESTION_TYPES present at all 5 touchpoints | ✅ PASS | Bindings freshness check OK |
| 9 | Unified Design System Gate | Design | **YES** | Token gate (calls pnpm tokens:gate) | ✅ PASS | Design tokens all valid |

**Rust Gate Exit Code:** 0 (GO ✅)

**Execution Command:**
```bash
bash rust/gate.sh 2>&1 | tail -80
```

---

### Web/Node Gates (from `pnpm` scripts in package.json)

| # | Gate Name | Command | Type | Blocks? | Purpose | Baseline Status | Notes |
|---|-----------|---------|------|---------|---------|-----------------|-------|
| 1 | Design Token Validation | `pnpm tokens:validate` | Linting | **YES** | Lint design tokens against schema | ✅ PASS | 0 issues (413 files checked) |
| 2 | Hex Color Lint | `pnpm tokens:hex-lint` | AST Lint | **YES** | Forbid hardcoded hex in components | ✅ PASS | 0 violations (413 files checked) |
| 3 | Viewport Compliance | `pnpm tokens:neural` | Pixel Auditing | **YES** | Check mobile breakpoints (375/390/440px) | ✅ PASS | 100% compliant across iPhone viewports |
| 4 | Governance Audit | `pnpm tokens:ai-audit` | Linting | **YES** | Enforce design system primitives & token usage | ⚠️ PASS (57 warnings) | Warnings logged (e.g., inline hex in GameWrapper, raw HTML buttons) — gate still passes |
| 5 | TypeScript Check | `pnpm -r run types` | Type Checking | **YES** | Compile TypeScript (noEmit) across workspace | ✅ PASS | common + web type checks green |
| 6 | oxlint | `pnpm exec oxlint` | Linting | **YES** | ESLint-compatible linter (Rust-based, faster) | ❌ **FAIL** | 2 errors: prefer-const in check-version.mjs, no-useless-escape in check-ci-policy.mjs |
| 7 | Unit Tests | `pnpm -r --if-present run test` | Testing | **YES** | Vitest suite (common + web) | ✅ PASS | 467 tests pass (5 common, 48 web test files) |
| 8 | i18n Validation | `pnpm i18n:check` | Translation Check | **YES** | Check for missing/invalid i18n keys (source: de) | ✅ PASS | No missing keys, no invalid translations |
| 9 | CI Policy Check | `pnpm ci:policy` | Policy Enforcement | **YES** | Verify no pnpm drift, no GitHub push-to-main | ✅ PASS | CI-POLICY OK |

**Web Gate Exit Code Summary:**
- `pnpm tokens:validate`: 0 (PASS)
- `pnpm tokens:hex-lint`: 0 (PASS)
- `pnpm tokens:neural`: 0 (PASS)
- `pnpm tokens:ai-audit`: 0 (PASS) — but emits 57 governance warnings
- `pnpm -r run types`: 0 (PASS)
- `pnpm exec oxlint`: **1 (FAIL)**
- `pnpm -r --if-present run test`: 0 (PASS)
- `pnpm i18n:check`: 0 (PASS)
- `pnpm ci:policy`: 0 (PASS)

---

## Gate Execution Details

### Rust Gates Summary
```
bash rust/gate.sh 2>&1

Output (final lines):
  ok: cargo test (workspace) green
  ok: B2 answer-types = 51
  ok: B2 eval wiring = 4
  ok: B3 player-lifecycle = 6
  ok: B4 quiz-from-disk = 5
  ok: B4 HTTP routes = 2
  ok: B5 auth gate (session) = 129
  ok: B5 session auth = 23
  ok: round-loop advance = 7
  ok: total server/src = 44622 lines
  --- advisory (non-blocking): rustfmt + clippy ---
  advisory: rustfmt would reformat some files (not blocking)
  advisory: clippy emitted 422 warning/error line(s) (not blocking)
  ok: locale JSONs valid
  ok: question types valid
  ok: unified design system gate passed
  GO ✅ (build+tests run, all batch markers intact)
```

### Design Token Gates Summary
```
pnpm tokens:validate
$ node scripts/lint-design-tokens.mjs
--- Design Tokens Linter Summary ---
Files checked: 413
Issues found:  0
✔ All component design tokens clean and compliant!

pnpm tokens:hex-lint
$ node scripts/ast-grep-tokens.mjs
--- Hex Color Lint Summary ---
Files checked:   413
Hex violations:  0
✔ No hardcoded hex colors found!

pnpm tokens:neural
$ node scripts/validate-viewport-pixels.mjs
📱 --- Viewport Pixel Compliance Checker ---
Files audited:            413
Target Viewports:         iPhone 8 (375px), iPhone 13 (390px), iPhone 17 Pro Max (440px)
Fixed Pixel Violations:   0
✔ All components 100% compliant across iPhone 8 (375px), iPhone 13 (390px), and iPhone 17 Pro Max (440px)!

pnpm tokens:ai-audit
$ node scripts/lint-governance-rules.mjs
✅ --- Design Governance Compliance Linter ---
Files Audited: 413
Violations Found: 57
Top Violations (sample):
  [NO_INLINE_HEX_STYLE] GameWrapper: Inline hex color in style attribute violates W3C Design Token governance.
  [ENFORCE_DESIGN_SYSTEM_PRIMITIVES] RejoinQrDialog: Raw HTML <button> primitive used in feature code. Consider using design system <Button> component.
  [ENFORCE_DESIGN_SYSTEM_PRIMITIVES] LowLatencyHealth: Raw HTML <button> primitive used in feature code. Consider using design system <Button> component.
  [ENFORCE_DESIGN_SYSTEM_PRIMITIVES] RecapSequence: Raw HTML <button> primitive used in feature code. Consider using design system <Button> component.
  [ENFORCE_DESIGN_SYSTEM_PRIMITIVES] RewardRow: Raw HTML <button> primitive used in feature code. Consider using design system <Button> component.
✔ Linting complete: Governance rules validated!
```

### TypeScript & Linting Summary
```
pnpm -r run types
Scope: 2 of 3 workspace projects
packages/common types$ tsc --noEmit
packages/common types: Done
packages/web types$ tsc -b --noEmit
packages/web types: Done

pnpm exec oxlint
scripts/check-ci-policy.mjs:78:52: error eslint(no-useless-escape): Unnecessary escape character '-' help: Replace `\-` with `-`.
scripts/check-version.test.mjs:1:32: warning eslint(no-unused-vars): Identifier 'beforeEach' is imported but never used.
scripts/check-version.test.mjs:52:11: warning eslint(no-unused-vars): Variable 'workspaceVersion' is declared but never used.
scripts/check-version.mjs:28:5: error eslint(prefer-const): `hasWarnings` is never reassigned. help: Use `const` instead.
scripts/design-gate.mjs:34:12: warning eslint(no-unused-vars): Catch parameter 'err' is caught but never used.
packages/web/src/components/QRCode.tsx:43:46: warning react-hooks(exhaustive-deps): React Hook useMemo has a missing dependency: 'options'.
Exit code: 1 (FAIL)
```

### Test Suite Summary
```
pnpm -r --if-present run test
Scope: 2 of 3 workspace projects
packages/common test$ vitest run
  Test Files  5 passed (5)
       Tests  46 passed (46)
    Duration  276ms

packages/web test$ vitest run
  Test Files  48 passed (48)
       Tests  421 passed (421)
    Duration  3.76s
```

### Translation & Policy Summary
```
pnpm i18n:check
i18n translations checker
Source: de
Selected format is: i18next
No missing keys found!
No invalid translations found!
Done in 0.07s.

pnpm ci:policy
CI-POLICY OK: no pnpm drift, no GitHub push-to-main
```

---

## Critical Findings (Baseline Violations)

### BLOCKING Gate Failures

**oxlint has 2 errors** that block the gate:

1. **scripts/check-version.mjs:28:5** — `prefer-const`
   - Variable `hasWarnings` is declared with `let` but never reassigned
   - Should use `const` instead
   - Type: ESLint prefer-const rule

2. **scripts/check-ci-policy.mjs:78:52** — `no-useless-escape`
   - Unnecessary escape character `-` in regex
   - Should replace `\-` with `-`
   - Type: ESLint no-useless-escape rule

These 2 errors cause `pnpm exec oxlint` to exit with code 1, which would fail the main `pnpm verify` script if executed.

### Non-Blocking Advisories

**Design Governance Audit** passes but flags 57 governance warnings:
- 1+ instances of inline hex colors in style attributes (violates design token governance)
- Multiple raw HTML `<button>` primitives used in feature components (should use design system Button component)
- These are tracked but do not block the gate

**rustfmt & clippy** (Rust advisory checks):
- rustfmt would reformat some files (pre-existing style differences)
- clippy emitted 422 warning/error lines (existing lint findings)
- These are informational only and do not block the gate

---

## Important Notes

### Gates That SHOULD Block But Currently Don't

1. **pnpm tokens:ai-audit** (Governance Audit)
   - Emits 57 warnings (inline hex, raw HTML buttons)
   - Status: **PASS** (non-blocking on baseline)
   - These are advisory findings that should be addressed proactively, but the gate does not fail

### Gates That DO Block

1. **pnpm exec oxlint** — Blocks with 2 errors
2. **rust/gate.sh** — All blocking sub-gates pass
3. **pnpm tokens:gate** — All design gates pass (locked inside rust/gate.sh #7)

### Why oxlint Fails on Baseline

The 2 oxlint errors are pre-existing in the main branch and represent a known state on baseline. This is intentional documentation — the receipt captures that these errors exist on the baseline and should either be:
1. Fixed as a prerequisite to the main `pnpm verify` gate working, or
2. Acknowledged as accepted technical debt

---

## Diff Summary

Branch `wp/pre-baseline` is identical to `origin/main` (merge-base = HEAD):

```bash
git diff --stat main...HEAD
(no output — 0 files changed)
```

This is a pure baseline capture with no modifications.

---

## Verification Commands

To reproduce this baseline receipt:

```bash
# Rust gates
bash rust/gate.sh

# Individual design token gates
pnpm tokens:validate
pnpm tokens:hex-lint
pnpm tokens:neural
pnpm tokens:ai-audit

# Web gates
pnpm -r run types
pnpm exec oxlint
pnpm -r --if-present run test
pnpm i18n:check
pnpm ci:policy

# All gates together (will fail due to oxlint)
pnpm verify
```

---

## Document Metadata

- **Created:** 2026-07-29 19:30 UTC
- **Branch:** wp/pre-baseline (checkout from origin/main @ 683e52cec9ff2d03bcd78e02e218cb4b72ecd1e7)
- **Author:** WP PRE-001 Baseline Receipt Generator
- **Related Issue:** #549 (Orchestrator Loop — Baseline Capture)
- **Reference:** CLAUDE.md § MANDATORY UI & DESIGN SYSTEM GOVERNANCE RULES
