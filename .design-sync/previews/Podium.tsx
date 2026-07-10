import { MotionConfig, Podium } from "@razzoozle/web"

// Frozen-clock captures freeze rAF, so motion entry animations never tick and
// staggered rows sit at opacity 0 forever. This scoped override forces final
// visual state; component tokens/layout are untouched.
const RevealAll = () => (
  <style>{`.ds-reveal-all * { opacity: 1 !important; transform: none !important; }`}</style>
)

// Podium's `usePodiumAnimation` gates all reveal state behind a 2000ms
// setInterval — under the frozen capture clock that never fires, so any
// `top.length >= 3` podium stays invisible (opacity 0). With < 3 players the
// hook's mount effect sets full reveal synchronously (a genuine 2-player
// finish), which is the only stable, fully-visible state to author against.
//
// The podium blocks are sized with `h-[50%]/h-[60%]/h-[40%]` (percentage
// heights) all the way down through `flex-1` ancestors, which only resolve
// against a DEFINITE height — a `minHeight`-only wrapper leaves the chain
// indefinite and every block collapses to 0px. Wrapper must set `height`.
const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  height: 640,
  display: "flex",
  flexDirection: "column" as const,
  ["--game-fg" as string]: "#0E1120",
}

export const TwoPlayerFinal = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Podium
      data={{
        subject: "Weltgeschichte",
        top: [
          {
            id: "p1",
            clientId: "c1",
            connected: true,
            username: "Mia",
            points: 1450,
            streak: 5,
            achievements: ["perfect_game", "streak_5"],
          },
          {
            id: "p2",
            clientId: "c2",
            connected: true,
            username: "Jonas",
            points: 1120,
            streak: 2,
            achievements: ["first_correct"],
          },
        ],
        autoMode: false,
      }}
    />
  </div>
  </MotionConfig>
)

export const WithTeamStandings = () => (
  <MotionConfig reducedMotion="always">
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Podium
      data={{
        subject: "Naturwissenschaften",
        top: [
          {
            id: "p1",
            clientId: "c1",
            connected: true,
            username: "Sarah",
            points: 980,
            streak: 3,
          },
          {
            id: "p2",
            clientId: "c2",
            connected: true,
            username: "Luca",
            points: 860,
            streak: 1,
          },
        ],
        teamStandings: [
          { teamId: "blue", points: 2200, playerCount: 3 },
          { teamId: "red", points: 1800, playerCount: 2 },
        ],
        autoMode: false,
      }}
    />
  </div>
  </MotionConfig>
)
