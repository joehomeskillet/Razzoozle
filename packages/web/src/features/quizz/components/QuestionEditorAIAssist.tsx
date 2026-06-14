import { AI, EVENTS } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { Sparkles } from "lucide-react"
import { useCallback, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const QuestionEditorAIAssist = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const [topic, setTopic] = useState("")
  const [genQuestion, setGenQuestion] = useState(false)
  const [genDistractors, setGenDistractors] = useState(false)

  useEvent(
    EVENTS.AI.QUESTION_GENERATED,
    useCallback(
      ({ question }: { question: Question }) => {
        updateQuestion(currentIndex, question)
        setGenQuestion(false)
        toast.success(t("manager:ai.generate.applied"))
      },
      [currentIndex, updateQuestion, t],
    ),
  )

  useEvent(
    EVENTS.AI.DISTRACTORS_GENERATED,
    useCallback(
      ({ distractors }: { distractors: string[] }) => {
        const existing = currentQuestion.answers ?? []
        const merged = [...existing]
        const solutions = Array.isArray(currentQuestion.solutions)
          ? currentQuestion.solutions
          : []
        let distractorIndex = 0

        for (
          let i = 0;
          i < merged.length && distractorIndex < distractors.length;
          i++
        ) {
          if (
            !solutions.includes(i) &&
            (!merged[i] || !merged[i].trim())
          ) {
            merged[i] = distractors[distractorIndex++]
          }
        }

        while (distractorIndex < distractors.length && merged.length < 4) {
          merged.push(distractors[distractorIndex++])
        }

        updateQuestion(currentIndex, { answers: merged })
        setGenDistractors(false)
        toast.success(t("manager:ai.generate.applied"))
      },
      [currentQuestion, currentIndex, updateQuestion, t],
    ),
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

  const generateQuestion = () => {
    const trimmedTopic = topic.trim()

    if (!trimmedTopic) {
      return
    }

    setGenQuestion(true)
    socket.emit(EVENTS.AI.GENERATE_QUESTION, {
      topic: trimmedTopic,
      type: currentQuestion.type ?? "choice",
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

    setGenDistractors(true)
    socket.emit(EVENTS.AI.GENERATE_DISTRACTORS, {
      question,
      correct,
    })
  }

  return (
    <section className="m-4 space-y-3 rounded-2xl bg-white p-3 shadow-sm outline-1 -outline-offset-1 outline-gray-200">
      <div className="flex items-center gap-2 text-gray-800">
        <Sparkles className="size-4 shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold">
          {t("manager:ai.generate.title")}
        </h2>
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
    </section>
  )
}

export default QuestionEditorAIAssist
