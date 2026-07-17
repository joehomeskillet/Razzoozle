# 17 — Element Design Matrix (binding cream spec)

**Date:** 2026-07-17 · Source: Grok element audit (verified). Single source of truth per element; all bound to `design.md` tokens (never raw hex). D7 focus = `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]` (white ring on violet fills).

## Verified inconsistencies to fix
- **F1/F3 (CRITICAL):** `Input.tsx:23` + `ConfigUsers:627` select + `ConfigKlassen:271` input use `focus-visible:border-… outline-none` (border-only) → must be D7 outline. `SelectableRow:43` missing `outline-2`. **Verified in source.**
- **F5 (MAJOR):** `ConfigUsers:469,552` close buttons have **no focus ring**. **Verified.**
- **F4 (MAJOR):** status colors hardcoded; `--status-{online,offline,pending}-{bg,text}` tokens exist (`console/tokens.css:19-33`, AA-verified) — use them.
- **F2 (radius):** manager: radius-theme ×72, rounded-lg ×63, rounded-md ×14, rounded-xl ×7. Eliminate md/xl (non-spec). See plan Decision B (conservative).

## Binding target specs (Tailwind class lists)

**Primary Button** — `inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[var(--radius-theme)] bg-[var(--color-primary)] text-white shadow-[var(--shadow-flat)] hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60 font-semibold transition-colors` · 44px.

**Text Input** — `w-full min-h-11 px-4 py-3 rounded-[var(--radius-theme)] bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] placeholder-[var(--ink-faint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-60` · error → `aria-invalid` + adjacent message · `<label htmlFor>` or `aria-label`.

**Select (native)** — `min-h-11 w-full sm:w-auto px-3 py-2 rounded-[var(--radius-theme)] bg-[var(--surface)] text-[var(--ink)] border border-[var(--border-hairline)] font-semibold` + D7 focus + disabled.

**Icon Button** — `size-11 rounded-lg p-0 text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-medium)]` + D7 focus + `aria-label` at call site. Destructive: `hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]`.

**Close Button** — `flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--ink-faint)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-medium)]` + D7 focus + `aria-label={t("common:close")}`.

**Status Badge** — `inline-flex items-center gap-2 rounded-lg px-3 py-1 text-sm font-semibold bg-[var(--status-<state>-bg)] text-[var(--status-<state>-text)]` · states online/offline/pending · **icon + text always (never color-only)**.

**Checkbox / Radio** — native input, 44px label hit-target (`flex items-center gap-3 min-h-11`), D7 focus, `size-5`, label linked.

**Card/Panel** — `rounded-[var(--radius-theme)] bg-[var(--surface)] border border-[var(--line)] shadow-[var(--shadow-flat)] px-4 py-3` · interactive adds hover `bg-[var(--surface-2)]` + selected outline.

**Dialog** — Radix (DialogPanel): scrim `fixed inset-0 bg-black/40`; panel `rounded-[var(--radius-theme)] bg-[var(--surface)] border border-[var(--border-hairline)] shadow-lg`; `aria-labelledby` title; Radix handles focus-trap/ESC/return.

**NavItem** — active `bg-[var(--accent-tint)] text-[var(--accent-contrast)]` + accent marker; `role="tab"` + `aria-selected`; roving tabindex; 44px.

## A11y / responsive baselines
44px touch targets; D7 focus on every interactive; contrast AA (verified table); ListRow title `min-w-0 flex-1 truncate` (D13); mobile nav D12 grouping; native inputs full-width on mobile. `prefers-reduced-motion` honored (existing).
