import type {
  GameResult,
  PlayerAnswerRecord,
  QuestionResult,
} from "@razzia/common/types/game"
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react"

interface ResultModalContextType {
  result: GameResult
  questionResult: QuestionResult
  questionIndex: number
  total: number
  totalPlayers: number
  answeredCount: number
  correctCount: number
  correctPct: number
  maxAnswerCount: number
  isAnswerCorrect: (_pa: PlayerAnswerRecord) => boolean
  getPlayerPoints: (_name: string) => number
  goNext: () => void
  goPrev: () => void
  onClose: () => void
}

const ResultModalContext = createContext<ResultModalContextType | null>(null)

type Props = PropsWithChildren<{
  result: GameResult
  onClose: () => void
}>

export const ResultModalProvider = ({ children, result, onClose }: Props) => {
  const [questionIndex, setQuestionIndex] = useState(0)

  const questionResult = result.questions[questionIndex]
  const total = result.questions.length
  const totalPlayers = result.players.length

  const answeredCount = questionResult.playerAnswers.filter(
    (pa) => pa.answerId !== null,
  ).length

  const sliderThreshold =
    questionResult.type === "slider" &&
    questionResult.min != null &&
    questionResult.max != null
      ? Math.max(
          questionResult.step ?? 0,
          (questionResult.max - questionResult.min) * 0.05,
        )
      : null

  // Single source of truth for per-player correctness, so the table and the
  // aggregate counts can never drift apart (previously the 5% slider tolerance
  // was duplicated in ResultModalTable).
  const isAnswerCorrect = (pa: PlayerAnswerRecord) => {
    if (pa.answerId === null) {
      return false
    }

    if (questionResult.type === "poll") {
      return false
    }

    if (sliderThreshold !== null && questionResult.correct != null) {
      return Math.abs(pa.answerId - questionResult.correct) <= sliderThreshold
    }

    return (questionResult.solutions ?? []).includes(pa.answerId)
  }

  const correctCount =
    questionResult.playerAnswers.filter(isAnswerCorrect).length

  const correctPct =
    totalPlayers > 0 ? Math.round((correctCount / totalPlayers) * 100) : 0

  const maxAnswerCount = Math.max(
    1,
    ...(questionResult.answers ?? []).map(
      (_, ai) =>
        questionResult.playerAnswers.filter((pa) => pa.answerId === ai).length,
    ),
  )

  const getPlayerPoints = (name: string) =>
    result.players.find((p) => p.username === name)?.points ?? 0

  const goNext = () => setQuestionIndex((i) => Math.min(i + 1, total - 1))

  const goPrev = () => setQuestionIndex((i) => Math.max(i - 1, 0))

  return (
    <ResultModalContext.Provider
      value={{
        result,
        questionResult,
        questionIndex,
        total,
        totalPlayers,
        answeredCount,
        correctCount,
        correctPct,
        maxAnswerCount,
        isAnswerCorrect,
        getPlayerPoints,
        goNext,
        goPrev,
        onClose,
      }}
    >
      {children}
    </ResultModalContext.Provider>
  )
}

export const useResultModal = () => {
  const ctx = useContext(ResultModalContext)

  if (!ctx) {
    throw new Error("useResultModal must be used inside ResultModalProvider")
  }

  return ctx
}
