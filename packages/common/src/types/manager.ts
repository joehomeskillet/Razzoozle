import type { GameResultMeta, QuizzMeta } from "@razzia/common/types/game"
import type { SubmissionMeta } from "@razzia/common/types/submission"
import type { MediaMeta } from "@razzia/common/types/media"
import type { ThemeTemplateMeta } from "@razzia/common/types/theme"

export interface ManagerConfig {
  quizz: QuizzMeta[]
  results: GameResultMeta[]
  submissions: SubmissionMeta[]
  // Media-manager library. Optional so the contract WP keeps the workspace
  // types gate green before WP-SOCKET-MEDIA populates it (emitConfig). The
  // socket layer always sends it once that WP lands.
  media?: MediaMeta[]
  // Lightweight theme-template list ({id,name}) for the design-tab picker.
  // Optional so the contract WP keeps the types gate green before the socket WP
  // populates it (emitConfig). The socket layer sends it once that WP lands.
  themeTemplates?: ThemeTemplateMeta[]
  // Persisted team-mode flag, round-tripped so the manager's game-mode toggle
  // reflects the saved value instead of always defaulting to off. Optional for
  // back-compat: an old emitConfig payload (or a missing config) reads as off.
  teamMode?: boolean
}
