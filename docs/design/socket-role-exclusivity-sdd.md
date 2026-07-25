# Security SDD: Socket-Role Exclusivity & Same-Tab Role Transition

Status: Draft / Approved Security Architecture
Parent Issue: [#281](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/281)
Child WP: `wp-c21a3b35a9be` (Issue #439)
Primary File: `docs/design/socket-role-exclusivity-sdd.md`

---

## 1. Executive Security Architecture

In Razzoozle (both Node/socket.io and Rust socketioxide backends), a connected socket MUST have exactly ONE verified role bound to its `SocketId` at any point in time.

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
   - `SocketId` to `VerifiedRole` is stored in a thread-safe / atomic session map (`SOCKET_ROLE_REGISTRY`).
   - A socket cannot simultaneously hold multiple roles.

2. **Atomic Role Transition & Rollback**:
   - When a socket attempts to switch roles or authenticate (e.g. `Unauthenticated` -> `Manager`), the server validates credentials *before* mutating the registry.
   - If verification fails, the transition is aborted, the registry state rolls back atomically, and an error ack `401 Unauthorized` or `403 Forbidden` is returned.
   - If a socket is already bound to `Player` and attempts to claim `Manager` without disconnecting/re-authing, the server denies the request.

3. **Room & Listener Ownership**:
   - Sockets only join role-restricted Socket.IO rooms (`room:manager`, `room:player:${pin}`, `room:display:${pin}`) *after* verified role assignment.
   - On disconnect or role reset, the socket is removed from all role-restricted rooms.

---

## 3. HandlerCtx Security Policy & Guards

Every socket event handler (in `packages/socket/src/handlers/` and `rust/server/src/socket/`) receives a context wrapper `HandlerCtx`:

```typescript
export interface HandlerCtx {
  socketId: string;
  verifiedRole: VerifiedRole;
  currentPin?: string;
  userId?: string;
  capabilities: Set<string>;
}

export function enforceRole(ctx: HandlerCtx, requiredRole: VerifiedRole): void {
  if (ctx.verifiedRole !== requiredRole) {
    throw new SecurityError(`Access denied: required ${requiredRole}, got ${ctx.verifiedRole}`);
  }
}
```

---

## 4. Satellite Control & Display Pairing Rules

1. **`satellite_manager_control` Capability**:
   - `satellite_manager_control` is a session *capability flag* granted to an authenticated `Manager` session operating from a secondary device (e.g. mobile host controller).
   - It is NOT a distinct socket role. Satellite controllers maintain the `Manager` role.

2. **Kiosk Display Pairing**:
   - Display pairing relies on code verification via `PAIRING_REGISTRY`.
   - Display sockets are assigned the `Display` role and joined exclusively to display broadcast channels.

---

## 5. Compatibility & Verification Requirements

- **Raw Socket Clients & E2E Tests**:
  - Raw WebSocket clients, Playwright E2E suites, and MCP test helpers must adhere to the formal authentication sequence (`auth:login` or `game:join` before emitting privileged domain events).
- **Rust Engine Parity**:
  - Rust `socketioxide` event handlers (`rust/server/src/socket/`) implement identical `VerifiedRole` checking via socket extension state (`SocketData`).

---

## 6. Stop Conditions

Do not proceed with code implementation if:
- Role verification can be bypassed via raw event payloads.
- Atomic rollback fails to clear room subscriptions on authentication rejection.
- Raw client or E2E test flows break during transition.
