import type { GameUpdateQuestion } from "@razzoozle/common/types/game"
import { create } from "zustand"

interface QuestionStore {
  questionStates: GameUpdateQuestion | null
  displayOrder: number[] | undefined
  setQuestionStates: (_state: GameUpdateQuestion | null) => void
  setDisplayOrder: (_order: number[] | undefined) => void
}

export const useQuestionStore = create<QuestionStore>((set) => ({
  questionStates: null,
  displayOrder: undefined,
  setQuestionStates: (state) => set({ questionStates: state }),
  setDisplayOrder: (order) => set({ displayOrder: order }),
}))
