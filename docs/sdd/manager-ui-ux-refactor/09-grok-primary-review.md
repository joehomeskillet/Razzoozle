# 09 — Grok Primary Review (UX / Accessibility)

**Lane:** grok-build (read-only) · **Date:** 2026-07-17 · **Scope:** profile → header relocation (WP-C)

## Passing
- **Icon:** `User` (already imported `configurations/index.tsx:53`) — mirrors nav rail profile icon.
- **Sizing/touch:** `size="icon"` → 44px square, matches Logout (WCAG 2.5.5).
- **Focus ring:** Button primitive supplies D7 focus formula.
- **i18n:** `manager:tabs.profile` present in all 6 locales.
- **Nav IA:** System group → 6 items after removal; no collapse/regression.
- **Roving tablist:** arrow-key nav unaffected; profile leaving the tablist is semantically fine.
- **Responsive:** header `flex-wrap` tolerates a 3rd action; acceptable wrap at narrow mobile.

## Refinements (folded into WP-C)
- **R1 — no `aria-current`.** `aria-current` marks the current page/route in a nav landmark, not
  an active UI shortcut. Use a **visual active highlight** instead: `bg-[var(--accent-tint)]` when
  `active.key === "profile"`, plus the standard `aria-label`. Mirrors active nav-row styling
  (design.md §8·B, `NavItem.tsx:58`).
- **R2 — active-state wiring.** Build the Profile button inside `ConsoleBody` where `active.key`
  and `onSelect` are already in scope; style it conditionally on `active.key === "profile"` and
  `onClick={() => onSelect("profile")}`. (No prop threading needed — original "blocker" is moot.)

## Regression analysis
System group stays visible (6 items); ConfigProfile still resolves when selected; DOM order
Profile-before-Logout gives correct left-to-right; Logout untouched.

## Verdict
**Safe to proceed** once R1 (drop aria-current, use visual highlight) + R2 (wire via `active.key`)
are in the spec. No Critical/blocking code issue; both are spec refinements, now incorporated.

`SECURITY-CHECK: PASS (read-only audit, no code)`
