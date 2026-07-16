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
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"

const ManagerConfigPage = () => {
  const { isConnected } = useSocket()
  const {
    setGameId,
    setInviteCode,
    setStatus,
    setConfig,
    patchQuizzLabels,
    config,
  } = useManagerStore()
  const navigate = useNavigate()

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
  })

  // #145: patch config.quizz in the store directly on the assign/remove ack —
  // the source of truth for `Configurations`' `data` prop — instead of a
  // component-local copy that a view remount (tab switch) racing ahead of the
  // next CONFIG refresh could silently drop back to the stale value.
  useEvent(EVENTS.LABEL.ASSIGNED, ({ entityType, entityId, labelIds }) => {
    if (entityType === "quizz") {
      patchQuizzLabels(entityId, labelIds)
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
  // Route-level guard (SECURITY): no token in the manager store → bounce to
  // login before the route even loads. Runs on every navigation/reload, so a
  // deep-link into /manager/config without auth never mounts the component.
  beforeLoad: () => {
    const { token } = useManagerStore.getState()

    if (!token) {
      throw redirect({ to: "/manager", replace: true })
    }
  },
  component: ManagerConfigPage,
})
