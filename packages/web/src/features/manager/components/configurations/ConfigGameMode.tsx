import { EVENTS } from "@razzoozle/common/constants"
import { FormSection, ToggleField } from "@razzoozle/web/components/ui"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { setLowLatencyPref } from "@razzoozle/web/features/game/utils/lowLatencyPref"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const TEAM_COLOR_MAP: Record<string, string> = {
  red: "bg-red-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  yellow: "bg-yellow-400",
}

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
  const [lowLatency, setLowLatency] = useState(config.lowLatencyEnabled ?? false)
  const [joinLocked, setJoinLocked] = useState(config.joinLocked ?? false)
  const [randomizeAnswers, setRandomizeAnswers] = useState(config.randomizeAnswers ?? false)
  const [scoringMode, setScoringMode] = useState<"speed" | "accuracy">(config.scoringMode ?? "speed")
  const [saving, setSaving] = useState(false)
  const [savingLowLatency, setSavingLowLatency] = useState(false)
  const [savingJoinLocked, setSavingJoinLocked] = useState(false)
  const [savingRandomizeAnswers, setSavingRandomizeAnswers] = useState(false)
  const [savingScoringMode, setSavingScoringMode] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lowLatencyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const joinLockedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const randomizeAnswersTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const scoringModeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep the toggle in sync with the persisted config: emitConfig round-trips
  // the saved value back after a save (and on reconnect), so re-sync local state
  // whenever the context value changes.
  useEffect(() => {
    setTeamMode(config.teamMode ?? false)
  }, [config.teamMode])

  useEffect(() => {
    const next = config.lowLatencyEnabled ?? false
    setLowLatency(next)
    setLowLatencyPref(next)
  }, [config.lowLatencyEnabled])

  useEffect(() => {
    setJoinLocked(config.joinLocked ?? false)
  }, [config.joinLocked])

  useEffect(() => {
    setRandomizeAnswers(config.randomizeAnswers ?? false)
  }, [config.randomizeAnswers])

  useEffect(() => {
    setScoringMode(config.scoringMode ?? "speed")
  }, [config.scoringMode])

  // Clear any pending optimistic-toast timeout on unmount.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (lowLatencyTimeoutRef.current !== null) {
        clearTimeout(lowLatencyTimeoutRef.current)
      }
      if (joinLockedTimeoutRef.current !== null) {
        clearTimeout(joinLockedTimeoutRef.current)
      }
      if (randomizeAnswersTimeoutRef.current !== null) {
        clearTimeout(randomizeAnswersTimeoutRef.current)
      }
      if (scoringModeTimeoutRef.current !== null) {
        clearTimeout(scoringModeTimeoutRef.current)
      }
    }
  }, [])

  const handleToggle = useCallback(
    (next: boolean) => {
      setTeamMode(next)
      setSaving(true)

      // Emit a partial patch; server merges it into the persisted GameConfig.
      socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { teamMode: next })

      // Visual confirmation: the server may echo a success event in future; for
      // now a short optimistic toast keeps the UX consistent with SET_THEME.
      // ponytail: server SET_GAME_CONFIG has no ack; toast is optimistic
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
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

  const handleLowLatencyToggle = useCallback(
    (next: boolean) => {
      setLowLatency(next)
      setSavingLowLatency(true)
      // Mirror the choice into localStorage so the in-game manager chrome
      // (GameWrapper, outside ConfigProvider) can gate the LowLatencyHealth
      // widget without re-reading the server config.
      setLowLatencyPref(next)

      // Emit a partial patch; server merges `lowLatencyEnabled` into the
      // persisted lowLatencyMode.enabled flag (mirrors the teamMode toggle).
      socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { lowLatencyEnabled: next })

      // ponytail: server SET_GAME_CONFIG has no ack; toast is optimistic
      if (lowLatencyTimeoutRef.current !== null) {
        clearTimeout(lowLatencyTimeoutRef.current)
      }
      lowLatencyTimeoutRef.current = setTimeout(() => {
        setSavingLowLatency(false)
        toast.success(
          next
            ? t("manager:gameMode.lowLatencyEnabled", {
                defaultValue: "Low-Latency-Modus aktiviert",
              })
            : t("manager:gameMode.lowLatencyDisabled", {
                defaultValue: "Low-Latency-Modus deaktiviert",
              }),
        )
      }, 300)
    },
    [socket, t],
  )

  const handleJoinLockedToggle = useCallback(
    (next: boolean) => {
      setJoinLocked(next)
      setSavingJoinLocked(true)

      // Emit a partial patch; server merges it into the persisted GameConfig.
      socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { joinLocked: next })

      // ponytail: server SET_GAME_CONFIG has no ack; toast is optimistic
      if (joinLockedTimeoutRef.current !== null) {
        clearTimeout(joinLockedTimeoutRef.current)
      }
      joinLockedTimeoutRef.current = setTimeout(() => {
        setSavingJoinLocked(false)
        toast.success(
          next
            ? t("manager:gameMode.lobbyLocked", {
                defaultValue: "Lobby gesperrt",
              })
            : t("manager:gameMode.lobbyUnlocked", {
                defaultValue: "Lobby entsperrt",
              }),
        )
      }, 300)
    },
    [socket, t],
  )

  const handleRandomizeAnswersToggle = useCallback(
    (next: boolean) => {
      setRandomizeAnswers(next)
      setSavingRandomizeAnswers(true)

      // Emit a partial patch; server merges it into the persisted GameConfig.
      socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { randomizeAnswers: next })

      // ponytail: server SET_GAME_CONFIG has no ack; toast is optimistic
      if (randomizeAnswersTimeoutRef.current !== null) {
        clearTimeout(randomizeAnswersTimeoutRef.current)
      }
      randomizeAnswersTimeoutRef.current = setTimeout(() => {
        setSavingRandomizeAnswers(false)
        toast.success(
          next
            ? t("manager:gameMode.randomizeAnswersEnabled", {
                defaultValue: "Antworten werden gemischt",
              })
            : t("manager:gameMode.randomizeAnswersDisabled", {
                defaultValue: "Antwortreihenfolge fest",
              }),
        )
      }, 300)
    },
    [socket, t],
  )

  const handleScoringModeChange = useCallback(
    (next: "speed" | "accuracy") => {
      setScoringMode(next)
      setSavingScoringMode(true)

      socket.emit(EVENTS.MANAGER.SET_GAME_CONFIG, { scoringMode: next })

      if (scoringModeTimeoutRef.current !== null) {
        clearTimeout(scoringModeTimeoutRef.current)
      }
      scoringModeTimeoutRef.current = setTimeout(() => {
        setSavingScoringMode(false)
        toast.success(
          next === "accuracy"
            ? t("manager:gameMode.accuracyMode", {
                defaultValue: "Genauigkeitsmodus",
              })
            : t("manager:gameMode.speedMode", {
                defaultValue: "Geschwindigkeitsmodus",
              }),
        )
      }, 300)
    },
    [socket, t],
  )

  const teamLabelMap = useMemo<Record<string, string>>(
    () => ({
      red: t("game:teams.red", { defaultValue: "Rot" }),
      blue: t("game:teams.blue", { defaultValue: "Blau" }),
      green: t("game:teams.green", { defaultValue: "Grün" }),
      yellow: t("game:teams.yellow", { defaultValue: "Gelb" }),
    }),
    [t],
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
              return (
                <span
                  key={team}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700"
                >
                  <span
                    className={`size-3 rounded-full ${TEAM_COLOR_MAP[team] ?? ""}`}
                    aria-hidden
                  />
                  {teamLabelMap[team]}
                </span>
              )
            })}
          </div>
        )}
      </FormSection>

      <FormSection
        title={t("manager:gameMode.lowLatencyTitle", {
          defaultValue: "Low-Latency-Modus",
        })}
        description={t("manager:gameMode.lowLatencyDescription", {
          defaultValue:
            "Optimiert das Timing fürs schnelle Spielen: Uhr-Synchronisierung, Antwort-Bestätigung und gedrosselte Ranglisten-Updates. Blendet zudem die Latenz-Anzeige für den Host ein.",
        })}
      >
        <ToggleField
          label={t("manager:gameMode.lowLatency", {
            defaultValue: "Low-Latency-Modus",
          })}
          description={t("manager:gameMode.lowLatencyHint", {
            defaultValue:
              "Reduziert die wahrgenommene Verzögerung. Erfordert einen Neustart des Spiels.",
          })}
          checked={lowLatency}
          onChange={handleLowLatencyToggle}
          disabled={savingLowLatency}
        />
      </FormSection>

      <FormSection
        title={t("manager:gameMode.lobbyTitle", {
          defaultValue: "Lobby-Sperre",
        })}
        description={t("manager:gameMode.lobbyDescription", {
          defaultValue:
            "Wenn aktiviert, können neue Spieler nicht mehr der Lobby beitreten. Bestehende Spieler und deren Wiederverbindungen sind nicht betroffen.",
        })}
      >
        <ToggleField
          label={t("manager:gameMode.lobbyLocked", { defaultValue: "Lobby sperren" })}
          description={t("manager:gameMode.lobbyLockedHint", {
            defaultValue:
              "Sperrt die Lobby für neue Spieler, während bestehende Spieler weiterhin beitreten können.",
          })}
          checked={joinLocked}
          onChange={handleJoinLockedToggle}
          disabled={savingJoinLocked}
        />
      </FormSection>

      <FormSection
        title={t("manager:gameMode.randomizeAnswersTitle", {
          defaultValue: "Antwortreihenfolge",
        })}
        description={t("manager:gameMode.randomizeAnswersDescription", {
          defaultValue:
            "Mischt die Reihenfolge der Antwortoptionen pro Frage zufällig, während die kanonischen Indizes für die Bewertung erhalten bleiben.",
        })}
      >
        <ToggleField
          label={t("manager:gameMode.randomizeAnswers", {
            defaultValue: "Antworten mischen",
          })}
          description={t("manager:gameMode.randomizeAnswersHint", {
            defaultValue:
              "Randomisiert die Anzeigereihenfolge der Antworten pro Frage.",
          })}
          checked={randomizeAnswers}
          onChange={handleRandomizeAnswersToggle}
          disabled={savingRandomizeAnswers}
        />
      </FormSection>

      <FormSection
        title={t("manager:gameMode.scoringTitle", {
          defaultValue: "Wertung",
        })}
        description={t("manager:gameMode.scoringDescription", {
          defaultValue:
            "Wählen Sie, wie Punkte berechnet werden. Geschwindigkeit berücksichtigt die Antwortzeit, Genauigkeit zählt nur richtige oder falsche Antworten.",
        })}
      >
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="scoring"
              value="speed"
              checked={scoringMode === "speed"}
              onChange={() => handleScoringModeChange("speed")}
              disabled={savingScoringMode}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-gray-900">
              {t("manager:gameMode.speedMode", {
                defaultValue: "Geschwindigkeit",
              })}
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="scoring"
              value="accuracy"
              checked={scoringMode === "accuracy"}
              onChange={() => handleScoringModeChange("accuracy")}
              disabled={savingScoringMode}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-gray-900">
              {t("manager:gameMode.accuracyMode", {
                defaultValue: "Genauigkeit",
              })}
            </span>
          </label>
        </div>
      </FormSection>
    </div>
  )
}

export default ConfigGameMode
