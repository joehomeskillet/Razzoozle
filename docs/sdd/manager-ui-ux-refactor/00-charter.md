# 00 — Charter: Manager UI/UX Refactor (Cream-only + Profile-Header)

**Date:** 2026-07-17 · **Owner:** Orchestrator (Opus) · **Branch:** `refactor/manager-ui-ux-design-system`
**Reference:** https://rust.razzoozle.xyz/manager/config (read-only)

## Auftrag

Finish the genuinely-remaining Manager UI/UX deltas and document them as a focused
SDD. This pass is **scoped by a ground-truth audit**, not by the original brief's
(stale) premise that a live Glass theme still governs the manager.

## Ground truth (audit result — see `01-current-state.md`)

The original brief assumed a live Glass/Liquid-Glass theme on the manager console
that needs a full rip-out + 16-doc SDD. The repo says otherwise:

| Brief objective | Actual state |
|---|---|
| Remove Glass theme | **Already inert** — `apply.ts` hard-forces `data-theme-style="flat"`; the user-facing toggle was already removed; the 62-line `[data-theme-style="glass"]` CSS + `.glass*` utilities have **zero live consumers** |
| Old glass prefs → Cream, no flicker | **Already satisfied** — flat is forced regardless of persisted `style:"glass"` |
| Manager = single Cream design, token-clean | **Already shipped** (#86, 2026-07-16: token-clean, CI-hard) |
| Reusable Cream tokens/primitives | **Already exist** — Button/Badge/EmptyState/ListRow/ActionFooter/ConsoleShell |
| Move "Mein Profil" nav → header | **NOT done** (this pass) |
| Deep glass plumbing removal | **NOT done** (this pass) |

## Scope (this pass)

1. **Profile relocation** — remove `profile` from the left-nav `system` group; add a
   Profile button in the header, immediately left of Logout. Route + component unchanged.
2. **Deep glass removal** — delete the dead `[data-theme-style="glass"]` CSS and strip
   the `style` field from the theme contract end-to-end (validator → type → apply →
   skeleton engine), preserving backward-compat and the skeleton-author contract.
3. **Residual dup/token gaps** — only concrete High/Medium findings the audit surfaces;
   no cosmetic mass changes (YAGNI).
4. **Lean SDD** — this doc set + Grok/Codex cross-review of the actual plan and diffs.

## Non-Goals (explicit)

- **No** re-audit / re-documentation of already-shipped #86 work.
- **No** removal of the per-game **skeleton theme engine** (uploaded-ZIP theming is a
  core product feature). Only the `glass` *style variant* leaves; `flat` stays the
  single emitted style.
- **No** changes to public game/presenter/player *behaviour* (only dead glass CSS the
  game never rendered, plus stale comments).
- **No** new UI library, no new dependency, no Tailwind v3 config.
- **No** full 5-viewport screenshot baseline of all 18 sections (mostly-shipped surface);
  targeted before/after verification of the changed surfaces instead.

## Regeln

- Orchestrator writes docs (`.md`); all product code goes to CLI-lane workers in
  worktrees; orchestrator merges after cross-vendor review + gates.
- No prod-data writes on the reference instance. No secrets in docs/commits.
- Backward-compat one-liner required on the theme-contract change.
- `pnpm verify` (typecheck+lint+tests) + `check-manager-tokens.sh` are merge gates.
