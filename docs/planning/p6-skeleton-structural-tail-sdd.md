# SDD: P6 ConfigSkeleton Structural Tail Extraction

Status: Draft / Approved Specification
Parent Issue: [#191](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/191)
Child WP: `wp-cbb022ccf2d2` (Issue #438)
Primary File: `docs/planning/p6-skeleton-structural-tail-sdd.md`
Target Monolith: `packages/web/src/features/manager/configurations/ConfigSkeleton.tsx` (454 LOC)

---

## 1. Problem & Architecture Overview

`ConfigSkeleton.tsx` (454 LOC) manages skeleton theme drafts (CSS and JavaScript custom styles), 512-KiB payload byte checks, socket event lifecycle (`SET`/`RESET` theme events), and ZIP import/export transfers.

Currently, client-side ZIP transfer calls send raw `getClientId()` as an `X-Manager-Token` header, whereas the Rust backend expects DB session Bearer authentication. This SDD resolves the authentication contract and defines a safe, modular extraction into single-responsibility hooks while keeping parent `ConfigSkeleton.tsx` down to ~245–275 orchestration lines.

---

## 2. Authentication Contract Decision

- **Auth Resolution**: All skeleton import and export REST requests (`/api/manager/skeleton/export`, `/api/manager/skeleton/import`) MUST use the centralized `fetchWithAuth` helper from `@razzoozle/web/features/manager/api/client`.
- `fetchWithAuth` automatically handles Bearer authorization and `X-Manager-Token` header injection, ensuring full compatibility with both Node and Rust backend proxy targets (`/_rust/*`).
- Security invariant: Auth tokens must never be logged, saved to disk, or passed through transient component state.

---

## 3. Structural Target Architecture & Module Split

The monolith is split into modular files under `packages/web/src/features/manager/configurations/skeleton/`:

```
packages/web/src/features/manager/configurations/
├── ConfigSkeleton.tsx                       # Orchestration parent (~245-275 LOC)
└── skeleton/
    ├── useSkeletonDrafts.ts                 # Draft prefill, 512-KiB byte check, SET/RESET events & ack handlers
    ├── useSkeletonDrafts.test.ts            # Focused draft hook & byte-check unit tests
    ├── useSkeletonTransfer.ts               # ZIP import/export using fetchWithAuth, Object-URL & anchor cleanup
    └── useSkeletonTransfer.test.ts          # Focused transfer hook unit tests
```

---

## 4. Submodule Responsibilities

### 4.1 `useSkeletonDrafts.ts`
- **Scope**: Manages live draft text state for CSS and JS custom skeletons.
- **Payload Validation**: Enforces the 512-KiB (`512 * 1024` bytes) payload limit check before emitting theme update events.
- **Socket Events**: Listens for theme prefill events and emits `theme:skeleton:set` / `theme:skeleton:reset`. Handles ack/error callbacks and cleans up event listeners on unmount.

### 4.2 `useSkeletonTransfer.ts`
- **Scope**: Manages skeleton package import (ZIP upload) and export (ZIP download).
- **Network**: Calls backend import/export endpoints via `fetchWithAuth`.
- **Resource Cleanup**: Properly revokes created Blob Object URLs and cleans up temporary anchor elements after trigger download. Resets file input elements on completion or error.

### 4.3 `ConfigSkeleton.tsx` (Parent Orchestration)
- Orchestrates `useSkeletonDrafts` and `useSkeletonTransfer`.
- Renders the theme editor layout, textareas, stored-XSS confirmation dialogs, and import/export action buttons.
- Target size: ~245–275 LOC. Stable default export.

---

## 5. Micro-WP Execution DAG

| Step / WP | Target File(s) | Responsibilities & Acceptance Criteria |
| --- | --- | --- |
| **191-S-SDD** | `docs/planning/p6-skeleton-structural-tail-sdd.md` | Freeze auth decision, module boundaries, and micro-WP registry. |
| **Draft Hook & Tests** | `skeleton/useSkeletonDrafts.*` | RED/helper unit tests + hook for prefill, 512-KiB limit, SET/RESET events, and cleanup. |
| **Transfer Hook & Tests** | `skeleton/useSkeletonTransfer.*` | RED/helper unit tests + hook for `fetchWithAuth` import/export, Blob Object-URL cleanup. |
| **Parent Check** | `ConfigSkeleton.tsx` | Wire parent component; verify LOC reaches ~245–275 without behavior drift. |
| **Verification** | Operational / Browser QA | Test CSS/JS save & reset, ZIP import & export, stored-XSS warnings across Chrome/Firefox. |

---

## 6. Stop Conditions

Execution must stop and the SDD be revised if:
- Auth behavior between Node and Rust endpoints diverges.
- Parent component cannot reach ~245–275 LOC target without catch-all extraction.
- DOM structure, copy, test IDs, or stored-XSS confirmation behavior drifts.
