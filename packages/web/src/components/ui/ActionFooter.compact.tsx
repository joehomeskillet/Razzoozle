import clsx from "clsx"
import { useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useActionFooterHostOptional } from "@razzoozle/web/features/manager/contexts/action-footer-host-context"
import { IconBarDock } from "@razzoozle/web/components/ui/ActionFooter.primitives"
import type { CompactIconBarProps } from "@razzoozle/web/components/ui/ActionFooter.compact.types"

/**
 * AF07 / WP-1.2 — CompactIconBar portal-consumer.
 *
 * Renders an icon-only footer (44×44 buttons) into
 * the shell-local `ConsoleActionFooterHost` portal target. Tabs opt-in by
 * setting `TabDef.actionFooterVariant: "compact"`; ConsoleShell flips the
 * host's `variant` to `"compact"` so `ActionFooterHostSlot` swaps chrome.
 *
 * Returns null when the host (or its portal target) is missing — compact
 * footers are opt-in chrome; without a host there is nowhere safe to render.
 */
export function ActionFooterCompact({
  actions,
  className,
  instanceId,
}: CompactIconBarProps) {
  const { t } = useTranslation("manager")
  const host = useActionFooterHostOptional()
  // Depend only on the stable register fn (host object identity changes when
  // registrationCount ticks — see ActionFooter.tsx for the same pattern).
  const register = host?.register
  const portalTarget = host?.target

  useLayoutEffect(() => {
    if (!register) return
    // The registry's register() returns its own cleanup fn — calling it
    // unregisters this instanceId and notifies subscribers.
    return register(instanceId)
  }, [register, instanceId])

  if (!portalTarget) return null

  return createPortal(
    <div
      role="toolbar"
      aria-label={t("aria.actionFooter", { defaultValue: "Page actions" })}
      data-testid="action-footer-compact"
      className={clsx("flex items-center justify-end gap-2", className)}
    >
      {actions.length > 0 && <IconBarDock actions={actions} />}
    </div>,
    portalTarget,
  )
}

export default ActionFooterCompact
