import { EVENTS } from "@razzoozle/common/constants"
import { FormSection, ToggleField } from "@razzoozle/web/components/ui"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
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

  const handleToggle = useCallback(
    (next: boolean) => {
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
    },
    [socket, t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <FormSection
        title={t("manager:gameMode.title", { defaultValue: "Spielmodus" })}
        description={t("manager:gameMode.description", {
          defaultValue:
            "Im Team-Modus werden Punkte pro Team aufsummiert und eine Team-Rangliste angezeigt.",
        })}
      >
        <ToggleField
          label={t("manager:gameMode.teamMode", { defaultValue: "Team-Modus" })}
          description={t("manager:gameMode.teamModeHint", {
            defaultValue:
              "Spieler wählen ein Team (Rot / Blau / Grün / Gelb). Erfordert Neustart des Spiels.",
          })}
          checked={teamMode}
          onChange={handleToggle}
          disabled={saving}
        />

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
      </FormSection>
    </div>
  )
}

export default ConfigGameMode
