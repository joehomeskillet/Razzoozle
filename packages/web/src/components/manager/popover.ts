// D23 popover canon (docs/design/w7-manager-perfection-sdd.md §4) — one shared
// Radix Select.Content/Item pair for every label/class-assignment popover.
// Content uses the primary-surface radius + the single shadow rung (D9/D5);
// items carry the D7 focus-visible formula + D8 44px touch target
// (counter-proof: QuizzList.tsx Select.Item already had the focus ring but
// still missed min-h-11 — see SDD C106).
export const popoverContentClass =
  "rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] shadow-[var(--shadow-flat)]"

export const popoverItemClass =
  "flex min-h-11 cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm text-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] hover:bg-[var(--surface-3)] focus:bg-[var(--surface-3)]"
