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
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { buildJoinUrl } from "@razzoozle/web/features/game/utils/joinUrl"
import { teamDot } from "@razzoozle/web/features/game/utils/teams"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import { Maximize2, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import QRCode from "@razzoozle/web/components/QRCode"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const LOBBY_SLOTS = [
  { top: "16%", left: "8%" }, { top: "33%", left: "13%" }, { top: "50%", left: "7%" }, { top: "67%", left: "13%" }, { top: "84%", left: "9%" },
  { top: "16%", left: "92%" }, { top: "33%", left: "87%" }, { top: "50%", left: "93%" }, { top: "67%", left: "87%" }, { top: "84%", left: "91%" },
  { top: "88%", left: "26%" }, { top: "92%", left: "42%" }, { top: "90%", left: "58%" }, { top: "92%", left: "74%" },
  { top: "11%", left: "30%" }, { top: "9%", left: "70%" }, { top: "24%", left: "22%" }, { top: "24%", left: "78%" }, { top: "70%", left: "22%" }, { top: "70%", left: "78%" },
] as const

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
  // Single shared kick dialog — the targeted player (null = closed). Mounting one
  // dialog subtree instead of one per roster card keeps a ~200-player lobby light.
  const [kickTarget, setKickTarget] = useState<Player | null>(null)
  const qrContentRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const { theme } = useThemeStore()
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
    toast.success(t("manager:satellite.paired"))
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
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      {theme.logo ? (
        <img src={theme.logo} alt={theme.appTitle ?? "Razzoozle"} className="mb-6 h-12 w-auto select-none md:h-16" />
      ) : (
        <h1 className="mb-6 text-4xl font-extrabold text-[color:var(--game-fg)]">{theme.appTitle ?? "Razzoozle"}</h1>
      )}
      <div className="mb-10 flex flex-col items-center gap-5">
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
            <div className="group relative flex shrink-0 cursor-pointer rounded-xl bg-white p-4">
              <QRCode
                className="h-auto w-auto"
                size={240}
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

      <h2 className="mb-4 text-4xl font-bold text-[color:var(--game-fg)] drop-shadow-lg">
        {t(text)}
      </h2>

      <div className="mb-4 flex items-center justify-center rounded-lg bg-white px-6 py-3 shadow-sm">
        <span className="text-2xl font-bold text-[color:var(--color-field-ink)]">
          {t("game:playersJoined")}
          {totalPlayers}
        </span>
      </div>

      <div className="mb-6 flex items-center gap-2 rounded-lg bg-white px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-[color:var(--color-field-ink)]/70">
          {t("manager:satellite.codeLabel")}
        </span>
        <input
          value={pairCode}
          onChange={(e) => setPairCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pairDisplay()}
          placeholder="ABC123"
          aria-label={t("manager:satellite.codeLabel")}
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

      {/* Joined players: round avatars floating around the screen, name below. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <AnimatePresence initial={false}>
          {playerList.map((player, i) => {
            const pos = LOBBY_SLOTS[i % LOBBY_SLOTS.length]
            return (
              <motion.div
                key={player.id}
                className="absolute"
                style={{ top: pos.top, left: pos.left, x: "-50%", y: "-50%" }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={reveal.tween()}
              >
                <div className="lobby-bob" style={{ animationDelay: `${(i % 7) * -0.7}s` }}>
                  <button
                    type="button"
                    onClick={() => setKickTarget(player)}
                    aria-label={t("manager:kickPlayer.aria", { name: player.username })}
                    className="pointer-events-auto flex cursor-pointer flex-col items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
                  >
                    <span className="relative">
                      <Avatar src={player.avatar} name={player.username} size={72} />
                      {player.teamId && teamDot(player.teamId) && (
                        <span className={`absolute -right-0.5 -bottom-0.5 size-4 rounded-full ${teamDot(player.teamId)} ring-2 ring-white`} aria-hidden />
                      )}
                    </span>
                    <span className="max-w-28 truncate text-lg font-bold text-[color:var(--color-field-ink)] drop-shadow-sm">
                      {player.username}
                    </span>
                  </button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Single shared kick confirmation — opened by any roster card's X button. */}
      <AlertDialog.Root
        open={kickTarget !== null}
        onOpenChange={(open) => {
          if (!open) setKickTarget(null)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 text-black">
            <AlertDialog.Title className="text-xl font-bold">
              {t("manager:kickPlayer.title")}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-gray-600">
              {t("manager:kickPlayer.description", {
                name: kickTarget?.username ?? "",
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
                  onClick={() => {
                    if (kickTarget) kickPlayer(kickTarget.id)
                  }}
                  className="rounded-md bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                >
                  {t("manager:kickPlayer.confirm")}
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  )
}

export default Room
