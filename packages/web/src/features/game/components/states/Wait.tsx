import { EVENTS, TEAMS } from "@razzoozle/common/constants"
import type { Team } from "@razzoozle/common/constants"
import type { PlayerStatusDataMap } from "@razzoozle/common/types/game/status"
import Button from "@razzoozle/web/components/Button"
import Loader from "@razzoozle/web/components/Loader"
import AvatarPicker from "@razzoozle/web/features/game/components/join/AvatarPicker"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { EASE, useReveal } from "@razzoozle/web/features/game/animation/presets"
import { teamSwatch } from "@razzoozle/web/features/game/utils/teams"
import { motion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: PlayerStatusDataMap["WAIT"]
}

const Wait = ({ data: { text, teamMode } }: Props) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const reveal = useReveal()
  const [showPicker, setShowPicker] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  // Only the lobby wait (pre-game) lets the player pick an avatar; the same WAIT
  // state is reused between questions where the picker would be out of place.
  const isLobby = text === "game:waitingForPlayers"

  // Anticipation loop — a gentle "breathing" pulse on the loader + a soft sheen
  // on the heading so the otherwise-static wait screen feels alive. Looping
  // ambient motion is suppressed entirely under reduced-motion (static values),
  // so nothing animates when the user opts out. Cheap: opacity / scale only, no
  // layout — this screen can be on hundreds of clients at once.
  const loaderPulse = reveal.reduced
    ? undefined
    : { scale: [1, 1.04, 1], opacity: [0.92, 1, 0.92] }
  const headingSheen = reveal.reduced ? undefined : { opacity: [0.88, 1, 0.88] }
  const breatheTransition = {
    duration: 2.4,
    ease: EASE.inOut,
    repeat: Infinity,
  }

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <motion.div
        animate={loaderPulse}
        transition={breatheTransition}
        style={{ willChange: "transform, opacity" }}
      >
        <Loader className="h-30" />
      </motion.div>
      <motion.h2
        animate={headingSheen}
        transition={breatheTransition}
        className="mt-5 text-center text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]"
      >
        {t(text)}
      </motion.h2>

      {isLobby && showPicker && (
        <motion.div
          variants={reveal.item()}
          initial="hidden"
          animate="visible"
          transition={reveal.spring}
          className="mt-8 w-full max-w-md rounded-xl bg-white/95 p-4 shadow-lg"
        >
          <AvatarPicker onDone={() => setShowPicker(false)} />
        </motion.div>
      )}

      {isLobby && !showPicker && (
        <div className="mt-8 flex w-full justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowPicker(true)}
          >
            {t("game:avatar.change", { defaultValue: "Avatar ändern" })}
          </Button>
        </div>
      )}

      {/* Team picker — only rendered in the lobby of a team-mode game. The
          server sends teamMode in the lobby WAIT payload; outside team mode the
          picker would be a dead control (SELECT_TEAM is a no-op), so we gate it.
          Visually compact and non-blocking so it doesn't interfere with the
          avatar flow. */}
      {isLobby && teamMode && (
        <motion.div
          variants={reveal.item()}
          initial="hidden"
          animate="visible"
          transition={reveal.spring}
          className="mt-4 w-full max-w-md rounded-xl bg-white/95 px-4 py-3 shadow-lg"
        >
          <p className="mb-2 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            {t("game:teams.pick", { defaultValue: "Team wählen" })}
          </p>
          <div className="flex gap-3" role="group" aria-label={t("game:teams.pick", { defaultValue: "Team wählen" })}>
            {TEAMS.map((team) => {
              const swatch = teamSwatch(team)
              const isSelected = selectedTeam === team
              const handleSelect = () => {
                setSelectedTeam(team)
                socket.emit(EVENTS.PLAYER.SELECT_TEAM, { teamId: team })
              }

              return (
                <button
                  key={team}
                  type="button"
                  onClick={handleSelect}
                  aria-pressed={isSelected}
                  aria-label={t(`game:teams.${team}`, {
                    defaultValue:
                      team.charAt(0).toUpperCase() + team.slice(1),
                  })}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg p-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${
                    isSelected
                      ? `ring-2 ring-offset-1 ${swatch.ring} scale-105`
                      : "hover:scale-105 opacity-80 hover:opacity-100"
                  }`}
                >
                  <span
                    className={`size-10 rounded-full ${swatch.bg} ${isSelected ? "shadow-md" : ""}`}
                  />
                  <span className={`text-xs font-bold ${swatch.label}`}>
                    {t(`game:teams.${team}`, {
                      defaultValue:
                        team.charAt(0).toUpperCase() + team.slice(1),
                    })}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.div>
      )}
    </section>
  )
}

export default Wait
