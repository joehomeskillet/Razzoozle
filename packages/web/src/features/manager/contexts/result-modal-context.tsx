import type {
  GameResult,
  PlayerAnswerRecord,
  QuestionResult,
} from "@razzoozle/common/types/game"
import { isAnswerCorrect as isAnswerCorrectPure } from "@razzoozle/web/features/manager/utils/answerCorrectness"
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

// A fully-typed empty QuestionResult for the out-of-range / no-questions
// fallback below. Every required field carries an inert default (the cooldown/
// time bounds mirror the zod questionValidator) so the modal renders an empty
// table without a partial `as unknown as` cast.
const EMPTY_QUESTION_RESULT: QuestionResult = {
  question: "",
  cooldown: 3,
  time: 5,
  playerAnswers: [],
}

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
  const questionResult = result.questions[questionIndex] ?? EMPTY_QUESTION_RESULT

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

  // Single source of truth for per-player correctness, so the table and the
  // aggregate counts can never drift apart. The logic is extracted to a pure
  // helper (answerCorrectness.ts) so it can be reused across the manager UI
  // and export functions.
  const isAnswerCorrect = (pa: PlayerAnswerRecord) =>
    isAnswerCorrectPure(questionResult, pa)

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
