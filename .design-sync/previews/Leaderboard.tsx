import { MotionConfig, Leaderboard } from "@razzoozle/web"

// Frozen-clock captures freeze rAF, so motion entry animations never tick and
// staggered rows sit at opacity 0 forever. This scoped override forces final
// visual state; component tokens/layout are untouched.
const RevealAll = () => (
  <style>{`.ds-reveal-all * { opacity: 1 !important; transform: none !important; }`}</style>
)

// Leaderboard mounts with `displayedLeaderboard = oldLeaderboard` and only
// swaps to `leaderboard` (plus reveals achievement chips / the celebratory
// banner) after 1600ms/2100ms setTimeouts — under the frozen capture clock
// those never fire, so `oldLeaderboard` IS what renders. Author it as the
// standing you want visible; `leaderboard` only needs to be a plausible
// "next" state (never shown in this capture).
const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  minHeight: 640,
  display: "flex",
  flexDirection: "column" as const,
  ["--game-fg" as string]: "#0E1120",
}

const standing = [
  { id: "p1", clientId: "c1", connected: true, username: "Mia", points: 820, streak: 3 },
  { id: "p2", clientId: "c2", connected: true, username: "Jonas", points: 640, streak: 0 },
  { id: "p3", clientId: "c3", connected: true, username: "Sarah", points: 510, streak: 1 },
]

export const MidGameStanding = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Leaderboard
      data={{
        oldLeaderboard: standing,
        leaderboard: standing,
      }}
    />
  </div>
  </MotionConfig>
)

export const WithTeams = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Leaderboard
      data={{
        oldLeaderboard: standing,
        leaderboard: standing,
        teamStandings: [
          { teamId: "blue", points: 1450, playerCount: 3 },
          { teamId: "red", points: 1200, playerCount: 2 },
        ],
      }}
    />
  </div>
  </MotionConfig>
)
