import { getPluginTab } from "@razzoozle/web/features/manager/plugins/host"
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  /** The `plugin:<id>` key whose registration drives this host. */
  pluginKey: string
  /**
   * Version hash of the owning plugin (e.g. its manifest version). Changing it
   * re-runs the mount effect so a hot-swapped ui.js re-renders cleanly.
   */
  versionHash: string
}

/**
 * Renders a registered plugin tab into a host element React owns but whose
 * CHILDREN React never reconciles. The plugin's `render(rootEl)` may populate
 * the element with any framework or raw DOM; we keep React out of that subtree
 * entirely (no React children) so the two worlds never fight over the same
 * nodes.
 *
 * Lifecycle (deps `[pluginKey, versionHash]`):
 *  - mount → look up the registration, call `render(ref.current)`, stash the
 *    returned teardown.
 *  - cleanup → call `teardown?.()`, then `ref.current.replaceChildren()` to nuke
 *    any DOM the plugin left behind.
 *
 * StrictMode-safe: the double mount/cleanup/mount cycle tears down and remounts
 * via the same path, and `replaceChildren()` guarantees a clean slate each time
 * so no duplicated DOM accrues.
 */
const PluginTabHost = ({ pluginKey, versionHash }: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const registration = getPluginTab(pluginKey)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    const reg = getPluginTab(pluginKey)
    if (!reg) return

    let teardown: (() => void) | undefined
    try {
      teardown = reg.render(host)
    } catch (err) {
      console.error(`[razzoozle] plugin tab "${pluginKey}" render failed`, err)
    }

    return () => {
      try {
        teardown?.()
      } catch (err) {
        console.error(
          `[razzoozle] plugin tab "${pluginKey}" teardown failed`,
          err,
        )
      }
      // Nuke any DOM the plugin left behind — React never reconciled it, so we
      // must clear it ourselves to stay idempotent across re-mounts.
      host.replaceChildren()
    }
    // Re-mount only when the tab identity or its version changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginKey, versionHash])

  if (!registration) {
    return (
      <p className="text-sm text-gray-500">
        {t("manager:plugins.tabUnavailable", {
          defaultValue: "Plugin nicht geladen.",
        })}
      </p>
    )
  }

  // The single host element. React owns the element itself but NEVER its
  // children — the plugin fills it imperatively. No JSX children here on
  // purpose.
  return <div ref={ref} className="plugin-tab-host min-h-0 flex-1" />
}

export default PluginTabHost
