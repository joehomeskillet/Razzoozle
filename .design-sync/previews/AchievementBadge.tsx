import { AchievementBadge } from "@razzoozle/web"

const field = {
  background: "var(--color-field-cream)",
  padding: 24,
  color: "var(--color-field-ink)",
  display: "flex",
  gap: 20,
  alignItems: "flex-end",
  flexWrap: "wrap",
}

// animated={false} — the component's own capture-safe static mode (see its
// doc comment). The entrance pop + pulsing ring are time-based motion that a
// frozen-clock single-frame capture cannot reliably settle on visible.
export const TierSweep = () => (
  <div style={field}>
    <AchievementBadge id="participation" tier="bronze" size="md" animated={false} label="Bronze" />
    <AchievementBadge id="sharpshooter" tier="silver" size="md" animated={false} label="Silber" />
    <AchievementBadge id="first_responder" tier="gold" size="md" animated={false} label="Gold" />
    <AchievementBadge id="perfect_game" tier="diamant" size="md" animated={false} label="Diamant" />
  </div>
)

export const SizeSweep = () => (
  <div style={field}>
    <AchievementBadge id="first_responder" tier="gold" size="sm" animated={false} />
    <AchievementBadge id="first_responder" tier="gold" size="md" animated={false} />
    <AchievementBadge id="first_responder" tier="gold" size="lg" animated={false} />
  </div>
)

export const ColorOverride = () => (
  <div style={field}>
    <AchievementBadge
      id="streak_10"
      size="lg"
      animated={false}
      label="Marken-Blau"
      colorOverride={{ gradientFrom: "#0EA5E9", gradientTo: "#6366F1", ring: "#38BDF8", icon: "#FFFFFF" }}
    />
    <AchievementBadge
      id="speedy_gonzales"
      size="lg"
      animated={false}
      label="Marken-Warm"
      colorOverride={{ gradientFrom: "#F43F5E", gradientTo: "#F59E0B", ring: "#FBBF24", icon: "#111827" }}
    />
  </div>
)
