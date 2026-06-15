import { EVENTS, TEAMS } from "@razzoozle/common/constants"
import type { Team } from "@razzoozle/common/constants"
import type { PlayerStatusDataMap } from "@razzoozle/common/types/game/status"
import Loader from "@razzoozle/web/components/Loader"
import AvatarPicker from "@razzoozle/web/features/game/components/join/AvatarPicker"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useState } from "react"
import { useTranslation } from "react-i18next"

// CSS colour map for the 4 fixed team swatches (client-side only, no i18n needed).
const TEAM_SWATCH: Record<Team, { bg: string; ring: string; label: string }> = {
  red: { bg: "bg-red-500", ring: "ring-red-700", label: "text-red-900" },
  blue: { bg: "bg-blue-500", ring: "ring-blue-700", label: "text-blue-900" },
  green: { bg: "bg-green-500", ring: "ring-green-700", label: "text-green-900" },
  yellow: { bg: "bg-yellow-400", ring: "ring-yellow-600", label: "text-yellow-900" },
}

interface Props {
  data: PlayerStatusDataMap["WAIT"]
}

const Wait = ({ data: { text, teamMode } }: Props) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [showPicker, setShowPicker] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  // Only the lobby wait (pre-game) lets the player pick an avatar; the same WAIT
  // state is reused between questions where the picker would be out of place.
  const isLobby = text === "game:waitingForPlayers"

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <Loader className="h-30" />
      <h2 className="mt-5 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
        {t(text)}
      </h2>

      {isLobby && showPicker && (
        <div className="mt-8 w-full max-w-md rounded-xl bg-white/95 p-4 shadow-lg">
          <AvatarPicker onDone={() => setShowPicker(false)} />
        </div>
      )}

      {/* Team picker — only rendered in the lobby of a team-mode game. The
          server sends teamMode in the lobby WAIT payload; outside team mode the
          picker would be a dead control (SELECT_TEAM is a no-op), so we gate it.
          Visually compact and non-blocking so it doesn't interfere with the
          avatar flow. */}
      {isLobby && teamMode && (
        <div className="mt-4 w-full max-w-md rounded-xl bg-white/95 px-4 py-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold text-gray-600 uppercase tracking-wide">
            {t("game:teams.pick", { defaultValue: "Team wählen" })}
          </p>
          <div className="flex gap-3" role="group" aria-label={t("game:teams.pick", { defaultValue: "Team wählen" })}>
            {TEAMS.map((team) => {
              const swatch = TEAM_SWATCH[team]
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
        </div>
      )}
    </section>
  )
}

export default Wait
