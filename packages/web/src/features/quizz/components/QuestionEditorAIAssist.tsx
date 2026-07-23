import { AI, EVENTS } from "@razzoozle/common/constants"
import type { Question } from "@razzoozle/common/types/game"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { CircleHelp, Sparkles } from "lucide-react"
import { useCallback, useId, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { motion, useReducedMotion } from "motion/react"

// The AI server returns its payload WITHOUT persisting it (see
// AI.QUESTION_GENERATED / AI.DISTRACTORS_GENERATED). We hold the result in a
// local `pendingResult` so the manager can review a small preview and decide
// to apply ("Übernehmen") or discard ("Verwerfen") before it touches the form.
//
// For distractors we keep ONLY the raw suggestions: the merge against the
// current answers is recomputed (via mergeDistractors) both for the live
// preview and at apply time, so any edits the manager makes between Generate
// and "Übernehmen" are honoured instead of being clobbered by a stale snapshot.
type PendingResult =
  | { kind: "question"; question: Question }
  | { kind: "distractors"; distractors: string[] }

// Distractor count bounds mirror aiGenerateDistractorsValidator.count (1–3).
const DISTRACTORS_MIN = 1
const DISTRACTORS_MAX = 3

const clampDistractorsCount = (value: number) =>
  Math.min(DISTRACTORS_MAX, Math.max(DISTRACTORS_MIN, Math.round(value)))

// Fill empty, non-solution answer slots with the AI distractors (in order),
// then append any leftovers up to a 4-slot ceiling. Pure so it can run against
// either a live `currentQuestion` (preview/apply) or any answers snapshot.
const mergeDistractors = (
  answers: string[] | undefined,
  solutions: number[] | undefined,
  distractors: string[],
): string[] => {
  const merged = [...(answers ?? [])]
  const solutionSet = Array.isArray(solutions) ? solutions : []
  let distractorIndex = 0

  for (
    let i = 0;
    i < merged.length && distractorIndex < distractors.length;
    i++
  ) {
    if (!solutionSet.includes(i) && (!merged[i] || !merged[i].trim())) {
      merged[i] = distractors[distractorIndex++]
    }
  }

  while (distractorIndex < distractors.length && merged.length < 4) {
    merged.push(distractors[distractorIndex++])
  }

  return merged
}

const QuestionEditorAIAssist = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const distractorsCountId = useId()
  const dialogTitleId = useId()
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState("")
  const [distractorsCount, setDistractorsCount] = useState(DISTRACTORS_MAX)
  const [genQuestion, setGenQuestion] = useState(false)
  const [genDistractors, setGenDistractors] = useState(false)
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null)

  // Socket handlers stay on this parent so generation can finish while the
  // dialog is closed; reopening shows the stored pendingResult.
  useEvent(
    EVENTS.AI.QUESTION_GENERATED,
    useCallback(({ question }: { question: Question }) => {
      setPendingResult({ kind: "question", question })
      setGenQuestion(false)
    }, []),
  )

  useEvent(
    EVENTS.AI.DISTRACTORS_GENERATED,
    useCallback(({ distractors }: { distractors: string[] }) => {
      // Store ONLY the raw suggestions; the merge against the answers is
      // recomputed live (preview) and at apply time so edits aren't clobbered.
      setPendingResult({ kind: "distractors", distractors })
      setGenDistractors(false)
    }, []),
  )

  useEvent(
    EVENTS.AI.ERROR,
    useCallback(
      (message: string) => {
        setGenQuestion(false)
        setGenDistractors(false)
        toast.error(t(message))
      },
      [t],
    ),
  )

  const applyPending = () => {
    if (!pendingResult) {
      return
    }

    if (pendingResult.kind === "question") {
      updateQuestion(currentIndex, pendingResult.question)
    } else {
      // Recompute the merge against the LIVE answers/solutions so any edits made
      // between Generate and "Übernehmen" survive.
      updateQuestion(currentIndex, {
        answers: mergeDistractors(
          currentQuestion.answers,
          Array.isArray(currentQuestion.solutions)
            ? currentQuestion.solutions
            : undefined,
          pendingResult.distractors,
        ),
      })
    }

    setPendingResult(null)
    setOpen(false)
    toast.success(t("manager:ai.generate.applied"))
  }

  const discardPending = () => {
    setPendingResult(null)
  }

  const generateQuestion = () => {
    const trimmedTopic = topic.trim()

    if (!trimmedTopic) {
      return
    }

    // The server validator only accepts these authoring kinds; clamp anything
    // else (slider, poll, undefined) to "choice" so it never trips zod.
    const supportedTypes = [
      "choice",
      "boolean",
      "multiple-select",
      "type-answer",
    ] as const
    const safeType = supportedTypes.includes(
      currentQuestion.type as (typeof supportedTypes)[number],
    )
      ? (currentQuestion.type as (typeof supportedTypes)[number])
      : "choice"

    setPendingResult(null)
    setGenQuestion(true)
    socket.emit(EVENTS.AI.GENERATE_QUESTION, {
      topic: trimmedTopic,
      type: safeType,
    })
  }

  const generateDistractors = () => {
    const question = currentQuestion.question?.trim()

    if (!question) {
      return
    }

    const correct =
      currentQuestion.answers?.[
        (Array.isArray(currentQuestion.solutions)
          ? currentQuestion.solutions[0]
          : 0) ?? 0
      ] ?? ""

    setPendingResult(null)
    setGenDistractors(true)
    socket.emit(EVENTS.AI.GENERATE_DISTRACTORS, {
      question,
      correct,
      count: clampDistractorsCount(distractorsCount),
    })
  }

  const previewAnswers =
    pendingResult?.kind === "question"
      ? (pendingResult.question.answers ?? [])
      : pendingResult?.kind === "distractors"
        ? // Recompute against the LIVE answers so the preview reflects edits the
          // manager makes after generating (same merge that applyPending uses).
          mergeDistractors(
            currentQuestion.answers,
            Array.isArray(currentQuestion.solutions)
              ? currentQuestion.solutions
              : undefined,
            pendingResult.distractors,
          )
        : []

  const previewSolutions =
    pendingResult?.kind === "question" &&
    Array.isArray(pendingResult.question.solutions)
      ? pendingResult.question.solutions
      : Array.isArray(currentQuestion.solutions)
        ? currentQuestion.solutions
        : []

  const title = t("manager:ai.generate.title")

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4 shrink-0" aria-hidden />
        {title}
      </Button>

      <DialogPanel
        open={open}
        onOpenChange={setOpen}
        titleId={dialogTitleId}
        title={title}
        maxWidth="lg"
      >
        {/* Body spacing only — surface/chrome comes from DialogPanel tokens. */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-end">
            {/* Inline "?" help — explains both actions. CSS-only hover/focus
                tooltip (no portal); the group wraps the trigger so keyboard
                focus reveals it too. */}
            <span className="group relative inline-flex">
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-full text-[var(--ink-faint)] transition-colors hover:text-[var(--ink-medium)] focus-visible:text-[var(--ink-medium)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                aria-label={t("manager:ai.generate.help.aria", {
                  defaultValue: "Hilfe zu den KI-Funktionen",
                })}
              >
                <CircleHelp className="size-4" aria-hidden />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none absolute top-full right-0 z-20 mt-1 w-60 rounded-lg bg-[var(--ink)] px-3 py-2 text-xs leading-relaxed text-[var(--surface)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
              >
                {t("manager:ai.generate.help.text", {
                  defaultValue:
                    "„Frage aus Thema“ erzeugt eine komplette Frage mit Antworten. „Distraktoren“ füllt leere Antwortfelder mit plausiblen falschen Optionen. Du siehst immer zuerst eine Vorschau und entscheidest mit „Übernehmen“ oder „Verwerfen“.",
                })}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              variant="sm"
              value={topic}
              maxLength={AI.TOPIC_MAX_LEN}
              placeholder={t("manager:ai.generate.topicPlaceholder")}
              onChange={(event) => setTopic(event.target.value)}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              size="sm"
              onClick={generateQuestion}
              disabled={!topic.trim() || genQuestion}
            >
              {genQuestion
                ? t("manager:ai.generate.generating")
                : t("manager:ai.generate.fromTopic")}
            </Button>
          </div>

          <div className="space-y-2">
            {/* Distractor count slider — mirrors the WP-9 quiz-gen slider;
                bounded by aiGenerateDistractorsValidator.count (1–3). */}
            <label
              htmlFor={distractorsCountId}
              className="block text-xs font-medium text-[var(--ink-medium)]"
            >
              {t("manager:ai.generate.distractorsCountValue", {
                defaultValue: "Antworten: {{count}}",
                count: distractorsCount,
              })}
            </label>
            <div className="flex items-center gap-3">
              <input
                id={distractorsCountId}
                type="range"
                min={DISTRACTORS_MIN}
                max={DISTRACTORS_MAX}
                step={1}
                value={distractorsCount}
                aria-valuetext={t("manager:ai.generate.distractorsCountValue", {
                  defaultValue: "Antworten: {{count}}",
                  count: distractorsCount,
                })}
                onChange={(event) =>
                  setDistractorsCount(
                    clampDistractorsCount(Number(event.target.value)),
                  )
                }
                className="h-11 w-full cursor-pointer accent-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              />
              <span className="w-6 shrink-0 text-right text-base font-bold tabular-nums text-[var(--ink)]">
                {distractorsCount}
              </span>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={generateDistractors}
              disabled={!currentQuestion.question?.trim() || genDistractors}
            >
              {genDistractors
                ? t("manager:ai.generate.generating")
                : t("manager:ai.generate.distractors")}
            </Button>
          </div>

          {pendingResult ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.18, ease: "easeOut" }
              }
              className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-2)] p-3"
            >
              <p className="text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
                {t("manager:ai.generate.preview.label", {
                  defaultValue: "Vorschau",
                })}
              </p>

              {pendingResult.kind === "question" ? (
                <p className="text-sm font-medium break-words text-[var(--ink)]">
                  {pendingResult.question.question?.trim() ||
                    t("manager:ai.generate.preview.noQuestion", {
                      defaultValue: "(Keine Fragestellung)",
                    })}
                </p>
              ) : null}

              {previewAnswers.length > 0 ? (
                <ul className="space-y-1">
                  {previewAnswers.map((answer, index) => (
                    <li
                      key={index}
                      className={clsx(
                        "flex items-start gap-2 rounded-md px-2 py-1 text-sm break-words",
                        previewSolutions.includes(index)
                          ? "bg-[var(--state-correct-soft)] font-medium text-[var(--answer-text)]"
                          : "text-[var(--ink-muted)]",
                      )}
                    >
                      <span className="text-[var(--ink-faint)] tabular-nums">
                        {index + 1}.
                      </span>
                      <span className="min-w-0">
                        {answer?.trim() ||
                          t("manager:ai.generate.preview.emptyAnswer", {
                            defaultValue: "(leer)",
                          })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button type="button" size="sm" onClick={applyPending}>
                  {t("manager:ai.generate.preview.apply", {
                    defaultValue: "Übernehmen",
                  })}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={discardPending}
                >
                  {t("manager:ai.generate.preview.discard", {
                    defaultValue: "Verwerfen",
                  })}
                </Button>
              </div>
            </motion.div>
          ) : null}
        </div>
      </DialogPanel>
    </>
  )
}

export default QuestionEditorAIAssist
