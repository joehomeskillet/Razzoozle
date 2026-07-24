import { create } from "zustand"

// Bridges the "this player already answered the current question" signal from
// the reconnect/resume path (SUCCESS_RECONNECT.alreadyAnswered) into the answer
// component, which mounts fresh on each SELECT_ANSWER and otherwise has no way
// to know the player already committed an answer before the reload/reconnect.
//
// Keyed loosely by gameId so a stale value from a previous game can't leak into
// a new one. Everything here is OPTIONAL low-latency behaviour: in normal mode
// `alreadyAnswered` is always false and the component behaves exactly as today.
interface AnswerState {
  // GameId the flag belongs to (guards against cross-game leakage).
  gameId: string | null
  // True if the server told us this player already answered the live question.
  alreadyAnswered: boolean
  // Sentence-builder: player's submitted chip order, revealed on SHOW_RESULT.
  submittedChunks?: string[]
  // Type-answer: player's submitted free text, kept for the client reveal
  // comparison ("your answer") on SHOW_RESULT.
  submittedText?: string
  // Slider / mathematik: player's submitted numeric value.
  submittedNumber?: number
  // Drop-pin: player's submitted pin position (image-relative coordinates).
  // `null` = explicitly cleared; `undefined` = never set this question.
  submittedPin?: { x: number; y: number } | null
  // Fill-blank / matching: player's submitted slot option indices.
  submittedSlotIndices?: number[]

  setAlreadyAnswered: (_gameId: string | null, _value: boolean) => void
  setSubmittedChunks: (_chunks: string[] | undefined) => void
  setSubmittedText: (_text: string | undefined) => void
  setSubmittedNumber: (_value: number | undefined) => void
  setSubmittedPin: (_pin: { x: number; y: number } | null | undefined) => void
  setSubmittedSlotIndices: (_indices: number[] | undefined) => void
  reset: () => void
}

export const useAnswerStore = create<AnswerState>((set) => ({
  gameId: null,
  alreadyAnswered: false,
  submittedChunks: undefined,
  submittedText: undefined,
  submittedNumber: undefined,
  submittedPin: undefined,
  submittedSlotIndices: undefined,

  setAlreadyAnswered: (gameId, value) =>
    set({ gameId: gameId ?? null, alreadyAnswered: Boolean(value) }),

  setSubmittedChunks: (chunks) => set({ submittedChunks: chunks }),

  setSubmittedText: (text) => set({ submittedText: text }),

  setSubmittedNumber: (value) => set({ submittedNumber: value }),

  setSubmittedPin: (pin) => set({ submittedPin: pin }),

  setSubmittedSlotIndices: (indices) => set({ submittedSlotIndices: indices }),

  reset: () =>
    set({
      gameId: null,
      alreadyAnswered: false,
      submittedChunks: undefined,
      submittedText: undefined,
      submittedNumber: undefined,
      submittedPin: undefined,
      submittedSlotIndices: undefined,
    }),
}))
