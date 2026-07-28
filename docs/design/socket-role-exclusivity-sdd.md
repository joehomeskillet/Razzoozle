# Security SDD: Socket-Role Exclusivity & Same-Tab Role Transition

Status: Draft / Approved Security Architecture
Parent Issue: [#281](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/281)
Child WP: `wp-c21a3b35a9be` (Issue #439)
Primary File: `docs/design/socket-role-exclusivity-sdd.md`

---

## 1. Executive Security Architecture

In Razzoozle, a connected socket MUST have exactly ONE verified role bound to its `SocketId` at any point in time.

Unverified client claims (e.g. sending `manager:action` from an unauthenticated or player socket) MUST be rejected at the `HandlerCtx` policy boundary before business logic execution.

### Role Hierarchy & Definitions
- `Unauthenticated`: Initial connected state before role verification.
- `Manager`: Authenticated host/manager with valid DB session / Bearer token or Manager Token.
- `Player`: Joined participant in a quiz session bound to a PIN and Player ID.
- `Display`: Kiosk/stage display bound to a game PIN.

---

## 2. Claimed vs. Verified Role Model

```
               [ Socket Connect ]
                       │
                       ▼
             ( Unauthenticated )
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
     Verify Token  Verify PIN   Verify PIN
    (Manager Auth) (Player Join)(Display Pair)
          │            │            │
          ▼            ▼            ▼
      [Manager]    [Player]     [Display]
```

1. **Strict Binding**:
   - `SocketId` to `VerifiedRole` is stored per-socket via Rust's `socketioxide` extension state mechanism.
   - A socket cannot simultaneously hold multiple roles.

2. **Atomic Role Transition & Rollback**:
   - When a socket attempts to switch roles or authenticate (e.g. `Unauthenticated` -> `Manager`), the server validates credentials *before* mutating the role state.
   - If verification fails, the transition is aborted, the state rolls back atomically, and an error ack `401 Unauthorized` or `403 Forbidden` is returned.
   - If a socket is already bound to `Player` and attempts to claim `Manager` without disconnecting/re-authing, the server denies the request.

3. **Room & Listener Ownership**:
   - Sockets only join role-restricted Socket.IO rooms (`room:manager`, `room:player:${pin}`, `room:display:${pin}`) *after* verified role assignment.
   - On disconnect or role reset, the socket is removed from all role-restricted rooms.

---

## 3. HandlerCtx Security Policy & Guards

Every socket event handler in `rust/server/src/socket/` receives a context wrapper `HandlerCtx` (rust/server/src/socket/mod.rs:14–25):

```rust
#[derive(Clone)]
pub struct HandlerCtx {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub io: SocketIo,
    pub client_id: String,
    pub db_pool: Option<sqlx::PgPool>,
    /// Session token from handshake auth payload (None if not provided).
    pub session_token: Option<String>,
    /// Satellite token from handshake auth payload (None if not provided).
    pub satellite_token: Option<String>,
    /// Lazily-resolved and cached user. Populated on first require_user/require_admin call.
    pub user_cache: Arc<RwLock<Option<AuthUser>>>,
}
```

The `HandlerCtx` carries authentication credentials and provides methods to gate operations:
- `require_user()`: Resolves the authenticated user from `session_token` and DB, caching the result.
- `require_admin()`: Requires both authentication AND the `admin` role.

Every handler MUST call one of these guards before executing privileged operations. Handlers that bypass these guards allow role confusion attacks.

---

## 4. Role Entry Points & Verification Locations

### Manager Role (DB-Session Authentication)
- **Entry**: `rust/server/src/socket/game.rs:16` — `register_create()` handler — requires `require_user()` (:40) before creating game.
- **Reconnect**: `rust/server/src/socket/manager/auth.rs:44` — `register_reconnect()` handler — requires `require_user()` (:53) before reconnecting to existing game.
- **Logout**: `rust/server/src/socket/manager/auth.rs:13` — `register_logout()` handler — clears session via `delete_session()` (:30).

### Player Role (PIN + Username Join)
- **Entry**: `rust/server/src/socket/player/login.rs:257` — `register_login()` handler — validates against active roster, rate-limits, deduplicates display names.
- **Session Maintenance**: `rust/server/src/socket/player/session.rs:8` — `register_leave()` handler — hard-removes player from lobby (or marks disconnected mid-game).
- **Reconnect**: `rust/server/src/socket/player/session.rs:163` — `register_reconnect()` handler — restores player state on reconnect via `player_token`.

### Display Role (Code-Based Pairing)
- **Register Display**: `rust/server/src/socket/display.rs:241` — `DISPLAY.REGISTER` handler — generates pairing code and stores in `PAIRING_REGISTRY`.
- **Pair to Game**: `rust/server/src/socket/display.rs:263` — `DISPLAY.PAIR` handler — verifies code exists, validates manager identity or password (:321-352), joins display to game room (:375).
- **Disconnect**: `rust/server/src/socket/display.rs:454` — `DISPLAY.DISCONNECT` handler — removes pairing code (one-time use).
- **Transport Disconnect**: `rust/server/src/socket/display.rs:466` — native socket disconnect handler — removes display from active registry.

### Transport Disconnect (All Roles)
- **Entry**: `rust/server/src/socket/game.rs:242` — `register_disconnect()` handler — gracefully handles transport loss, marks player disconnected (but preserves roster slot per #83).

---

## 5. Critical Design Decisions

### Decision 1: Multi-Socket Role Separation (Cross-Device Same ClientId)

**Question**: May the same `ClientId` hold **different roles on separate sockets** in the same game?

**Answer**: **Yes.** A single `ClientId` (e.g. browser localStorage UUID) may establish multiple independent socket connections, each holding a distinct role:
- A single person opening `/manager` on Desktop and `/player` on Mobile creates two sockets with the same `ClientId`.
- Each socket independently verifies its role (DB session for Desktop, PIN+name for Mobile).
- Each socket's role is stored per-`SocketId`, not per-`ClientId`.
- **Scope**: The role guard is socket-scoped. Cross-socket role confusion is **not** a vulnerability because handlers receive socket-specific context, not `ClientId`-wide context.

**Rationale**: Razzoozle's design intentionally allows multi-device scenarios (manager on desktop, display on tablet, player on phone). Enforcing singleton ClientIds would break this use case and is not necessary; socket-scoped verification is sufficient.

---

### Decision 2: Manager Reconnect on Existing Manager Binding

**Question**: What happens when a Manager attempts `manager:reconnect` if a **different Manager socket is already bound** to the same game?

**Answer**: **Reject with `game.managerAlreadyConnected`.** The server (rust/server/src/socket/manager/auth.rs:121-134) checks if a previous manager socket is still genuinely connected via `io.get_socket(sid)`. If it is, the new reconnect is rejected to prevent concurrent manager control.

**Rationale**: Two concurrent Manager connections to the same game would create race conditions in game state mutations. Only one manager may actively control a game at a time. If the previous manager's connection is stale (socket was closed but not yet cleaned), the reconnect is allowed (previous_socket_id is overwritten).

---

## 6. Satellite Control & Display Pairing Rules

1. **`satellite_manager_control` Capability**:
   - `satellite_manager_control` is a session *capability flag* granted to an authenticated `Manager` session operating from a secondary device (e.g. mobile host controller).
   - It is NOT a distinct socket role. Satellite controllers maintain the `Manager` role.

2. **Kiosk Display Pairing**:
   - Display pairing relies on code verification via `PAIRING_REGISTRY` (rust/server/src/socket/display.rs:182).
   - Display sockets are assigned the `Display` role and joined exclusively to display broadcast channels.
   - Password fallback (rust/server/src/socket/display.rs:321-352): If the caller is not the manager socket, password validation is required.

---

## 7. Compatibility & Verification Requirements

- **Raw Socket Clients & E2E Tests**:
  - Raw WebSocket clients, Playwright E2E suites, and MCP test helpers must adhere to the formal authentication sequence (`game:create` for managers, `game:join` for players, `display:pair` for displays) before emitting privileged domain events.
- **Rust Engine Parity**:
  - Rust `socketioxide` event handlers (rust/server/src/socket/) implement role verification via the `HandlerCtx` guards (`require_user()`, `require_admin()`).
  - Every role entry point (sections 4.1–4.4) calls its appropriate guard before committing state changes.

---

## 8. Stop Conditions

Do not proceed with code implementation if:
- Role verification can be bypassed via raw event payloads.
- A handler mutates role-critical state without calling `require_user()` or `require_admin()`.
- Manager reconnect allows concurrent sockets to control the same game.
- E2E tests pass role verification by accident (e.g. failing to clear session state between test runs).

---

## Historical Note: Backend Correction

**This specification was corrected on 2026-07-28** from an earlier draft that referenced `packages/socket/src/handlers/` — a Node.js backend module that was **deleted on 2026-07-15**. The original spec did not reflect Razzoozle's current architecture (Rust socketioxide only). The incorrect backend reference led to an incomplete TypeScript implementation of Issue #281 that the Rust server did not honor.

All role entry points, guards, and line numbers now reference the **actual Rust implementation** in `rust/server/src/socket/`. Future implementers should verify all entry points against the live Rust source before building new features.
