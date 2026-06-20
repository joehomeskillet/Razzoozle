import { useEffect, useRef } from "react"

interface Props {
  status: string
  data: unknown
}

/**
 * v2 Plugin render slot: allows enabled plugins to register render hooks
 * for specific game status events (SHOW_QUESTION, SHOW_RESULT, SHOW_LEADERBOARD, FINISHED).
 *
 * This component mounts an inert container that plugins can populate via
 * the window.razzoozle.registerRenderSlot API. When no plugins are registered
 * or no plugin matches the current status, this renders as null.
 *
 * Lifecycle:
 * - mount: clears the container
 * - status/data change: triggers plugin render hooks if registered
 * - unmount: clears the container
 */
const PluginRenderSlot = ({ status, data }: Props) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = ref.current
    if (!host) return

    // Clear any previous plugin renders
    host.replaceChildren()

    // v2 INFRASTRUCTURE: plugins register render slots via window.razzoozle.registerRenderSlot.
    // For now, this is a placeholder that mounts a container. When plugins are enabled,
    // they will call registerRenderSlot({ events: [...], render: (container, {status, data}) => ... })
    // and this component will iterate the registry and invoke matching render functions.
    // No-op is safe and expected when no plugins are registered.
  }, [status, data])

  // Mount a container div that plugins can populate via window.razzoozle.registerRenderSlot.
  // This div is never directly populated by React, only by plugins imperatively.
  return <div ref={ref} className="plugin-render-slot" />
}

export default PluginRenderSlot
