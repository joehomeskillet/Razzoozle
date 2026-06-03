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
  // gameId the flag belongs to (guards against cross-game leakage).
  gameId: string | null
  // True if the server told us this player already answered the live question.
  alreadyAnswered: boolean

  setAlreadyAnswered: (_gameId: string | null, _value: boolean) => void
  reset: () => void
}

export const useAnswerStore = create<AnswerState>((set) => ({
  gameId: null,
  alreadyAnswered: false,

  setAlreadyAnswered: (gameId, value) =>
    set({ gameId: gameId ?? null, alreadyAnswered: Boolean(value) }),

  reset: () => set({ gameId: null, alreadyAnswered: false }),
}))
