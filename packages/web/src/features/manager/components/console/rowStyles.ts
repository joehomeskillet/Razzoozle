/**
 * Row Shell & State Classes — Unified Row System
 *
 * Centralized Tailwind class constants for all Manager console rows (ListRow, SelectableRow, SubmissionCard).
 * rowShellBase carries only Chrome (radius, outline, transition), not layout axis.
 * Each component applies its own flex direction & alignment:
 *   - ListRow: flex flex-col
 *   - SelectableRow: flex min-h-11 w-full items-center gap-3 text-left
 *
 * **State-Farben EXKLUSIV branchen:** Tailwind v4 ordert base-Utilities im Build unabhängig von clsx-Reihenfolge.
 * Daher nie additiv stacken: `selected ? rowSelectedState : rowRestState` (nicht beide gleichzeitig).
 * ADR: rowstyles-zustandsfarben-exklusiv-statt-additiv
 *
 * Ref: SDD docs/specs/manager-row-system.md §3.1 (R13)
 */

export type ListRowDensity = "compact" | "default"

export const rowShellBase = "rounded-[var(--radius-theme)] outline-2 -outline-offset-2 transition-colors"
export const rowRestState = "bg-[var(--surface)] outline-[var(--line)]"
export const rowShellDensity: Record<ListRowDensity, string> = { default: "p-4", compact: "px-4 py-2" }
export const rowHoverState = "hover:bg-[var(--accent-tint)] hover:outline-[var(--color-primary)]"
export const rowSelectedState = "bg-[var(--accent-tint)] outline-[var(--color-primary)]"
export const rowDisabledState = "opacity-60"
export const rowFocusState = "focus-visible:outline-[var(--color-primary)] focus-visible:outline-offset-2"
export const rowBodyFocusState = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]"
export const rowTitleClass = "truncate text-sm leading-5 font-semibold text-[var(--ink)]"
export const rowMetaClass = "text-xs leading-4 font-normal text-[var(--ink-subtle)]"
export const rowLeadingClass = "flex shrink-0 items-center text-[var(--ink-muted)]"
export const rowActionGroupClass = "flex shrink-0 items-center gap-1"
export const rowActionBase = "shrink-0 text-[var(--ink-faint)]"
export const rowActionHover = "hover:bg-[var(--accent-tint)] hover:text-[var(--accent-contrast)]"
export const rowActionDestructiveHover = "hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)]"
