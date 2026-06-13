import type { GameResultMeta, QuizzMeta } from "@razzia/common/types/game"
import type { SubmissionMeta } from "@razzia/common/types/submission"

export interface ManagerConfig {
  quizz: QuizzMeta[]
  results: GameResultMeta[]
  submissions: SubmissionMeta[]
}
