/**
 * Zustand store for the offline solo-play state machine.
 *
 * States:
 *   idle       → loading → name → question → answering → result → (loop) → finished
 *
 * No socket. All interaction is via REST (/api/quizz/:id/solo, /check-answer,
 * /solo-score).
 */
import type { SoloCheckAnswerResponse, SoloQuestion, SoloScoreEntry } from "@razzoozle/common/types/game"
import { mergeAchievementsConfig } from "@razzoozle/common/achievements"
import { create } from "zustand"

// BOUNDED solo badges only. Solo is offline/stateless with NO manager config,
// so the streak thresholds come from the registry defaults
// (mergeAchievementsConfig({})), mirroring the server's solo check-answer path.
// Per-badge manager enable/threshold overrides are deliberately ignored solo.
// streak_3/5/10 fire when the running consecutive-correct streak EQUALS the
// configured threshold (same `=== threshold` semantics as round-manager);
// perfect_round shares streak_5's threshold. sharpshooter is server-computed
// and merged in from `response.achievements`.
const REGISTRY_DEFAULTS = mergeAchievementsConfig({})

function registryThreshold(id: string, fallback: number): number {
  return REGISTRY_DEFAULTS.find((a) => a.id === id)?.threshold ?? fallback
}

const STREAK_3 = registryThreshold("streak_3", 3)
const STREAK_5 = registryThreshold("streak_5", 5)
const STREAK_10 = registryThreshold("streak_10", 10)
const PERFECT_ROUND = registryThreshold("perfect_round", 5)

/**
 * Streak badges unlocked at exactly this consecutive-correct count.
 * Mirrors round-manager's `streak === threshold` (and perfect_round) checks.
 */
function streakBadges(streak: number): string[] {
  const ids: string[] = []
  if (streak === STREAK_3) ids.push("streak_3")
  if (streak === STREAK_5) ids.push("streak_5")
  if (streak === PERFECT_ROUND) ids.push("perfect_round")
  if (streak === STREAK_10) ids.push("streak_10")
  return ids
}

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
  // BOUNDED badges unlocked for THIS answer: the server `sharpshooter` (slider
  // accuracy) merged with client-derived streak badges (streak_3/5/10 +
  // perfect_round). Deduped. Read by SoloAnswers to feed <RewardStack>.
  achievements: string[]
  // SEC-05: raw answer input, kept so finishGame can send it to /solo-score
  // for server-side re-evaluation. The server never trusts `correct`/`points`
  // above — only these.
  answerId?: number
  answerIds?: number[]
  answerText?: string
}

interface SoloState {
  quizzId: string | null
  assignmentId?: string
  subject: string
  questions: SoloQuestion[]
  currentIndex: number
  phase: SoloPhase
  playerName: string
  totalPoints: number
  // Running consecutive-correct streak — incremented on a correct answer, reset
  // to 0 on a wrong one. Drives the client-derived streak badges (the ONLY
  // streak source solo has; server never computes streak on the stateless path).
  streak: number
  lastResult: SoloCheckAnswerResponse | null
  // Merged (server sharpshooter ∪ client streak badges), deduped, for the badge
  // currently shown on the result screen. Mirrors lastResult's lifecycle.
  lastAchievements: string[]
  answers: SoloQuestionResult[]
  leaderboard: SoloScoreEntry[]
  error: string | null
  // Session preference: when true (default), the result screen auto-advances to
  // the next question (or finished screen) after a short delay. Toggling off
  // lets the player linger on the result; the manual Next/Finish button is
  // always an immediate override.
  autoAdvance: boolean

  // Actions
  setQuizzId: (id: string) => void
  setAssignmentId: (assignmentId: string | undefined) => void
  loadQuiz: (id: string) => Promise<void>
  setPlayerName: (name: string) => void
  startGame: () => void
  submitAnswer: (
    id: string,
    payload: { answerId?: number; answerIds?: number[]; answerText?: string },
  ) => Promise<void>
  nextQuestion: () => void
  toggleAutoAdvance: () => void
  finishGame: (id: string) => Promise<void>
  reset: () => void
}

const initialState = {
  quizzId: null,
  assignmentId: undefined,
  subject: "",
  questions: [] as SoloQuestion[],
  currentIndex: 0,
  phase: "idle" as SoloPhase,
  playerName: "",
  totalPoints: 0,
  streak: 0,
  lastResult: null as SoloCheckAnswerResponse | null,
  lastAchievements: [] as string[],
  answers: [] as SoloQuestionResult[],
  leaderboard: [] as SoloScoreEntry[],
  error: null as string | null,
  autoAdvance: false,
}

export const useSoloStore = create<SoloState>((set, get) => ({
  ...initialState,

  setQuizzId: (quizzId) => set({ quizzId }),

  setAssignmentId: (assignmentId) => set({ assignmentId }),

  loadQuiz: async (id: string) => {
    set({ phase: "loading", error: null, quizzId: id })
    try {
      const res = await fetch(`/api/quizz/${encodeURIComponent(id)}/solo`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        set({
          phase: "idle",
          error: (body as { error?: string }).error ?? "errors:game.statusError",
        })
        return
      }
      const data = (await res.json()) as { subject: string; questions: SoloQuestion[] }
      set({
        subject: data.subject,
        questions: data.questions,
        currentIndex: 0,
        totalPoints: 0,
        streak: 0,
        answers: [],
        lastResult: null,
        lastAchievements: [],
        phase: "name",
        error: null,
      })
    } catch (err) {
      set({ phase: "idle", error: "errors:game.networkError" })
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
        // Still move on; treat as wrong — a wrong answer resets the streak.
        set((s) => ({
          lastResult: { correct: false, points: 0 },
          lastAchievements: [],
          streak: 0,
          answers: [
            ...s.answers,
            {
              questionIndex: currentIndex,
              correct: false,
              points: 0,
              achievements: [],
              ...payload,
            },
          ],
          phase: "result",
        }))
        return
      }
      const result = (await res.json()) as SoloCheckAnswerResponse
      set((s) => {
        // Poll responses: don't reset streak, don't add achievements, just show neutral feedback.
        if (result.poll) {
          return {
            lastResult: result,
            lastAchievements: [],
            streak: s.streak,
            totalPoints: s.totalPoints + result.points,
            answers: [
              ...s.answers,
              {
                questionIndex: currentIndex,
                correct: result.correct,
                points: result.points,
                achievements: [],
                ...payload,
              },
            ],
            phase: "result",
          }
        }

        // Consecutive-correct streak: +1 on correct, reset to 0 on wrong.
        const nextStreak = result.correct ? s.streak + 1 : 0
        // Merge server badge(s) (sharpshooter) with client streak badges, dedupe.
        // Streak badges only meaningful while the answer is correct.
        const merged = Array.from(
          new Set([
            ...(result.achievements ?? []),
            ...(result.correct ? streakBadges(nextStreak) : []),
          ]),
        )
        return {
          lastResult: result,
          lastAchievements: merged,
          streak: nextStreak,
          totalPoints: s.totalPoints + result.points,
          answers: [
            ...s.answers,
            {
              questionIndex: currentIndex,
              correct: result.correct,
              points: result.points,
              achievements: merged,
              ...payload,
            },
          ],
          phase: "result",
        }
      })
    } catch {
      set((s) => ({
        lastResult: { correct: false, points: 0 },
        lastAchievements: [],
        streak: 0,
        answers: [
          ...s.answers,
          {
            questionIndex: currentIndex,
            correct: false,
            points: 0,
            achievements: [],
            ...payload,
          },
        ],
        phase: "result",
      }))
    }
  },

  nextQuestion: () => {
    const { currentIndex, questions, phase } = get()
    // Idempotency guard: only advance out of the result phase. Kills a
    // double-advance if the auto-advance timer fires in the same tick as a
    // manual Next click (a stale queued timer can't skip a question).
    if (phase !== "result") return
    const next = currentIndex + 1
    if (next < questions.length) {
      set({
        currentIndex: next,
        phase: "question",
        lastResult: null,
        lastAchievements: [],
      })
    } else {
      set({ phase: "finished" })
    }
  },

  toggleAutoAdvance: () => set((s) => ({ autoAdvance: !s.autoAdvance })),

  finishGame: async (id: string) => {
    const { playerName, totalPoints, answers, assignmentId } = get()
    try {
      let url = `/api/quizz/${encodeURIComponent(id)}/solo-score`
      if (assignmentId) {
        url += `?assignmentId=${encodeURIComponent(assignmentId)}`
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim() || "Anonym",
          score: totalPoints,
          answers: answers.map((a) => ({
            questionIndex: a.questionIndex,
            correct: a.correct, // Anzeige-/Legacy-Kompat; Server ignoriert
            ...(a.answerId !== undefined ? { answerId: a.answerId } : {}),
            ...(a.answerIds ? { answerIds: a.answerIds } : {}),
            ...(a.answerText !== undefined ? { answerText: a.answerText } : {}),
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
