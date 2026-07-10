import { MotionConfig, TeamLeaderboard } from "@razzoozle/web"

// Frozen-clock captures freeze rAF, so motion entry animations never tick and
// staggered rows sit at opacity 0 forever. This scoped override forces final
// visual state; component tokens/layout are untouched.
const RevealAll = () => (
  <style>{`.ds-reveal-all * { opacity: 1 !important; transform: none !important; }`}</style>
)

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  ["--game-fg" as string]: "#0E1120",
}

export const Standings = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <TeamLeaderboard
      standings={[
        { teamId: "blue", points: 2200, playerCount: 3 },
        { teamId: "red", points: 1800, playerCount: 3 },
        { teamId: "green", points: 1150, playerCount: 2 },
        { teamId: "yellow", points: 400, playerCount: 2 },
      ]}
    />
  </div>
  </MotionConfig>
)

export const TwoTeamsCloseRace = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <TeamLeaderboard
      standings={[
        { teamId: "green", points: 990, playerCount: 4 },
        { teamId: "yellow", points: 960, playerCount: 4 },
      ]}
    />
  </div>
  </MotionConfig>
)
