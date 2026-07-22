import Badge from "@razzoozle/web/components/manager/Badge"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { LabelRow, ToggleField } from "@razzoozle/web/components/ui"
import { RadioGroup, type RadioGroupOption } from "@razzoozle/web/components/Radio"
import { setLowLatencyPref } from "@razzoozle/web/features/game/utils/lowLatencyPref"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { useOptimisticConfigToggle } from "./useOptimisticConfigToggle"

const TEAM_COLOR_MAP: Record<string, string> = {
  red: "bg-[var(--team-red)]",
  blue: "bg-[var(--team-blue)]",
  green: "bg-[var(--team-green)]",
  yellow: "bg-[var(--team-yellow)]",
}

const VALID_END_SCREEN_MODES = ["full", "top3", "private"] as const

/**
 * Parse comma-separated modes string into a set of valid modes.
 * Ignores unknown tokens (robustness for legacy data).
 */
const parseModes = (str: string): Set<string> => {
  return new Set(
    str
      .split(",")
      .map((m) => m.trim())
      .filter((m) => (VALID_END_SCREEN_MODES as readonly string[]).includes(m)),
  )
}

/**
 * Reconstruct comma-separated modes string in canonical order.
 */
const stringifyModes = (modes: Set<string>): string => {
  return VALID_END_SCREEN_MODES.filter((m) => modes.has(m)).join(",")
}

/**
 * Manager toggle for team mode. Emits `manager:setGameConfig { teamMode }`
 * so the server persists the flag. Mirrors the pattern used by
 * `lowLatencyMode.enabled` (config/game.json, zod-defaulted). The initial value
 * comes from the persisted ManagerConfig (via useConfig) so the toggle reflects
 * the saved state instead of always starting off.
 *
 * Settings use ToggleField / LabelRow SettingRow slots (restartBadge,
 * statusMessage, disabledReason). Saves are optimistic per-field — no bulk
 * dirty form / ActionFooter.
 */
const ConfigGameMode = () => {
  const { t } = useTranslation()
  const config = useConfig()
  const [teamMode, setTeamMode] = useState(config.teamMode ?? false)
  const [lowLatency, setLowLatency] = useState(
    config.lowLatencyEnabled ?? false,
  )
  const [joinLocked, setJoinLocked] = useState(config.joinLocked ?? false)
  const [randomizeAnswers, setRandomizeAnswers] = useState(
    config.randomizeAnswers ?? false,
  )
  const [scoringMode, setScoringMode] = useState<"speed" | "accuracy">(
    config.scoringMode ?? "speed",
  )
  const [klassenEnabled, setKlassenEnabled] = useState(
    config.klassenEnabled ?? false,
  )
  const [endScreenModes, setEndScreenModes] = useState(
    config.endScreenModes ?? "full,top3,private",
  )

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

  useEffect(() => {
    setKlassenEnabled(config.klassenEnabled ?? false)
  }, [config.klassenEnabled])

  useEffect(() => {
    setEndScreenModes(config.endScreenModes ?? "full,top3,private")
  }, [config.endScreenModes])

  const teamModeToggle = useOptimisticConfigToggle({
    setValue: setTeamMode,
    patchKey: "teamMode",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.teamModeEnabled", {
            defaultValue: "Team-Modus aktiviert",
          })
        : t("manager:gameMode.teamModeDisabled", {
            defaultValue: "Team-Modus deaktiviert",
          }),
  })
  const handleToggle = teamModeToggle.commit

  // Mirrors the choice into localStorage so the in-game manager chrome
  // (GameWrapper, outside ConfigProvider) can gate the LowLatencyHealth
  // widget without re-reading the server config.
  const lowLatencyToggle = useOptimisticConfigToggle({
    setValue: setLowLatency,
    patchKey: "lowLatencyEnabled",
    sideEffect: setLowLatencyPref,
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.lowLatencyEnabled", {
            defaultValue: "Low-Latency-Modus aktiviert",
          })
        : t("manager:gameMode.lowLatencyDisabled", {
            defaultValue: "Low-Latency-Modus deaktiviert",
          }),
  })
  const handleLowLatencyToggle = lowLatencyToggle.commit

  const joinLockedToggle = useOptimisticConfigToggle({
    setValue: setJoinLocked,
    patchKey: "joinLocked",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.lobbyLocked", { defaultValue: "Lobby gesperrt" })
        : t("manager:gameMode.lobbyUnlocked", {
            defaultValue: "Lobby entsperrt",
          }),
  })
  const handleJoinLockedToggle = joinLockedToggle.commit

  const randomizeAnswersToggle = useOptimisticConfigToggle({
    setValue: setRandomizeAnswers,
    patchKey: "randomizeAnswers",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.randomizeAnswersEnabled", {
            defaultValue: "Antworten werden gemischt",
          })
        : t("manager:gameMode.randomizeAnswersDisabled", {
            defaultValue: "Antwortreihenfolge fest",
          }),
  })
  const handleRandomizeAnswersToggle = randomizeAnswersToggle.commit

  const scoringModeToggle = useOptimisticConfigToggle({
    setValue: setScoringMode,
    patchKey: "scoringMode",
    toastMessage: (next) =>
      next === "accuracy"
        ? t("manager:gameMode.accuracyMode", {
            defaultValue: "Genauigkeitsmodus",
          })
        : t("manager:gameMode.speedMode", {
            defaultValue: "Geschwindigkeitsmodus",
          }),
  })
  const handleScoringModeChange = scoringModeToggle.commit

  const klassenToggle = useOptimisticConfigToggle({
    setValue: setKlassenEnabled,
    patchKey: "klassenEnabled",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.klassenEnabled", {
            defaultValue: "Klassen-Modus verfügbar",
          })
        : t("manager:gameMode.klassenDisabled", {
            defaultValue: "Klassen-Modus deaktiviert",
          }),
  })
  const handleKlassenToggle = klassenToggle.commit

  const endScreenToggle = useOptimisticConfigToggle({
    setValue: setEndScreenModes,
    patchKey: "endScreenModes",
    toastMessage: () =>
      t("manager:gameMode.endScreenModesUpdated", {
        defaultValue: "Endbildschirm-Optionen aktualisiert",
      }),
  })

  const handleEndScreenModeToggle = useCallback(
    (mode: string) => {
      // Prevent clicks while saving
      if (endScreenToggle.saving) {
        return
      }

      const current = parseModes(endScreenModes)
      const isActive = current.has(mode)
      const isLastActive = current.size === 1 && isActive

      // No-op: can't deselect the last active mode
      if (isLastActive) {
        return
      }

      const next = new Set(current)
      if (isActive) {
        next.delete(mode)
      } else {
        next.add(mode)
      }

      endScreenToggle.commit(stringifyModes(next))
    },
    [endScreenModes, endScreenToggle],
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

  const endScreenModeLabelMap = useMemo<Record<string, string>>(
    () => ({
      full: t("manager:gameMode.endScreenMode.full", {
        defaultValue: "Vollständig",
      }),
      top3: t("manager:gameMode.endScreenMode.top3", { defaultValue: "Top 3" }),
      private: t("manager:gameMode.endScreenMode.private", {
        defaultValue: "Privat",
      }),
    }),
    [t],
  )

  const endScreenModeDescriptionMap = useMemo<Record<string, string>>(
    () => ({
      full: t("manager:gameMode.endScreenModeDescription.full"),
      top3: t("manager:gameMode.endScreenModeDescription.top3"),
      private: t("manager:gameMode.endScreenModeDescription.private"),
    }),
    [t],
  )

  const activeModes = useMemo(
    () => parseModes(endScreenModes),
    [endScreenModes],
  )

  const scoringOptions = useMemo<RadioGroupOption[]>(
    () => [
      {
        value: "speed",
        label: t("manager:gameMode.speedMode", {
          defaultValue: "Geschwindigkeit",
        }),
        disabled: scoringModeToggle.saving,
      },
      {
        value: "accuracy",
        label: t("manager:gameMode.accuracyMode", {
          defaultValue: "Genauigkeit",
        }),
        disabled: scoringModeToggle.saving,
      },
    ],
    [t, scoringModeToggle.saving],
  )

  /** Pending status slot for optimistic save-in-flight (no new i18n keys). */
  const pendingStatus = (saving: boolean) =>
    saving
      ? {
          text: t("common:loading"),
          tone: "pending" as const,
        }
      : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:gameMode.title")}
          subtitle={t("manager:gameMode.description")}
        />
      </div>

      <div className="flex flex-1 flex-col gap-8 pb-4">
        {/* Section 1: Spielablauf (Team-Modus, Low-Latency, Lobby-Sperre, Antwortreihenfolge) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.flow")}
          </h3>
          <div className="flex flex-col gap-4">
            {/* 1. Team-Modus — requires restart */}
            <ToggleField
              id="setting-team-mode"
              label={t("manager:gameMode.teamMode", {
                defaultValue: "Team-Modus",
              })}
              description={t("manager:gameMode.description", {
                defaultValue:
                  "Im Team-Modus werden Punkte pro Team aufsummiert und eine Team-Rangliste angezeigt.",
              })}
              checked={teamMode}
              onChange={handleToggle}
              disabled={teamModeToggle.saving}
              restartBadge
              statusMessage={pendingStatus(teamModeToggle.saving)}
            />

            {teamMode && (
              <div className="flex flex-wrap gap-2 sm:pl-44">
                {["red", "blue", "green", "yellow"].map((team) => {
                  return (
                    <Badge
                      key={team}
                      className="gap-1.5 bg-[var(--surface-3)] text-[var(--ink-muted)]"
                    >
                      <span
                        className={`size-3 rounded-full ${TEAM_COLOR_MAP[team] ?? ""}`}
                        aria-hidden
                      />
                      {teamLabelMap[team]}
                    </Badge>
                  )
                })}
              </div>
            )}

            {/* 2. Low-Latency-Modus */}
            <ToggleField
              id="setting-low-latency"
              label={t("manager:gameMode.lowLatency", {
                defaultValue: "Low-Latency-Modus",
              })}
              description={t("manager:gameMode.lowLatencyDescription", {
                defaultValue:
                  "Optimiert das Timing fürs schnelle Spielen: Uhr-Synchronisierung, Antwort-Bestätigung und gedrosselte Ranglisten-Updates. Blendet zudem die Latenz-Anzeige für den Host ein.",
              })}
              checked={lowLatency}
              onChange={handleLowLatencyToggle}
              disabled={lowLatencyToggle.saving}
              statusMessage={pendingStatus(lowLatencyToggle.saving)}
            />

            {/* 3. Lobby gesperrt */}
            <ToggleField
              id="setting-lobby-locked"
              label={t("manager:gameMode.lobbyTitle", {
                defaultValue: "Lobby-Sperre",
              })}
              description={t("manager:gameMode.lobbyDescription", {
                defaultValue:
                  "Wenn aktiviert, können neue Spieler nicht mehr der Lobby beitreten. Bestehende Spieler und deren Wiederverbindungen sind nicht betroffen.",
              })}
              checked={joinLocked}
              onChange={handleJoinLockedToggle}
              disabled={joinLockedToggle.saving}
              statusMessage={pendingStatus(joinLockedToggle.saving)}
            />

            {/* 4. Randomize Answers */}
            <ToggleField
              id="setting-randomize-answers"
              label={t("manager:gameMode.randomizeAnswersTitle", {
                defaultValue: "Antwortreihenfolge",
              })}
              description={t("manager:gameMode.randomizeAnswersDescription", {
                defaultValue:
                  "Mischt die Reihenfolge der Antwortoptionen pro Frage zufällig, während die kanonischen Indizes für die Bewertung erhalten bleiben.",
              })}
              checked={randomizeAnswers}
              onChange={handleRandomizeAnswersToggle}
              disabled={randomizeAnswersToggle.saving}
              statusMessage={pendingStatus(randomizeAnswersToggle.saving)}
            />
          </div>
        </div>

        {/* Section 2: Wertung (Scoring Mode) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.scoring")}
          </h3>
          <LabelRow
            id="setting-scoring-mode"
            label={t("manager:gameMode.scoringTitle", {
              defaultValue: "Wertung",
            })}
            description={t("manager:gameMode.scoringDescription", {
              defaultValue:
                "Wählen Sie, wie Punkte berechnet werden. Geschwindigkeit berücksichtigt die Antwortzeit, Genauigkeit zählt nur richtige oder falsche Antworten.",
            })}
            disabled={scoringModeToggle.saving}
            statusMessage={pendingStatus(scoringModeToggle.saving)}
          >
            <RadioGroup
              name="scoring"
              value={scoringMode}
              onChange={(v) =>
                handleScoringModeChange(v as "speed" | "accuracy")
              }
              options={scoringOptions}
              aria-labelledby="setting-scoring-mode-title"
            />
          </LabelRow>
        </div>

        {/* Section 3: Schule (Klassen-Modus) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.school")}
          </h3>
          <ToggleField
            id="setting-klassen-mode"
            label={t("manager:gameMode.klassenTitle", {
              defaultValue: "Klassen-Modus",
            })}
            description={t("manager:gameMode.klassenDescription", {
              defaultValue:
                "Aktiviert den Klassen-Modus, in dem Spieler aus einem von der Lehrkraft verwalteten Schülerverzeichnis beitreten können.",
            })}
            checked={klassenEnabled}
            onChange={handleKlassenToggle}
            disabled={klassenToggle.saving}
            restartBadge
            statusMessage={pendingStatus(klassenToggle.saving)}
          />
        </div>

        {/* Section 4: Endbildschirm (End Screen Modes as ToggleFields) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.endScreen")}
          </h3>
          <div className="flex flex-col gap-4">
            {VALID_END_SCREEN_MODES.map((mode) => {
              const isActive = activeModes.has(mode)
              const isLastActive = activeModes.size === 1 && isActive
              return (
                <ToggleField
                  key={mode}
                  id={`setting-end-screen-${mode}`}
                  label={endScreenModeLabelMap[mode]}
                  description={endScreenModeDescriptionMap[mode]}
                  checked={isActive}
                  onChange={() => handleEndScreenModeToggle(mode)}
                  disabled={
                    isLastActive || endScreenToggle.saving
                  }
                  disabledReason={
                    isLastActive
                      ? t("manager:gameMode.endScreenMinOneActive")
                      : endScreenToggle.saving
                        ? t("common:loading")
                        : undefined
                  }
                  statusMessage={pendingStatus(endScreenToggle.saving)}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfigGameMode
