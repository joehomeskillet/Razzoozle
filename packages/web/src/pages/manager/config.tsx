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
import { createFileRoute, useNavigate } from "@tanstack/react-router"

const ManagerConfigPage = () => {
  const { socket, isConnected } = useSocket()
  const { setGameId, setInviteCode, setStatus, setConfig, config, token } =
    useManagerStore()
  const navigate = useNavigate()

  // Protect this route: if no token, redirect to login
  if (!token) {
    navigate({ to: "/manager", replace: true })
    return null
  }

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
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
