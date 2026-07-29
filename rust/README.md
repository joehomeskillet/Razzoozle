# 🦀 Razzoozle in Rust

A production-ready Rust rewrite of the Razzoozle game server — an `axum` +
`socketioxide` server that speaks the **exact same socket.io wire protocol**
as the Node.js server (`packages/socket`), so the React frontend and
every connected phone work unchanged against either backend.

**Deployment:** The Rust server runs in parallel to the Node server as an
**opt-in alternative backend**. In production, it listens on `:3012` (via
`docker run ... --restart unless-stopped`); the frontend reaches it through
Caddy's `/_rust/*` proxy routes. The Node server remains the default path
(`:3011` via `docker compose`); Rust is feature-complete and passes a real-game
CI gate but is not yet the default production backend. This allows safe
experimentation and gradual migration.

**Why Rust:** The endgame is shipping the desktop host as a **~10 MB Tauri app**
(Rust server as a sidecar) instead of a ~150 MB Electron bundle that ships a full
Node runtime. Along the way, the game's state machine (Lobby → Round → Reveal →
Scoreboard) becomes compile-time-checked, and a single static binary makes both
the hosted and desktop cases cheaper (RAM, cold start).

> Plugin-runtime decision (Node-sidecar):
> [`../docs/adr/rust-port-plugin-runtime.md`](../docs/adr/rust-port-plugin-runtime.md)

---

## Status — 2026-07-29

| Phase | What | State |
|---|---|---|
| **0 — Spike & Gate** | socketioxide talks socket.io to the real client; golden-frame baseline recorded; plugin-runtime decision (Node-sidecar) | ✅ **PASS** — no protocol blockers |
| **1 — Protocol & types** | Every socket event/payload as a Rust type, `ts-rs` generates the TS bindings (Rust leads, one source of truth) | ✅ **9 modules, ~200 types, 50+ tests** |
| **1b — Engine logic** | Sentence-builder chunk generation + shuffle guard, ported 1:1 from TS | ✅ **19 tests** |
| **2 — Server MVP → feature-complete** | Full scored multi-question game, all question types, player lifecycle + reconnect, manager auth, quiz-from-disk, HTTP + solo endpoints, game-control (skip/reveal/adjust-timer), snapshot/restore persistence, bots, display/kiosk, satellite-auth (env SATELLITE_TOKEN), AI/media | ✅ **deployed :3012, feature-complete** |
| **2.x — Real-game CI gate** | Every deploy plays a **100-player game to FINISHED + reconnect** against the running container before it's considered good | ✅ **CI gate live** |
| **v2.0 — Hardening (in progress)** | Adversarial multi-model bughunt (19 confirmed findings) → resource caps + game eviction, per-IP rate-limits, path-traversal allowlist, Unicode-correct text matching, **server-minted host-token auth** closing a cross-game-control (IDOR) hole. Applied to both Node and Rust twins. `ts-rs` now also exports host-token/status types | 🚧 in progress |
| **Next** | Modularization + actor-per-game refactor; shadow cutover planning | ⏳ later |

The Rust server **plays a real, scored, multi-question game**. Verified end-to-end
against the real `socket.io-client` 4.8.3, and re-verified on every deploy by a
100-player CI gate:

```
create → join → login → startGame
  Q1: SHOW_QUESTION → SELECT_ANSWER → answer → reveal SHOW_RESULT → SHOW_LEADERBOARD (scored)
  Q2: … → SHOW_LEADERBOARD → FINISHED            ✅ full game, 100 players + reconnect
```

---

## Crates (Cargo workspace)

| Crate | Purpose |
|---|---|
| [`protocol/`](protocol) | `razzoozle-protocol` — **wire types for every socket event + payload**, `serde` (camelCase) + `ts-rs`. **Rust is the source of truth**; `cargo test` in this crate regenerates the TypeScript bindings in `packages/common/src/types/`. Exports ~200 types across 9 modules: `game`, `status`, `player`, `results_display`, `quizz`, `manager`, `theme`, `media_ai`, `constants`. |
| [`engine/`](engine) | `razzoozle-engine` — **pure, IO-free game logic**. Sentence-builder chunk generation + Fisher-Yates shuffle with anti-identity guard. Scoring, achievement awards, round recap logic. No network, no database — this crate is deterministic and fully tested. Exports state types and evaluation functions used by the server. |
| [`server/`](server) | `razzoozle-server` — **the running game container**. `axum` HTTP routes + `socketioxide` socket.io namespace. In-memory game registry (games are ephemeral; only scorecards persist to Postgres). Implements the lobby → question → reveal → leaderboard loop. Manager auth (host-token based). Rate-limits + resource caps. Snapshot/restore persistence. Bots. Admin endpoints (quiz catalog, themes, display/kiosk links, media transcoding). |

Spikes that proved the approach live under [`../spikes/`](../spikes):
`socketioxide-lobby` (protocol compat), `ts-rs-events` (type-gen), `golden-frames`
(byte-level Node baseline the Rust server is diffed against; also runs the
100-player real-game CI gate).

---

## Build & Test

Run these commands from the `rust/` directory.

### Build

```bash
cd rust
cargo build                    # whole workspace (debug mode)
cargo build --release         # optimized binary (used in Docker)
```

The binary and all dependencies are placed under `target/debug/` or
`target/release/`. Compilation time: ~2-3 minutes (cold) on a modern machine;
much faster on subsequent builds thanks to BuildKit cache mounts in the Dockerfile.

### Test

```bash
cd rust
cargo test --lib --bin        # all unit + integration tests (library crates + binaries)
cargo test --workspace        # synonym
```

**Important:** Several test modules hold global state in `lazy_static` registries
(Rate-Limiter windows, LRU eviction, Invite-Code index) and flake when run in
parallel. The test suite auto-runs single-threaded (`--test-threads=1`) to
ensure deterministic results. Total runtime: ~5–10 seconds. If you see flakes in
any of these tests individually, they pass when rerun:
- `test_lru_eviction_order`
- `test_within_rate`
- `test_load_snapshot_restores_games_by_invite_code`

These are isolated module-state bugs, not code bugs. See `rust/gate.sh` (lines
31–37) for context.

### Run locally

```bash
cd rust
PORT=3020 RUST_LOG=info cargo run --bin razzoozle-server
# → GET http://127.0.0.1:3020/health ⇒ 200 OK
```

The server embeds a fixture quiz at compile time via `include_str!`, so it works
from any working directory. The default `PORT=3020` can be overridden via the
`PORT` environment variable (used in production: `PORT=3012` when deployed as a
container).

**Ports on the dev host:** If ports 3001, 3011, 3020, 3030, 3310 are already
taken by the Node stack or Docker, pick a free port:

```bash
PORT=3478 cargo run --bin razzoozle-server
```

---

## The Gate (rust/gate.sh)

Before committing any Rust changes, run:

```bash
bash rust/gate.sh
```

This is the **single source of truth** for the Rust server's health. Never trust
a worker's self-report ("build passes"), always run the gate. It is deterministic
and runs all checks:

1. **Compilation** — `cargo build -p razzoozle-server` succeeds with no errors.
2. **Tests** — All workspace tests pass single-threaded. Uses `cargo-nextest` if
   available (faster, clearer output), falls back to `cargo test --test-threads=1`.
3. **Anti-regression markers** — Shipped feature batches leave fingerprints (e.g.,
   "B2 answer-types" = ≥12 instances of `answer_keys` or `answer_text`).
   If a marker count drops, a batch was reverted.
4. **Source floor** — Total lines in `server/src/` must not fall below 2400
   (guards against mass deletion / wholesale rewrites).
5. **Advisory rustfmt + clippy** — Reported but never blocking. If the toolchain
   is present, Rust code style and lints are shown.
6. **Locale JSON validity** — Every web locale namespace (de/game.json,
   fr/game.json, etc.) is valid JSON. Checked via `scripts/check-locales.sh`.
   A textual merge or stale checkout can silently corrupt locale files — this
   gate catches it.
7. **Question-type consistency** — All 10+ question types must appear at all five
   touchpoints: constants, validators, editor, answer handlers, Rust engine.
   Checked via `scripts/check-question-types.sh`. Prevents types from slipping
   through the cracks during refactors.
8. **Unified Design System Gate** — Runs the full token verification chain
   (`pnpm tokens:validate`, `tokens:ast`, `tokens:wasm`, `tokens:morph`,
   `tokens:neural`, `tokens:ai-audit`, `tokens:daemon`) on the web frontend.
   Ensures component tokens stay mapped and no arbitrary hex sneaks in.

Exit code: **0** = GO ✅ (deploy safe), **1** = GATE FAILED ❌ (discard output).

---

## Design notes & gotchas found during the port

- **socketioxide has no auto-`sid` room.** Node's socket.io auto-joins each socket
  to a room named after its own id; socketioxide does not — `socket.to(<sid>)`
  reaches nobody. Emit to one socket via `io.get_socket(sid)`.
- **Epoch-ms fields must be `i64`.** `Date.now()` (~1.75e12) overflows `i32` and
  fails deserialization of real low-latency payloads.
- **Explicit `null` vs omitted key.** TS `x: T | null` (required) must serialize as
  `null` (plain `Option<T>`), not be dropped — zod rejects a missing key. TS `x?:`
  keeps `skip_serializing_if`.
- **The fixture quiz is embedded** via `include_str!(concat!(env!("CARGO_MANIFEST_DIR"), …))`
  so the binary runs from any working directory.
- **Manager auth is now a server-minted host-token**, not a shared password
  check alone — a client that knows a game PIN can no longer forge control
  commands for a game it doesn't own (the IDOR the v2.0 bughunt found).
- **Unicode-correct text matching** for type-answer questions — naive
  byte/char-index slicing broke on multi-byte input; fuzzy-match now works on
  grapheme clusters.

## Non-goals (kept deliberately)

No frontend port (React ecosystem stays), no protocol changes during the port
(wire-format freeze), no Redis/persistence rework (snapshot/restore extends in-memory persistence), `packages/mcp` stays Node for now.
