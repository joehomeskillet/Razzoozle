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
    <>
      {/* Skip link — first focusable element so keyboard users can jump past
          the persistent chrome straight to the page content (#main below). */}
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-[var(--color-primary)] px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        Zum Inhalt springen
      </a>
      <main id="main" className="bg-secondary antialiased">
        <Outlet />
      </main>
    </>
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
