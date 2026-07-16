import { EVENTS } from "@razzoozle/common/constants"
import type { SelectedModes } from "@razzoozle/common/types/game/socket"
import Button from "@razzoozle/web/components/Button"
import ToggleField from "@razzoozle/web/components/ui/ToggleField"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import {
  EmptyState,
  SelectableRow,
} from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
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
  const [selected, setSelected] = useState<string | null>(null)
  const [scoringMode, setScoringMode] = useState<"speed" | "accuracy">("speed")
  const [teamMode, setTeamMode] = useState(false)
  const [klassenMode, setKlassenMode] = useState(false)
  const [endScreen, setEndScreen] = useState<string>("full")
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const list = useMemo(
    () => quizzList.filter((q) => !q.archived),
    [quizzList],
  )

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

  const handleSelect = (id: string) => () =>
    setSelected((current) => (current === id ? null : id))

  const handleSubmit = useCallback(() => {
    if (!selected) {
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
      })
    } else {
      socket.emit(EVENTS.GAME.CREATE, selected)
    }
  }, [socket, selected, config, scoringMode, teamMode, klassenMode, endScreen])

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
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <EmptyState
          icon={ListChecks}
          headline={t("manager:quizz.notFound")}
          hint={t("manager:quizz.pleaseCreate")}
          action={{
            label: t("manager:quizz.create"),
            onClick: () => {
              void navigate({ to: "/manager/quizz" })
            },
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <motion.div
        role="radiogroup"
        aria-label={t("manager:quizz.startGame")}
        className="min-h-0 flex-1 space-y-3 p-0.5 pb-6"
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={
          reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
        }
      >
        {list.map((quizz, index) => (
          <motion.div
            key={quizz.id}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion
                ? undefined
                : {
                    duration: 0.28,
                    ease: "easeOut",
                    delay: Math.min(index, 8) * 0.04,
                  }
            }
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

      <div className="shrink-0 space-y-3 pt-4">
        {selected && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion ? undefined : { duration: 0.2, ease: "easeOut" }
            }
            className="space-y-2 rounded-lg bg-[var(--surface-2)] p-3"
          >
            {config.scoringMode !== undefined && (
              <ToggleField
                label={t("manager:gameMode.speedMode", {
                  defaultValue: "Geschwindigkeit",
                })}
                description={t("manager:selectQuizz.modeSelector.scoringModeHint", {
                  defaultValue: "Geschwindigkeit berücksichtigen",
                })}
                checked={scoringMode === "speed"}
                onChange={(isSpeed) =>
                  setScoringMode(isSpeed ? "speed" : "accuracy")
                }
              />
            )}

            {config.teamMode === true && (
              <ToggleField
                label={t("manager:gameMode.teamMode", {
                  defaultValue: "Team-Modus",
                })}
                description={t("manager:selectQuizz.modeSelector.teamModeHint", {
                  defaultValue: "Spieler wählen Teams",
                })}
                checked={teamMode}
                onChange={setTeamMode}
              />
            )}

            {config.klassenEnabled === true && (
              <ToggleField
                label={t("manager:gameMode.klassenMode", {
                  defaultValue: "Klassen-Modus",
                })}
                description={t("manager:selectQuizz.modeSelector.klassenModeHint", {
                  defaultValue: "Klassen-Beitritte aktivieren",
                })}
                checked={klassenMode}
                onChange={setKlassenMode}
              />
            )}

            {endScreenModesList.length > 1 && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[var(--ink-muted)]">
                  {t("manager:gameMode.endScreenSelectTitle", {
                    defaultValue: "Endbildschirm",
                  })}
                </label>
                <select
                  value={endScreen}
                  onChange={(e) => setEndScreen(e.target.value)}
                  className="w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {endScreenModesList.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </motion.div>
        )}

        <Button
          data-testid="quizz-start-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-xl"
          onClick={handleSubmit}
          disabled={!selected}
          title={selected ? undefined : t("manager:quizz.pleaseSelect")}
        >
          <Play className="size-5" aria-hidden strokeWidth={2.5} />
          <span>{t("manager:quizz.startGame")}</span>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          type="button"
          className="w-full rounded-xl"
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
      </div>
    </div>
  )
}

export default ConfigSelectQuizz
