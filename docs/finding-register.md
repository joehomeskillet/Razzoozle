# Finding Register

This register tracks all known findings (bugs, gaps, regressions) discovered during development, with status tracking and evidence.

Format: Machine-readable table. Status values: `open` (unresolved), `in-progress` (under fix), `fixed` (resolved and merged), `deferred` (accepted but scheduled), `won't-fix` (intentional design choice).

---

## Registry

| ID | Finding | Component | Status | Severity | Issue | Discovered | Notes |
|----|---------|-----------|--------|----------|-------|------------|-------|
| F001 | Auth: negative auth card for non-existent user | Manager UI / Auth | open | P2 | #815 | 2026-07-29 | Spec promised negative card display for failed login; UI shows generic error instead of specific "user not found" card. Blocked by issue #815 triage. |
| F002 | update_student endpoint deletes surname | Rust server / DB | open | P1 | #818 | 2026-07-29 | POST /api/assignment/:id/update-student inadvertently clears the student `lastname` field to NULL when called with only `firstname`. Root cause: query builder applies zero/empty default instead of conditional update. |
| F003 | Orphan student deletion promised but unimplemented | Rust server / Logic | open | P2 | #819 | 2026-07-29 | Admin spec promised automatic cleanup of students when class is deleted or students are unassigned. No handler exists; orphaned student records accumulate in DB. |
| F004 | Protocol bindings out of date | rust/protocol | open | P3 | — | 2026-07-25 | Rust protocol changes in `rust/protocol/src/` are occasionally committed without regenerating `rust/protocol/bindings/`. Client fallback to hand-synced Zod validators masks the drift temporarily. Mitigation: ts-rs regeneration is now in pre-commit reminder. |
| F005 | Untyped socket payloads (class/label/user events) | Rust server / Protocol | open | P3 | — | 2026-07-20 | Some socket events (class_created, label_updated, user_admin_changed) parse payloads via ad-hoc `serde_json::Value` instead of typed protocol structs. Created gap in type safety. |
| F006 | Solo game identity unbound to student record | Game logic | open | P3 | — | 2026-07-18 | Solo play accepts free-text name with no identity binding to student roster. Cannot track attempts per student in solo mode; class-mode per-student tracking is unfinished. |
| F007 | In-memory game state: clustering not supported | Rust server / State | open | P3 | — | 2026-07-10 | Game registry is in-process HashMap with 5s disk snapshots. Multi-instance deployments would lose active games if server dies. Shared snapshot store (Redis, S3) is not implemented. |

---

## Closed Findings

| ID | Finding | Status | Resolved In | Notes |
|----|---------|--------|-------------|-------|
| F-legacy-1 | Old Node socket package referenced in docs | fixed | 2026-05-01 | Removed references to deleted `packages/socket`; updated `docs/architecture/README.md` to clarify Rust-only backend. |
| F-legacy-2 | Socket.io sid not auto-joining rooms | fixed | 2026-06-15 | socketioxide requires explicit `io.to(room).emit()` after client JOIN; now documented in `docs/architecture/README.md` §Communication Patterns. |

---

## Triage Guidelines

### Severity Levels

- **P1 (Critical):** Data loss, auth bypass, or breaking change affecting >50% of users
- **P2 (High):** Feature regression, incorrect behavior under specific conditions, affecting <50% of users
- **P3 (Medium):** Design gap, incomplete feature, or technical debt that doesn't block users
- **P4 (Low):** Documentation gap, minor UX inconsistency, or future-proofing

### Status Transitions

```
open → in-progress  [when developer assigned or PR created]
in-progress → fixed [when merged to main]
in-progress → deferred [if deprioritized; document reason]
open → won't-fix [if intentional design choice; document rationale]
```

---

## How to Use This Register

1. **Discover:** When you encounter a gap, bug, or regression, add a row with:
   - Unique ID (`F###`)
   - Clear description (what's missing or wrong)
   - Component (which crate, file, or subsystem)
   - Status (default: `open`)
   - Severity (P1–P4)
   - Issue link (Gitea issue number, if created; otherwise `—`)
   - Discovered date (YYYY-MM-DD)
   - Notes (context, reproduction steps, or workaround)

2. **Triage:** During backlog refinement, review open findings and prioritize by severity + impact. Move high-utility fixes to the current sprint.

3. **Close:** When a PR fixes a finding, update the status to `fixed`, add the commit SHA, and move the row to "Closed Findings".

4. **Search:** Use `grep` to find findings by component:
   ```bash
   grep "Rust server" docs/finding-register.md
   grep "Status" docs/finding-register.md | grep open
   ```

---

## Why This Register?

Findings discovered during active development often get lost if they're filed as stale issues or documented in scattered comments. A central, machine-readable register ensures:
- No findings vanish between sprints
- Severity and status are visible at a glance
- Developers can batch-fix related findings
- Post-mortem analysis is possible ("which findings were open for >6 months?")
