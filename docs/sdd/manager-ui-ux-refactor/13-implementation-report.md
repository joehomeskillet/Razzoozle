# 13 — Implementation Report

**Date:** 2026-07-17 · **Base:** `d3e362da9` (SDD docs) · **Result:** +77 / −240 across 19 files.

## What shipped

### Deep glass removal (WP-A, WP-B, WP-D + reviewer-fixes)
- **`style` field removed from the theme contract** — `validators/theme.ts` (enum dropped),
  `types/theme.ts` (DEFAULT_THEME), so `Theme = z.infer<validator>` no longer has `.style`.
- **Dead `[data-theme-style="glass"]` CSS block deleted** — `index.css` −137 lines
  (frost tokens, `.glass*` utilities, `@supports`/reduced-motion fallbacks). `.cb-blob` kept.
- **Skeleton engine de-glassed** — `skeleton-demo.ts`/`skeleton-doc.ts` emit a **constant**
  `data-theme-style="flat"` (no `theme.style` read), glass treatment blocks + glass doc
  bullets removed, styleless `.glass` demo class dropped.
- **`apply.ts`** keeps a **constant** `data-theme-style="flat"` on `<html>` (reviewer-fix —
  see below), so the documented `[data-theme-style="flat"]` author hook stays live.
- **Dead i18n removed** — `manager.theme.style` (label/flat/glass) picker labels pruned from
  all 6 locales (parity-preserving; `locale-sync check` clean).
- **Stale comments** de-glassed in AnswerButton/CircularTimer/RoundRecapCard.
- **Back-compat:** old `theme.json` with `style:"glass"` parses (zod strip) → renders flat;
  covered by `packages/common/src/validators/theme.test.ts` (2 back-compat tests, green).

### Profile → header (WP-C)
- `profile` excluded from the left-nav array + removed from `ConsoleShell` system `NAV_GROUPS`.
- Header **Profile `<Button variant="ghost" size="icon">`** inserted **before** Logout: `User`
  icon, `title`+`aria-label`=`manager:tabs.profile` (all 6 locales), visual active highlight
  `bg-[var(--accent-tint)]` when `active.key==="profile"`, `onClick={()=>onSelect("profile")}`.
  No `aria-current` (Grok R1). `profile` kept in BUILTIN_TABS so ConfigProfile still resolves.
  Logout untouched.

### design.md
- §1 + §6 rewritten from "gated glass, leave inert" → "glass fully removed, flat only"; drift-table
  rows updated. §6 keeps its number (cross-refs stable).

## Commits (base..HEAD)
| SHA | Commit |
|---|---|
| 293bdc6ef | refactor(manager): remove glass theme 'style' field end-to-end (WP-A) |
| 7368e1227 | refactor(manager): delete dead glass CSS block from index.css (WP-B) |
| 215cedee4 | fix(manager): move profile action from nav to header, left of logout (WP-C) |
| 8973393c7 | docs(game): drop stale glass-theme mentions in component comments (WP-D) |
| 339cca682 | fix(theme): keep constant data-theme-style="flat" on <html> (reviewer-fix) |
| e5272f230 | test(theme): narrow safeParse result before .data access (reviewer-fix) |
| f9f26e102 | chore(cleanup): drop orphaned resolveIcon + dead test locals + glass residue |
| 8ddd6a4a6 | chore(i18n): remove dead theme.style picker labels from 6 locales |
| 5ad976bbd | test(theme): drop 2 speculative minimal-theme tests (reviewer-fix) |
| (docs) | design.md glass-removal update + this report |

## Reviewer-fixes (found during integration verify)
1. **apply.ts constant flat** — WP-A dropped the `data-theme-style` write while the skeleton
   doc/demo still advertise/emit `flat`; restored the constant for live/demo/doc consistency.
2. **theme.test.ts narrowing** — `safeParse` result needs `if (!result.success) return` before
   `.data` (tsc TS18048).
3. **Orphaned `resolveIcon`** — pre-existing dead function in manager `index.tsx` (+ its
   `lucideIcons` import) exposed when WP-C's touch invalidated the `tsc -b` cache. Removed.
4. **GameWrapper.test.tsx dead locals** — pre-existing `handleStatusChange`/`timeoutId` unused
   in the first test (stale-cache-masked). Removed.
5. **2 speculative theme tests** — WP-A over-added "minimal theme" tests with a wrong
   required-field assumption (failed at runtime). Removed; the 4 contract tests stay green.

## Gates
| Gate | Result |
|---|---|
| `pnpm -r run types` | **PASS** (exit 0) after reviewer-fixes |
| oxlint (scoped to changed files) | **PASS** (0 findings) |
| unit tests (`packages/common`) | **PASS** (21/21; theme.test 4/4) |
| `check-manager-tokens.sh` | **PASS** (0 findings) |
| `locale-sync check` | parity clean (only pre-existing auth.*/profile.* WARNs) |
| design guardrail #1 (`grep backdrop-filter/blur`) | **CLEAN** (0 in web src) |
| cross-vendor diff review (Gemini) | see `14-final-review.md` |
| browser verify (profile move) | see `14-final-review.md` |

## Pre-existing issues surfaced (NOT introduced here; out of scope)
Full `pnpm verify` remains red on **pre-existing** lint debt in files untouched by this change:
`e2e/stagehand/*.spec.ts` (dozens of `@stylistic(semi)`, plus TS2339/unbound-method),
`ConfigUsers.tsx`, `pages/manager/config.tsx`, `game/stores/manager.test.ts`, `scripts/locale-sync.mjs`.
These were masked by a stale `tsc -b` incremental cache and are unrelated to glass/profile.
**Recommended follow-up:** a separate lint-debt cleanup pass. This work's own files are clean.
