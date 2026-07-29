# ADR 005 — Version and Tag Schema

**Status:** angenommen  
**Date:** 2026-07-29  
**Affected Parties:** Rust backend, Node.js frontend, Docker build, Release process  

---

## Context

Razzoozle is a monorepo hosting both Rust (`rust/` — engine, protocol, server crates) and Node.js (`packages/` — web, common, mcp packages) codebases. The project currently exhibits version mismatch:

- **Rust workspace:** All three crates (protocol, engine, server) are hardcoded to version `0.1.0` in their individual `Cargo.toml` files, unchanged since initial commit.
- **Node.js root:** `package.json` version is `3.0.0`, aligned with recent release history.
- **Git tags:** Both unprefixed (`0.1.0`, `1.0.0`, ..., `3.0.0`) and `v`-prefixed (`v1.1.0`, `v1.2.0`, `v2.0.0`, `v3.0.0`) tags exist, creating inconsistency.
- **Release process:** No automated version-bump tooling; CHANGELOG and version are edited manually. Docker image tags use only `:latest`.

This fragmentation obscures which version is "live" and complicates future CI/CD (e.g., automated Docker image tagging, release notes generation).

---

## Decision

**Razzoozle uses a unified semantic versioning schema:**

1. **Workspace Version as Single Source of Truth:**  
   The Rust workspace version in `rust/Cargo.toml` `[workspace.package]` section is the canonical version number. All member crates (protocol, engine, server) inherit this version via `version.workspace = true` declarations in their individual `Cargo.toml` files.

2. **Parity with Node.js:**  
   The root `package.json` version is manually kept in sync with the workspace version. They always match (e.g., both `3.0.0`).

3. **Git Tag Schema (v-prefixed only):**  
   All release tags follow the pattern `v<MAJOR>.<MINOR>.<PATCH>` (e.g., `v3.0.0`, `v3.0.1`, `v3.1.0`). Unprefixed tags are deprecated and must not be created going forward.

4. **Version Bump Procedure:**  
   Before each release:
   - Increment the version in `rust/Cargo.toml` `[workspace.package]` section.
   - Increment the version in root `package.json`.
   - Update `CHANGELOG.md` with release notes.
   - Create a signed tag `v<VERSION>` pointing to the merge commit of the release PR.
   - Optionally configure CI to validate tag schema (reject tags not matching `v[0-9]+\.[0-9]+\.[0-9]+`).

---

## Consequences

### Immediate (Migration)

- **One-time:** All Rust crates' versions must be updated from `0.1.0` to `3.0.0` to reflect the current state. Add `version.workspace = true` to each member's `Cargo.toml` and remove duplicate `version = "..."` declarations.
- **Cleanup:** No immediate action on existing tags (unprefixed tags remain in history), but CI/CD should reject any new unprefixed tags.

### Ongoing

- **Single version number to manage** per release, reducing human error.
- **Docker image builds** can extract version from `package.json` or build script to tag images as `razzoozle:v3.0.0`, `razzoozle:latest`, etc.
- **CHANGELOG and Git history** are the release records; tags are immutable markers.

### Release Process Simplification

Teams must only remember to update one version field (`package.json`); Rust's workspace inheritance handles the rest. This integrates naturally with existing release procedures (PR-based, manual changelog).

---

## Alternatives Considered

### A. Separate versions per layer (Rust 0.x, Node 3.x)

Each crate and package would version independently. Tags would disambiguate (`rust/v0.1.0`, `web/v3.0.0`).

**Rejected:** Razzoozle is a single application product, not a library ecosystem. Users care about "Razzoozle v3.0.0," not which component versions went into it. Separate versioning adds complexity without corresponding benefit and makes release notes ambiguous.

### B. Fully automated version bumping

Conventional commits (e.g., `fix:`, `feat:`, `BREAKING CHANGE:`) trigger automatic semver bumps via CI.

**Rejected:** The project currently manages releases manually via PRs, and the release cadence is not yet high enough to warrant automation investment. Teams can adopt this later without changing the schema; both approaches use a single workspace version.

### C. Keep unprefixed tags; add a `-prod` suffix for releases

Maintain both `3.0.0` (commit tag) and `3.0.0-prod` (release marker).

**Rejected:** Adds a layer of indirection and cognitive load. The simpler rule "all Git tags are `v`-prefixed" is easier to enforce and document.

---

## Rationale

- **Single source of truth reduces drift:** The workspace version is part of the Rust build system and is authoritative; Node inherits by convention.
- **Cargo workspace pattern is idiomatic:** Rust best practice for monorepos is to define a workspace version once and have members reference it.
- **Consistent with deployment practice:** Razzoozle ships as one Docker image per commit; one version per release reflects that.
- **Future-proof:** As Docker image tagging, release artifact naming, or API versioning evolve, they can all read from the same version source without additional mapping.

---

## Verification Checklist

- [ ] All Rust crate `Cargo.toml` files updated to use `version.workspace = true` (no duplicate version fields).
- [ ] Workspace version in `rust/Cargo.toml` matches root `package.json`.
- [ ] CHANGELOG.md reflects the decision and instructs future maintainers.
- [ ] Existing unprefixed tags remain (no destructive cleanup); CI configured to reject future unprefixed tags (optional).
- [ ] Next release uses the new schema (single version bump, `v`-prefixed tag).
