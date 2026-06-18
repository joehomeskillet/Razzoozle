import { EVENTS } from "@razzoozle/common/constants"
import ErrorBoundary from "@razzoozle/web/components/ErrorBoundary"
import ErrorPage from "@razzoozle/web/components/ErrorPage"
import CreamBackdrop from "@razzoozle/web/components/CreamBackdrop"
import NotFound from "@razzoozle/web/components/NotFound"
import {
  SocketProvider,
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { applyTheme, fetchTheme } from "@razzoozle/web/features/theme/apply"
import { sanitizeAnimatedCss } from "@razzoozle/web/features/theme/sanitizeAnimatedCss"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import {
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { useEffect } from "react"

type BackdropSlot = "auth" | "managerGame" | "playerGame"

const slotFromPath = (pathname: string): BackdropSlot => {
  if (pathname.startsWith("/party")) return "playerGame"
  if (pathname.startsWith("/manager") || pathname.startsWith("/display"))
    return "managerGame"
  return "auth"
}

const ThemedBackdrop = () => {
  const { theme } = useThemeStore()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  // Theme not loaded yet → render the default backdrop so first paint matches.
  if (!theme) return <CreamBackdrop />

  const cfg = theme.backgrounds?.animated?.[slotFromPath(pathname)]
  if (cfg?.type === "none") return null

  const safeCss = sanitizeAnimatedCss(theme.backgrounds?.animatedCss)

  return (
    <>
      <CreamBackdrop
        speed={cfg?.speed}
        intensity={cfg?.intensity}
        iconCount={cfg?.iconCount}
      />
      {safeCss && <style>{safeCss}</style>}
    </>
  )
}

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
      <main id="main" className="antialiased">
        <ThemedBackdrop />
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
    <div className="antialiased">
      <ErrorPage error={error} />
    </div>
  ),
  notFoundComponent: () => (
    <div className="antialiased">
      <NotFound />
    </div>
  ),
})
