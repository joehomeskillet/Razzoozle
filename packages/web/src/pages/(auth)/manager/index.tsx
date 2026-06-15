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
  const { setConfig, setPassword } = useManagerStore()
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()

  useEffect(() => {
    if (!isConnected) {
      return
    }

    socket.emit(EVENTS.MANAGER.GET_CONFIG)
    // oxlint-disable-next-line
  }, [isConnected])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
    navigate({ to: "/manager/config" })
  })

  const handleAuth = (password: string) => {
    setPassword(password)
    socket.emit(EVENTS.MANAGER.AUTH, password)
  }

  return <ManagerPassword onSubmit={handleAuth} />
}

export const Route = createFileRoute("/(auth)/manager/")({
  component: ManagerAuthPage,
})
