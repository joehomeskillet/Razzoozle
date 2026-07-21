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
  const { redirect } = Route.useSearch()
  const { socket, isConnected, reconnect } = useSocket()

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
    // Return to the deep-link the manager hit while logged out, if any (the
    // `/manager/config` auth guard forwards it as `?redirect=`). Only honor a
    // same-area config tab path; anything else falls back to the bare dashboard,
    // which resolves the default tab.
    const tab = redirect?.match(/^\/manager\/config\/([^/?#]+)/)?.[1]
    if (tab) {
      navigate({
        to: "/manager/config/$tab",
        params: { tab: decodeURIComponent(tab) },
        replace: true,
      })
    } else {
      navigate({ to: "/manager/config" })
    }
  })

  const handleAuth = () => {
    // The socket connected pre-login as anonymous (no session token in the
    // handshake). Reconnect so auth() re-runs and includes the now-stored
    // sessionToken → the socket authenticates; the isConnected effect above then
    // re-emits GET_CONFIG, whose CONFIG reply drives the redirect to the dashboard.
    reconnect()
  }

  return <ManagerPassword onSubmit={handleAuth} />
}

export const Route = createFileRoute("/(auth)/manager/")({
  component: ManagerAuthPage,
})
