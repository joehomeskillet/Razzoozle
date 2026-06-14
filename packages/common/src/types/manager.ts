import type { GameResultMeta, QuizzMeta } from "@razzia/common/types/game"
import type { SubmissionMeta } from "@razzia/common/types/submission"
import type { MediaMeta } from "@razzia/common/types/media"

export interface ManagerConfig {
  quizz: QuizzMeta[]
  results: GameResultMeta[]
  submissions: SubmissionMeta[]
  // Media-manager library. Optional so the contract WP keeps the workspace
  // types gate green before WP-SOCKET-MEDIA populates it (emitConfig). The
  // socket layer always sends it once that WP lands.
  media?: MediaMeta[]
}
