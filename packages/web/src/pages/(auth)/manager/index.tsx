import { EVENTS } from "@razzoozle/common/constants"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import ManagerPassword from "@razzoozle/web/features/manager/components/ManagerPassword"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

const ManagerAuthPage = () => {
  const { setConfig } = useManagerStore()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()

  useEffect(() => {
    if (!isConnected) {
      return
    }

    socket.emit(EVENTS.MANAGER.GET_CONFIG)
    // `socket` is a stable reference from the socket context for the lifetime of
    // the provider, so re-emitting only on `isConnected` change is correct.
  }, [isConnected, socket])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
    navigate({ to: "/manager/config" })
  })

  const handleAuth = () => {
    // After successful HTTP login, trigger GET_CONFIG
    socket.emit(EVENTS.MANAGER.GET_CONFIG)
  }

  return <ManagerPassword onSubmit={handleAuth} />
}

export const Route = createFileRoute("/(auth)/manager/")({
  component: ManagerAuthPage,
})
