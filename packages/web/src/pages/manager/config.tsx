import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { resolveDefaultManagerTab } from "@razzoozle/web/features/manager/components/configurations"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"

/**
 * Layout + bare-path redirect for `/manager/config`.
 *
 * - Auth guard: no token → `/manager`
 * - Exact `/manager/config` (no $tab) → last valid localStorage tab or first
 *   allowed tab under current role/config gates
 * - Child `/manager/config/$tab` renders via `<Outlet />`
 */
export const Route = createFileRoute("/manager/config")({
  beforeLoad: ({ location }) => {
    const { token, role, config } = useManagerStore.getState()

    if (!token) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() is thrown by design
      throw redirect({ to: "/manager", replace: true })
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
  component: () => <Outlet />,
})
