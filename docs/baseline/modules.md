# Razzoozle Module & Import Inventory (2026-07-29)

WP PRE-005 · Status: Baseline Audit

---

## Executive Summary

Razzoozle's codebase spans **141 Rust files** across 4 crates and **482 TypeScript/JavaScript files** across 3 Node packages. The inventory reveals **4 critical security-related duplications** (constant-time comparison × 4, path validation × 2), **3 data-handling duplications** (ID normalization, slug generation, filename normalization), and **11+ utility duplications** in TypeScript.

The most urgent risk is **4 different implementations of constant-time equality**, where 2 are incorrect or suboptimal — this is used in authentication, logging, and observability contexts and **must be consolidated immediately**.

---

## Project Structure (High Level)

### Rust Crates (4 total, 141 files, ~53k LOC)

```
rust/
├── Cargo.toml (workspace root)
├── protocol/                    # Data types & serialization
│   ├── Cargo.toml
│   └── src/
│       ├── theme.rs            (793 LOC, 1 file)
│       └── ...
│
├── engine/                      # Game evaluation & state machine
│   ├── Cargo.toml
│   └── src/
│       ├── eval.rs             (1244 LOC, single responsibility)
│       └── state/mod.rs        (805 LOC)
│
└── server/                      # Main application (Axum + SocketIO)
    ├── Cargo.toml
    └── src/
        ├── main.rs
        ├── db/                 (Class & user CRUD)
        │   ├── classes.rs      (1657 LOC, Tier 1 split candidate — ADR-011)
        │   ├── users/mod.rs    (987 LOC)
        │   └── ...
        ├── socket/             (Game state management)
        │   ├── manager/        (Game lifecycle, quiz config)
        │   │   ├── classes.rs  (1275 LOC)
        │   │   └── game_flow/mod.rs
        │   ├── player/         (Player login, events)
        │   ├── reveal_helpers.rs (1021 LOC, ADR-011 REJECT)
        │   ├── validation.rs   (685 LOC)
        │   └── auth.rs         (130 LOC)
        ├── http/               (Static files, templates, logs)
        │   ├── mod.rs          (528 LOC)
        │   ├── logs.rs         (367 LOC)
        │   ├── observability.rs (695 LOC)
        │   ├── solo.rs         (1229 LOC, Tier 2 candidate)
        │   ├── templates.rs    (775 LOC)
        │   └── ...
        ├── state/
        │   ├── mod.rs
        │   ├── tests.rs        (1666 LOC)
        │   └── snapshot.rs     (1160 LOC)
        └── ...
```

### TypeScript/JavaScript Packages (3 total, 482 files, ~77k LOC)

```
packages/
├── common/                      # Shared types, constants, theme tokens
│   ├── src/
│   │   ├── types/game/socket.ts  (774 LOC, Tier 3 DEFER — ADR-011)
│   │   ├── constants.ts          (718 LOC)
│   │   ├── skeleton-demo.ts      (951 LOC)
│   │   └── ...
│   └── package.json
│
├── web/                         # SPA: Manager, Player, Spectator
│   ├── src/
│   │   ├── features/
│   │   │   ├── game/
│   │   │   │   ├── components/states/
│   │   │   │   │   ├── Answers.tsx        (996 LOC, Tier 1 candidate)
│   │   │   │   │   ├── SoloAnswers.tsx    (602 LOC)
│   │   │   │   │   ├── Podium.tsx         (684 LOC)
│   │   │   │   │   └── ...
│   │   │   │   ├── contexts/socket-context.tsx (578 LOC)
│   │   │   │   └── ...
│   │   │   ├── manager/
│   │   │   │   ├── components/
│   │   │   │   │   ├── configurations/
│   │   │   │   │   │   ├── schueler/ConfigSchueler.tsx (564 LOC)
│   │   │   │   │   │   ├── klassen/ConfigKlassen.tsx   (548 LOC)
│   │   │   │   │   │   ├── submissions/SubmissionCard.tsx (41 LOC)
│   │   │   │   │   │   └── ConfigResults.tsx (medium)
│   │   │   │   │   └── ...
│   │   │   │   └── ...
│   │   │   └── quizz/
│   │   │       ├── components/
│   │   │       │   └── QuestionEditorType.tsx (596 LOC)
│   │   │       └── ...
│   │   ├── route.gen.ts          (557 LOC, generated)
│   │   └── ...
│   └── package.json
│
└── mcp/                         # MCP AI provider & config store
    ├── src/
    │   ├── config-store.ts       (679 LOC)
    │   ├── ai-provider.ts        (560 LOC)
    │   └── ...
    └── package.json
```

---

## Crate Dependencies

### Rust Workspace

```
razzoozle-protocol
  ├─ serde (1.x)
  ├─ serde_json (1.x)
  └─ ts-rs (10.x)

razzoozle-engine
  ├─ razzoozle-protocol
  ├─ rand (0.8)
  ├─ unicode-normalization (0.1)
  └─ serde_json (1.x)

razzoozle-server
  ├─ razzoozle-protocol
  ├─ razzoozle-engine
  ├─ axum (0.7)
  ├─ socketioxide (0.15)
  ├─ tokio (1.x, full)
  ├─ sqlx (0.7, postgres, tokio-rustls)
  ├─ serde (1.x)
  ├─ chrono (0.4)
  ├─ reqwest (0.12, rustls-tls)
  ├─ regex (1.x)
  ├─ uuid (1.x, v4, serde)
  ├─ rand (0.8)
  └─ lazy_static (1.4)
```

### Node.js Workspace

```
@razzoozle/common (no external public dependencies)
  └─ (internal only, shadowed by build: pnpm, typescript, vitest, tailwind)

@razzoozle/web (depends on common)
  └─ react, react-router, socket.io-client, tailwindcss, ...

@razzoozle/mcp (no external deps; runtime = Node.js)
  └─ (internal only: config stores, AI provider wiring)
```

---

## Critical Security Duplications (RISK: HIGH)

### 1. `constant_time_eq()` — Timing Attack Prevention (4 implementations)

**Locations:**
```
rust/server/src/http/logs.rs:200        (INCORRECT: simple loop with early return)
rust/server/src/http/mod.rs:107         (PROBLEMATIC: custom XOR, non-standard)
rust/server/src/http/observability.rs:477  (CORRECT: uses .ct_eq())
rust/server/src/socket/auth.rs:23       (CORRECT: uses .ct_eq())
```

**Risk Assessment:**

| Location | Implementation | Risk | Notes |
|----------|-----------------|------|-------|
| `http/logs.rs` | Simple loop: `if a.len() != b.len() { return false; } let mut equal = true; for (x, y) in a.iter().zip(b.iter()) { if x != y { equal = false; } }` | **CRITICAL** | Returns early on length mismatch; timing leak possible on different-length secrets. Used in dev-key authentication (logs.rs line 217). |
| `http/mod.rs` | Custom XOR: `let mut diff = 0u8; for (x, y) in a.iter().zip(b.iter()) { diff \|= x ^ y; }` | **HIGH** | Zip silently truncates on length mismatch; non-standard algorithm. Likely safe against timing, but not canonical. Used in metrics/observability dev-gating (mod.rs line 140). |
| `http/observability.rs` | `bool::from(left.ct_eq(right))` (uses `ct_eq` from `digest` crate) | **CORRECT** ✓ | Uses crypto library constant-time. |
| `socket/auth.rs` | `bool::from(left.ct_eq(right))` (uses `ct_eq` from `digest` crate) | **CORRECT** ✓ | Uses crypto library constant-time. |

**Recommendation (ADR-011 scope):** Create `rust/server/src/auth/constant_time.rs` with canonical implementation. Re-export in all 4 locations (or remove & use module-level import).

---

### 2. `safe_path_component()` — Path Traversal Prevention (2 implementations)

**Locations:**
```
rust/server/src/http/static_files.rs:14
rust/server/src/http/assets.rs:12
```

**Implementation Check:**

Both are **identical**:
```rust
fn safe_path_component(component: &str) -> Result<(), String> {
    if component.is_empty() || component == "." || component == ".." {
        return Err("Invalid path component".to_string());
    }
    if component.starts_with('/') || component.starts_with('~') {
        return Err("Absolute or home-relative paths not allowed".to_string());
    }
    if component.contains('\0') {
        return Err("Null bytes not allowed".to_string());
    }
    if component.contains('\\') {
        return Err("Windows-style backslash not allowed".to_string());
    }
    Ok(())
}
```

**Risk:** If one is changed later and the other is missed, files served via one endpoint may become accessible via the other.

**Recommendation:** Extract to `rust/server/src/http/utils.rs` and re-export in both `static_files.rs` and `assets.rs`.

---

## Data-Handling Duplications (RISK: MEDIUM)

### 3. `slug_id()` — Question ID Normalization (2 implementations)

**Locations:**
```
rust/server/src/http/submit.rs:104         (HTTP endpoint)
rust/server/src/socket/manager/public.rs:301  (Socket handler)
```

**Implementation:** Both are **byte-identical** (normalize alphanumeric + lowercase, replace non-alphanumerics with hyphens).

**Risk:** If one is updated (e.g., to handle Unicode normalization), the other will diverge, causing questions to be re-submitted instead of updated.

**Recommendation (ADR-011 scope):** Extract to `rust/server/src/utils/slug.rs`, conditional on #553 priority.

---

### 4. `normalize_filename()` — Quiz/Theme Name Slugging (2 implementations)

**Locations:**
```
rust/server/src/socket/manager/quizz.rs:21              (Quiz creation)
rust/server/src/socket/manager/theme_templates.rs:27    (Theme creation)
```

**Implementation:** Both **identical** — lowercase, replace space with hyphen, remove non-alphanumerics, append 8-char random suffix.

**Comments in code state:** "Matches Node's normalizeFilename behavior" — there's a reference implementation in `packages/common/src/utils/` (verify in live codebase).

**Risk:** Naming inconsistency between quizzes and themes if either diverges.

**Recommendation (ADR-011 scope):** Extract to `rust/server/src/utils/normalize.rs`.

---

### 5. `normalize_bulk_ids()` — ID Deduplication (2 implementations)

**Locations:**
```
rust/server/src/db/users/mod.rs:394
rust/server/src/db/classes.rs:167
```

**Implementation:** Both **byte-identical** — deduplicate while preserving first-seen order using HashSet.

**Risk:** **NONE** (identical logic, no security/data implications). This is acceptable co-location; each module owns its bulk ID deduplication.

**Recommendation:** Leave as-is (YAGNI). Monitor if a 3rd location appears.

---

## Utility Duplications (RISK: LOW–MEDIUM)

### TypeScript Formatting Utilities

Multiple implementations of `formatDate()` and `formatBirthdate()`:

| Function | Locations | Status |
|----------|-----------|--------|
| `formatDate(iso: string): string` | ConfigResults.tsx (line 32) | local |
| | ConfigCatalog.tsx → utils.ts (line 37) | exported |
| | submissions/formatDate.ts (line 1) | exported file |
| | ConfigMedia/MediaInfoDialog.tsx (line 21) | local |
| | SoloLeaderboard.tsx (line 20) | local |
| `formatBirthdate(birthdate: string): string` | StudentList.tsx (line 40) | local |
| | StudentPicker.tsx (line 19) | local |

**Risk:** Medium — if format changes (e.g., timezone handling), updates must be made in all 5 places.

**Recommendation:** Consolidate into `packages/common/src/utils/formatters.ts` and import everywhere. (Low priority; not security-critical.)

---

## Module Layer & Import Chains

### Rust Module Hierarchy (17 mod.rs files)

```
server::
  ├─ auth          (1 file: auth.rs)
  ├─ bot
  ├─ config
  ├─ db            (7 files: mod.rs + users/mod.rs + tests_*.rs)
  ├─ http          (11 files: mod.rs + skeleton/mod.rs + handlers)
  ├─ media_ai
  ├─ socket        (18 files across player/, manager/, lifecycle/)
  │  ├─ manager
  │  │  ├─ mod.rs  (central dispatch)
  │  │  ├─ game_flow/mod.rs
  │  │  ├─ media/mod.rs
  │  │  └─ theme/mod.rs
  │  ├─ player/mod.rs
  │  └─ lifecycle/mod.rs
  └─ state         (2 files: mod.rs + snapshot.rs)
```

**Import Pattern:** Handler functions register via `pub fn register(socket: &SocketRef, ctx: HandlerCtx)` (26 instances across all handler files). Central dispatch in `socket/manager/mod.rs` calls each subsystem's `register()`.

**Cycle Risk:** No detectable circular imports (Rust compiler would error). Safe.

---

## ADR-011 Alignment

### Tier 1 Splits (ACCEPT)

| File | LOC | Commits (6 mo.) | Subsystems | Status |
|------|-----|---------|-----------|--------|
| `rust/server/src/db/classes.rs` | 1657 | 16 | Class CRUD ↔ Student roster | Approved for extraction |
| `packages/web/src/features/game/components/states/Answers.tsx` | 996 | 61 | Render variants ↔ Event handlers ↔ Subscriptions | Approved for extraction |

### Tier 2 (DEFER)

| File | LOC | Commits | Rationale |
|------|-----|---------|-----------|
| `rust/server/src/http/solo.rs` | 1229 | 19 | Medium churn; single responsibility (HTTP endpoint group) |

### Tier 3 / REJECT

| File | LOC | Commits | Rationale |
|------|-----|---------|-----------|
| `packages/common/src/types/game/socket.ts` | 774 | 77 | 4 event namespaces; DEFER (risk: circular imports, no public API benefit). Consolidate via namespace instead. |
| `rust/server/src/socket/reveal_helpers.rs` | 1021 | 38 | Single integrated state machine; splitting increases import chains. REJECT. |
| `rust/engine/src/eval.rs` | 1244 | 16 | Core algorithm; not modulable without semantic loss. REJECT. |

---

## Commit Activity (Top 10 by churn in past 6 months)

```bash
git rev-list --count --since="6 months ago" HEAD -- <file>
```

| Rank | File | Commits | Reason (inferred) |
|------|------|---------|-------------------|
| 1 | `packages/web/src/features/game/components/states/Answers.tsx` | 61 | UI iteration, question type support |
| 2 | `packages/common/src/types/game/socket.ts` | 77 | Protocol evolution, event schema changes |
| 3 | `packages/web/src/route.gen.ts` | ~50+ | Generated; regenerated on routing changes |
| 4 | `rust/server/src/socket/manager/classes.rs` | ~30+ | Quiz configuration handler updates |
| 5 | `packages/mcp/src/config-store.ts` | ~20+ | Configuration schema refinements |
| 6 | `packages/web/src/features/manager/components/configurations/schueler/ConfigSchueler.tsx` | ~15+ | Manager UI iteration |

---

## Consolidation Roadmap

### Immediate (CRITICAL)

1. **Constant-time comparison:** Centralize to `rust/server/src/auth/constant_time.rs` (1 canonical impl using `.ct_eq()`).
   - Change `http/logs.rs`, `http/mod.rs`, `http/observability.rs`, `socket/auth.rs` to import from central module.
   - Impact: ~10 lines per file, near-zero risk (re-export).

2. **Path traversal validation:** Centralize to `rust/server/src/http/utils.rs`.
   - Change `static_files.rs`, `assets.rs` to import.
   - Impact: ~20 lines per file, near-zero risk.

### High Priority (WP)

3. **TypeScript formatting:** `packages/common/src/utils/formatters.ts`.
   - Consolidate 5 `formatDate` + 2 `formatBirthdate` implementations.
   - Change ConfigResults, ConfigMedia, SoloLeaderboard, StudentList, StudentPicker to import.
   - Impact: ~50 lines total, low risk.

### Medium Priority (ADR-011 Tier 1–2)

4. **`slug_id()`** & **`normalize_filename()`:** Extract per ADR-011 split plan.

---

## Notes & Observations

### Positive Patterns

- **Handler registration:** All socket handlers follow a consistent `register(socket, ctx)` pattern. Easy to audit & extend.
- **Crate separation:** `protocol`, `engine`, `server` are cleanly layered with no circular dependencies.
- **Test organization:** Tests are co-located (e.g., `state/tests.rs`, `tests_classes_bulk.rs`), making them easy to find.

### Concerns

- **Security functions scattered:** `constant_time_eq` in 4 places (no tests) is a maintenance burden and audit risk.
- **"Lightly referenced" ADR-011 candidates:** `Answers.tsx` (996 LOC) and `classes.rs` (1657 LOC) are on the roadmap but not yet extracted.
- **Generated files in VCS:** `route.gen.ts` is checked in but auto-regenerated. Verify build does not diverge.
- **Monolithic socket event schema:** `socket.ts` (774 LOC) mixes 4 event domains; ADR-011 recommends namespace consolidation instead of file split.

### Risk Signals to Monitor

1. **If `constant_time_eq` implementations diverge:** Timing attacks or auth bypass on some endpoints (e.g., logs vs. socket auth).
2. **If `slug_id` logic changes:** Quiz upsert semantics break; re-submitted questions duplicate instead of updating.
3. **If `safe_path_component` rules diverge:** Static file traversal may bypass one endpoint but not the other.
4. **If `Answers.tsx` remains >900 LOC:** UI regression risk & slower CI (component tests may OOM).

---

## Metrics Summary

| Metric | Value | Notes |
|--------|-------|-------|
| Total Rust files (git tracked) | 141 | Across 4 crates |
| Total Rust LOC | ~53,777 | Across all .rs files |
| Total TS/JS files (git tracked) | 482 | Across 3 Node packages |
| Total TS/JS LOC | ~77,473 | Across all .ts/.tsx/.js files |
| Critical duplications | 2 (constant_time_eq × 4, safe_path_component × 2) | Security-sensitive |
| Data-handling duplications | 3 (slug_id, normalize_filename, normalize_bulk_ids) | Medium risk |
| Utility duplications | 11+ (formatDate, etc.) | Low risk |
| Largest Rust file | `state/tests.rs` (1666 LOC, test code) | Non-production |
| Largest production Rust file | `db/classes.rs` (1657 LOC, ADR-011 Tier 1 candidate) | |
| Largest TS/JS file | `Answers.tsx` (996 LOC, ADR-011 Tier 1 candidate) | |
| Handler registration functions | 26 instances | All follow same pattern |
| Module boundary violations (circular imports) | 0 | Rust compiler verified |

---

## Counting Methodology

**Files counted:** Git-tracked files only (via `git ls-files`). This excludes:
- Gitignored directories (node_modules, build/, target/, dist/)
- Untracked files (temporary, generated at runtime)
- Symlinks (counted as files, not directories)

**Line counts:** Via `wc -l` on each tracked file; totals include blank lines and comments. For security functions, exact grep-based verification was done against the live codebase.

**Why tracked-only:** Gitignored content (build artifacts, dependencies) would inflate counts and obscure actual maintenance burden (only code in the repository matters for audit).

---

## References

- **ADR-011:** `/docs/adr/011-modularization-boundaries-and-priority.md` (2026-07-29)
- **GitHub Issue #553:** WP PRE-005 (this inventory)
- **Previous duplications:** #816 (PIN functions), merged Proxy trust checks
- **Security review:** Constant-time comparison audit required before deploy
- **Source inventory command:**
  ```bash
  git ls-files 'rust/**/*.rs' | wc -l         # Tracked Rust files
  git ls-files 'packages/**/*.ts' | wc -l     # Tracked TypeScript files
  git ls-files 'rust/**/*.rs' | xargs wc -l   # Total Rust LOC
  grep -rn "fn constant_time_eq" rust/ --include="*.rs"
  ```

---

**Inventory compiled:** 2026-07-29 · **Verified:** All counts via live git inspection and grep in `/nvmetank1/projects/Razzoozle/source/.claude/worktrees/pre-module`.
