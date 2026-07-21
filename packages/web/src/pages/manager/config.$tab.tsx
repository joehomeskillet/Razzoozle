import { EVENTS } from "@razzoozle/common/constants"
import { STATUS } from "@razzoozle/common/types/game/status"
import Background from "@razzoozle/web/components/Background"
import Loader from "@razzoozle/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import Configurations, {
  BUILTIN_TABS,
  isTabAllowed,
  resolveDefaultManagerTab,
} from "@razzoozle/web/features/manager/components/configurations"
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

export const Route = createFileRoute("/manager/config/$tab")({
  // Auth is enforced on the parent `/manager/config` layout. Here we only soft-
  // validate $tab: known-but-disallowed keys redirect to the first allowed tab.
  // Unregistered keys (not in BUILTIN_TABS) still match — no 404 — so future
  // plugin tabs (#217) can land without a hard route registry.
  beforeLoad: ({ params }) => {
    const { token, role, config } = useManagerStore.getState()

    if (!token) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() is thrown by design
      throw redirect({ to: "/manager", replace: true })
    }

    const knownKeys = BUILTIN_TABS.map((t) => t.key)
    // Unregistered → allow through (no 404).
    if (!knownKeys.includes(params.tab)) {
      return
    }

    const gateOpts = {
      devMode: Boolean(config?.devMode),
      klassenEnabled: Boolean(config?.klassenEnabled ?? false),
      role: role ?? "user",
    }
    const allowed = BUILTIN_TABS.filter((tab) => isTabAllowed(tab, gateOpts))
    if (allowed.some((tab) => tab.key === params.tab)) {
      return
    }

    const fallback = resolveDefaultManagerTab({
      devMode: config?.devMode,
      klassenEnabled: config?.klassenEnabled,
      role,
    })
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() is thrown by design
    throw redirect({
      to: "/manager/config/$tab",
      params: { tab: fallback },
      replace: true,
    })
  },
  component: ManagerConfigPage,
})
