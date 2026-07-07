/**
 * celebration/types.ts — FROZEN contract for the post-game celebration layer.
 *
 * Single source of truth shared by every file under `celebration/`. Code labels
 * are brand-neutral (no "Razzoozle" in identifiers); the cream visual language is
 * applied only through CSS tokens / Tailwind classes.
 *
 * Do not change these shapes without updating every consumer.
 */
import type { AchievementTier } from "@razzoozle/web/features/game/utils/achievements"

/** One ranked participant (player or team) on the podium. Brand-neutral. */
export interface Celebrant {
  /** Stable key (username / team id). */
  id: string
  /** Display name. */
  name: string
  points: number
  /** Avatar URL (generic-set URL or uploaded data-URL); falls back to initials. */
  avatar?: string
  /** Present when this celebrant is a team rather than a solo player. */
  teamId?: string
  /** Full-game achievement ids this celebrant unlocked (ACHIEVEMENT_META keys). */
  achievements?: string[]
}

/** Input to the celebration layer. */
export interface CelebrationData {
  /** Top placements, already sorted best-first. Length 0–3 is used by the podium. */
  podium: Celebrant[]
  /** Newly-unlocked achievement ids to play through the burst queue (ACHIEVEMENT_META keys). */
  newAchievements?: string[]
}

export interface CelebrationOverlayProps {
  data: CelebrationData
  /**
   * Render the WinnerPodium. Default true. Pass false when the host screen
   * already draws its own podium (then the overlay only adds confetti + burst).
   */
  renderPodium?: boolean
  /** Fire the winner confetti once on reveal. Default true. */
  fireConfetti?: boolean
  /** Fired once the full celebration sequence has played. */
  onComplete?: () => void
}

export interface WinnerPodiumProps {
  /** Top placements best-first, length 0–3. */
  top: Celebrant[]
  /** Gate the reveal start (e.g. hold until a recap finishes). Default true. */
  active?: boolean
}

export interface AchievementBurstProps {
  /** Newly-unlocked achievement ids (ACHIEVEMENT_META keys; unknown ids are skipped). */
  ids: string[]
  /** Gate the burst start. Default true. */
  active?: boolean
  /** Fired after the last badge has played. */
  onComplete?: () => void
}

export type { AchievementTier }
