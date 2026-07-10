# 🦀 Razzoozle in Rust

**A ground-up Rust rewrite of the Razzoozle game server** — an `axum` +
`socketioxide` server that speaks the **exact same socket.io wire protocol**
as the live Node.js server (`packages/socket`), so the React frontend and
every connected phone work unchanged against either backend.

**This is a preview, not a replacement.** Production traffic at
[razzoozle.joelduss.xyz](https://razzoozle.joelduss.xyz) still runs on the
Node server. The Rust server runs feature-complete alongside it in a parallel
container, gated by a real-game CI suite, working toward cutover.

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
| **2 — Server MVP → feature-complete** | Full scored multi-question game, all 7 question types, player lifecycle + reconnect, manager auth, quiz-from-disk, HTTP + solo endpoints, game-control (kick/skip/abort/timer), bots, display/kiosk, AI/media | ✅ **deployed :3012, feature-complete** |
| **2.x — Real-game CI gate** | Every deploy plays a **100-player game to FINISHED + reconnect** against the running container before it's considered good | ✅ **CI gate live** |
| **v2.0 — Hardening (in progress)** | Adversarial multi-model bughunt (19 confirmed findings) → resource caps + game eviction, per-IP rate-limits, path-traversal allowlist, Unicode-correct text matching, **server-minted host-token auth** closing a cross-game-control (IDOR) hole. Applied to both Node and Rust twins. `ts-rs` now also exports host-token/status types | 🚧 in progress |
| **Next** | Modularization + actor-per-game refactor; shadow cutover planning | ⏳ later |

**It plays a real, scored, multi-question game — deployed as a preview.**
The Rust server runs as a container on `127.0.0.1:3012` (parallel to the Node
server on :3011, **not** the default, **not** yet what production traffic
hits). Verified end-to-end against the real `socket.io-client` 4.8.3, and
re-verified on every deploy by the 100-player CI gate:

```
create → join → login → startGame
  Q1: SHOW_QUESTION → SELECT_ANSWER → answer → reveal SHOW_RESULT → SHOW_LEADERBOARD (scored)
  Q2: … → SHOW_LEADERBOARD → FINISHED            ✅ full game, 100 players + reconnect
```

---

## Crates (Cargo workspace)

| Crate | Purpose |
|---|---|
| [`protocol/`](protocol) | `razzoozle-protocol` — wire types for every socket event + payload, `serde` (camelCase) + `ts-rs`. **Rust is the source of truth**; `cargo test` regenerates the TS bindings. |
| [`engine/`](engine) | `razzoozle-engine` — pure, IO-free game logic (sentence-builder chunking + Fisher-Yates shuffle with anti-identity guard). |
| [`server/`](server) | `razzoozle-server` — `axum` HTTP + `socketioxide` namespace, in-memory game registry, the lobby → question → reveal → leaderboard loop, manager auth (host-token), rate-limits + resource caps. |

Spikes that proved the approach live under [`../spikes/`](../spikes):
`socketioxide-lobby` (protocol compat), `ts-rs-events` (type-gen), `golden-frames`
(byte-level Node baseline the Rust server is diffed against; also runs the
100-player real-game CI gate).

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
- **Manager auth is now a server-minted host-token**, not a shared password
  check alone — a client that knows a game PIN can no longer forge control
  commands for a game it doesn't own (the IDOR the v2.0 bughunt found).
- **Unicode-correct text matching** for type-answer questions — naive
  byte/char-index slicing broke on multi-byte input; fuzzy-match now works on
  grapheme clusters.

## Non-goals (kept deliberately)

No frontend port (React ecosystem stays), no protocol changes during the port
(wire-format freeze), no Redis/persistence rework (in-memory stays in-memory),
`packages/mcp` stays Node for now.
