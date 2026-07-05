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

> Full plan, phases, risks and the event inventory:
> [`../docs/rust-port-plan.md`](../docs/rust-port-plan.md) ·
> [`../docs/rust-port-event-inventory.md`](../docs/rust-port-event-inventory.md) ·
> plugin-runtime decision: [`../docs/adr/rust-port-plugin-runtime.md`](../docs/adr/rust-port-plugin-runtime.md)

---

## Status — 2026-07-05

| Phase | What | State |
|---|---|---|
| **0 — Spike & Gate** | socketioxide talks socket.io to the real client; golden-frame baseline recorded; plugin-runtime decision (Node-sidecar) | ✅ **PASS** — no protocol blockers |
| **1 — Protocol & types** | Every socket event/payload as a Rust type, `ts-rs` generates the TS bindings (Rust leads, one source of truth) | ✅ **9 modules, ~200 types, 178 tests** |
| **1b — Engine logic** | Sentence-builder chunk generation + shuffle guard, ported 1:1 from TS | ✅ **19 tests** |
| **2/3 — Server MVP** | Runnable `axum` + `socketioxide` server driving the game loop | ✅ **Lobby + game loop end-to-end** |
| 3/4 — Full parity | config, auth, themes, AI/media, plugins, reconnect, low-latency, cutover | ⏳ not started |

**The MVP plays a real game.** Verified against the actual `socket.io-client`
4.8.3:

```
connect → game:create → player:join → player:login → manager:startGame
  → game:status SHOW_START → SHOW_QUESTION      ✅ GAME FLOW OK
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
