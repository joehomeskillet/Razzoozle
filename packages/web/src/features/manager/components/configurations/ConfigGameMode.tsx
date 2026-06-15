import { EVENTS } from "@razzia/common/constants"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import {
  SectionCard,
} from "@razzia/web/features/manager/components/console"
import { useConfig } from "@razzia/web/features/manager/contexts/config-context"
import { Users } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

/**
 * Manager toggle for team mode. Emits `manager:setGameConfig { teamMode }`
 * so the server persists the flag. Mirrors the pattern used by
 * `lowLatencyMode.enabled` (config/game.json, zod-defaulted). The initial value
 * comes from the persisted ManagerConfig (via useConfig) so the toggle reflects
 * the saved state instead of always starting off.
 */
const ConfigGameMode = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const config = useConfig()
  const [teamMode, setTeamMode] = useState(config.teamMode ?? false)
  const [saving, setSaving] = useState(false)

  // Keep the toggle in sync with the persisted config: emitConfig round-trips
  // the saved value back after a save (and on reconnect), so re-sync local state
  // whenever the context value changes.
  useEffect(() => {
    setTeamMode(config.teamMode ?? false)
  }, [config.teamMode])

  const handleToggle = useCallback(() => {
    const next = !teamMode
    setTeamMode(next)
    setSaving(true)

    // Emit a partial patch; server merges it into the persisted GameConfig.
    socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { teamMode: next })

    // Visual confirmation: the server may echo a success event in future; for
    // now a short optimistic toast keeps the UX consistent with SET_THEME.
    setTimeout(() => {
      setSaving(false)
      toast.success(
        next
          ? t("manager:gameMode.teamModeEnabled", {
              defaultValue: "Team-Modus aktiviert",
            })
          : t("manager:gameMode.teamModeDisabled", {
              defaultValue: "Team-Modus deaktiviert",
            }),
      )
    }, 300)
  }, [socket, teamMode, t])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <SectionCard
        icon={<Users className="size-5" aria-hidden />}
        title={t("manager:gameMode.title", { defaultValue: "Spielmodus" })}
        description={t("manager:gameMode.description", {
          defaultValue:
            "Im Team-Modus werden Punkte pro Team aufsummiert und eine Team-Rangliste angezeigt.",
        })}
      >
        {/* Toggle row — same visual language as the theme-tab toggle switches */}
        <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3 outline-2 -outline-offset-2 outline-gray-200">
          <div>
            <p className="font-semibold text-gray-800">
              {t("manager:gameMode.teamMode", { defaultValue: "Team-Modus" })}
            </p>
            <p className="text-sm text-gray-500">
              {t("manager:gameMode.teamModeHint", {
                defaultValue:
                  "Spieler wählen ein Team (Rot / Blau / Grün / Gelb). Erfordert Neustart des Spiels.",
              })}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={teamMode}
            aria-label={t("manager:gameMode.teamMode", {
              defaultValue: "Team-Modus",
            })}
            disabled={saving}
            onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-wait ${
              teamMode ? "bg-[var(--color-primary)]" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
                teamMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {teamMode && (
          <div className="flex flex-wrap gap-2">
            {["red", "blue", "green", "yellow"].map((team) => {
              const colorMap: Record<string, string> = {
                red: "bg-red-500",
                blue: "bg-blue-500",
                green: "bg-green-500",
                yellow: "bg-yellow-400",
              }
              const labelMap: Record<string, string> = {
                red: t("game:teams.red", { defaultValue: "Rot" }),
                blue: t("game:teams.blue", { defaultValue: "Blau" }),
                green: t("game:teams.green", { defaultValue: "Grün" }),
                yellow: t("game:teams.yellow", { defaultValue: "Gelb" }),
              }
              return (
                <span
                  key={team}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700"
                >
                  <span
                    className={`size-3 rounded-full ${colorMap[team] ?? ""}`}
                    aria-hidden
                  />
                  {labelMap[team]}
                </span>
              )
            })}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default ConfigGameMode
