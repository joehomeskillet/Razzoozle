# SDD: P6 ConfigUsers Structural Tail Extraction

Status: Draft / Approved Specification
Parent Issue: [#191](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/191)
Child WP: `wp-7d83b3bec100` (Issue #437)
Primary File: `docs/planning/p6-users-structural-tail-sdd.md`
Target Monolith: `packages/web/src/features/manager/configurations/ConfigUsers.tsx` (948 LOC)

---

## 1. Problem & Architecture Overview

`ConfigUsers.tsx` currently contains 948 lines of TypeScript React code mixing REST API communication, complex state management (load/create/copy/toggle/reset/delete), bulk operations, filtering, table row rendering, dialog management, and security invariants (self-delete protection, last-admin protection, lehrkraft-cascade warnings).

This SDD defines a strict, behavior-preserving, collision-safe structural decomposition that extracts single-responsibility modules without altering DOM structure, copy, test IDs, security guards, or visual appearance.

The parent `ConfigUsers.tsx` will be reduced from 948 LOC to an orchestration-only component of approximately 250–300 LOC.

---

## 2. Structural Target Architecture & Module Split

The 948-line monolith is split into the following modular files under `packages/web/src/features/manager/configurations/users/`:

```
packages/web/src/features/manager/configurations/
├── ConfigUsers.tsx                          # Orchestration parent (~250-300 LOC)
└── users/
    ├── userManagementApi.ts                 # Pure REST API functions (`fetchWithAuth`)
    ├── userManagementApi.test.ts            # Focused API unit tests
    ├── useUserBulkActions.ts                # Bulk actions hook & orchestration
    ├── useUserCrudActions.ts                # Single-user CRUD state & handlers
    ├── UserFilterPanel.tsx                  # Search & role/status filter controls
    ├── UserManagementRow.tsx                # Single user table row & action buttons
    ├── UserManagementList.tsx               # Table container, select-all & empty state
    ├── ResetPasswordDialog.tsx              # Password reset modal dialog
    ├── UserFormFields.tsx                   # Username, password & role inputs
    └── CreateUserDialog.tsx                 # Create & copy user modal dialog
```

---

## 3. Security & Domain Invariants

Every extracted module MUST strictly preserve the following invariant rules:

1. **Self-User Identification**:
   - Self-detection is strictly performed via exact username match (`user.username === currentUsername`).
   - Copying, toggling active status, and deleting are strictly DISABLED for self-user, reinforced by both UI disabled attributes and handler guard statements.
   - Resetting password for self-user remains permitted.

2. **Last-Admin Protection**:
   - Server-authoritative last-admin protection is preserved. The UI displays appropriate toasts/errors returned by backend API responses.

3. **Lehrkraft-Cascade Warning**:
   - Warning banner/toast for `lehrkraft` role assignment and cascade deletion remains intact.

4. **Stable Test IDs**:
   - `users-search`: Search input field.
   - `users-select-all`: Select-all checkbox.
   - `user-select-${id}`: Individual user selection checkbox.
   - `user-create-btn`: Create user action button.

5. **Stability of Parent Exports**:
   - Default exports in `configurations/index.tsx` and `ConfigDev.tsx` remain unchanged.

---

## 4. Micro-WP Execution DAG

| Step / WP | Target File(s) | Responsibilities & Acceptance Criteria |
| --- | --- | --- |
| **191-U-SDD** | `docs/planning/p6-users-structural-tail-sdd.md` | Freeze extraction architecture, security invariants, and micro-WP registry. |
| **API RED + Impl** | `userManagementApi.ts` & test | Extract `/api/manager/users` REST calls (`fetchWithAuth`, error handling). |
| **Bulk Hook** | `useUserBulkActions.ts` & test | Bulk toggle active, bulk delete, bulk reset password state & notifications. |
| **CRUD Hook** | `useUserCrudActions.ts` & test | Single user CRUD state, load/create/copy/toggle/reset/delete handlers. |
| **Filter Panel** | `UserFilterPanel.tsx` | Search, role, and active status filter control panel UI. |
| **User Row** | `UserManagementRow.tsx` | Single user row rendering, action buttons, self-delete guard. |
| **User List** | `UserManagementList.tsx` | User table list container, select-all header, empty state. |
| **Reset Dialog** | `ResetPasswordDialog.tsx` | Password reset modal dialog UI and submission handler. |
| **Form Fields** | `UserFormFields.tsx` | Reusable form fields for username, password, and role selection. |
| **Create Dialog** | `CreateUserDialog.tsx` | Create/copy user modal dialog UI using `UserFormFields`. |
| **Parent Wiring** | `ConfigUsers.tsx` | Refactor `ConfigUsers.tsx` to orchestrate submodules (~250-300 LOC). |
| **Verification** | Operational / Browser QA | Validate create, copy, reset, toggle, filter, bulk, self-guard, and error flows. |

---

## 5. Generator & Test Strategy

1. **Component Generators**:
   - UI sub-components (`UserFilterPanel`, `UserManagementRow`, `UserManagementList`, `ResetPasswordDialog`, `UserFormFields`, `CreateUserDialog`) must be scaffolded using `pnpm g:console <Name>`.
   - Scaffold WPs must run in an isolated worktree to prevent generator artifacts from polluting unrelated files.

2. **Test Strategy**:
   - Pure API and hook helpers are tested with unit tests (`userManagementApi.test.ts`).
   - Component rendering is verified using static JSX/SSR markup rendering and Stagehand browser tests without introducing unapproved jsdom dependencies.

---

## 6. Stop Conditions

Execution must stop and the SDD be revised if:
- `ConfigUsers.tsx` cannot reach the 250–300 LOC target without a catch-all extraction.
- A single WP diff exceeds 150 LOC (except designated wiring carves).
- Visible behavior, DOM hierarchy, test IDs, or copy drift from `main`.
