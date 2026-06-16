import type {
  GameResult,
  PlayerAnswerRecord,
  QuestionResult,
} from "@razzia/common/types/game"
import { matchAnswer } from "@razzia/web/features/game/utils/text-match"
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"
import { useTranslation } from "react-i18next"

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
  // Privacy toggle (default OFF → anonymized). When off, `displayName` masks the
  // real player name as "Spieler N"; when on, it returns the real name.
  showNames: boolean
  toggleShowNames: () => void
  // Maps a real player name to its display label, honoring `showNames`. The index
  // is stable across the whole result (derived once from the canonical roster),
  // so the same player reads as the same "Spieler N" in the table AND the
  // per-question answer breakdown.
  displayName: (_name: string) => string
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
  // Default OFF → names start anonymized; the manager opts in to reveal them.
  const [showNames, setShowNames] = useState(false)
  const { t } = useTranslation()

  const total = result.questions.length
  const totalPlayers = result.players.length

  // A result with zero questions (or an out-of-range index) has no question to
  // show; fall back to a safe empty question so the modal renders an empty
  // table instead of crashing on `questionResult.playerAnswers`.
  const questionResult =
    result.questions[questionIndex] ??
    ({ playerAnswers: [] } as unknown as QuestionResult)

  const answeredCount = questionResult.playerAnswers.filter(
    // A record counts as answered if it carries any answer payload: the scalar
    // answerId (choice/boolean/slider/poll), the multiple-select set, or the
    // type-answer free-text. New types use a sentinel answerId, so the scalar
    // check alone would miss "no answer" — hence the explicit field checks.
    (pa) =>
      Boolean(pa.answerText) ||
      (pa.answerIds != null && pa.answerIds.length > 0) ||
      pa.answerId !== null,
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
    if (questionResult.type === "poll") {
      return false
    }

    if (questionResult.type === "type-answer") {
      if (!pa.answerText) {
        return false
      }

      // Mirror the server's scoring: normalized/exact/fuzzy match against the
      // authored accepted answers.
      return matchAnswer(
        pa.answerText,
        questionResult.acceptedAnswers ?? [],
        questionResult.matchMode ?? "normalized",
      )
    }

    if (questionResult.type === "multiple-select") {
      // All-or-nothing set equality vs the correct solutions — mirrors the
      // server-side evalAnswer.
      if (!pa.answerIds || pa.answerIds.length === 0) {
        return false
      }

      const solutions = questionResult.solutions ?? []

      if (pa.answerIds.length !== solutions.length) {
        return false
      }

      const selectedSet = new Set(pa.answerIds)

      return solutions.every((s) => selectedSet.has(s))
    }

    if (pa.answerId === null) {
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
        questionResult.playerAnswers.filter(
          // Multiple-select counts each selected option; other types keep the
          // scalar answerId.
          (pa) => pa.answerIds?.includes(ai) ?? pa.answerId === ai,
        ).length,
    ),
  )

  // O(1) per-player points lookup. Built once per result instead of an O(n)
  // Array.find per call, so the table (one lookup per row) stays O(players)
  // rather than O(players^2) per render.
  const pointsByName = useMemo(() => {
    const map = new Map<string, number>()

    for (const player of result.players) {
      map.set(player.username, player.points)
    }

    return map
  }, [result])

  const getPlayerPoints = (name: string) => pointsByName.get(name) ?? 0

  // Stable real-name → 1-based index, derived once from the canonical roster so
  // every view masks the same player to the same "Spieler N". Any name that
  // only shows up in per-question answers (not in the roster) is appended so the
  // masking stays total and collision-free.
  const nameIndex = useMemo(() => {
    const map = new Map<string, number>()

    for (const player of result.players) {
      if (!map.has(player.username)) {
        map.set(player.username, map.size + 1)
      }
    }

    for (const question of result.questions) {
      for (const pa of question.playerAnswers) {
        if (!map.has(pa.playerName)) {
          map.set(pa.playerName, map.size + 1)
        }
      }
    }

    return map
  }, [result])

  const toggleShowNames = () => setShowNames((v) => !v)

  const displayName = (name: string) => {
    if (showNames) {
      return name
    }

    const index = nameIndex.get(name) ?? nameIndex.size + 1

    return t("manager:result.anonymizedPlayer", {
      defaultValue: "Spieler {{index}}",
      index,
    })
  }

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
        showNames,
        toggleShowNames,
        displayName,
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
