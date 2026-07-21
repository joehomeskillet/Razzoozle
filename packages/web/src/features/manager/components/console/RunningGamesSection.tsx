import { EVENTS } from "@razzoozle/common/constants"
import type { GameSummary } from "@razzoozle/common/types/game"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import { useActiveConsoleTab } from "@razzoozle/web/features/manager/contexts/active-console-tab"
import { useSelectConsoleTab } from "@razzoozle/web/features/manager/contexts/select-console-tab"
import { useNavigate } from "@tanstack/react-router"
import { LogIn, RefreshCw, Radio, Square } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Running-Games console section: a read-only list of every live game, with an
// End action (MANAGER.END_GAME — server verifies ownership) and a Take-over
// action that routes the host into the existing /party/manager reconnect flow.
// Consumes the already-shipped MANAGER.LIST_GAMES / GAMES_DATA contract; adds
// neither a new event nor a new store.
const RunningGamesSection = () => {
  const { socket, isConnected } = useSocket()
  const { setGameId, setInviteCode } = useManagerStore()
  const selectConsoleTab = useSelectConsoleTab()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const activeTab = useActiveConsoleTab()
  const [games, setGames] = useState<GameSummary[]>([])
  // The game pending an End confirmation; drives the AlertDialog.
  const [pendingEnd, setPendingEnd] = useState<GameSummary | null>(null)
  const wasActiveBefore = useRef(false)

  const refresh = useCallback(() => {
    socket.emit(EVENTS.MANAGER.LIST_GAMES)
  }, [socket])

  // Request the list on mount / reconnect. Re-running on `isConnected` covers a
  // server restart (deploy) that would otherwise leave the panel stale.
  useEffect(() => {
    if (isConnected) {
      refresh()
    }
  }, [isConnected, refresh])

  // Refresh the list when navigating to the Running Games section to prevent
  // staleness until manual refresh (F2 observation).
  useEffect(() => {
    const isNowActive = activeTab === "running"
    if (isNowActive && !wasActiveBefore.current) {
      refresh()
    }
    wasActiveBefore.current = isNowActive
  }, [activeTab, refresh])

  useEvent(
    EVENTS.MANAGER.GAMES_DATA,
    useCallback((data: GameSummary[]) => setGames(data), []),
  )

  const handleEnd = () => {
    if (!pendingEnd) {
      return
    }

    socket.emit(EVENTS.MANAGER.END_GAME, { gameId: pendingEnd.gameId })
    toast.success(t("manager:runningGames.ended"))
    setPendingEnd(null)
    // The server pushes a fresh GAMES_DATA after the kill; nudge it in case the
    // broadcast is debounced so the row disappears promptly.
    refresh()
  }

  const handleTakeOver = (game: GameSummary) => () => {
    // Prime the store the same way GAME_CREATED does, then route into the host
    // presentation view — useManagerGameSession reconnects to the game on mount.
    setGameId(game.gameId)
    setInviteCode(game.inviteCode)
    navigate({ to: "/party/manager/$gameId", params: { gameId: game.gameId } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader
        title={t("manager:tabs.running")}
        subtitle={t("manager:runningGames.description")}
        action={
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={refresh}
            aria-label={t("manager:runningGames.refresh")}
            title={t("manager:runningGames.refresh")}
          >
            <RefreshCw className="size-5" aria-hidden />
          </Button>
        }
      />

      {games.length === 0 ? (
        <EmptyState
          icon={Radio}
          headline={t("manager:runningGames.emptyHeadline")}
          hint={t("manager:runningGames.emptyHint")}
          action={{
            label: t("manager:runningGames.goToPlayTab"),
            onClick: () => selectConsoleTab("play"),
          }}
        />
      ) : (
        <div className="space-y-3">
          {games.map((game) => (
            <ListRow
              key={game.gameId}
              title={game.subject}
              meta={
                <>
                  {t("manager:runningGames.pin", { pin: game.inviteCode })}
                  {" · "}
                  <span className="tabular-nums">
                    {t("manager:runningGames.playerCount", {
                      count: game.playerCount,
                    })}
                  </span>
                  {" · "}
                  {game.started
                    ? t("manager:runningGames.phase.running")
                    : t("manager:runningGames.phase.lobby")}
                  {!game.managerConnected &&
                    ` · ${t("manager:runningGames.hostOffline")}`}
                </>
              }
              actions={[
                {
                  key: "takeover",
                  icon: LogIn,
                  label: t("manager:runningGames.takeOver"),
                  onClick: handleTakeOver(game),
                },
                {
                  key: "end",
                  icon: Square,
                  label: t("manager:runningGames.end"),
                  destructive: true,
                  onClick: () => setPendingEnd(game),
                },
              ]}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingEnd !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingEnd(null)
          }
        }}
        title={t("manager:runningGames.end")}
        description={t("manager:runningGames.endConfirm", {
          name: pendingEnd?.subject ?? "",
        })}
        confirmLabel={t("manager:runningGames.end")}
        onConfirm={handleEnd}
      />
    </div>
  )
}

export default RunningGamesSection
