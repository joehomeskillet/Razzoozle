# 🦀 Razzoozle in Rust

**A ground-up Rust rewrite of the Razzoozle game server** — replacing the
Node.js `packages/socket` (~31k LOC) with an `axum` + `socketioxide` server that
speaks the **exact same socket.io wire protocol**, so the React frontend and
every connected phone keep working unchanged.

**Why Rust:** the endgame is shipping the desktop host as a **~10 MB Tauri app**
(Rust server as a sidecar) instead of a ~150 MB Electron bundle that ships a full
Node runtime. Along the way, the game's state machine (Lobby → Round → Reveal →
Scoreboard) becomes compile-time-checked, and a single static binary makes both
the hosted and desktop cases cheaper (RAM, cold start).

> Plugin-runtime decision (Node-sidecar):
> [`../docs/adr/rust-port-plugin-runtime.md`](../docs/adr/rust-port-plugin-runtime.md)

---

## Status — 2026-07-05

| Phase | What | State |
|---|---|---|
| **0 — Spike & Gate** | socketioxide talks socket.io to the real client; golden-frame baseline recorded; plugin-runtime decision (Node-sidecar) | ✅ **PASS** — no protocol blockers |
| **1 — Protocol & types** | Every socket event/payload as a Rust type, `ts-rs` generates the TS bindings (Rust leads, one source of truth) | ✅ **9 modules, ~200 types, 178 tests** |
| **1b — Engine logic** | Sentence-builder chunk generation + shuffle guard, ported 1:1 from TS | ✅ **19 tests** |
| **2 — Server MVP** | Runnable `axum` + `socketioxide` server; lobby + full round loop | ✅ **deployed & verified** |
| **2·Batch 1** | Core round loop: select-answer, time-weighted scoring + streaks, reveal (SHOW_RESULT), leaderboard, next/finish, cooldowns | ✅ **full multi-question game → FINISHED** |
| **2·Batch 2** | All 7 question types: choice, multiple-select, boolean, slider, poll, type-answer (fuzzy), sentence-builder | ✅ **37 engine tests + live** |
| **2·Batch 3** | Player lifecycle: `totalPlayers` / `newPlayer` / `removePlayer`, disconnect handling, `SHOW_RESPONSES` (answer distribution) | ✅ **full game + player-leave verified live** |
| **2·Batch 4** | Quiz loading from disk (`config/quizz/*.json`, 469 loaded) + axum HTTP routes: `GET /api/quizzes`, `GET /api/quizz/:id/solo` (solutions stripped), `POST /api/quizz/:id/check-answer` | ✅ **live-verified, no solutions leaked** |
| **2·Batch 4b** | Unified check-answer eval (all types, points/accuracy/achievements) + `POST /solo-score` server-side recompute+cap (rejects inflated client scores) + persist to `config/solo-results/` | ✅ **inflated 999999→1000 rejected, live** |
| **2·Batch 5** | Manager auth: `manager:auth` (password), `logged_clients` set, `startGame`/`revealAnswer`/`showLeaderboard` gated → `manager:unauthorized`; `manager:config` delivery | ✅ **no-auth stalls, auth→FINISHED, live** |
| 2·Batch 6+ | peripherals: bots, themes, AI/media, low-latency, display | 🚧 in progress |
| 3/4 — Peripherals & cutover | themes, AI/media, plugins (Node sidecar), low-latency, display, shadow cutover | ⏳ later |

**It plays a real, scored, multi-question game — deployed.** The Rust server runs
as a container on `127.0.0.1:3012` (parallel to the Node server on :3011, not a
replacement yet). Verified end-to-end against the real `socket.io-client` 4.8.3:

```
create → join → login → startGame
  Q1: SHOW_QUESTION → SELECT_ANSWER → answer → reveal SHOW_RESULT → SHOW_LEADERBOARD (scored)
  Q2: … → SHOW_LEADERBOARD → FINISHED            ✅ full game
```

**Run the deployed preview:**
```bash
docker build -f rust/Dockerfile -t razzoozle-rust:latest .
# Mount config/ so the real quizzes (config/quizz/*.json) load; CONFIG_PATH points at it.
docker run -d --name razzoozle-rust -p 127.0.0.1:3012:3020 \
  -e PORT=3020 -e CONFIG_PATH=/config -v "$(pwd)/config:/config:ro" razzoozle-rust:latest
# GET http://127.0.0.1:3012/health ⇒ 200 ; GET /api/quizzes ⇒ 469 ids
# SMOKE_URL=http://127.0.0.1:3012 node spikes/golden-frames/smoke-fullgame.cjs ⇒ FINISHED
```

---

## Crates (Cargo workspace)

| Crate | Purpose |
|---|---|
| [`protocol/`](protocol) | `razzoozle-protocol` — wire types for every socket event + payload, `serde` (camelCase) + `ts-rs`. **Rust is the source of truth**; `cargo test` regenerates the TS bindings. |
| [`engine/`](engine) | `razzoozle-engine` — pure, IO-free game logic (sentence-builder chunking + Fisher-Yates shuffle with anti-identity guard). |
| [`server/`](server) | `razzoozle-server` — `axum` HTTP + `socketioxide` namespace, in-memory game registry, the lobby → question → reveal → leaderboard loop. |

Spikes that proved the approach live under [`../spikes/`](../spikes):
`socketioxide-lobby` (protocol compat), `ts-rs-events` (type-gen), `golden-frames`
(byte-level Node baseline the Rust server is diffed against).

---

## Build & run

```bash
cd rust
cargo build            # whole workspace
cargo test             # 197+ tests across protocol/engine/server

# Run the server (fixture quiz is embedded at compile time → any cwd works).
# NOTE: ports 3001/3011/3030/3310 are taken by docker on the dev host — pick a free one.
PORT=3478 RUST_LOG=info ./target/debug/razzoozle-server
# → GET http://127.0.0.1:3478/health  ⇒ 200
```

**End-to-end smoke** (real socket.io client drives a full game):

```bash
node ../spikes/golden-frames/smoke-startgame.cjs   # expects the server on :3478
# → GAME FLOW OK  (SHOW_START → SHOW_QUESTION)
```

---

## Design notes / gotchas found during the port

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

## Non-goals (kept deliberately)

No frontend port (React ecosystem stays), no protocol changes during the port
(wire-format freeze), no Redis/persistence rework (in-memory stays in-memory),
`packages/mcp` stays Node for now.
