# Design Specification: Socket Role Transition UI States

Status: Approved Design Specification
Parent Issue: [#281](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/281)
Child WP: `wp-4de90a550062` (Issue #440)
Primary File: `docs/design/socket-role-transition-states.md`
Predecessor: `docs/design/socket-role-exclusivity-sdd.md` (`wp-c21a3b35a9be`)

---

## 1. Overview & Purpose

This design specification defines the visible user interface states, feedback indicators, accessible announcements, and transition flows across client surfaces (Manager Console, Player Mobile, Kiosk Display, Satellite Controller) during Socket.IO role verification and transitions.

It strictly adheres to the security boundaries established in `socket-role-exclusivity-sdd.md`:
- `VerifiedRole`: `Unauthenticated`, `Manager`, `Player`, `Display`.
- `satellite_manager_control`: Session capability flag, not a distinct socket role.
- Kiosk pairing: Derived from `PAIRING_REGISTRY`.

---

## 2. State Inventory & UI Feedback Specifications

```
                       ┌─────────────────────────┐
                       │   1. INITIALIZING       │
                       └────────────┬────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │   2. TRANSITIONING      │
                       └──────┬───────────┬──────┘
                              │           │
                     Success  │           │ Denied / Error
                              ▼           ▼
             ┌──────────────────┐       ┌──────────────────┐
             │ 3. VERIFIED      │       │ 4. ACCESS DENIED │
             │    SUCCESS       │       │    (ROLLBACK)    │
             └────────┬─────────┘       └──────────────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ 5. RECONNECTING  │
             └──────────────────┘
```

### 2.1 State 1: Initializing
- **Trigger**: Socket connection established; pending role authentication or join payload emission.
- **UI Element**: Micro-spinner or skeleton pulsing loader (`bg-surface-2 animate-pulse`).
- **Test ID**: `role-state-initializing`
- **ARIA**: `aria-busy="true"`

### 2.2 State 2: Transitioning
- **Trigger**: Emitted `auth:login`, `game:join`, or `display:pair`; server processing verification.
- **UI Element**: Loading indicator with localized status text: `t("quizz:socket.authenticating")`.
- **Test ID**: `role-state-transitioning`
- **ARIA**: `aria-live="polite"`

### 2.3 State 3: Verified Success
- **Trigger**: Server confirms role binding (`Manager`, `Player`, or `Display`).
- **UI Element**: Subtle status badge (`bg-status-online-bg text-ink`), toast notification.
- **Test ID**: `role-state-success`
- **ARIA**: `aria-live="polite"` announcement: "Role verified successfully".

### 2.4 State 4: Access Denied / Atomic Rollback
- **Trigger**: Verification rejected (invalid token, PIN, or role mismatch). Server returns 401/403 ack.
- **UI Element**: Red alert banner (`bg-[var(--state-wrong)] text-answer-text`), error toast notification.
- **Test ID**: `role-state-denied`
- **ARIA**: `aria-live="assertive"` announcement: "Access denied. Role transition aborted."
- **Focus**: Focus moves automatically to primary retry action or login input.

### 2.5 State 5: Reconnecting
- **Trigger**: Socket connection lost; socket.io auto-reconnecting.
- **UI Element**: Banner overlay `t("quizz:socket.reconnecting")` (`bg-brand-primary text-white`).
- **Test ID**: `role-state-reconnecting`
- **ARIA**: `aria-live="assertive"`

### 2.6 State 6: Cleanup Failed
- **Trigger**: Disconnect or unmount failed to detach event listeners cleanly.
- **UI Element**: Console log + silent fallback toast `t("quizz:socket.cleanupWarning")`.
- **Test ID**: `role-state-cleanup-failed`

---

## 3. Viewport & Responsive Specifications

| Surface | Target Resolution (Logical PX) | Key Layout Rule |
| --- | --- | --- |
| **Player Mobile (Small)** | 375 × 667 (iPhone 8) | Single-column status banner, 44px min tap target. |
| **Player Mobile (Standard)** | 390 × 844 (iPhone 13) | Standard mobile toast spacing. |
| **Player Mobile (Large)** | 440 × 956 (iPhone 17 Pro Max) | Expanded card layout. |
| **Kiosk Display (FHD)** | 1920 × 1080 | Top-right status pill badge, high contrast. |
| **Kiosk Display (4K)** | 3840 × 2160 | Scaled 2x badge text. |

---

## 4. Accessibility & Token Governance

- **Color Tokens**: Only mapped Tailwind v4 semantic utility classes (`bg-brand-primary`, `bg-surface-2`, `text-ink`, `bg-status-online-bg`, `text-answer-text`). No hardcoded hex values.
- **Touch Targets**: All interactive retry/login buttons must be at least 44×44px.
- **Reduced Motion**: All transition animations respect `prefers-reduced-motion` via `motion-reduce:transition-none`.
- **Locales**: Localized strings present across all 6 supported locales (`de`, `en`, `es`, `fr`, `it`, `zh`).

---

## 5. Non-Goals

- No production TypeScript or Rust code in this design contract.
- No network protocol or payload modifications.
