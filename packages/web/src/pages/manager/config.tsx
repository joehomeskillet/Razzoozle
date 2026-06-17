import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import Background from "@razzoozle/web/components/Background"
import Loader from "@razzoozle/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import Configurations from "@razzoozle/web/features/manager/components/configurations"
import {
  initManagerPluginHost,
  setHostConfig,
  syncPluginScripts,
} from "@razzoozle/web/features/manager/plugins/host"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

const ManagerConfigPage = () => {
  const { socket, isConnected } = useSocket()
  const { setGameId, setInviteCode, setStatus, setConfig, config, password } =
    useManagerStore()
  const navigate = useNavigate()

  // Install the manager-only plugin host global (window.razzoozle.registerTab +
  // api) exactly once on mount. Idempotent + StrictMode-safe; merges onto any
  // skeleton-theme global apply.ts may have set.
  useEffect(() => {
    initManagerPluginHost()
  }, [])

  // Re-authenticate on every (re)connect. The manager auth lives only in the
  // server's in-memory loggedClients set, so a server restart (deploy) wipes it
  // and otherwise silently 401s every withAuth handler — the visible symptom is
  // an empty KI tab after a deploy. The password is held in-memory in the store
  // from login; on re-auth the server re-adds the client and re-pushes config +
  // AI settings, so open tabs heal without a reload.
  useEffect(() => {
    if (isConnected && password) {
      socket.emit(EVENTS.MANAGER.AUTH, password)
    }
  }, [isConnected, password, socket])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
    // Keep the plugin host's read-only config snapshot in sync, and reconcile
    // injected plugin ui.js scripts against the (possibly embedded) plugin list.
    setHostConfig(data)
    syncPluginScripts(data.plugins ?? [])
  })

  // Live plugin-list broadcasts (install/remove/enable from WP5). Re-injects or
  // removes ui.js scripts so a freshly enabled plugin's tab appears without a
  // reload; a removed/disabled plugin's script (and its tab) disappears.
  useEvent(EVENTS.MANAGER.PLUGIN_CONFIG, (plugins) => {
    syncPluginScripts(plugins)
    // Mirror the new list into the host config snapshot so api.config.plugins
    // stays current between full CONFIG pushes.
    const current = useManagerStore.getState().config
    if (current) {
      const next = { ...current, plugins }
      setConfig(next)
      setHostConfig(next)
    }
  })

  useEvent(EVENTS.MANAGER.GAME_CREATED, ({ gameId, inviteCode }) => {
    setGameId(gameId)
    setInviteCode(inviteCode)
    setStatus(STATUS.SHOW_ROOM, {
      text: "game:waitingForPlayers",
      inviteCode,
    })
    navigate({ to: "/party/manager/$gameId", params: { gameId } })
  })

  if (!isConnected) {
    return (
      <Background plain>
        <Loader className="h-23" />
      </Background>
    )
  }

  if (!config) {
    return navigate({ to: "/manager" })
  }

  return (
    <div className="relative flex h-svh flex-col overflow-hidden">
      <Configurations data={config} />
    </div>
  )
}

export const Route = createFileRoute("/manager/config")({
  component: ManagerConfigPage,
})
