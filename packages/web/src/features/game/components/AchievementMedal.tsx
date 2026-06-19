/**
 * AchievementMedal — thin wrapper delegating to AchievementBadge for
 * backward compatibility. All components that previously used emoji icons
 * through AchievementMedal now transparently receive SVG icons via delegation.
 *
 * Preserved for gradual migration; import statements in calling components
 * require no changes.
 */

import AchievementBadge from "@razzoozle/web/features/game/achievements/AchievementBadge"
import type { AchievementTier } from "@razzoozle/web/features/game/utils/achievements"

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AchievementMedalProps {
  /** Achievement id — used to look up SVG icon from iconRegistry. */
  id: string
  tier: AchievementTier
  size?: "sm" | "md" | "lg"
  /** Optional text label rendered beneath the disc. */
  label?: string
  /** Force the animated ring regardless of tier (pass true for explicit pulse). */
  pulse?: boolean
  className?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * AchievementMedal delegates all props to AchievementBadge.
 * Callers need not change their imports; the underlying icon source (emoji → SVG)
 * is transparent.
 */
const AchievementMedal = (props: AchievementMedalProps) => {
  return <AchievementBadge {...props} />
}

export default AchievementMedal
