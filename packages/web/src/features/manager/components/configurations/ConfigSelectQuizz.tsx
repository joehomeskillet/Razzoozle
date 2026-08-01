import { EVENTS } from "@razzoozle/common/constants"
import type {
  ExperienceMode,
  SelectedModes,
} from "@razzoozle/common/types/game/socket"
import Input from "@razzoozle/web/components/Input"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import {
  RadioGroup,
  type RadioGroupOption,
} from "@razzoozle/web/components/Radio"
import Select from "@razzoozle/web/components/Select"
import {
  ActionFooterCompact,
  FormSection,
  LabelRow,
} from "@razzoozle/web/components/ui"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  SelectableRow,
} from "@razzoozle/web/features/manager/components/console"
import {
  listContainerMotion,
  listItemMotion,
} from "@razzoozle/web/features/manager/components/console/listMotion"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useClassManager } from "@razzoozle/web/features/manager/components/configurations/klassen/useClassManager"
import { ParticipantCapSetting } from "@razzoozle/web/features/manager/components/configurations/ParticipantCapSetting"
import { useNavigate } from "@tanstack/react-router"
import {
  Flower2,
  ListChecks,
  Pyramid,
  Waves,
  type LucideIcon,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

/** Manager-selectable experience modes (WP-EXP-05, extended WP-FLB-18) — UI option keys. */
type ExperienceModeKey =
  "classic" | "pyramid_climb" | "deep_sea_escape" | "flower_battle"

interface ExperienceModeOption {
  key: ExperienceModeKey
  /** Wire value for SelectedModes.experienceMode (rust ExperienceMode binding). */
  wire: ExperienceMode
  /** Token in the experienceModesEnabled CSV allow-list (lowercase, no separators). */
  csvToken: string
  icon: LucideIcon
  /** Team play is required for this mode (E-13) — surfaces the assignment control. */
  requiresTeams?: boolean
}

// Four options total. flower_battle joined in WP-FLB-18 (csvToken "flowerbattle"
// mirrors the allow-list comment in packages/common/src/types/manager.ts —
// no server-side canonicalization of this token exists yet to grep against).
const EXPERIENCE_MODE_OPTIONS: readonly ExperienceModeOption[] = [
  { key: "classic", wire: "classic", csvToken: "classic", icon: ListChecks },
  {
    key: "pyramid_climb",
    wire: "pyramidClimb",
    csvToken: "pyramidclimb",
    icon: Pyramid,
    requiresTeams: true,
  },
  {
    key: "deep_sea_escape",
    wire: "deepSeaEscape",
    csvToken: "deepseaescape",
    icon: Waves,
  },
  {
    key: "flower_battle",
    wire: "flowerBattle",
    csvToken: "flowerbattle",
    icon: Flower2,
    requiresTeams: true,
  },
]

export interface ExperienceModeSectionProps {
  /** Parsed CSV allow-list (lowercase csvTokens) — parent computes it once. */
  unlockedExperienceModes: ReadonlySet<string>
  experienceMode: ExperienceModeKey
  onExperienceModeChange: (next: ExperienceModeKey) => void
}

/**
 * Experience-mode RadioGroup + its own visibility gate (WP-EXP-05). Renders
 * `null` when no mode is unlocked. Extracted out of ConfigSelectQuizz's
 * `{selected && (...)}` panel (only mounts after a quiz-row click, which a
 * static SSR render can never simulate) so the "exactly 3 options" +
 * "hidden until unlocked" behavior stays independently testable.
 */
export const ExperienceModeSection = ({
  unlockedExperienceModes,
  experienceMode,
  onExperienceModeChange,
}: ExperienceModeSectionProps) => {
  const { t } = useTranslation()

  const active = EXPERIENCE_MODE_OPTIONS.some((opt) =>
    unlockedExperienceModes.has(opt.csvToken),
  )

  if (!active) {
    return null
  }

  const selectedOption = EXPERIENCE_MODE_OPTIONS.find(
    (opt) => opt.key === experienceMode,
  )

  const options: RadioGroupOption[] = EXPERIENCE_MODE_OPTIONS.map((opt) => {
    const Icon = opt.icon
    return {
      value: opt.key,
      disabled: !unlockedExperienceModes.has(opt.csvToken),
      label: (
        <span className="flex items-start gap-3">
          <Icon
            className="mt-0.5 size-5 shrink-0 text-[var(--ink-muted)]"
            aria-hidden
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--ink)]">
              {t(`manager:selectQuizz.experienceMode.options.${opt.key}.name`)}
            </span>
            <span className="text-xs font-normal text-[var(--ink-muted)]">
              {t(
                `manager:selectQuizz.experienceMode.options.${opt.key}.description`,
              )}
            </span>
            <span className="text-xs font-normal text-[var(--ink-muted)]">
              {t("manager:selectQuizz.experienceMode.devicesOnlyHint")}
            </span>
          </span>
        </span>
      ),
    }
  })

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-[var(--ink)]">
        {t("manager:selectQuizz.experienceMode.label")}
      </legend>
      <RadioGroup
        name="experience-mode"
        value={experienceMode}
        onChange={(v) => onExperienceModeChange(v as ExperienceModeKey)}
        options={options}
        aria-label={t("manager:selectQuizz.experienceMode.label")}
        data-testid="experience-mode-group"
      />
      {/* Vorschau-Platzhalter — layout slot only, no artwork (WP-EXP-05). */}
      <div
        aria-label={t("manager:selectQuizz.experienceMode.previewPlaceholder")}
        className="flex h-24 items-center justify-center rounded-[var(--radius-theme)] border border-dashed border-[var(--border-hairline)] bg-[var(--surface)]"
        data-testid="experience-mode-preview"
      >
        <div
          aria-hidden
          className="flex items-center gap-2 text-[var(--ink-muted)]"
        >
          {selectedOption && <selectedOption.icon className="size-5" />}
          <span className="text-xs">
            {t("manager:selectQuizz.experienceMode.previewPlaceholder")}
          </span>
        </div>
      </div>
    </fieldset>
  )
}

export const getPlayActionDisabledReasons = (
  selected: string | null,
  klassenMode: boolean,
  classId: string,
  reasons: { selectQuiz: string; selectClass: string },
) => {
  const selectQuizReason = selected ? undefined : reasons.selectQuiz

  return {
    copy: selectQuizReason,
    start:
      selectQuizReason ??
      (klassenMode && !classId ? reasons.selectClass : undefined),
  }
}

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const config = useConfig()
  const navigate = useNavigate()
  const { classes } = useClassManager()
  const [selected, setSelected] = useState<string | null>(null)
  const [scoringMode, setScoringMode] = useState<"speed" | "accuracy">("speed")
  const [teamMode, setTeamMode] = useState(false)
  const [teamAssignment, setTeamAssignment] = useState<"self" | "auto">("self")
  const [klassenMode, setKlassenMode] = useState(false)
  const [classId, setClassId] = useState<string>("")
  const [endScreen, setEndScreen] = useState<string>("full")
  const [participantCap, setParticipantCap] = useState<number | null>(null)
  const [experienceMode, setExperienceMode] =
    useState<ExperienceModeKey>("classic")
  const [search, setSearch] = useState("")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const list = useMemo(() => quizzList.filter((q) => !q.archived), [quizzList])
  // Same live-search matching as the Quiz tab (QuizzList/useQuizzManager):
  // case-insensitive substring match on subject. Filtered list only feeds
  // rendering — `list` (unfiltered) still drives the selection-reset effect
  // below, so filtering a selected quiz out of view doesn't clear it.
  const filteredList = useMemo(() => {
    const query = search.trim().toLowerCase()

    return query.length === 0
      ? list
      : list.filter((q) => q.subject.toLowerCase().includes(query))
  }, [list, search])

  useEffect(() => {
    if (selected && !list.some((q) => q.id === selected)) {
      setSelected(null)
    }
  }, [list, selected])

  // Parse endScreenModes CSV and set defaults
  useEffect(() => {
    const modes = config.endScreenModes?.split(",").map((m) => m.trim()) ?? [
      "full",
      "top3",
      "private",
    ]
    if (modes.length > 0) {
      setEndScreen(modes[0])
    }
  }, [config.endScreenModes])

  // Reset classId when klassenMode is toggled off
  useEffect(() => {
    if (!klassenMode) {
      setClassId("")
    }
  }, [klassenMode])

  // Reset classId if it points to an inactive class (WP-E4). The `active`
  // field only lands on the wire with WP-E1; `!== false` treats undefined as
  // active so every class stays selectable pre-merge.
  useEffect(() => {
    if (
      classId &&
      !classes.some(
        (cls) =>
          String(cls.id) === classId &&
          (cls as { active?: boolean }).active !== false,
      )
    ) {
      setClassId("")
    }
  }, [classes, classId])

  const handleSelect = (id: string) => () =>
    setSelected((current) => (current === id ? null : id))

  // Unlocked experience modes from the global CSV allow-list (toggled in the
  // game-mode tab, WP #879 EXP-05). None unlocked → the RadioGroup stays hidden.
  const unlockedExperienceModes = useMemo(() => {
    const tokens = (config.experienceModesEnabled ?? "")
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean)

    return new Set(tokens)
  }, [config.experienceModesEnabled])

  const experienceModesActive = EXPERIENCE_MODE_OPTIONS.some((o) =>
    unlockedExperienceModes.has(o.csvToken),
  )

  // Keep the selection on an unlocked mode when the allow-list changes.
  useEffect(() => {
    if (!experienceModesActive) {
      return
    }
    const current = EXPERIENCE_MODE_OPTIONS.find(
      (o) => o.key === experienceMode,
    )
    if (!current || !unlockedExperienceModes.has(current.csvToken)) {
      const first = EXPERIENCE_MODE_OPTIONS.find((o) =>
        unlockedExperienceModes.has(o.csvToken),
      )
      if (first) {
        setExperienceMode(first.key)
      }
    }
  }, [experienceModesActive, experienceMode, unlockedExperienceModes])

  // E-13: pyramid_climb and flower_battle are team play — surface the shared
  // team-assignment control and force teamMode in the create payload (server
  // soft-gates it regardless, evaluate_experience_start_gate treats both the
  // same way).
  const selectedRequiresTeams =
    experienceModesActive &&
    (EXPERIENCE_MODE_OPTIONS.find((o) => o.key === experienceMode)
      ?.requiresTeams ??
      false)

  const handleSubmit = useCallback(() => {
    if (!selected) {
      return
    }

    // Check if klassenMode is on but no class is selected
    if (klassenMode && !classId) {
      toast.error(t("manager:selectQuizz.klassenModeNeedsClass"))
      return
    }

    // Check which modes are available and build the payload
    const selectedModes: SelectedModes = {}
    let hasCustomModes = false

    if (config.scoringMode !== undefined) {
      selectedModes.scoringMode = scoringMode
      hasCustomModes = true
    }

    // Experience presentation mode (WP #879 EXP-05): only send the selected
    // mode when it is unlocked — the server clamps against the same allow-list.
    if (experienceModesActive) {
      const opt = EXPERIENCE_MODE_OPTIONS.find((o) => o.key === experienceMode)
      if (opt && unlockedExperienceModes.has(opt.csvToken)) {
        selectedModes.experienceMode = opt.wire
        hasCustomModes = true
      }
    }

    if (config.teamMode === true) {
      // E-13: pyramid_climb / flower_battle imply team play — force team
      // mode + assignment even when the standalone team toggle is off.
      const effectiveTeamMode = teamMode || selectedRequiresTeams
      selectedModes.teamMode = effectiveTeamMode
      if (effectiveTeamMode) {
        selectedModes.teamAssignment = teamAssignment
      }
      hasCustomModes = true
    }

    if (config.klassenEnabled === true) {
      selectedModes.klassen = klassenMode
      hasCustomModes = true
    }

    const endScreenModes =
      config.endScreenModes?.split(",").map((m) => m.trim()) ?? []
    if (endScreenModes.length > 1) {
      selectedModes.endScreen = endScreen as "full" | "top3" | "private"
      hasCustomModes = true
    }

    // Participant cap from manager form (optional)
    if (participantCap !== null) {
      selectedModes.participantCap = participantCap
      hasCustomModes = true
    }

    if (hasCustomModes) {
      socket.emit(EVENTS.GAME.CREATE, {
        quizzId: selected,
        selectedModes,
        classId: klassenMode && classId ? parseInt(classId, 10) : undefined,
      })
    } else {
      socket.emit(EVENTS.GAME.CREATE, selected)
    }
  }, [
    socket,
    selected,
    config,
    scoringMode,
    teamMode,
    teamAssignment,
    klassenMode,
    classId,
    endScreen,
    participantCap,
    experienceModesActive,
    experienceMode,
    unlockedExperienceModes,
    selectedRequiresTeams,
    t,
  ])

  const handleCopySoloLink = async () => {
    if (!selected) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/quizz/${selected}/solo`,
      )
      toast.success(t("common:copied"))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  // Parse endScreenModes for the select
  const endScreenModesList = useMemo(() => {
    return (
      config.endScreenModes?.split(",").map((m) => m.trim()) ?? [
        "full",
        "top3",
        "private",
      ]
    )
  }, [config.endScreenModes])

  if (list.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <PageHeader
          title={t("manager:tabs.play")}
          subtitle={t("manager:selectQuizz.intro")}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            icon={ListChecks}
            headline={t("manager:quizz.notFound")}
            hint={t("manager:quizz.pleaseCreate")}
            action={{
              label: t("manager:quizz.create"),
              onClick: () => void navigate({ to: "/manager/quizz" }),
            }}
          />
        </div>
      </div>
    )
  }

  const footerControlsDisabled = !selected
  const actionDisabledReasons = getPlayActionDisabledReasons(
    selected,
    klassenMode,
    classId,
    {
      selectQuiz: t("manager:quizz.pleaseSelect"),
      selectClass: t("manager:selectQuizz.klassenModeNeedsClass"),
    },
  )

  return (
    <>
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <PageHeader
            title={t("manager:tabs.play")}
            subtitle={t("manager:selectQuizz.intro")}
          />
          <label htmlFor="play-quizz-search" className="sr-only">
            {t("manager:quizz.search")}
          </label>
          <Input
            id="play-quizz-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:quizz.searchPlaceholder")}
            className="min-h-11 w-full rounded-[var(--radius-theme)]"
          />
        </div>

        {/* Keep start options in page content; compact footer contains actions only. */}
        <FormSection
          title={t("manager:selectQuizz.optionsTitle", {
            defaultValue: "Startoptionen",
          })}
          className="mb-4 shrink-0"
        >
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
            {config.scoringMode !== undefined && (
              <LabelRow
                label={t("manager:gameMode.speedMode")}
                htmlFor="play-scoring-mode"
              >
                <Select
                  id="play-scoring-mode"
                  value={scoringMode}
                  disabled={footerControlsDisabled}
                  onChange={(e) =>
                    setScoringMode(
                      e.target.value === "accuracy" ? "accuracy" : "speed",
                    )
                  }
                  data-testid="play-scoring-mode"
                  className="min-h-11 min-w-[9rem]"
                >
                  <option value="speed">
                    {t("manager:gameMode.speedMode")}
                  </option>
                  <option value="accuracy">
                    {t("manager:gameMode.accuracyMode", {
                      defaultValue: "Genauigkeit",
                    })}
                  </option>
                </Select>
              </LabelRow>
            )}

            {experienceModesActive && (
              <LabelRow
                label={t("manager:selectQuizz.experienceMode.label")}
                htmlFor="play-experience-mode"
              >
                <Select
                  id="play-experience-mode"
                  value={experienceMode}
                  disabled={footerControlsDisabled}
                  onChange={(e) =>
                    setExperienceMode(e.target.value as ExperienceModeKey)
                  }
                  data-testid="experience-mode-select"
                  className="min-h-11 min-w-[10rem]"
                >
                  {EXPERIENCE_MODE_OPTIONS.map((opt) => (
                    <option
                      key={opt.key}
                      value={opt.key}
                      disabled={!unlockedExperienceModes.has(opt.csvToken)}
                    >
                      {t(
                        `manager:selectQuizz.experienceMode.options.${opt.key}.name`,
                      )}
                    </option>
                  ))}
                </Select>
              </LabelRow>
            )}

            {config.teamMode === true && (
              <LabelRow
                label={t("manager:gameMode.teamMode")}
                htmlFor="play-team-mode"
              >
                <Select
                  id="play-team-mode"
                  value={
                    teamMode || selectedRequiresTeams ? teamAssignment : "off"
                  }
                  disabled={footerControlsDisabled || selectedRequiresTeams}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === "off") {
                      setTeamMode(false)
                    } else {
                      setTeamMode(true)
                      setTeamAssignment(v as "self" | "auto")
                    }
                  }}
                  data-testid="play-team-mode"
                  className="min-h-11 min-w-[9rem]"
                >
                  {!selectedRequiresTeams && (
                    <option value="off">
                      {t("common:off", { defaultValue: "Aus" })}
                    </option>
                  )}
                  <option value="self">
                    {t("manager:selectQuizz.teamAssignment.self")}
                  </option>
                  <option value="auto">
                    {t("manager:selectQuizz.teamAssignment.auto")}
                  </option>
                </Select>
              </LabelRow>
            )}

            {config.klassenEnabled === true && (
              <LabelRow
                label={t("manager:gameMode.klassenMode")}
                htmlFor="play-klassen-mode"
              >
                <Select
                  id="play-klassen-mode"
                  value={klassenMode ? "on" : "off"}
                  disabled={footerControlsDisabled}
                  onChange={(e) => setKlassenMode(e.target.value === "on")}
                  data-testid="play-klassen-mode"
                  className="min-h-11 min-w-[8rem]"
                >
                  <option value="off">
                    {t("common:off", { defaultValue: "Aus" })}
                  </option>
                  <option value="on">
                    {t("common:on", { defaultValue: "An" })}
                  </option>
                </Select>
              </LabelRow>
            )}

            {config.klassenEnabled === true && klassenMode && (
              <div className="xl:col-span-2">
                <LabelRow
                  label={t("manager:selectQuizz.selectClass")}
                  htmlFor="class-select"
                >
                  <Select
                    id="class-select"
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    data-testid="class-select"
                    disabled={footerControlsDisabled}
                    className="min-h-11 min-w-[10rem]"
                  >
                    <option value="">
                      {t("manager:selectQuizz.chooseClass")}
                    </option>
                    {classes
                      .filter(
                        (cls) => (cls as { active?: boolean }).active !== false,
                      )
                      .map((cls) => (
                        <option key={cls.id} value={String(cls.id)}>
                          {cls.name}
                        </option>
                      ))}
                  </Select>
                </LabelRow>
              </div>
            )}

            {endScreenModesList.length > 1 && (
              <LabelRow
                label={t("manager:gameMode.endScreenSelectTitle")}
                htmlFor="endscreen-select"
              >
                <Select
                  id="endscreen-select"
                  value={endScreen}
                  disabled={footerControlsDisabled}
                  onChange={(e) => setEndScreen(e.target.value)}
                  className="min-h-11 min-w-[9rem]"
                >
                  {endScreenModesList.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`manager:gameMode.endScreenMode.${mode}`)}
                    </option>
                  ))}
                </Select>
              </LabelRow>
            )}

            <ParticipantCapSetting
              variant="compact"
              value={participantCap}
              onChange={setParticipantCap}
              disabled={footerControlsDisabled}
              testIdPrefix="select-quizz-"
            />
          </div>
        </FormSection>

        <motion.div
          role="radiogroup"
          aria-label={t("manager:quizz.startGame")}
          className="min-h-0 flex-1 space-y-3 p-0.5"
          {...listContainerMotion(reducedMotion)}
        >
          {filteredList.map((quizz, index) => (
            <motion.div
              key={quizz.id}
              {...listItemMotion(index, reducedMotion)}
            >
              <SelectableRow
                data-testid={`quizz-row-${quizz.id}`}
                title={quizz.subject}
                meta={
                  quizz.questionCount != null
                    ? t("manager:selectQuizz.meta.questions", {
                        count: quizz.questionCount,
                      })
                    : undefined
                }
                selected={selected === quizz.id}
                onClick={handleSelect(quizz.id)}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      <ActionFooterCompact
        instanceId="play"
        actions={[
          {
            key: "play-copy",
            iconName: "Copy",
            intent: "secondary",
            testId: "play-copy-btn",
            label: t("manager:selectQuizz.copySoloLink"),
            onClick: () => {
              void handleCopySoloLink()
            },
            disabled: actionDisabledReasons.copy !== undefined,
            disabledReason: actionDisabledReasons.copy,
          },
          {
            key: "play-start",
            iconName: "Play",
            intent: "primary",
            testId: "quizz-start-btn",
            label: t("manager:quizz.startGame"),
            onClick: handleSubmit,
            disabled: actionDisabledReasons.start !== undefined,
            disabledReason: actionDisabledReasons.start,
          },
        ]}
      />
    </>
  )
}

export default ConfigSelectQuizz
