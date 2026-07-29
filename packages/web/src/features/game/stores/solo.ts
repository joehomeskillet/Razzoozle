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

// #471: finishGame's outcome once the score POST comes back. "rejected" is a
// definitive server answer (403, deadline_passed/attempt_limit_reached in
// rust/server/src/http/solo.rs) — the run is over, nothing to retry.
// "network" means the request never got a server answer at all — unlike a
// rejection, trying again may succeed.
export type SubmitErrorReason = "deadline" | "attemptLimit" | "other"
export type SubmitError =
  | { kind: "rejected"; reason: SubmitErrorReason }
  | { kind: "network" }

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
  // Unscored poll question: marks answers that do not contribute to score stats.
  // Used by SoloRecapCard to filter out poll answers from accuracy/streak calculations.
  poll?: boolean
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
  // #471: set by finishGame when the score POST is rejected (definitive server
  // answer) or never reached the server (retryable). null while idle and after
  // a successful submit. No dedicated setter — finishGame owns this field.
  submitError: SubmitError | null
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
  finishPractice: (id: string) => Promise<void>
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
  submitError: null as SubmitError | null,
  autoAdvance: false,
}

// ---------------------------------------------------------------------------
// sessionStorage persistence — a run survives an accidental reload/crash of
// the tab, but not a closed browser (unlike localStorage), which matches how
// long a single solo run should live. Manual read/write, same pattern as the
// manager store's auth state (no persist middleware for one blob).
// ---------------------------------------------------------------------------

const STORAGE_KEY = "razzoozle_solo_progress"

// What's worth resuming: which quiz, where the player is, and what they've
// already scored/answered. `assignmentId` is deliberately excluded — it's
// routing context the calling page re-establishes via setAssignmentId()
// right before loadQuiz(), not part of the run's progress.
interface StoredSoloProgress {
  quizzId: string
  subject: string
  questions: SoloQuestion[]
  currentIndex: number
  phase: SoloPhase
  playerName: string
  totalPoints: number
  streak: number
  answers: SoloQuestionResult[]
}

function loadSoloProgress(quizzId: string): StoredSoloProgress | null {
  try {
    if (typeof window === "undefined") return null
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSoloProgress
    // Quiz-match guard: a saved run only ever resumes the SAME quiz that's
    // being opened right now — a stand from quiz A must never surface in B.
    if (parsed.quizzId !== quizzId) return null
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

function clearSoloProgress() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

// Wired up via useSoloStore.subscribe() below, so it runs after every state
// change without threading a persist call into each action. Only writes on
// "settled" phases — "loading" and "answering" are transient/in-flight and
// must never become the resumable snapshot: reloading mid-submit would
// otherwise continue a half-submitted answer whose server-side outcome is
// unknown. Leaving storage untouched during those phases keeps the last good
// snapshot (the state right before the in-flight request) intact for resume.
function persistSoloProgress(state: SoloState) {
  try {
    if (typeof window === "undefined" || !state.quizzId) return
    // A finished run has nothing left to resume — clean up.
    if (state.phase === "finished") {
      window.sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    if (state.phase !== "name" && state.phase !== "question" && state.phase !== "result") {
      return
    }
    const snapshot: StoredSoloProgress = {
      quizzId: state.quizzId,
      subject: state.subject,
      questions: state.questions,
      currentIndex: state.currentIndex,
      phase: state.phase,
      playerName: state.playerName,
      totalPoints: state.totalPoints,
      streak: state.streak,
      answers: state.answers,
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

export const useSoloStore = create<SoloState>((set, get) => ({
  ...initialState,

  setQuizzId: (quizzId) => set({ quizzId }),

  setAssignmentId: (assignmentId) => set({ assignmentId }),

  loadQuiz: async (id: string) => {
    // Resume a reload-surviving run for THIS quiz before hitting the network
    // — skips re-fetching (and, more importantly, skips wiping progress back
    // to zero) when there's a matching in-progress snapshot.
    const saved = loadSoloProgress(id)
    if (saved) {
      set({
        quizzId: id,
        subject: saved.subject,
        questions: saved.questions,
        currentIndex: saved.currentIndex,
        phase: saved.phase,
        playerName: saved.playerName,
        totalPoints: saved.totalPoints,
        streak: saved.streak,
        answers: saved.answers,
        lastResult: null,
        lastAchievements: [],
        error: null,
      })
      return
    }
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
    } catch {
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
                poll: true,
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
    // A new attempt clears any previous submit error (e.g. the retry button on
    // the assignment page after a network failure).
    set({ submitError: null })
    try {
      const url = `/api/quizz/${encodeURIComponent(id)}/solo-score`

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim() || "Anonym",
          score: totalPoints,
          // #471: the server reads assignmentId from the JSON body (see
          // SoloScoreRequest in rust/server/src/http/solo.rs) — it has no
          // Query extractor, so a query-string param is silently dropped.
          ...(assignmentId !== undefined ? { assignmentId } : {}),
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
      } else {
        // #471: a definitive server answer (403 deadline/attempt-limit from
        // rust/server/src/http/solo.rs). Axum renders the handler's
        // (StatusCode, String) as a plain-text body, so classify the text —
        // the page turns it into a localized reason instead of silently
        // showing the local result as if the submit had landed.
        const bodyText = await res.text().catch(() => "")
        const lower = bodyText.toLowerCase()
        const reason: SubmitErrorReason = lower.includes("deadline")
          ? "deadline"
          : lower.includes("attempt")
            ? "attemptLimit"
            : "other"
        set({ submitError: { kind: "rejected", reason } })
      }
    } catch {
      // #471: the request never got a server answer (offline, DNS, aborted).
      // Unlike a rejection, a retry may succeed — the page offers one.
      set({ submitError: { kind: "network" } })
    }
  },

  // Practice: same payload shape, never ranks (practice-score sink).
  finishPractice: async (id: string) => {
    const { playerName, totalPoints, answers } = get()
    try {
      const url = `/api/quizz/${encodeURIComponent(id)}/practice-score`
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim() || "Anonym",
          score: totalPoints,
          answers: answers.map((a) => ({
            questionIndex: a.questionIndex,
            correct: a.correct,
            ...(a.answerId !== undefined ? { answerId: a.answerId } : {}),
            ...(a.answerIds ? { answerIds: a.answerIds } : {}),
            ...(a.answerText !== undefined ? { answerText: a.answerText } : {}),
          })),
        }),
      })
      set({ leaderboard: [] })
    } catch {
      // non-fatal
    }
  },

  reset: () => {
    clearSoloProgress()
    set(initialState)
  },
}))

// Persist after every state change (see persistSoloProgress for which phases
// actually write). Runs once at module load, alongside the store itself.
useSoloStore.subscribe(persistSoloProgress)
