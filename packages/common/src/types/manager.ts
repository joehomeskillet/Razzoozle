import type { GameResultMeta, QuizzMeta } from "@razzoozle/common/types/game"
import type { SubmissionMeta } from "@razzoozle/common/types/submission"
import type { MediaMeta } from "@razzoozle/common/types/media"
import type { ThemeTemplateMeta } from "@razzoozle/common/types/theme"
import type { MergedAchievement } from "@razzoozle/common/achievements"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"

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
  // Persisted low-latency-mode master switch (lowLatencyMode.enabled), flattened
  // and round-tripped so the manager toggle reflects the saved value and the
  // host can gate the LowLatencyHealth widget. Optional for back-compat: absent
  // in old emitConfig payloads → reads as off.
  lowLatencyEnabled?: boolean
  // Persisted join-locked flag. When true, new players cannot join the lobby;
  // existing players and reconnects are unaffected. Optional for back-compat:
  // absent in old payloads → reads as false (unlocked).
  joinLocked?: boolean
  // Merged achievement config (registry defaults + manager overrides).
  // Optional for back-compat; absent in old payloads → client falls back to defaults.
  achievements?: MergedAchievement[]
  // Dev-mode flag mirroring the server's RAZZOOLE_DEV env. Optional for
  // back-compat; absent in old payloads → reads as off.
  devMode?: boolean
  // Optional dev-API token (mirrors the server's DEV_API_KEY env) the manager
  // appends to dev-gated endpoint URLs. Optional/absent when no key is set or
  // for back-compat with old payloads → client falls back to dev-gate only.
  devApiKey?: string
  // Installed manager plugins (config/plugins/index.json). Optional for
  // back-compat; absent in old payloads → client renders no plugin tabs. The
  // socket layer broadcasts the live list via MANAGER.PLUGIN_CONFIG.
  plugins?: InstalledPlugin[]
  // Observability dashboard links surfaced in the manager's dev tab. Optional;
  // any individual URL may be absent if not configured.
  observability?: {
    grafanaUrl?: string
    lokiUrl?: string
    prometheusUrl?: string
  }
}
