// Achievements config helpers — extracted verbatim from RoundManager
// (round-manager.ts, Modul 1 of the SRP split). Each function was a private
// method reading `this.achievementsConfig`; the config map is now an explicit
// first argument instead of an implicit `this`.
import type {
  AchievementId,
  MergedAchievement,
} from "@razzoozle/common/achievements"

// enabled gate: a badge with `enabled === false` in the merged config is
// skipped entirely (never pushed). A missing entry (never happens once merged
// off the registry, but defensive) defaults to enabled.
export function achievementEnabled(
  config: Map<AchievementId, MergedAchievement>,
  id: AchievementId,
): boolean {
  return config.get(id)?.enabled ?? true
}

// configured numeric threshold for a badge, falling back to `fallback` (the
// shipped default) when the config carries no number for it. Merged config
// already clamped the value to the registry [min,max], so this is read-only.
export function achievementThreshold(
  config: Map<AchievementId, MergedAchievement>,
  id: AchievementId,
  fallback: number,
): number {
  return config.get(id)?.threshold ?? fallback
}

// Per-badge bonus points awarded when the badge unlocks. Falls back to 0 when
// the merged config carries no number for it (registry holds no per-id bonus),
// so an empty/missing config reproduces the previous scoring exactly. Merged
// config already clamped the value to [0, BONUS_MAX], so this is read-only.
export function achievementBonus(
  config: Map<AchievementId, MergedAchievement>,
  id: AchievementId,
): number {
  return config.get(id)?.bonus ?? 0
}
