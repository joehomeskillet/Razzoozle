# Razzoozle Architecture

## Overview

Razzoozle is a single-process, Rust-based backend serving a React SPA frontend. The server handles both HTTP REST endpoints and Socket.IO multiplayer game events, with PostgreSQL for persistent storage and in-memory state for active games.

**Key fact:** This is NOT a Node.js backend. The server is a single compiled Rust binary (`razzoozle-server`, built from `rust/server/src/main.rs`), deployed in Docker and running on port 3020. The old Node-based socket package (`packages/socket`) no longer exists as of 2026 — all game server logic has been ported to Rust.

---

## Layer Architecture

```
┌────────────────────────────────────────────────────────┐
│ BROWSER — packages/web (React 18 SPA)                  │
│  - Routes: TanStack Router, generated route.gen.ts     │
│  - Stores: Zustand for game state (player, manager)    │
│  - Socket: socket.io-client (1 shared instance)        │
│  - REST: Fetch for stateless operations (solo, auth)   │
└────────────────────────┬─────────────────────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                │
         ▼ Socket.IO (game events)        ▼ HTTP/REST
┌────────────────────────────────────────────────────────┐
│ RUST SERVER — razzoozle-server (single process)        │
│                                                        │
│  /socket ─────► socket handlers (113 socket.on registrations)  │
│  │               - lifecycle/mod.rs  (phase FSM)     │
│  │               - player/*.rs       (join/answer)  │
│  │               - manager/*.rs      (host control)│
│  │               - display.rs        (kiosk output)  │
│  │                                                   │
│  /http ────────► REST routes (51 endpoints)         │
│  │               - login, auth, solo play          │
│  │               - assignments, results            │
│  │               - quizzes, media, themes          │
│  │                                                   │
│  /state ───────► In-memory game registry             │
│  │               - Arc<RwLock<HashMap<gameId>>>     │
│  │               - each game = engine state + DB    │
│  │                                                   │
│  /engine ──────► Game logic (imported from          │
│                  razzoozle-engine crate)           │
│  │               - GamePhase FSM                    │
│  │               - scoring/evaluation              │
│  │               - achievement awards              │
│                                                     │
└────────────────────────┬─────────────────────────┘
                         │
         ┌───────────────┴──────────────┐
         │                              │
         ▼ SQL                          ▼ JSON
┌──────────────────────┐        ┌──────────────────────┐
│ PostgreSQL           │        │ razzoozle-protocol   │
│                      │        │ (wire types)         │
│ - classes            │        │ - Status enum        │
│ - students/pins      │        │ - Player, Question   │
│ - quizzes            │        │ - socket.io events   │
│ - results            │        │ (serde+ts-rs export)│
│ - users              │        │                      │
│ - media              │        │ Bindings (/bindings) │
│ - themes             │        │ not imported by web; │
│ - config             │        │ web uses hand-synced │
│                      │        │ zod types instead    │
└──────────────────────┘        └──────────────────────┘
```

---

## Tech Stack

### Backend Runtime

- **Language & Runtime:** Rust (2021 edition), tokio async runtime
- **HTTP Server:** Axum (web framework, router)
- **WebSocket:** socketioxide (socket.io server implementation)
- **Database Driver:** sqlx (query builder, postgres support)
- **Authentication:** argon2 (password hashing), SHA-256 (session tokens)
- **Serialization:** serde + serde_json (runtime), serde_json::Value for untyped payloads

### Crates (Workspace: `rust/`)

```
rust/
├── server/        razzoozle-server (main binary, ~800 LOC main.rs)
87	│   ├── socket/    ~19k LOC: event handlers, lifecycles
88	│   ├── http/      ~7.7k LOC: REST routes, auth logic
89	│   ├── db/        ~8.6k LOC: SQL queries
│   ├── state/     ~1000 LOC: in-memory game registry
│   ├── auth/      ~500 LOC: JWT, token validation
│   ├── config/    ~300 LOC: YAML parsing, env resolution
│   ├── bot/       ~400 LOC: test bot spawning
│   └── media_ai/  ~800 LOC: ComfyUI integration
├── engine/        razzoozle-engine (game logic, IO-free)
│   ├── state/     GamePhase FSM, round logic
│   ├── eval.rs    Answer evaluation (shared MP + solo)
│   ├── scoring.rs Point calculation
│   └── achievements/ Award criteria
└── protocol/      razzoozle-protocol (wire types)
    ├── status.rs     Status enum (12 variants)
    ├── player.rs     Player events
    ├── game.rs       Game events
    ├── manager.rs    Host controls
    └── [+ 15 more type files]
```

### Frontend (packages/web)

- **UI:** React 18 + TypeScript
- **Routing:** TanStack Router (file-based, generated to `route.gen.ts`)
- **State:** Zustand (8 stores in `features/game/stores/`)
- **Networking:** socket.io-client (Multiplayer), fetch (REST stateless ops)
- **Styling:** Tailwind v4 + W3C design tokens (see `design.md`)
- **Components:** Custom domain-specific components (admin console, quiz tiles, player UX)

### Shared (packages/common)

- TypeScript types and zod validators (hand-maintained, parallel source of truth)
- Design tokens and theme management
- Utilities: clock sync, constants, locale strings

---

## Directory Structure & Key Files

### Rust Server Modules

| Module | Purpose | Key Files |
|--------|---------|-----------|
| **socket** | Socket.IO event handlers (114 registrations) | `socket/mod.rs` registers all handlers; `lifecycle/mod.rs` drives game phases; `player/*.rs` and `manager/*.rs` split role-based logic; `display.rs` for kiosk output |
| **http** | REST API (30 routes) | `http/mod.rs` router; `login.rs`, `solo.rs`, `assignments.rs` for auth and stateless play |
| **db** | SQL queries and schema | `db/mod.rs` public interface; migrations stored in `db/migrations/` (22 files); tables: users, classes, students, quizzes, results, media, themes, config |
| **state** | In-memory game registry | `state/game.rs` wraps engine + session metadata; `state/registry.rs` manages HashMap<gameId, Game> with eviction timers and snapshots |
| **auth** | JWT and token logic | `auth/jwt.rs` (manager login tokens); `auth/token.rs` (player reconnection tokens) |
| **config** | Runtime configuration | `config/mod.rs` loads from ENV + `game.json` file (gitignored quiz data) |
| **media_ai** | AI image generation | Hooks into ComfyUI; stores generated images to disk + Postgres |
| **bot** | Testing bot client | Simulates players for e2e tests; uses same socket protocol as real clients |

### Frontend Structure (packages/web)

| Directory | Purpose |
|-----------|---------|
| `src/pages/` | File-based routes (TanStack Router generates `route.gen.ts` from file structure) |
| `src/features/game/` | Game-specific logic: stores (player, manager, solo), contexts (socket), UI components |
| `src/features/game/contexts/socket-context.tsx` | Socket.IO setup, auth, event listeners |
| `src/features/game/stores/` | Zustand stores for game state (player, manager, solo, lowLatency, etc.) |
| `src/components/` | Shared UI primitives (buttons, dialogs, inputs, timers) |
| `src/lib/` | API client (`api.ts`, REST fetch wrappers) |
| `src/index.css` | CSS variables (themes, tokens, static fields) |

### Build & Deployment

| File | Purpose |
|------|---------|
| `rust/Dockerfile` | Multi-stage: builds web SPA + Rust binary, bundles both into lean runtime image |
| `rust/Cargo.toml` | Workspace definition; dependencies: axum, socketioxide, tokio, sqlx, serde |
| `pnpm-workspace.yaml` | Workspace config for packages/web, packages/common, packages/mcp (MCP excluded from runtime image) |
| `rust/.cargo/config.toml` | Linker config (mold); profiling options |
| `rust/server/src/main.rs` | Server entrypoint: initializes DB, socket.io, HTTP routes, graceful shutdown |

---

## Communication Patterns

### Multiplayer (Socket.IO)

**Transport:** WebSocket (socket.io protocol, JSON messages)

**Flow:**

1. **Connect & Auth:** Client connects to `/` namespace → handshake includes auth headers (`X-Manager-Token` for host, player token for reconnect)
2. **Event Emit:** Client calls `socket.emit('game:xxx', payload)` → server handler in `socket/` receives and mutates state
3. **Broadcast:** Server calls `io.to(room).emit('game:yyy', payload)` → all clients in room receive
4. **Rooms:** Each game has a room by `gameId`; manager and players in separate rooms for role-specific events

**Example:** Player submits answer
```
Client                          Server
socket.emit('player:selectedAnswer', {answerId})
                                │
                                └─► socket/player/answer.rs
                                    - validate phase
                                    - call engine.evaluate_answer()
                                    - emit 'game:playerAnswer'
                                ◄───
emit 'game:playerAnswer' received
```

### Stateless REST

**Flow:** Client calls fetch → server processes → response. No ongoing connection or state tracking.

**Endpoints:**
- `GET /api/quizz/:id` — fetch quiz metadata (stateless)
- `POST /api/quizz/:id/check-answer` — solo: score single answer
- `POST /api/quizz/:id/solo-score` — solo: finalize score (server recomputes)
- `POST /api/login` — manager: authenticate with username + password
- `GET /api/assignment/:id` — fetch assignment details
- `POST /api/assignment/:id/validate-pin` — verify student PIN (rate-limited)

### Type Contracts

**Wire types live in `rust/protocol/src/`:**
- `status.rs` — Status enum (12 variants, wire superset of GamePhase)
- `player.rs`, `game.rs`, `manager.rs` — Socket event structs
- `quizz.rs`, `theme.rs`, etc. — Data shapes

**Export:** `#[derive(ts)]` from ts-rs crate → generates `/bindings/*.ts` (~140 files)

**Client-side:** `packages/web/src` does NOT import from `/bindings/`. Instead, `packages/common/src/validators/*.ts` (zod) maintains a parallel, hand-synced version. The protocol bindings are a dead codegen pipeline as of 2026.

---

## Startup & Runtime

### Startup Sequence (main.rs)

```rust
1. Parse CLI command (serve, healthcheck, migrate); optional flags (--version, --help)
2. Initialize logging (tracing + ring buffer for GET /api/v1/observability/logs)
3. Create DB pool (if DATABASE_URL env is set; optional for dev)
4. Hydrate media from Postgres to disk (E4 feature)
5. Bootstrap admin user (if DB is empty and BOOTSTRAP_ADMIN_PASSWORD env is set)
6. Load fixture quiz from compile-time include_str!()
7. Initialize GameRegistry (in-memory state)
8. Load crash-recovery snapshot (if exists)
9. Start periodic snapshot saver (5s interval)
10. Create Socket.IO instance (113 handlers registered)
11. Create HTTP router (51 REST routes registered)
12. Listen on :3020 (or $PORT env)
13. Install signal handlers (SIGINT/SIGTERM → graceful shutdown → save snapshot)
```

### Deployment (Docker)

```dockerfile
# Stage 1: webbuilder
# - Node 25 + pnpm
# - Install workspace, build packages/web → dist/

# Stage 2: Rust builder
# - rust:1-bookworm
# - Copy rust/ and build `cargo build --release -p razzoozle-server`

# Stage 3: Runtime
# - debian:bookworm-slim
# - COPY razzoozle-server from stage 2
# - COPY web/dist from stage 1
# - Create config dirs (/config/quizz, /config/solo-results, /config/media, /config/theme)
# - Run as uid 10001 (appuser)
```

**Volumes/Mounts:**
- `/app/web/` — bundled React SPA (served by server as static files)
- `/config/` — runtime data (quizzes authored via UI, media, themes)
- DATABASE_URL env — Postgres connection string (optional; file-based fallback)

---

## Historical Note: No Node Socket Package

**packages/socket was removed.** In early versions, a Node.js backend (`packages/socket`) existed to handle Socket.IO. As of mid-2026, all socket logic has been ported to Rust (`rust/server/src/socket/`). The old packages/socket directory no longer exists.

If you find references to `packages/socket` in old docs or comments, they refer to archived code. The current source of truth for socket handlers is `rust/server/src/socket/`.

---

## Key Boundaries & Ownership

### Server Ownership (Authoritative)

- **GamePhase transitions:** Server enforces all phase guards (only valid state transitions allowed)
- **Scoring:** Both multiplayer reveal and solo check-answer call the same `razzoozle_engine::eval::evaluate_answer()`; solo's final score is recomputed server-side
- **Player identity:** player_token is minted once per join, stored securely (#[serde(skip)] prevents wire leak)
- **Game ownership:** is_game_host() checks hostToken, owner_user_id, or admin role (main.rs:54-100)
- **Manager credentials:** Passwords hashed with argon2; session tokens hashed with SHA-256

### Client Ownership (Local State)

- **Solo game phases:** SoloPhase FSM lives entirely on the client; server has no phase tracking for solo play
- **Multiplayer state machines:** Both player and manager stores (Zustand) mirror engine state; server broadcasts Status events to resync
- **UI routing:** Client-side TanStack Router decides which page to show based on game state
- **Timeouts & cooldowns:** Initially local; server may enforce retro-active phase guards

---

## Common Paths & Commands

### Build

```bash
cd rust
cargo build --release -p razzoozle-server
# Binary: target/release/razzoozle-server
```

### Tests

```bash
cd rust
cargo test --all
# Host-token tests live in main.rs:102-198
```

### Migrations

New database schema changes go in `db/migrations/NNN_description.sql`. Migration numbering is sequential; the CLI runs pending migrations on startup.

### Observability

- **Logs:** Structured logs via tracing; live log ring accessible at `GET /api/v1/observability/logs/server`
- **Metrics:** `GET /api/v1/observability/metrics` (Prometheus format)
- **Health:** `GET /health` → 200 OK

---

## Gotchas & Anti-Patterns

1. **No packages/socket.** If a build or deploy script references `packages/socket`, it's stale. Socket logic is in `rust/server/src/socket/`.
2. **Untyped event payloads.** Some socket events (class/label/user events) parse payloads via ad-hoc `serde_json::Value` instead of typed protocol structs. This is a known gap.
3. **Solo identity.** Solo play takes a free-text name with no identity binding to a student record. Class-mode identity is unfinished.
4. **Protocol bindings stale.** `rust/protocol/bindings/` is auto-generated but not imported by web. Web uses hand-synced zod types instead. Keep both in sync if you modify protocol types.
5. **DB snapshots & clustering.** In-memory game state is saved to disk every 5s. Multi-instance deployments would need a shared snapshot store (not yet implemented).

---

## Further Reading

- **Game state machine & events:** `docs/sdd/game-solo-multiplayer-refactor/01-current-game-architecture.md`
- **Design system (tokens, colors):** `design.md`
- **Self-hosting & deployment:** `docs/Self-Hosting.md`
- **Configuration reference:** `docs/Configuration.md`
