# ADR-003: Supported Toolchains

**Status:** angenommen  
**Date:** 2026-07-29  
**Context:** Razzoozle runs three runtime stacks: Rust server, Node.js web frontend, and pnpm workspace manager.
Each stack has multiple versions in circulation; without explicit pinning, worktrees and CI runners drift,
leading to "works on my machine" failures and flaky builds.

---

## Kontext

The project spans three toolchain layers:
- **Rust:** server binary (`razzoozle-server`) compiled from workspace (`rust/Cargo.toml`, 3 crates).
- **Node.js + npm ecosystem:** web frontend and tooling scripts executed across `pnpm` workspaces.
- **pnpm:** monorepo package manager for 4 workspace packages (`@razzoozle/{common,web,socket,engine}`).

Previously:
- Rust version was not pinned; `cargo build` used whatever `rustc` was installed on each dev machine or CI runner.
- Node version was implied by Docker base images but not declared in version control.
- pnpm version was pinned only in `package.json` `packageManager` field (corepack support), not enforced in CI.

**Problem:** Fresh worktrees and CI runs experience:
1. Compilation failures due to Rust version drift (MSRV changes, feature gate shifts between minor versions).
2. Subtle test failures when Node or pnpm versions differ (dependency resolver changes, npm registry quirks).
3. False negatives in gates (e.g., CI passes with v11.4.0, dev machine has v11.5.1, merge fails).

---

## Entscheidung

**Rust:** Pin to rustc **1.96.1** via `rust/rust-toolchain.toml`, enforced identically on all dev worktrees,
CI runners, and Docker image builds.  
**Node.js:** Pin to **25** (node:25-alpine in `rust/Dockerfile`), enforced in Docker builds and recommended via
bare-metal dev setup documentation.  
**pnpm:** Pin to **11.5.1** via `packageManager` field in `package.json` (corepack), with explicit install step
in `rust/Dockerfile` (`npm install -g pnpm@11.5.1`), and CI uses `corepack pnpm` to enforce the declared version.

---

## Konsequenzen

### Positive
- **Reproducibility:** every worktree builds identically; no "works on my machine" surprises.
- **Drift prevention:** CI gates now fail early if a dev machine drifts, forcing immediate fix.
- **Faster troubleshooting:** build failures are never "which toolchain version was this compiled with?"
- **Deterministic test results:** Node/pnpm dependency resolution is identical across all runs.

### Negative / Operational
- **Rust version bumps** require explicit edit to `rust/rust-toolchain.toml` (MSRV, security patches).
  Mitigation: watch Rust security advisories; bump on patch releases ~quarterly; coordinate with team.
- **Node upgrades** require Docker `FROM` node:XX-alpine edit + testing (major versions may break scripts).
  Mitigation: Node 25 is LTS; typically stable for 18–24 months. Upgrade only for security or breaking deps.
- **pnpm bumps** may reorder lock files; requires re-running `pnpm install` and committing `pnpm-lock.yaml`.
  Mitigation: pnpm is conservative on patch releases; document breaking changes per release.

### Enforcement Mechanisms
- **Rust:** `rust/rust-toolchain.toml` is checked at compile time; `rustc --version` verifies it.
- **Node:** Dockerfile hard-pins `node:25-alpine`; bare-metal dev uses `.nvmrc` (recommend adding).
- **pnpm:** `packageManager` + corepack auto-selects; CI workflow uses `corepack pnpm` (rejects wrong version).

All three are committed to version control and read by CI/CD and local builds without explicit per-developer action.

---

## Alternativen

### 1. No pinning (rejected)
- Each dev machine picks its own versions.
- **Problem:** Flaky gates, non-deterministic lock files, "works for me" friction.

### 2. Floating minor versions (e.g., "1.96.x", "25.x", "11.5.x", rejected)
- Reduces update churn but keeps patch-level drift.
- **Problem:** patch bugs can still cause test flakes or subtly different behavior.

### 3. Semver relaxation in lock files instead of toolchain lock
- Commit only ranges (e.g., `^1.96.0`) and rebuild on each run.
- **Problem:** CI becomes non-hermetic; same source can produce different binaries on different days.

### 4. Minimum version constraints only (rejected)
- CI pins; dev machines can run "any version ≥ X.Y.Z".
- **Problem:** developers still diverge, and the "minimum that works" shifts with every dep bump.
  Reintroduces "works on my machine" at smaller scale.

### 5. CI-only pinning (rejected)
- Rust/Node/pnpm pinned in CI; dev machines unmanaged.
- **Problem:** defeats the purpose; most bugs are caught locally first; divergence is invisible.

---

## Verifizierung

**Status quo (verified 2026-07-29):**

| Tool | Location | Value | Enforced By |
|------|----------|-------|-------------|
| Rust | `rust/rust-toolchain.toml` line 6 | `1.96.1` | rustc version check at compile time |
| Node | `rust/Dockerfile` line 7 | `node:25-alpine` | Docker image base layer |
| pnpm | `package.json` line 4 | `11.5.1` | corepack (Node native) + CI workflow |

All three are **implemented and active** as of the Phase 3 build-baseline work (2026-07-09).
