# Rust build & CI/CD baseline (Phase 0 analysis)

Date: 2026-07-09 · Scope: `rust/` Cargo workspace only · **read-only analysis, no behavior change**.
Purpose: establish a measured baseline before optimizing build feedback loops + CI duration.
Measured on the dev host (20 cores, 122 GiB RAM), rustc/cargo **1.96.1**.

> **Prereq for any cargo command in a fresh worktree:** the `config/` dir is gitignored, so
> a checkout has no `rust/config`. Create the symlink first:
> `[ -e rust/config ] || ln -sfn /nvmetank1/projects/Razzoozle/source/config rust/config`
> Run cargo from `rust/` (or `--manifest-path rust/Cargo.toml`).

---

## 1. Repo / workspace shape

- **Workspace** (`rust/Cargo.toml`, resolver = "2"), 3 member crates, `edition = "2021"`:
  - `razzoozle-protocol` — lib + one extra binary `export_types` (`[[bin]]`, ts-rs type export).
  - `razzoozle-engine` — lib only (depends on protocol).
  - `razzoozle-server` — the service binary `razzoozle-server` (depends on protocol + engine).
- **Binaries produced:** `razzoozle-server`, `export_types`.
- **Feature flags:** no crate defines a `[features]` table — nothing to matrix. Features are only
  enabled *on dependencies* (e.g. `socketioxide["state"]`, `sqlx["postgres","runtime-tokio-rustls","chrono"]`,
  `reqwest[..."rustls-tls"]`, `zip["deflate-flate2-zlib-rs"]`).
- **Cargo.lock:** committed (`rust/Cargo.lock`, git-tracked), **306** locked packages.
- **Profiles:** only `server` sets `[profile.release] opt-level = 3` (already the release default — a no-op).
  No `[profile.dev]` tuning anywhere.

## 2. Toolchain & tooling present

| Tool | Local dev host | Notes |
|------|----------------|-------|
| rustc / cargo | 1.96.1 | **not pinned** — no `rust-toolchain.toml` anywhere |
| mold | ✅ 2.40.4 | installed but **not wired** (no `.cargo/config.toml`) |
| sccache | ✅ 0.13.0 | installed but **not wired** (no `RUSTC_WRAPPER`) |
| clang | ❌ missing locally | present in the CI `rust-ci` toolchain image per spec |
| cargo-nextest | ❌ missing locally | present in the CI `rust-ci` toolchain image per spec |
| clippy | ❌ not installed on this toolchain | pipeline does not run clippy anyway |

There is **no `.cargo/config.toml`, no `rust-toolchain.toml`, no `deny.toml`**, and **no `ci-templates/`** folder.

## 3. Existing CI / build artifacts

- **`.gitea/workflows/ci.yml`** (Gitea Actions, 4 jobs): `lint-typecheck` → then `unit` (Node socket tests)
  and `rust` in parallel → `build` (docker images, main-push only).
  - The **`rust` job** runs `runs-on: ubuntu-latest` with `container: rust:1-bookworm` and executes
    `bash rust/gate.sh`. It seeds a synthetic 1-question `config/quizz` fixture (gitignored dir).
  - **No dependency/target caching.** The job never touches the runner's persistent `/ci-cache` volume,
    and does **not** use the `rust-ci` runner label (which per spec ships a toolchain image with
    mold + clang + clippy + rustfmt + cargo-nextest + sccache). Every run is a cold build + full crate
    download over the network.
- **`.gitea/workflows/deploy.yml`** — no-op marker; real CD is the host `razzoozle-cd.timer` (currently stopped).
- **`rust/gate.sh`** — the deterministic gate. Runs **two** separate cargo invocations —
  `cargo build -p razzoozle-server` **and** `cargo test --no-run` — plus grep-based anti-regression
  feature-marker counts and a total-source-line floor.
- **`rust/Dockerfile`** — single-stage-ish builder (`rust:1-bookworm`) → `cargo build --release -p razzoozle-server`
  → `debian:bookworm-slim` runtime. No cache mount (`--mount=type=cache`), no cargo-chef; each image build
  recompiles all deps from scratch.

## 4. Baseline measurements

### 4.1 Cold build — `cargo build --timings` (debug, workspace default members)

- **Wall clock: 27.2 s**, but only **~126 % average CPU** on a 20-core box.
- Sum of per-crate compile time: **232.9 s** across **304 build units** (i.e. parallelism ≈ 8.6×, and the
  low average CPU means the run is **serial/link-tail-bound**, not core-bound — the final `razzoozle-server`
  link and long dependency chains dominate the tail).
- **Top crates by self compile time:**

  | # | crate | self time |
  |---|-------|-----------|
  | 1 | `razzoozle-server` 0.1.0 (final codegen + link) | 6.82 s |
  | 2 | `ring` 0.17.14 (TLS crypto, C/asm) | 6.65 s |
  | 3 | `tokio` 1.52.3 | 3.68 s |
  | 4 | `razzoozle-protocol` 0.1.0 (ts-rs derive) | 3.64 s |
  | 5 | `sqlx-postgres` 0.7.4 | 2.96 s (**+ a 2nd copy 2.62 s**) |

  (next: `axum` 2.88 s, `h2` 2.80 s, `serde_core` 2.30 s, `hyper` 0.14 2.15 s, `proc-macro2` 2.14 s.)

### 4.2 Dev-loop timings (warm target)

| Command | Time | CPU | Note |
|---------|------|-----|------|
| `cargo check --workspace` | **18.8 s** | 48 % | first check after a build — **separate cache from build**, so it re-compiles all deps in *check* mode |
| `cargo build -p razzoozle-server` after `touch main.rs` | **1.27 s** | 91 % | incremental rebuild — already fast |
| `cargo check -p razzoozle-server` after `touch main.rs` | **0.42 s** | 100 % | incremental check — already fast |
| `cargo test -p razzoozle-server` | **15.1 s** | 41 % | ≈100 % compile: 44 tests **run in 0.02 s** — again a *separate* test-mode cache |

**Key structural cost:** each cargo *mode* (`build` rlib / `check` rmeta / `test` cfg(test)) keeps its **own**
fingerprint set in `target/`. Running build then check then test compiles the dependency graph up to three
times. `gate.sh` triggers two of these modes per run (`build` + `test --no-run`).

### 4.3 Duplicate dependency versions — `cargo tree --duplicates`

Genuinely multi-version crates (compiled more than once), root cause in **`reqwest 0.11`** pulling an entire
legacy async stack alongside the modern one from `axum 0.7` / `socketioxide 0.15`:

- `hyper` **0.14** + **1.10** · `http` **0.2** + **1.4** · `http-body` **0.4** + **1.0**
- `base64` **0.21** + **0.22** · `rustls` **0.21** (via reqwest/sqlx) · `syn` **1.0** + **2.0**
- `thiserror` **1.0** + **2.0** · `getrandom` 0.2 + 0.3 + 0.4 · `hashbrown` 0.14 + 0.17
- `socket2` 0.5 + 0.6 · `matchit` 0.7 + 0.8 · `sync_wrapper` 0.1 + 1.0

## 5. Detected problems

1. **CI does a full cold build every run.** No cargo registry / git / `target` cache; the persistent
   `/ci-cache` volume is unused. Biggest single CI cost — 300 crate downloads + full recompile each time.
2. **CI does not use the purpose-built `rust-ci` runner image.** The `rust` job pulls `rust:1-bookworm` and
   forgoes the mold/clang/sccache/nextest that image already ships.
3. **No linker/compiler-cache wiring.** mold and sccache are installed on the host but no `.cargo/config.toml`
   enables them → serial link tail stays slow and nothing is cached across the many agent worktrees.
4. **Per-mode cache duplication.** build vs check vs test each recompile the dep graph; `gate.sh` runs two
   modes; local dev flipping between `check` and `test` pays it repeatedly.
5. **Multi-worktree cold-build tax.** This repo's workflow spawns many fresh worktrees; each currently pays a
   full ~27 s cold build with zero shared compilation cache.
6. **No `[profile.dev]` tuning.** Debug builds emit full debuginfo (`debug=2`), inflating compile + link time
   and `target/` size.
7. **Toolchain not pinned** (no `rust-toolchain.toml`) → drift risk across worktrees and CI.
8. **Pre-existing: missing engine test fixture.** `rust/engine/src/state/tests.rs:9` does
   `include_str!("../../../../spikes/golden-frames/fixture-quiz.json")`, but `spikes/golden-frames/` does not
   exist in the repo. Because `include_str!` resolves at **compile time**, the engine's **test target fails to
   compile** on a clean checkout — so `cargo test`/`cargo test --no-run`/`clippy --all-targets` at the
   *workspace* level fail here. **Pre-existing, not introduced by this effort.** (The server crate has its own
   `rust/server/fixture-quiz.json`, which is present and compiles fine.) Baseline test timing was therefore
   taken on `-p razzoozle-server`.
9. **Duplicate dep stacks** (§4.3) add ~5–8 s of avoidable serial compile. Resolving them means bumping
   `reqwest 0.11 → 0.12` — a **dependency-version change, out of scope** for this build/CI-only mandate;
   flagged for a separate owner-approved PR.

## 6. Planned measures (proposed — awaiting approval)

All measures below are **build/CI config only, zero behavior change**; no dep-version changes, no `cargo clean`,
no `cargo update`.

### Phase 1 — local dev inner-loop (`.cargo/config.toml` + `[profile.dev]`)
- **mold linker** via `.cargo/config.toml` (`target.x86_64-unknown-linux-gnu.linker`/`rustflags` `-C link-arg=-fuse-ld=mold`).
  *Effect:* cuts the serial link tail of `razzoozle-server` and every incremental rebuild link step.
- **`[profile.dev] debug = "line-tables-only"`** (keeps panic/backtrace line info, drops full debuginfo).
  *Effect:* ~10–20 % off debug compile+link, smaller `target/`.
- **sccache as `RUSTC_WRAPPER`** pointing at a shared cache dir.
  *Effect:* the multi-worktree win — a fresh worktree's dep objects become cache hits, so only our 3 crates
  recompile (est. 27 s cold → single-digit seconds after first warm-up).

### Phase 2 — CI (`.gitea/workflows/ci.yml` + `rust/gate.sh` + `rust/Dockerfile`)
- **Cache on `/ci-cache`:** cargo registry (`~/.cargo/registry`, `~/.cargo/git`) + workspace `target/`.
  *Effect:* eliminates per-run crate downloads and recompiles of unchanged deps — the single biggest CI win;
  unchanged-dep runs should compile only the 3 workspace crates.
- **Move the `rust` job to `runs-on: rust-ci`** (drop the `rust:1-bookworm` container; use the toolchain image).
  *Effect:* no container pull; mold + sccache + nextest available natively.
- **Wire mold + sccache in CI** (same `.cargo/config.toml` + `RUSTC_WRAPPER`, sccache dir on `/ci-cache`).
- **Docker build cache:** add `--mount=type=cache` for cargo registry + target in `rust/Dockerfile`
  (or cargo-chef dependency layer) so image builds stop recompiling all deps.
- **Optionally unify `gate.sh`** to fewer cargo modes to avoid the build-then-test double compile.

### Phase 3 — reproducibility & polish (optional)
- **`rust-toolchain.toml`** pinning 1.96.x + components (clippy, rustfmt) for worktree/CI parity.
- **cargo-nextest** for the test run (faster, better output) once the runner provides it.
- **Add a clippy/fmt gate** to CI if desired (currently absent).
- **Surface the missing engine fixture** (problem #8) so `--workspace` test/clippy compiles — either restore
  `spikes/golden-frames/fixture-quiz.json` or gate the engine test behind a `cfg`/skip. *(Content decision —
  flag to owner; strictly a test-fixture issue, adjacent to but outside the build/CI-perf mandate.)*
- **Note only:** collapsing the duplicate dep stacks (§4.3 / problem #9) needs `reqwest 0.11 → 0.12`; propose
  as a separate dependency PR — **not** part of this effort.

## 7. Constraints honored throughout
Never `cargo clean`; never change dependency versions; touch `Cargo.lock` only if strictly required (then
justify); no `cargo update`; one conventional-commit per phase; never delete anything not created here;
do not touch `rust/server/src` (parallel effort owns it); behavior must not change. `CLAUDE.md` at repo root is
a symlink to `AGENTS.md` — later phases edit the real `AGENTS.md`.
