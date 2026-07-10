import { AchievementMedal } from "@razzoozle/web"

const field = {
  background: "var(--color-field-cream)",
  padding: 24,
  color: "var(--color-field-ink)",
  display: "flex",
  gap: 24,
  alignItems: "flex-end",
  flexWrap: "wrap",
}

// AchievementMedal is a thin delegate to AchievementBadge — animated={false}
// (forwarded through the spread even though the wrapper's own prop contract
// doesn't declare it) keeps every cell in its capture-safe static mode.
export const GalleryTiers = () => (
  <div style={field}>
    <AchievementMedal id="participation" tier="bronze" size="lg" animated={false} />
    <AchievementMedal id="climber" tier="silver" size="lg" animated={false} />
    <AchievementMedal id="perfect_round" tier="gold" size="lg" animated={false} />
    <AchievementMedal id="perfect_game" tier="diamant" size="lg" animated={false} />
  </div>
)

export const CompactSizes = () => (
  <div style={field}>
    <AchievementMedal id="streak_5" tier="gold" size="sm" animated={false} label="×3" />
    <AchievementMedal id="streak_5" tier="gold" size="md" animated={false} label="×3" />
    <AchievementMedal id="streak_5" tier="gold" size="lg" animated={false} label="×3" />
  </div>
)
