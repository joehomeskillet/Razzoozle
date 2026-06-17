import * as AlertDialog from "@radix-ui/react-alert-dialog"
import { EVENTS } from "@razzoozle/common/constants"
import type { Player } from "@razzoozle/common/types/game"
import type { ManagerStatusDataMap } from "@razzoozle/common/types/game/status"
import Avatar from "@razzoozle/web/components/Avatar"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { buildJoinUrl } from "@razzoozle/web/features/game/utils/joinUrl"
import {
  STAGGER,
  useReveal,
} from "@razzoozle/web/features/game/animation/presets"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import { Maximize2, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import QRCode from "@razzoozle/web/components/QRCode"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// Team indicator colours for the manager lobby (inline dot on player card).
// Kept consistent with the player-side picker and TeamLeaderboard.
const TEAM_DOT: Record<string, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
}

interface Props {
  data: ManagerStatusDataMap["SHOW_ROOM"]
}

const Room = ({ data: { text, inviteCode } }: Props) => {
  const { gameId, password } = useManagerStore()
  const { socket } = useSocket()
  const webUrl = window.location.origin
  const { players } = useManagerStore()
  const [playerList, setPlayerList] = useState<Player[]>(players)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [qrOpen, setQrOpen] = useState(false)
  const [pairCode, setPairCode] = useState("")
  const qrContentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const reveal = useReveal()

  const pairDisplay = () => {
    if (!gameId || pairCode.trim().length === 0) {
      return
    }

    // Server authorizes by manager-socket identity; password (in-memory only,
    // may be gone after a reload) is sent for wire-compat and ignored.
    socket.emit(EVENTS.DISPLAY.PAIR, {
      code: pairCode.trim().toUpperCase(),
      managerPassword: password ?? "",
      gameId,
    })
  }

  useEvent(EVENTS.DISPLAY.PAIR_SUCCESS, () => {
    toast.success("Satellit-Display verbunden")
    setPairCode("")
  })

  useEvent(EVENTS.DISPLAY.PAIR_ERROR, (message) => {
    toast.error(t(message))
  })

  useOnClickOutside({ ref: qrContentRef, handler: () => setQrOpen(false) })

  useEvent(EVENTS.MANAGER.NEW_PLAYER, (player) => {
    setPlayerList((prev) => {
      const i = prev.findIndex((p) => p.id === player.id)
      if (i === -1) return [...prev, player]
      const next = [...prev]
      next[i] = player
      return next
    })
  })

  useEvent(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) => {
    setPlayerList((prev) => prev.filter((p) => p.id !== playerId))
  })

  useEvent(EVENTS.MANAGER.PLAYER_KICKED, (playerId) => {
    setPlayerList((prev) => prev.filter((p) => p.id !== playerId))
  })

  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (total) => {
    setTotalPlayers(total)
  })

  const kickPlayer = (playerId: string) => {
    if (!gameId) {
      return
    }

    socket.emit(EVENTS.MANAGER.KICK_PLAYER, {
      gameId,
      playerId,
    })
  }

  const handleCloseQrCode = () => setQrOpen(false)

  return (
    <section className="glass-2 relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      <div className="mb-10 flex flex-col-reverse items-center gap-3 md:flex-row md:items-stretch">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex flex-col items-center justify-center rounded-xl bg-white px-6 py-4 md:flex-row">
            <div>
              <p className="text-2xl font-bold">{t("game:joinInstruction")}</p>
              <p className="max-w-64 text-lg font-extrabold break-words">
                {webUrl}
              </p>
            </div>

            <div className="my-4 h-0.5 w-full bg-gray-300 md:mx-4 md:h-full md:w-0.5" />

            <div>
              <p className="text-2xl font-bold">{t("game:gamePinLabel")}</p>
              <p className="text-6xl font-extrabold tabular-nums lg:text-[clamp(3.75rem,12vh,9rem)]">
                {inviteCode}
              </p>
            </div>
          </div>
        </div>

        <AlertDialog.Root open={qrOpen} onOpenChange={setQrOpen}>
          <AlertDialog.Trigger asChild>
            <div className="group relative flex h-40 shrink-0 cursor-pointer rounded-xl bg-white p-2">
              <QRCode
                className="h-auto w-auto"
                size={144}
                value={buildJoinUrl(inviteCode, webUrl)}
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 transition-opacity group-hover:opacity-100">
                <div className="rounded-md bg-black/80 p-2">
                  <Maximize2 className="size-6 text-white" />
                </div>
              </div>
            </div>
          </AlertDialog.Trigger>

          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <AlertDialog.Content
              ref={qrContentRef}
              className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6"
            >
              <AlertDialog.Title className="sr-only">
                {t("game:joinInstruction")}
              </AlertDialog.Title>
              <button
                onClick={handleCloseQrCode}
                className="absolute -top-3 -right-3 rounded-full bg-white p-1.5 shadow-md hover:bg-gray-100"
              >
                <X className="size-6 text-gray-700" />
              </button>
              <QRCode
                className="size-56 md:size-70 lg:size-95"
                size={380}
                value={buildJoinUrl(inviteCode, webUrl)}
              />
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>

      <h2 className="mb-4 text-4xl font-bold text-white drop-shadow-lg">
        {t(text)}
      </h2>

      <div className="mb-4 flex items-center justify-center rounded-lg bg-black/40 px-6 py-3">
        <span className="text-2xl font-bold text-white drop-shadow-md">
          {t("game:playersJoined")}
          {totalPlayers}
        </span>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-lg bg-black/40 px-4 py-2">
        <span className="text-sm font-semibold text-white/70">
          {t("manager:satellite.codeLabel")}
        </span>
        <input
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pairDisplay()}
          placeholder="ABC123"
          maxLength={6}
          className="w-28 rounded-md bg-white/90 px-2 py-1 text-center font-mono text-lg font-bold tracking-widest text-black uppercase outline-none"
        />
        <button
          type="button"
          onClick={pairDisplay}
          className="bg-primary rounded-md px-3 py-1.5 text-sm font-bold text-white"
        >
          {t("manager:satellite.pair")}
        </button>
      </div>

      {/* Lobby roster: each card fades/rises in on its own id key via a cheap
          composited tween (opacity/transform) — NO `layout` spring on this
          player-scaled list (~200 players), so an append never forces a per-join
          reflow + position spring across the whole roster. Stagger = fast token. */}
      <motion.div
        className="flex flex-wrap gap-3"
        variants={reveal.container(STAGGER.fast)}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence initial={false}>
          {playerList.map((player) => (
            <motion.div
              key={player.id}
              variants={reveal.item()}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={reveal.tween()}
              className="bg-primary flex items-center gap-2 rounded-xl px-4 py-3 font-bold text-white"
            >
              {player.teamId && TEAM_DOT[player.teamId] && (
                <span
                  className={`size-4 shrink-0 rounded-full ${TEAM_DOT[player.teamId]} ring-2 ring-white/40`}
                  aria-label={player.teamId}
                  title={player.teamId}
                />
              )}
              <Avatar src={player.avatar} name={player.username} size={40} />
              <span className="text-3xl drop-shadow-sm">{player.username}</span>
              <AlertDialog.Root>
                <AlertDialog.Trigger asChild>
                  <button
                    type="button"
                    aria-label={t("manager:kickPlayer.aria", {
                      name: player.username,
                    })}
                    className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <X className="size-4" />
                  </button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
                  <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 text-black">
                    <AlertDialog.Title className="text-xl font-bold">
                      {t("manager:kickPlayer.title")}
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-2 text-gray-600">
                      {t("manager:kickPlayer.description", {
                        name: player.username,
                      })}
                    </AlertDialog.Description>
                    <div className="mt-6 flex justify-end gap-3">
                      <AlertDialog.Cancel asChild>
                        <button
                          type="button"
                          className="rounded-md bg-gray-200 px-4 py-2 font-bold text-black hover:bg-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500"
                        >
                          {t("common:cancel")}
                        </button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <button
                          type="button"
                          onClick={() => kickPlayer(player.id)}
                          className="rounded-md bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                        >
                          {t("manager:kickPlayer.confirm")}
                        </button>
                      </AlertDialog.Action>
                    </div>
                  </AlertDialog.Content>
                </AlertDialog.Portal>
              </AlertDialog.Root>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}

export default Room
