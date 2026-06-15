import type { GameResultMeta, QuizzMeta } from "@razzoozle/common/types/game"
import type { SubmissionMeta } from "@razzoozle/common/types/submission"
import type { MediaMeta } from "@razzoozle/common/types/media"
import type { ThemeTemplateMeta } from "@razzoozle/common/types/theme"
import type { MergedAchievement } from "@razzoozle/common/achievements"

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
  // Merged achievement config (registry defaults + manager overrides).
  // Optional for back-compat; absent in old payloads → client falls back to defaults.
  achievements?: MergedAchievement[]
}
