import { EVENTS } from "@razzoozle/common/constants"
import Background from "@razzoozle/web/components/Background"
import Loader from "@razzoozle/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { resolveDefaultManagerTab } from "@razzoozle/web/features/manager/components/configurations"
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { useEffect } from "react"

/**
 * Layout + bare-path redirect for `/manager/config`.
 *
 * - Auth guard: no token → `/manager` (carrying the intended path as `redirect`
 *   so login can send the manager back here instead of the bare dashboard).
 * - Exact `/manager/config` (no $tab) → last valid localStorage tab or first
 *   allowed tab under current role/config gates
 * - Child `/manager/config/$tab` renders via `<Outlet />`
 *
 * Config bootstrap: a hard load / deep-link of `/manager/config/<tab>`
 * authenticates via the sessionStorage token carried in the socket handshake,
 * but the manager store's `config` is in-memory only and starts null on every
 * fresh page load. Nothing on this route used to fetch it, so the child bounced
 * to `/manager`, which then redirected to the *bare* dashboard — discarding the
 * intended $tab and landing on "play". We emit GET_CONFIG here — mirroring the
 * `/manager/quizz` layout — so deep-links load config in place and keep their tab.
 */
const ManagerConfigLayout = () => {
  const { socket, isConnected } = useSocket()
  const { config, setConfig } = useManagerStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isConnected && !config) {
      socket.emit(EVENTS.MANAGER.GET_CONFIG)
    }
  }, [isConnected, socket, config])

  useEvent(EVENTS.MANAGER.CONFIG, (data) => {
    setConfig(data)
  })

  // Expired/invalid token: the server denies GET_CONFIG with UNAUTHORIZED. Only
  // then bounce to the login page — a healthy session never reaches this.
  useEvent(EVENTS.MANAGER.UNAUTHORIZED, () => {
    navigate({ to: "/manager", replace: true })
  })

  if (!isConnected || !config) {
    return (
      <Background plain>
        <Loader className="h-23" />
      </Background>
    )
  }

  return <Outlet />
}

export const Route = createFileRoute("/manager/config")({
  beforeLoad: ({ location }) => {
    const { token, role, config } = useManagerStore.getState()

    if (!token) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() is thrown by design
      throw redirect({
        to: "/manager",
        search: { redirect: location.pathname },
        replace: true,
      })
    }

    // Bare path only — child `$tab` paths keep their param.
    const path = location.pathname.replace(/\/+$/, "") || "/"
    if (path === "/manager/config") {
      const tab = resolveDefaultManagerTab({
        devMode: config?.devMode,
        klassenEnabled: config?.klassenEnabled,
        role,
      })
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() is thrown by design
      throw redirect({
        to: "/manager/config/$tab",
        params: { tab },
        replace: true,
      })
    }
  },
  component: ManagerConfigLayout,
})
