# Module Boundaries & Layering

This document describes how Razzoozle's codebase is organized into crates, packages, and layers, along with import rules and responsibilities. It implements decisions from ADR-008, ADR-010, and ADR-011.

---

## Overview

Razzoozle splits into **5 principal layers:**

```
┌────────────────────────────────────────┐
│ Browser (packages/web)                 │
│ React SPA: UI, routing, game stores    │
└────────────────┬───────────────────────┘
                 │ Socket.IO (events) + REST (API calls)
┌────────────────┴───────────────────────┐
│ Rust Server (razzoozle-server)         │
│ Socket handlers, HTTP routes, DB       │
└────────────────┬───────────────────────┘
                 │ SQL queries
┌────────────────┴───────────────────────┐
│ Shared Layers                          │
│ - razzoozle-engine (game logic)        │
│ - razzoozle-protocol (wire types)      │
│ - packages/common (Zod + themes)       │
│ - PostgreSQL (data persistence)        │
└────────────────────────────────────────┘
```

---

## Layer 1: Browser (packages/web)

**Purpose:** React 18 single-page application. Renders UI, manages local game state, emits socket events.

**Key Directories:**
- `src/pages/` — File-based routes (TanStack Router generates `route.gen.ts`)
- `src/features/game/` — Game-specific stores (Zustand), contexts, event handlers
- `src/features/game/stores/` — Stores: `playerStore`, `managerStore`, `soloStore`, `lowLatencyStore`
- `src/features/game/contexts/socket-context.tsx` — Socket.IO initialization and auth
- `src/components/` — Shared UI primitives (buttons, dialogs, timers, layout)
- `src/lib/api.ts` — REST API client (fetch wrappers)
- `src/locales/` — i18n namespaces (de, en, es, fr, it, pt-br)
- `src/index.css` — CSS variables, design tokens, theme definitions

**Owned By:**
- All socket.emit() calls and their payloads (client-side intent)
- Local game phase state (SoloPhase FSM is entirely client-side)
- UI rendering and routing decisions
- Player identity: optional free-text name (solo), or student PIN class-mode

**Imports:**
- ✅ `@razzoozle/common` — Zod validators, theme helpers, locale keys, constants
- ✅ `socket.io-client` — WebSocket client library
- ❌ Do NOT import from `rust/` or `razzoozle-server`

**Tests:**
- Vitest component tests in `src/**/*.test.tsx`
- Playwright e2e tests in `source/e2e/`

---

## Layer 2: Rust Server (razzoozle-server)

**Purpose:** Single-process server. Handles socket.io events, HTTP/REST endpoints, database queries, and in-memory game registry. The authoritative source for game state, scoring, and player identity.

**Architecture:**

```
razzoozle-server (main binary, ~800 LOC in main.rs)
├── socket/              Socket.IO event handlers (~19k LOC)
│   ├── lifecycle/mod.rs — game phase FSM, phase transitions
│   ├── player/*.rs      — join, answer submission, solo scoring
│   ├── manager/*.rs     — quiz creation, game control, live reveals
│   └── display.rs       — kiosk display output
├── http/                REST API routes (~7.7k LOC)
│   ├── login.rs         — manager password + JWT auth
│   ├── solo.rs          — stateless quiz scoring
│   ├── assignments.rs   — student roster, attempt tracking
│   └── [+ 8 more endpoint files]
├── db/                  SQL queries and schema (~8.6k LOC)
│   ├── migrations/      — Sequential SQL schema upgrades
│   └── [query modules per table: users.rs, classes.rs, quizzes.rs, ...]
├── state/               In-memory game registry (~1k LOC)
│   ├── game.rs          — Game wrapper (engine + session metadata)
│   └── registry.rs      — HashMap<gameId, Game>, eviction, snapshots
├── auth/                JWT and player tokens (~500 LOC)
│   ├── jwt.rs           — Manager login tokens
│   └── token.rs         — Player reconnection tokens
├── config/              Runtime configuration (~300 LOC)
├── bot/                 Test bot client (~400 LOC)
└── media_ai/            ComfyUI integration (~800 LOC)
```

**Owned By:**
- All game phase transitions (server enforces FSM guards)
- Scoring logic (always server-computes, client mirrors)
- Player and manager identity validation
- Database queries and schema
- Socket.io message dispatch and broadcasting

**Imports:**
- ✅ `razzoozle-engine` — game logic, evaluation, scoring
- ✅ `razzoozle-protocol` — wire types (Rust structs, serde)
- ✅ `packages/common` (via symlink in workspace) — shared constants, type refs
- ✅ External crates: axum, socketioxide, sqlx, tokio, serde, chrono
- ❌ Do NOT import from `packages/web`

**Tests:**
- Unit tests in `src/**/*tests.rs` (Rust #[cfg(test)])
- Integration tests in `rust/server/tests/` (full server startup)
- E2E tests via Playwright (browser + running server)

---

## Layer 3: Rust Engine (razzoozle-engine)

**Purpose:** Pure game logic library. No I/O, no networking. Stateless evaluation and scoring functions.

**Key Modules:**
- `state/` — GamePhase enum, phase transitions
- `eval.rs` — Answer evaluation (matches against solutions)
- `scoring.rs` — Point calculation
- `achievements/` — Medal and achievement logic

**Owned By:**
- Game phase FSM definition
- Answer evaluation rules (single vs multiple-select, slider tolerance, type-answer fuzzy matching)
- Scoring formulas (time bonus, accuracy)
- Achievement unlock criteria

**Imports:**
- ✅ External crates: serde, chrono
- ✅ Standard library only; zero dependencies on server, db, networking
- ❌ Do NOT import from server, protocol, web, common

**Used By:**
- `razzoozle-server` — calls engine functions to evaluate answers, compute scores, check phase guards
- Embedded in server binary; no separate deployment

**Tests:**
- Unit tests in `src/**/*tests.rs`
- Snapshot tests for scoring edge cases

---

## Layer 4: Rust Protocol (razzoozle-protocol)

**Purpose:** Wire type definitions. Rust structs that serialize to JSON and are exported to TypeScript bindings via ts-rs.

**Key Files:**
- `status.rs` — Status enum (game phases + socket event response codes)
- `player.rs` — Player events (join, answer submission)
- `game.rs` — Game state broadcasts
- `manager.rs` — Host control events
- `quizz.rs`, `theme.rs`, `config.rs` — Data shapes
- `bindings/` — Auto-generated TypeScript (NOT to be edited manually)

**Owned By:**
- All socket.io event type definitions
- All JSON wire format contracts

**Single Source of Truth (ADR-010):**
- **Rust is authoritative.** New types go here with `#[derive(ts)]`.
- **TypeScript bindings are generated:** `rust/protocol/bindings/*.ts` are outputs of ts-rs, not hand-edited.
- **Client uses hand-synced validators:** Web imports `packages/common/src/validators/*.ts` (Zod), not the bindings. This is kept in sync manually.

**Imports:**
- ✅ `serde`, `serde_json`, `ts-rs` (for export)
- ✅ `razzoozle-engine` types (e.g., GamePhase)
- ❌ Do NOT import from server, web

---

## Layer 5: Shared (packages/common)

**Purpose:** Shared TypeScript utilities, validators, theme helpers, and constants.

**Key Files:**
- `src/validators/` — Zod schemas for wire types (hand-maintained mirrors of Rust protocol)
- `src/theme-tokens.ts` — Design token helpers, `getThemeTokenCssVar()`
- `src/constants/` — Shared constants (game timeouts, PIN format, etc.)
- `src/types/` — TypeScript type definitions

**Owned By:**
- Zod runtime validators (for form validation, socket payload checks)
- Design system tokens and theme accessors
- i18n locale keys and fallback strings
- Shared constants and enums

**Imports:**
- ✅ `zod` — runtime schema validation
- ✅ Standard library only

**Used By:**
- ✅ `packages/web` — Zod validators, theme helpers
- ✅ `razzoozle-server` (via Cargo symlink `link:../common`) — constants (minimal)

**Note:** `packages/mcp` (MCP server) is NOT part of the main workspace (excluded in `pnpm-workspace.yaml` with `!packages/mcp`). It's a host-only development tool and manages its own dependencies independently.

---

## Database (razzoozle-server → PostgreSQL)

**Purpose:** Persistent storage for quizzes, user accounts, student rosters, results, and game state snapshots.

**Schema:**
- `users` — Manager accounts (admin, teacher roles)
- `classes` — Classrooms
- `students` — Student roster with PINs
- `quizzes` — Quiz definitions (title, questions)
- `questions` — Question metadata
- `results` — Game play results (scores, timing)
- `assignments` — Quiz-to-class assignments with attempt limits
- `media` — Media files (images, video)
- `themes` — Manager-created color/animation themes
- `config` — Runtime settings

**Owned By:**
- `razzoozle-server` (SQL queries in `rust/server/src/db/`)
- Migrations managed in `rust/server/src/db/migrations/`

**Accessed By:**
- ✅ Only via razzoozle-server (HTTP REST or internal queries)
- ❌ Never directly from web or external clients (security boundary)

---

## Import Rules (Enforcement)

### From packages/web

```typescript
// ✅ Allowed
import { GamePhase } from '@razzoozle/common';
import { getThemeTokenCssVar } from '@razzoozle/common/theme-tokens';
import { useSocket } from './contexts/socket-context';
import { socket } from 'socket.io-client';

// ❌ Forbidden
import { evaluateAnswer } from 'razzoozle-engine'; // Not exported to TS
import { SomeServerType } from 'razzoozle-server'; // Backend-only
```

### From razzoozle-server

```rust
// ✅ Allowed
use razzoozle_engine::eval::evaluate_answer;
use razzoozle_protocol::{Status, PlayerEvent};
use tokio::task;
use sqlx::PgPool;

// ❌ Forbidden
// Do NOT import packages/web code
// Do NOT import server-specific modules outside server crate
```

### From razzoozle-engine

```rust
// ✅ Allowed
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

// ❌ Forbidden
// Do NOT import from server, protocol, web
// No I/O, async, or networking
```

---

## Modularization Guidelines (ADR-011)

A file is a candidate for splitting if **both** conditions hold:

1. **Size threshold:** >600 lines of code
2. **Responsibility condition:** Contains two or more cohesive, independently-viable subsystems

**Safeguards for all splits:**
- Write characterizing tests for the subsystem being extracted
- Verify tests pass with the original file
- Extract into new file with re-export block preserving public API
- Run full test suite (unit + integration + e2e)
- Cross-vendor code review (verify contract, no state leaks, no side effects)
- Grep codebase for all call sites and verify they still work

**Candidates audited 2026-07-29:**
- `rust/server/src/db/classes.rs` (1629 LOC, 16 commits) — **ACCEPT Tier 1.** Class CRUD and student roster are independent; extract `students.rs`.
- `packages/web/src/features/game/components/states/Answers.tsx` (996 LOC, 61 commits) — **ACCEPT Tier 1.** Render logic, event handlers, store subscriptions are separable; extract per-question-type variants.
- `rust/server/src/socket/reveal_helpers.rs` (998 LOC, 38 commits) — **REJECT.** Single cohesive state machine; splitting increases import chains without reducing complexity.

---

## How to Add New Code

1. **New socket event?** → Define in `rust/protocol/src/`, regenerate bindings, sync Zod validator in `packages/common`.
2. **New REST endpoint?** → Add to `rust/server/src/http/`, call engine functions, respond with protocol types.
3. **New game rule or scoring?** → Implement in `razzoozle-engine`, export via `pub fn`, call from server.
4. **New UI component?** → Use scaffold generators (`pnpm g:console`, `pnpm g:menu`, etc.), import from `packages/common`.
5. **New database table?** → Create migration in `rust/server/src/db/migrations/`, define schema, write query module.

---

## References

- **ADR-008:** MCP server as host-only dev tool (excluded from workspace)
- **ADR-010:** Rust as authoritative protocol source (ts-rs bindings)
- **ADR-011:** Modularization boundaries (>600 LOC + multiple responsibilities)
- **Architecture guide:** `docs/architecture/README.md`
- **Protocol inventory:** `docs/rust-port-event-inventory.md`
