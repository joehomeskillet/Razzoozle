import { EVENTS } from "@razzoozle/common/constants"
import type { SelectedModes } from "@razzoozle/common/types/game/socket"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import Select from "@razzoozle/web/components/Select"
import ToggleField from "@razzoozle/web/components/ui/ToggleField"
import { ActionFooter, LabelRow } from "@razzoozle/web/components/ui"
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
import { useNavigate } from "@tanstack/react-router"
import { Copy, ListChecks, Play } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const ConfigSelectQuizz = () => {
  const { socket } = useSocket()
  const { quizz: quizzList } = useConfig()
  const config = useConfig()
  const navigate = useNavigate()
  const { classes } = useClassManager()
  const [selected, setSelected] = useState<string | null>(null)
  const [scoringMode, setScoringMode] = useState<"speed" | "accuracy">("speed")
  const [teamMode, setTeamMode] = useState(false)
  const [klassenMode, setKlassenMode] = useState(false)
  const [classId, setClassId] = useState<string>("")
  const [endScreen, setEndScreen] = useState<string>("full")
  const [search, setSearch] = useState("")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const list = useMemo(
    () => quizzList.filter((q) => !q.archived),
    [quizzList],
  )
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

  const handleSelect = (id: string) => () =>
    setSelected((current) => (current === id ? null : id))

  const handleSubmit = useCallback(() => {
    if (!selected) {
      return
    }

    // Check if klassenMode is on but no class is selected
    if (klassenMode && !classId) {
      toast.error(t("manager:selectQuizz.klassenModeNeedsClass", {
        defaultValue: "Bitte wähle eine Klasse aus",
      }))
      return
    }

    // Check which modes are available and build the payload
    const selectedModes: SelectedModes = {}
    let hasCustomModes = false

    if (config.scoringMode !== undefined) {
      selectedModes.scoringMode = scoringMode
      hasCustomModes = true
    }

    if (config.teamMode === true) {
      selectedModes.teamMode = teamMode
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

    if (hasCustomModes) {
      socket.emit(EVENTS.GAME.CREATE, {
        quizzId: selected,
        selectedModes,
        classId: klassenMode && classId ? parseInt(classId, 10) : undefined,
      })
    } else {
      socket.emit(EVENTS.GAME.CREATE, selected)
    }
  }, [socket, selected, config, scoringMode, teamMode, klassenMode, classId, endScreen, t])

  const handleCopySoloLink = async () => {
    if (!selected) {
      return
    }

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/quizz/${selected}/solo`,
      )
      toast.success(t("common:copied", { defaultValue: "Kopiert" }))
    } catch {
      toast.error(t("manager:result.share.copyFailed"))
    }
  }

  // Parse endScreenModes for the select
  const endScreenModesList = useMemo(() => {
    return config.endScreenModes?.split(",").map((m) => m.trim()) ?? [
      "full",
      "top3",
      "private",
    ]
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

  return (
    <>
      {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <PageHeader
            title={t("manager:tabs.play")}
            subtitle={t("manager:selectQuizz.intro")}
          />
          <label htmlFor="play-quizz-search" className="sr-only">
            {t("manager:quizz.search", { defaultValue: "Quiz suchen" })}
          </label>
          <Input
            id="play-quizz-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:quizz.searchPlaceholder", {
              defaultValue: "Nach Thema suchen …",
            })}
            className="min-h-11 w-full rounded-[var(--radius-theme)]"
          />
        </div>

        <motion.div
          role="radiogroup"
          aria-label={t("manager:quizz.startGame")}
          className="min-h-0 flex-1 space-y-3 p-0.5 pb-20"
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
                        defaultValue: "{{count}} Fragen",
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

        {selected && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion ? undefined : { duration: 0.2, ease: "easeOut" }
            }
            className="shrink-0 space-y-2 rounded-lg bg-[var(--surface-2)] p-3"
          >
            <h3 className="text-sm font-semibold text-[var(--ink)]">
              {t("manager:selectQuizz.optionsTitle")}
            </h3>

            {config.scoringMode !== undefined && (
              <ToggleField
                label={t("manager:gameMode.speedMode")}
                description={t("manager:selectQuizz.modeSelector.scoringModeHint")}
                checked={scoringMode === "speed"}
                onChange={(isSpeed) =>
                  setScoringMode(isSpeed ? "speed" : "accuracy")
                }
              />
            )}

            {config.teamMode === true && (
              <ToggleField
                label={t("manager:gameMode.teamMode")}
                description={t("manager:selectQuizz.modeSelector.teamModeHint")}
                checked={teamMode}
                onChange={setTeamMode}
              />
            )}

            {config.klassenEnabled === true && (
              <>
                <ToggleField
                  label={t("manager:gameMode.klassenMode")}
                  description={t("manager:selectQuizz.modeSelector.klassenModeHint")}
                  checked={klassenMode}
                  onChange={setKlassenMode}
                />

                {klassenMode && (
                  <LabelRow
                    label={t("manager:selectQuizz.selectClass")}
                    htmlFor="class-select"
                    statusMessage={
                      !classId
                        ? {
                            text: t("manager:selectQuizz.klassenModeNeedsClass"),
                            tone: "error",
                          }
                        : undefined
                    }
                  >
                    <Select
                      id="class-select"
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                      data-testid="class-select"
                    >
                      <option value="">
                        {t("manager:selectQuizz.chooseClass")}
                      </option>
                      {classes.map((cls) => (
                        <option key={cls.id} value={String(cls.id)}>
                          {cls.name}
                        </option>
                      ))}
                    </Select>
                  </LabelRow>
                )}
              </>
            )}

            {endScreenModesList.length > 1 ? (
              <LabelRow
                label={t("manager:gameMode.endScreenSelectTitle")}
                htmlFor="endscreen-select"
              >
                <Select
                  id="endscreen-select"
                  value={endScreen}
                  onChange={(e) => setEndScreen(e.target.value)}
                  className="w-full sm:w-72"
                >
                  {endScreenModesList.map((mode) => (
                    <option key={mode} value={mode}>
                      {t(`manager:gameMode.endScreenMode.${mode}`)}
                    </option>
                  ))}
                </Select>
              </LabelRow>
            ) : (
              <LabelRow label={t("manager:gameMode.endScreenSelectTitle")}>
                <div className="text-sm font-medium text-[var(--ink)]">
                  {t(
                    `manager:gameMode.endScreenMode.${endScreenModesList[0] ?? "full"}`,
                  )}
                </div>
              </LabelRow>
            )}
          </motion.div>
        )}
      </div>

      <ActionFooter>
        <Button
          data-testid="quizz-start-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={handleSubmit}
          disabled={!selected || (klassenMode && !classId)}
          title={
            !selected
              ? t("manager:quizz.pleaseSelect")
              : klassenMode && !classId
                ? t("manager:selectQuizz.klassenModeNeedsClass", {
                    defaultValue: "Bitte wähle eine Klasse aus",
                  })
                : undefined
          }
        >
          <Play className="size-5" aria-hidden strokeWidth={2.5} />
          <span>{t("manager:quizz.startGame")}</span>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          type="button"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={() => {
            void handleCopySoloLink()
          }}
          disabled={!selected}
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          <Copy className="size-5" aria-hidden />
          <span>
            {t("manager:selectQuizz.copySoloLink", {
              defaultValue: "Solo-Link kopieren",
            })}
          </span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigSelectQuizz
