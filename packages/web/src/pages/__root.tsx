import { EVENTS } from "@razzoozle/common/constants"
import ErrorBoundary from "@razzoozle/web/components/ErrorBoundary"
import ErrorPage from "@razzoozle/web/components/ErrorPage"
import NotFound from "@razzoozle/web/components/NotFound"
import {
  SocketProvider,
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { applyTheme, fetchTheme } from "@razzoozle/web/features/theme/apply"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"

const GameLayout = () => {
  const { isConnected, connect } = useSocket()
  const { setTheme } = useThemeStore()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  // Load + apply the persisted theme on first render.
  useEffect(() => {
    fetchTheme().then((theme) => {
      setTheme(theme)
      applyTheme(theme)
    })
  }, [setTheme])

  // Live-update when a manager saves a new theme.
  useEvent(EVENTS.MANAGER.THEME, (theme) => {
    setTheme(theme)
    applyTheme(theme)
  })

  useEffect(() => {
    document.body.classList.add("bg-secondary")

    return () => {
      document.body.classList.remove("bg-secondary")
    }
  }, [])

  return (
    <div className="bg-secondary antialiased">
      <Outlet />
    </div>
  )
}

export const Route = createRootRoute({
  component: () => (
    <SocketProvider>
      {/* Top-level safety net for non-router render errors. The router's own
          errorComponent (below) handles route render failures; this catches
          anything that slips past it so the user never sees a white screen. */}
      <ErrorBoundary>
        <GameLayout />
      </ErrorBoundary>
    </SocketProvider>
  ),
  errorComponent: ({ error }) => (
    <div className="bg-secondary antialiased">
      <ErrorPage error={error} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="bg-secondary antialiased">
      <NotFound />
    </div>
  ),
})
