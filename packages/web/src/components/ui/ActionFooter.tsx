import clsx from "clsx"
import {
  useEffect,
  useId,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useActionFooterHostOptional } from "@razzoozle/web/features/manager/contexts/action-footer-host-context"

export interface ActionFooterProps {
  /** Action buttons (e.g. Save / Reset). Free `children` deprecated after AF05 zones. */
  children: ReactNode
  className?: string
  /**
   * Dirty-state indicator. When true, shows "Ungespeicherte Änderungen"
   * (role="status", aria-live="polite"). Does **not** dim the whole bar
   * (AF-12 — no global opacity).
   */
  dirty?: boolean
}

/**
 * Manager page actions — AF04 portals into the ConsoleShell ActionFooterHost.
 *
 * **Shell contract (AF03/AF04 / #983):**
 * - When rendered under `ActionFooterHostProvider`, content is portaled into
 *   the shell host (`<footer>` sibling of BodyGrid, full shell width).
 * - Registers via `host.register(instanceId)` and cleans up on unmount.
 * - No `position: sticky` / `fixed`, no negative margin bleed, no `pb-20`
 *   clearance (AF-17). Host owns chrome (border, surface, padding, safe-area).
 *
 * **Fallback:** Outside the shell provider (tests, rare non-console mounts),
 * renders an in-flow bar with the same chrome — still no sticky/neg margins.
 *
 * Presentational — children provide the button row until AF05 zone slots.
 */
const ActionFooter = ({ children, className, dirty }: ActionFooterProps) => {
  const { t } = useTranslation("manager")
  const host = useActionFooterHostOptional()
  const instanceId = useId()

  useEffect(() => {
    if (!host) return
    return host.register(instanceId)
  }, [host, instanceId])

  const inner = (
    <div
      data-testid="action-footer"
      data-portaled={host ? "true" : "false"}
      className={clsx(
        // Button row: right-aligned on ≥sm, stacked full-width below sm
        "flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4",
        className,
      )}
    >
      {dirty && (
        <span
          role="status"
          aria-live="polite"
          className="text-sm font-medium text-[var(--ink-muted)] sm:mr-auto sm:order-first"
        >
          {t("editor.unsavedChanges")}
        </span>
      )}
      {children}
    </div>
  )

  // Shell path: portal into host (chrome lives on ActionFooterHostSlot).
  if (host) {
    if (!host.target) {
      // Host mounted but ref not yet committed — register already ran;
      // render nothing at the tabpanel call site (no sticky ghost).
      return null
    }
    return createPortal(inner, host.target)
  }

  // Fallback: in-flow chrome, no sticky / negative margins (AF-17).
  return (
    <div
      data-testid="action-footer-fallback"
      className={clsx(
        "shrink-0 border-t border-[var(--line)] bg-[var(--surface)]",
        "shadow-[var(--shadow-flat)]",
        "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6",
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4",
        className,
      )}
    >
      {dirty && (
        <span
          role="status"
          aria-live="polite"
          className="text-sm font-medium text-[var(--ink-muted)] sm:mr-auto sm:order-first"
        >
          {t("editor.unsavedChanges")}
        </span>
      )}
      {children}
    </div>
  )
}

export default ActionFooter
