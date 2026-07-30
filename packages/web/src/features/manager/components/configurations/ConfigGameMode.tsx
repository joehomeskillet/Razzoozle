import Badge from "@razzoozle/web/components/manager/Badge"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { LabelRow, ToggleField } from "@razzoozle/web/components/ui"
import { RadioGroup, type RadioGroupOption } from "@razzoozle/web/components/Radio"
import { setLowLatencyPref } from "@razzoozle/web/features/game/utils/lowLatencyPref"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { ListChecks, Pyramid, Waves, type LucideIcon } from "lucide-react"
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

// WP #879 (EXP-05): the experience-modes availability toggle maps onto the CSV
// allow-list `experienceModesEnabled` (games_config.experience_modes_enabled).
// ON unlocks the three launch modes; OFF writes the empty string (none
// unlocked). flowerbattle is deliberately not manager-toggleable yet.
const VALID_EXPERIENCE_MODES = [
  "classic",
  "pyramidclimb",
  "deepseaescape",
] as const

/**
 * Parse the experience-modes CSV allow-list into the set of known tokens.
 * Unknown tokens are ignored for display but preserved server-side.
 */
const parseExperienceModes = (str: string): Set<string> => {
  return new Set(
    str
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter((m) =>
        (VALID_EXPERIENCE_MODES as readonly string[]).includes(m),
      ),
  )
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
  const [experienceModes, setExperienceModes] = useState(
    config.experienceModesEnabled ?? "",
  )
  const [pendingEndScreenMode, setPendingEndScreenMode] = useState<string | null>(null)

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

  useEffect(() => {
    setExperienceModes(config.experienceModesEnabled ?? "")
  }, [config.experienceModesEnabled])

  const teamModeToggle = useOptimisticConfigToggle({
    setValue: setTeamMode,
    patchKey: "teamMode",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.teamModeEnabled")
        : t("manager:gameMode.teamModeDisabled"),
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
        ? t("manager:gameMode.lowLatencyEnabled")
        : t("manager:gameMode.lowLatencyDisabled"),
  })
  const handleLowLatencyToggle = lowLatencyToggle.commit

  const joinLockedToggle = useOptimisticConfigToggle({
    setValue: setJoinLocked,
    patchKey: "joinLocked",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.lobbyLocked")
        : t("manager:gameMode.lobbyUnlocked"),
  })
  const handleJoinLockedToggle = joinLockedToggle.commit

  const randomizeAnswersToggle = useOptimisticConfigToggle({
    setValue: setRandomizeAnswers,
    patchKey: "randomizeAnswers",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.randomizeAnswersEnabled")
        : t("manager:gameMode.randomizeAnswersDisabled"),
  })
  const handleRandomizeAnswersToggle = randomizeAnswersToggle.commit

  const scoringModeToggle = useOptimisticConfigToggle({
    setValue: setScoringMode,
    patchKey: "scoringMode",
    toastMessage: (next) =>
      next === "accuracy"
        ? t("manager:gameMode.accuracyMode")
        : t("manager:gameMode.speedMode"),
  })
  const handleScoringModeChange = scoringModeToggle.commit

  const klassenToggle = useOptimisticConfigToggle({
    setValue: setKlassenEnabled,
    patchKey: "klassenEnabled",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.klassenEnabled")
        : t("manager:gameMode.klassenDisabled"),
  })
  const handleKlassenToggle = klassenToggle.commit

  const endScreenToggle = useOptimisticConfigToggle({
    setValue: setEndScreenModes,
    patchKey: "endScreenModes",
    toastMessage: () =>
      t("manager:gameMode.endScreenModesUpdated"),
  })

  // Availability toggle for experience modes. The persisted field is the CSV
  // allow-list (not a boolean): the boolean toggle commits the full launch set
  // or the empty string, mirroring the endScreenModes CSV handling above.
  const experienceModesToggle = useOptimisticConfigToggle({
    setValue: setExperienceModes,
    patchKey: "experienceModesEnabled",
    toastMessage: (next) =>
      next
        ? t("manager:gameMode.experienceModesEnabled")
        : t("manager:gameMode.experienceModesDisabled"),
  })
  const handleExperienceModesToggle = (next: boolean) =>
    experienceModesToggle.commit(next ? VALID_EXPERIENCE_MODES.join(",") : "")

  useEffect(() => {
    if (!endScreenToggle.saving) setPendingEndScreenMode(null)
  }, [endScreenToggle.saving])

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

      setPendingEndScreenMode(mode)
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
      red: t("game:teams.red"),
      blue: t("game:teams.blue"),
      green: t("game:teams.green"),
      yellow: t("game:teams.yellow"),
    }),
    [t],
  )

  const endScreenModeLabelMap = useMemo<Record<string, string>>(
    () => ({
      full: t("manager:gameMode.endScreenMode.full"),
      top3: t("manager:gameMode.endScreenMode.top3"),
      private: t("manager:gameMode.endScreenMode.private"),
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

  const activeExperienceModes = useMemo(
    () => parseExperienceModes(experienceModes),
    [experienceModes],
  )

  // Mode names shared with the play-tab RadioGroup (manager:selectQuizz) so
  // the same mode reads identically in both places — mirrors how
  // ConfigSelectQuizz reuses manager:gameMode.* keys.
  const experienceModeBadgeMap = useMemo<
    Record<string, { icon: LucideIcon; label: string }>
  >(
    () => ({
      classic: {
        icon: ListChecks,
        label: t("manager:selectQuizz.experienceMode.options.classic.name"),
      },
      pyramidclimb: {
        icon: Pyramid,
        label: t(
          "manager:selectQuizz.experienceMode.options.pyramid_climb.name",
        ),
      },
      deepseaescape: {
        icon: Waves,
        label: t(
          "manager:selectQuizz.experienceMode.options.deep_sea_escape.name",
        ),
      },
    }),
    [t],
  )

  const scoringOptions = useMemo<RadioGroupOption[]>(
    () => [
      {
        value: "speed",
        label: t("manager:gameMode.speedMode"),
        disabled: scoringModeToggle.saving,
      },
      {
        value: "accuracy",
        label: t("manager:gameMode.accuracyMode"),
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
              label={t("manager:gameMode.teamMode")}
              description={t("manager:gameMode.description")}
              checked={teamMode}
              onChange={handleToggle}
              pending={teamModeToggle.saving}
              restartBadge
              statusMessage={pendingStatus(teamModeToggle.saving)}
            />

            {teamMode && (
              <div className="sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-x-4">
                <div aria-hidden className="hidden sm:block" />
                <div className="flex flex-wrap gap-2">
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
              </div>
            )}

            {/* 2. Low-Latency-Modus */}
            <ToggleField
              id="setting-low-latency"
              label={t("manager:gameMode.lowLatency")}
              description={t("manager:gameMode.lowLatencyDescription")}
              checked={lowLatency}
              onChange={handleLowLatencyToggle}
              pending={lowLatencyToggle.saving}
              statusMessage={pendingStatus(lowLatencyToggle.saving)}
            />

            {/* 3. Lobby gesperrt */}
            <ToggleField
              id="setting-lobby-locked"
              label={t("manager:gameMode.lobbyTitle")}
              description={t("manager:gameMode.lobbyDescription")}
              checked={joinLocked}
              onChange={handleJoinLockedToggle}
              pending={joinLockedToggle.saving}
              statusMessage={pendingStatus(joinLockedToggle.saving)}
            />

            {/* 4. Randomize Answers */}
            <ToggleField
              id="setting-randomize-answers"
              label={t("manager:gameMode.randomizeAnswersTitle")}
              description={t("manager:gameMode.randomizeAnswersDescription")}
              checked={randomizeAnswers}
              onChange={handleRandomizeAnswersToggle}
              pending={randomizeAnswersToggle.saving}
              statusMessage={pendingStatus(randomizeAnswersToggle.saving)}
            />
          </div>
        </div>

        {/* Section 2: Experience-Modi (Verfügbarkeits-Toggle, WP #879 EXP-05) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.experience")}
          </h3>
          <div className="flex flex-col gap-4">
            <ToggleField
              id="setting-experience-modes"
              label={t("manager:gameMode.experienceModesTitle")}
              description={t("manager:gameMode.experienceModesDescription")}
              checked={experienceModes.trim().length > 0}
              onChange={handleExperienceModesToggle}
              pending={experienceModesToggle.saving}
              statusMessage={pendingStatus(experienceModesToggle.saving)}
            />

            {experienceModes.trim().length > 0 && (
              <div className="sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-x-4">
                <div aria-hidden className="hidden sm:block" />
                <div className="flex flex-wrap gap-2">
                  {VALID_EXPERIENCE_MODES.filter((mode) =>
                    activeExperienceModes.has(mode),
                  ).map((mode) => {
                    const meta = experienceModeBadgeMap[mode]
                    if (!meta) {
                      return null
                    }
                    const Icon = meta.icon
                    return (
                      <Badge
                        key={mode}
                        className="gap-1.5 bg-[var(--surface-3)] text-[var(--ink-muted)]"
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {meta.label}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Wertung (Scoring Mode) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.scoring")}
          </h3>
          <LabelRow
            id="setting-scoring-mode"
            label={t("manager:gameMode.scoringTitle")}
            description={t("manager:gameMode.scoringDescription")}
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
              className="flex-row flex-wrap items-center gap-4"
              aria-labelledby="setting-scoring-mode-title"
            />
          </LabelRow>
        </div>

        {/* Section 4: Schule (Klassen-Modus) */}
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            {t("manager:gameMode.sections.school")}
          </h3>
          <ToggleField
            id="setting-klassen-mode"
            label={t("manager:gameMode.klassenTitle")}
            description={t("manager:gameMode.klassenDescription")}
            checked={klassenEnabled}
            onChange={handleKlassenToggle}
            pending={klassenToggle.saving}
            restartBadge
            statusMessage={pendingStatus(klassenToggle.saving)}
          />
        </div>

        {/* Section 5: Endbildschirm (End Screen Modes as ToggleFields) */}
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
                  disabled={isLastActive}
                  disabledReason={
                    isLastActive
                      ? t("manager:gameMode.endScreenMinOneActive")
                      : undefined
                  }
                  pending={endScreenToggle.saving && pendingEndScreenMode === mode}
                  statusMessage={pendingEndScreenMode === mode ? pendingStatus(true) : undefined}
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
