import { MotionConfig, SoloLeaderboard } from "@razzoozle/web"

// Frozen-clock captures freeze rAF, so motion entry animations never tick and
// staggered rows sit at opacity 0 forever. This scoped override forces final
// visual state; component tokens/layout are untouched.
const RevealAll = () => (
  <style>{`.ds-reveal-all * { opacity: 1 !important; transform: none !important; }`}</style>
)

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  minHeight: 500,
  ["--game-fg" as string]: "#0E1120",
}

const entries = [
  { playerName: "Mia", score: 980, answeredAt: "2026-07-08T10:00:00Z" },
  { playerName: "Jonas", score: 860, answeredAt: "2026-07-07T09:00:00Z" },
  { playerName: "Sarah", score: 720, answeredAt: "2026-07-06T14:00:00Z" },
  { playerName: "Luca", score: 540, answeredAt: "2026-07-05T11:00:00Z" },
]

export const CurrentPlayerMidPack = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <SoloLeaderboard
      leaderboard={entries}
      playerName="Sarah"
      totalPoints={720}
    />
  </div>
  </MotionConfig>
)

export const TopScore = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <SoloLeaderboard
      leaderboard={entries}
      playerName="Mia"
      totalPoints={980}
    />
  </div>
  </MotionConfig>
)
