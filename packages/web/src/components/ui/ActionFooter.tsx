import clsx from "clsx"
import {
  useId,
  useLayoutEffect,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useActionFooterHostOptional } from "@razzoozle/web/features/manager/contexts/action-footer-host-context"
import { ActionFooterOptionsDisclosure } from "@razzoozle/web/components/ui/ActionFooter.primitives"

export interface ActionFooterProps {
  /** Context zone: selection, title, bulk count (AF-05). */
  context?: ReactNode
  /** Controls zone: compact options that affect the next commit/start. */
  controls?: ReactNode
  /** Explicit status node (validation / saving). Prefer over only `dirty`. */
  status?: ReactNode
  /** At most two visible secondary actions. */
  secondaryActions?: ReactNode
  /** Overflow / ⋮ actions. */
  overflowActions?: ReactNode
  /** Single primary action — last in DOM (AF-06). */
  primaryAction?: ReactNode
  /** Mobile disclosure label for controls (AF-10). */
  mobileOptionsLabel?: string
  /** Badge count for changed mobile options. */
  mobileChangedCount?: number
  className?: string
  /**
   * Dirty-state indicator. When true and `status` is omitted, shows
   * "Ungespeicherte Änderungen" (role="status"). No global opacity (AF-12).
   */
  dirty?: boolean
  /**
   * @deprecated AF05 — free `children` for transition only. Prefer named zones
   * (`context` / `controls` / `secondaryActions` / `primaryAction`). Removed in AF09.
   */
  children?: ReactNode
}

// Re-export primitives from the main module path for ergonomic imports.
export {
  ActionFooterSummary,
  ActionFooterField,
  ActionFooterControls,
  ActionFooterActions,
  ActionFooterOptionsDisclosure,
} from "@razzoozle/web/components/ui/ActionFooter.primitives"
export type {
  ActionFooterSummaryProps,
  ActionFooterFieldProps,
  ActionFooterControlsProps,
  ActionFooterActionsProps,
  ActionFooterOptionsDisclosureProps,
} from "@razzoozle/web/components/ui/ActionFooter.primitives"

/**
 * Manager page actions — portals into ConsoleShell ActionFooterHost (AF04).
 *
 * **Zones (AF05 / AF-05):** context → controls → secondary → primary (DOM/tab order).
 * Free `children` remains during migration (deprecated, AF09 removes).
 */
const ActionFooter = ({
  context,
  controls,
  status,
  secondaryActions,
  overflowActions,
  primaryAction,
  mobileOptionsLabel,
  mobileChangedCount,
  children,
  className,
  dirty,
}: ActionFooterProps) => {
  const { t } = useTranslation("manager")
  const host = useActionFooterHostOptional()
  const instanceId = useId()
  // Depend on stable register/target only — NOT the whole host object.
  // registrationCount changes used to recreate `host` and re-fire this effect
  // (unregister→register), which could leave the shell host empty for a frame
  // or stuck hidden if batching went wrong.
  const register = host?.register
  const portalTarget = host?.target

  useLayoutEffect(() => {
    if (!register) return
    return register(instanceId)
  }, [register, instanceId])

  const dirtyStatus =
    dirty && status == null ? (
      <span
        role="status"
        aria-live="polite"
        data-testid="action-footer-dirty"
        className="text-sm font-medium text-[var(--ink-muted)]"
      >
        {t("editor.unsavedChanges")}
      </span>
    ) : null

  const statusNode = status ?? dirtyStatus

  const hasZones =
    context != null ||
    controls != null ||
    statusNode != null ||
    secondaryActions != null ||
    overflowActions != null ||
    primaryAction != null

  const willPortal = Boolean(portalTarget)
  const body = hasZones ? (
    <div
      data-testid="action-footer"
      data-portaled={willPortal ? "true" : "false"}
      data-layout="zones"
      className={clsx(
        "flex w-full min-w-0 flex-col gap-3",
        // ≥sm: one row when possible — context left, actions right
        "sm:flex-row sm:flex-wrap sm:items-center sm:gap-4",
        className,
      )}
    >
      {(context != null || statusNode != null) && (
        <div
          data-testid="action-footer-context-zone"
          className="flex min-w-0 flex-col gap-1 sm:mr-auto sm:max-w-md"
        >
          {context}
          {statusNode}
        </div>
      )}

      {controls != null && (
        <>
          {/* Mobile: controls behind disclosure (AF-10). */}
          <div className="w-full min-[600px]:hidden">
            <ActionFooterOptionsDisclosure
              label={mobileOptionsLabel}
              changedCount={mobileChangedCount}
            >
              {controls}
            </ActionFooterOptionsDisclosure>
          </div>
          {/* ≥600px: controls inline. */}
          <div
            data-testid="action-footer-controls-zone"
            className="hidden min-w-0 min-[600px]:block"
          >
            {controls}
          </div>
        </>
      )}

      <div
        data-testid="action-footer-actions-zone"
        className={clsx(
          "flex w-full flex-col gap-2",
          "sm:ml-auto sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3",
        )}
      >
        {secondaryActions != null && (
          <div
            data-testid="action-footer-secondary"
            className="flex flex-col gap-2 sm:flex-row sm:gap-3"
          >
            {secondaryActions}
          </div>
        )}
        {overflowActions != null && (
          <div data-testid="action-footer-overflow">{overflowActions}</div>
        )}
        {primaryAction != null && (
          <div data-testid="action-footer-primary">{primaryAction}</div>
        )}
        {/* Legacy children — after secondary, before/with primary cluster end. */}
        {children != null && (
          <div data-testid="action-footer-legacy-children">{children}</div>
        )}
      </div>
    </div>
  ) : (
    // Legacy-only path (pre-zone call sites).
    <div
      data-testid="action-footer"
      data-portaled={willPortal ? "true" : "false"}
      data-layout="legacy-children"
      className={clsx(
        "flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4",
        className,
      )}
    >
      {statusNode && (
        <div className="sm:mr-auto sm:order-first">{statusNode}</div>
      )}
      {children}
    </div>
  )

  // Portal when the shell host node is ready. NEVER return null — if the host
  // is still mounting, fall back to in-flow chrome so primary actions remain
  // visible (Play Start / Create / Save must not vanish).
  if (portalTarget) {
    return createPortal(body, portalTarget)
  }

  return (
    <div
      data-testid="action-footer-fallback"
      className={clsx(
        "shrink-0 border-t border-[var(--line)] bg-[var(--surface)]",
        "shadow-[var(--shadow-flat)]",
        "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6",
      )}
    >
      {body}
    </div>
  )
}

export default ActionFooter
