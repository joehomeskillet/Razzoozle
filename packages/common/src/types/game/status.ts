import type {
  ManagerRecap,
  Player,
  PlayerRecap,
  QuestionMedia,
  QuestionType,
  RoundRecapAward,
  TeamStanding,
} from "@razzoozle/common/types/game"

export const STATUS = {
  // NOTE: the literal type is widened to include "PAUSED" (runtime value is
  // unchanged) so existing web records keyed off STATUS.* (e.g. MANAGER_SKIP_BTN,
  // indexed by a raw Status) keep typechecking before WP-WEB-QR-PAUSE adds a
  // real PAUSED branch. Additive/back-compat only.
  SHOW_ROOM: "SHOW_ROOM" as "SHOW_ROOM" | "PAUSED",
  SHOW_START: "SHOW_START",
  SHOW_PREPARED: "SHOW_PREPARED",
  SHOW_QUESTION: "SHOW_QUESTION",
  SELECT_ANSWER: "SELECT_ANSWER",
  SHOW_RESULT: "SHOW_RESULT",
  SHOW_RESPONSES: "SHOW_RESPONSES",
  // Manager-only interstitial: the per-round recap highlights get their OWN
  // full-screen page (reusing RecapSequence) BETWEEN the answer reveal and the
  // leaderboard. Players never receive it.
  SHOW_ROUND_RECAP: "SHOW_ROUND_RECAP",
  SHOW_LEADERBOARD: "SHOW_LEADERBOARD",
  FINISHED: "FINISHED",
  WAIT: "WAIT",
  PAUSED: "PAUSED",
} as const

export type Status = (typeof STATUS)[keyof typeof STATUS]

export interface CommonStatusDataMap {
  SHOW_START: { time: number; subject: string }
  SHOW_PREPARED: { totalAnswers: number; questionNumber: number }
  SHOW_QUESTION: {
    question: string
    // Answer TEXTS only (no solutions/correct — anti-cheat). Display-only for the
    // presenter big-screen tiles; absent for slider questions (no discrete answers).
    answers?: string[]
    // Optional permutation of answer indices when randomizeAnswers is enabled.
    // Absent for slider questions or when randomize is off. Lets the client render
    // tiles in displayOrder while keeping canonical indices for scoring.
    displayOrder?: number[]
    media?: QuestionMedia
    cooldown: number
    submittedBy?: string
  }
  SELECT_ANSWER: {
    question: string
    answers?: string[]
    media?: QuestionMedia
    time: number
    totalPlayer: number
    // Slider questions (no `correct` here — must not leak to players)
    type?: QuestionType
    min?: number
    max?: number
    step?: number
    unit?: string
    // Sentence-builder questions: shuffled word chips (no solution info).
    shuffledChunks?: string[]
    // Low-latency mode: server-authoritative timing anchors. All OPTIONAL —
    // absent in normal mode and ignored by old clients. Client uses these only
    // to drive the countdown/UI (never for scoring — scoring is server-side).
    serverSeq?: number
    serverNowMs?: number
    questionStartAtServerMs?: number
    answerDeadlineAtServerMs?: number
    submittedBy?: string
  }
  SHOW_RESULT: {
    correct: boolean
    message: string
    points: number
    myPoints: number
    rank: number
    aheadOfMe: string | null
    // Bonus / streak display
    streak?: number
    streakBonus?: boolean
    bonus?: boolean
    firstCorrect?: boolean
    poll?: boolean
    achievements?: string[]
    // Sum of per-achievement bonus points unlocked this round (already folded
    // into `myPoints`). Present only when > 0; absent/0 in the shipped default.
    bonusPoints?: number
    // Total players in this game, so the client can suppress a hollow "1st
    // place" label in a solo (single-player) game (W1-D FIX 2).
    playerCount?: number
    // The revealed correct answer for the round, shown on the wrong-answer
    // screen. Present only when applicable (never for poll/correct).
    correctAnswer?: string
    // Sentence-builder: authored correct order, revealed after the round.
    correctChunks?: string[]
    // Auto-mode: ms until the screen auto-advances, so the client can render a
    // local countdown. OPTIONAL — present only while auto-mode is on and an
    // advance is armed; absent (manual mode / old clients ignore it) otherwise.
    autoAdvanceMs?: number
    // Per-round recap awards (fastest finger, first correct, streak, …). OPTIONAL
    // + additive: up to 3 awards computed server-side per round; old clients
    // ignore it. Same value on every player's SHOW_RESULT (game-wide highlights).
    roundRecap?: RoundRecapAward[]
    // Scoring mode used in this game ('speed' for time-decay, 'accuracy' for
    // full base points on correct). OPTIONAL/additive; old clients ignore it.
    scoringMode?: "speed" | "accuracy"
  }
  WAIT: { text: string; teamMode?: boolean }
  PAUSED: { reason?: string }
  FINISHED: {
    subject: string
    top: Player[]
    rank?: number
    teamStandings?: TeamStanding[]
    // Post-game recap / awards (WP-A). OPTIONAL + filled DIFFERENTLY per
    // recipient: the manager emit carries a `ManagerRecap` (the full awards list
    // for the big screen), the per-player emit carries a `PlayerRecap` (this
    // player's own card + the single award they won). Old clients ignore it.
    recap?: ManagerRecap | PlayerRecap
    // Auto-mode flag echoed on the end-game screen so the client knows whether
    // the host auto-advanced through the game. OPTIONAL (old clients ignore it).
    autoMode?: boolean
  }
}

interface ManagerExtraStatus {
  SHOW_ROOM: { text: string; inviteCode?: string }
  SHOW_RESPONSES: {
    question: string
    responses: Record<number, number>
    solutions: number[]
    answers: string[]
    media?: QuestionMedia
    // Slider result
    type?: QuestionType
    correct?: number
    unit?: string
    averageGuess?: number
    // Type-answer result (manager-only — never sent to players). Normalized
    // text -> count, the authored accepted answers, and the comparison mode.
    textResponses?: Record<string, number>
    acceptedAnswers?: string[]
    matchMode?: "exact" | "normalized" | "fuzzy"
    // Sentence-builder result reveal (manager-only; same authored order as
    // player SHOW_RESULT.correctChunks after answers are closed).
    correctChunks?: string[]
    // Per-round recap awards (same as players see on SHOW_RESULT) so the
    // manager can display the round highlights during answer statistics.
    // OPTIONAL + additive.
    roundRecap?: RoundRecapAward[]
  }
  // Manager-only per-round recap screen (its OWN full-screen page). Carries the
  // same RoundRecapAward[] the players see inline on SHOW_RESULT.
  SHOW_ROUND_RECAP: { roundRecap: RoundRecapAward[] }
  SHOW_LEADERBOARD: {
    oldLeaderboard: Player[]
    leaderboard: Player[]
    teamStandings?: TeamStanding[]
    // Auto-mode: ms until the leaderboard auto-advances to the next question, so
    // the client can render a local countdown. OPTIONAL — present only while
    // auto-mode is on and an advance is armed; absent otherwise.
    autoAdvanceMs?: number
    // Per-round recap awards (same array the players get on SHOW_RESULT) so the
    // manager big-screen can show the round highlights. OPTIONAL + additive.
    roundRecap?: RoundRecapAward[]
  }
}

export type PlayerStatusDataMap = CommonStatusDataMap

export type ManagerStatusDataMap = CommonStatusDataMap & ManagerExtraStatus

export type StatusDataMap = PlayerStatusDataMap & ManagerStatusDataMap
