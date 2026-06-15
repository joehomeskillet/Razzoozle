/**
 * Zustand store for the offline solo-play state machine.
 *
 * States:
 *   idle       → loading → name → question → answering → result → (loop) → finished
 *
 * No socket. All interaction is via REST (/api/quizz/:id/solo, /check-answer,
 * /solo-score).
 */
import type { SoloCheckAnswerResponse, SoloQuestion, SoloScoreEntry } from "@razzia/common/types/game"
import { create } from "zustand"

export type SoloPhase =
  | "idle"
  | "loading"
  | "name"
  | "question"
  | "answering"
  | "result"
  | "finished"

export interface SoloQuestionResult {
  questionIndex: number
  correct: boolean
  points: number
}

interface SoloState {
  quizzId: string | null
  subject: string
  questions: SoloQuestion[]
  currentIndex: number
  phase: SoloPhase
  playerName: string
  totalPoints: number
  lastResult: SoloCheckAnswerResponse | null
  answers: SoloQuestionResult[]
  leaderboard: SoloScoreEntry[]
  error: string | null

  // Actions
  setQuizzId: (id: string) => void
  loadQuiz: (id: string) => Promise<void>
  setPlayerName: (name: string) => void
  startGame: () => void
  submitAnswer: (
    id: string,
    payload: { answerId?: number; answerIds?: number[]; answerText?: string },
  ) => Promise<void>
  nextQuestion: () => void
  finishGame: (id: string) => Promise<void>
  reset: () => void
}

const initialState = {
  quizzId: null,
  subject: "",
  questions: [] as SoloQuestion[],
  currentIndex: 0,
  phase: "idle" as SoloPhase,
  playerName: "",
  totalPoints: 0,
  lastResult: null as SoloCheckAnswerResponse | null,
  answers: [] as SoloQuestionResult[],
  leaderboard: [] as SoloScoreEntry[],
  error: null as string | null,
}

export const useSoloStore = create<SoloState>((set, get) => ({
  ...initialState,

  setQuizzId: (quizzId) => set({ quizzId }),

  loadQuiz: async (id: string) => {
    set({ phase: "loading", error: null, quizzId: id })
    try {
      const res = await fetch(`/api/quizz/${encodeURIComponent(id)}/solo`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        set({
          phase: "idle",
          error: (body as { error?: string }).error ?? `Fehler ${res.status}`,
        })
        return
      }
      const data = (await res.json()) as { subject: string; questions: SoloQuestion[] }
      set({
        subject: data.subject,
        questions: data.questions,
        currentIndex: 0,
        totalPoints: 0,
        answers: [],
        lastResult: null,
        phase: "name",
        error: null,
      })
    } catch (err) {
      set({ phase: "idle", error: "Netzwerkfehler beim Laden des Quiz." })
    }
  },

  setPlayerName: (playerName: string) => set({ playerName }),

  startGame: () => {
    const { questions } = get()
    if (questions.length === 0) return
    set({ phase: "question", currentIndex: 0 })
  },

  submitAnswer: async (
    id: string,
    payload: { answerId?: number; answerIds?: number[]; answerText?: string },
  ) => {
    const { currentIndex } = get()
    set({ phase: "answering" })
    try {
      const res = await fetch(`/api/quizz/${encodeURIComponent(id)}/check-answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: currentIndex, ...payload }),
      })
      if (!res.ok) {
        // Still move on; treat as wrong.
        set((s) => ({
          lastResult: { correct: false, points: 0 },
          answers: [
            ...s.answers,
            { questionIndex: currentIndex, correct: false, points: 0 },
          ],
          phase: "result",
        }))
        return
      }
      const result = (await res.json()) as SoloCheckAnswerResponse
      set((s) => ({
        lastResult: result,
        totalPoints: s.totalPoints + result.points,
        answers: [
          ...s.answers,
          {
            questionIndex: currentIndex,
            correct: result.correct,
            points: result.points,
          },
        ],
        phase: "result",
      }))
    } catch {
      set((s) => ({
        lastResult: { correct: false, points: 0 },
        answers: [
          ...s.answers,
          { questionIndex: currentIndex, correct: false, points: 0 },
        ],
        phase: "result",
      }))
    }
  },

  nextQuestion: () => {
    const { currentIndex, questions } = get()
    const next = currentIndex + 1
    if (next < questions.length) {
      set({ currentIndex: next, phase: "question", lastResult: null })
    } else {
      set({ phase: "finished" })
    }
  },

  finishGame: async (id: string) => {
    const { playerName, totalPoints, answers } = get()
    try {
      const res = await fetch(`/api/quizz/${encodeURIComponent(id)}/solo-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim() || "Anonym",
          score: totalPoints,
          answers: answers.map((a) => ({
            questionIndex: a.questionIndex,
            correct: a.correct,
          })),
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { leaderboard?: SoloScoreEntry[] }
        if (Array.isArray(data.leaderboard)) {
          set({ leaderboard: data.leaderboard })
        }
      }
    } catch {
      // Score submission failure is non-fatal; show what we have.
    }
  },

  reset: () => set(initialState),
}))
