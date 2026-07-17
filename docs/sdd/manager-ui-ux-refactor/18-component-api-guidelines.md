# 18 — Component API Guidelines

Binding rules for the shared manager/UI components. Follow the existing `Button.tsx` as the reference implementation.

## Naming
- PascalCase component + file (`Checkbox.tsx`). Semantic, not stylistic (`SearchField`, not `RoundedInput`).
- Variants are string unions, never boolean soup: `variant="primary|secondary|tertiary|destructive"`, `size="sm|md|lg"`. **No** `<Button purple compact flat outlined/>`.

## Props
- Small, typed, minimal. Extend the native element props where sensible: `interface Props extends ComponentProps<"input"> { … }` so `value/onChange/disabled/aria-*` pass through.
- Forward `className` via `clsx`/`twMerge` for one-off spacing only — NOT as a substitute for a variant. Recurring looks become a variant.
- Provide accessible defaults: inputs require `id`+`<label htmlFor>` OR `aria-label`; icon buttons require `aria-label` at the call site.

## Variants / states
- Every interactive primitive defines hover / active / focus-visible (D7) / disabled; inputs add error (`aria-invalid`) + read-only; async adds loading.
- Bind every value to a `design.md` token (`bg-[var(--surface)]`, `rounded-[var(--radius-theme)]`). **No raw hex, no `text-white` on colored fills** (except the documented violet/podium carve-outs), no `backdrop-filter`, no glass.

## Composition
- Primitives compose into composed components (FormField = Label+Input+error; ConfirmDialog = DialogPanel+Button). Composed components carry **no** domain logic, data-fetching, or permission checks — those live in feature components + hooks.
- Prefer composition over config flags. Extract only with ≥2 real uses / genuine repeated pattern (YAGNI). Avoid God components + deep prop chains.

## Events / a11y
- Native event names (`onChange`, `onClick`). Keyboard-operable; visible focus; `role`/`aria-*` correct (tabs `role="tab"`+`aria-selected`, menus Radix, dialogs `aria-labelledby`). 44px touch targets.

## Tests
- Each new primitive ships one render/behaviour test (renders, disabled blocks interaction, onChange fires, focus-visible class present). No framework sprawl (vitest + testing-library, as existing).

## Exports
- Export from the barrel (`components/ui/index.ts` or `components/`); no circular re-exports. Remove unused variants/exports.
