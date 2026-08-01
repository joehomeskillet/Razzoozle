import clsx from "clsx"
import {
  ChevronDown,
  Eye,
  Minus,
  Pause,
  Play,
  Plus,
  SkipForward,
} from "lucide-react"
import { Children, type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"
import type { CompactIconBarAction } from "./ActionFooter.compact.types"

/**
 * AF05 #1011 — typed zone primitives for ActionFooter.
 * Labels, compact fields, mobile disclosure. No sticky/layout chrome.
 */

export interface ActionFooterSummaryProps {
  /** Primary context line (quiz title, selection count, …). */
  title: ReactNode
  /** Secondary meta (question count, dirty bulk hint, …). */
  meta?: ReactNode
  className?: string
}

/** Context zone: selection / record identity. */
export function ActionFooterSummary({
  title,
  meta,
  className,
}: ActionFooterSummaryProps) {
  return (
    <div
      data-testid="action-footer-summary"
      className={clsx("min-w-0 flex-1 sm:mr-auto", className)}
    >
      <div className="text-ink truncate text-sm font-semibold">{title}</div>
      {meta != null && meta !== false && (
        <div className="text-ink-muted truncate text-xs">{meta}</div>
      )}
    </div>
  )
}

export interface ActionFooterFieldProps {
  /** Visible label — required for a11y (AF-11 / AF-13). */
  label: ReactNode
  /** Optional id linkage for the control. */
  htmlFor?: string
  /**
   * Field density.
   * `stacked` (default) — label above the control; current AF05 layout.
   * `inline` — label and control on one 44px-aligned row, visibly labelled
   *   (AF-11), `for`/`id` link preserved. Stable htmlFor/id association.
   *   Min-width safety + no horizontal scroll from the primitive itself.
   */
  density?: "stacked" | "inline"
  children: ReactNode
  className?: string
}

/** Compact labelled control for the Controls zone. */
export function ActionFooterField({
  label,
  htmlFor,
  density = "stacked",
  children,
  className,
}: ActionFooterFieldProps) {
  const autoId = useId()
  const labelId = `${autoId}-label`
  const isInline = density === "inline"
  return (
    <div
      data-testid="action-footer-field"
      data-density={density}
      className={clsx(
        "flex min-w-0",
        isInline ? "min-h-11 items-center gap-2" : "flex-col gap-1",
        className,
      )}
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-ink-muted text-xs font-medium">
          {label}
        </label>
      ) : (
        <span id={labelId} className="text-ink-muted text-xs font-medium">
          {label}
        </span>
      )}
      <div
        role="group"
        aria-labelledby={htmlFor ? undefined : labelId}
        className="min-h-11 min-w-0"
      >
        {children}
      </div>
    </div>
  )
}

export interface ActionFooterControlsProps {
  children: ReactNode
  className?: string
}

/** Flex wrap for compact footer controls (no horizontal page scroll). */
export function ActionFooterControls({
  children,
  className,
}: ActionFooterControlsProps) {
  return (
    <div
      data-testid="action-footer-controls"
      className={clsx("flex min-w-0 flex-wrap items-end gap-3", className)}
    >
      {children}
    </div>
  )
}

export interface ActionFooterActionsProps {
  /** At most two visible secondary actions (AF-05 / AF-06). */
  secondary?: ReactNode
  /** Overflow / ⋮ menu slot. */
  overflow?: ReactNode
  /** Exactly one primary — rendered last in DOM (AF-06). */
  primary?: ReactNode
  className?: string
}

/**
 * Action cluster: secondary → overflow → primary (DOM order = tab order).
 * Dev/test: warns if more than two secondary children.
 */
export function ActionFooterActions({
  secondary,
  overflow,
  primary,
  className,
}: ActionFooterActionsProps) {
  if (
    process.env.NODE_ENV !== "production" &&
    secondary != null &&
    Children.count(secondary) > 2
  ) {
    console.warn(
      "ActionFooterActions: at most two visible secondary actions (AF-05).",
    )
  }

  return (
    <div
      data-testid="action-footer-actions"
      className={clsx(
        "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3",
        className,
      )}
    >
      {secondary != null && (
        <div
          data-testid="action-footer-secondary"
          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
        >
          {secondary}
        </div>
      )}
      {overflow != null && (
        <div data-testid="action-footer-overflow">{overflow}</div>
      )}
      {primary != null && (
        <div data-testid="action-footer-primary" className="sm:order-none">
          {primary}
        </div>
      )}
    </div>
  )
}

export interface ActionFooterOptionsDisclosureProps {
  /** Visible summary label (mobile options). */
  label?: string
  /** Optional badge of changed/active options. */
  changedCount?: number
  /** Default closed on mobile (AF-10). */
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

/**
 * Mobile controls disclosure (`<details>`). Desktop callers hide this and
 * show controls inline instead.
 */
export function ActionFooterOptionsDisclosure({
  label,
  changedCount,
  defaultOpen = false,
  children,
  className,
}: ActionFooterOptionsDisclosureProps) {
  const { t } = useTranslation("manager")
  const resolvedLabel =
    label ?? t("actionFooter.options", { defaultValue: "Options" })

  return (
    <details
      data-testid="action-footer-options-disclosure"
      className={clsx(
        "group w-full rounded-[var(--radius-theme)] border border-[var(--line)] bg-[var(--surface)]",
        className,
      )}
      open={defaultOpen || undefined}
    >
      <summary
        className={clsx(
          "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2",
          "text-sm font-medium text-[var(--ink)]",
          "marker:content-none [&::-webkit-details-marker]:hidden",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{resolvedLabel}</span>
          {changedCount != null && changedCount > 0 && (
            <span
              data-testid="action-footer-options-changed"
              className="bg-accent-tint text-accent-contrast rounded-full px-2 py-0.5 text-xs font-semibold"
            >
              {changedCount}
            </span>
          )}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-[var(--ink-muted)] transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-[var(--line)] px-3 py-3">{children}</div>
    </details>
  )
}

/**
 * AF07 — CompactIconBar atom + dock. 44×44 icon button + row container
 * (`role="group"`). Token-only coloring, motion-reduce aware, focus-visible ring.
 */

const ICON_BAR_ICON_MAP = {
  Play,
  Pause,
  SkipForward,
  Eye,
  Minus,
  Plus,
} as const

export interface IconBarButtonProps {
  action: CompactIconBarAction
  className?: string
}

/** Single icon button — 44×44 touch target, token-driven active state. */
export function IconBarButton({ action, className }: IconBarButtonProps) {
  const Icon = ICON_BAR_ICON_MAP[action.iconName]
  return (
    <button
      type="button"
      onClick={action.onClick}
      aria-label={action.label}
      aria-pressed={action.toggle ? action.active : undefined}
      title={action.label}
      disabled={action.disabled}
      data-testid={`icon-bar-button-${action.key}`}
      className={clsx(
        "inline-flex h-11 w-11 items-center justify-center rounded-md",
        "transition-colors motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent-contrast)] focus-visible:outline-none",
        action.disabled
          ? "cursor-not-allowed text-[var(--ink-muted)] opacity-50"
          : action.active
            ? "bg-[var(--accent-contrast)] text-[var(--accent-contrast-text)]"
            : "hover:bg-accent-tint focus-visible:bg-accent-tint text-[var(--ink)]",
        className,
      )}
    >
      <Icon className="size-5" aria-hidden strokeWidth={2} />
    </button>
  )
}

export interface IconBarDockProps {
  actions: readonly CompactIconBarAction[]
  className?: string
}

/** Row of IconBarButtons — `role="group"` for landmark semantics. */
export function IconBarDock({ actions, className }: IconBarDockProps) {
  return (
    <div role="group" className={clsx("flex items-center gap-1", className)}>
      {actions.map((a) => (
        <IconBarButton key={a.key} action={a} />
      ))}
    </div>
  )
}
