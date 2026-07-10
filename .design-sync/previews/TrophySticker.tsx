import { TrophySticker } from "@razzoozle/web"

const wrap = {
  background: "var(--color-field-cream)",
  padding: 24,
  display: "flex",
  gap: 24,
  alignItems: "flex-start",
  flexWrap: "wrap" as const,
}

// No motion by design (foreignObject PNG-export constraint) — every cell is
// inherently capture-safe, resting-state pixels only.
export const Podium = () => (
  <div style={wrap}>
    <TrophySticker
      rank={1}
      name="Mira Solberg"
      points={4820}
      subject="Weltgeschichte"
      achievements={["first_responder", "streak_5"]}
      format="square"
    />
    <TrophySticker rank={2} name="Théo" points={3610} subject="Weltgeschichte" format="square" />
    <TrophySticker rank={3} name="Anna Kowalski" points={2990} subject="Weltgeschichte" format="square" />
  </div>
)

export const StoryFormat = () => (
  <div style={wrap}>
    <TrophySticker
      rank={1}
      name="Priya Nair"
      points={5120}
      subject="Naturwissenschaften"
      achievements={["perfect_game"]}
      format="story"
    />
  </div>
)

export const LongContentOverflow = () => (
  <div style={wrap}>
    <TrophySticker
      rank={1}
      name="Maximilian Alexander von Habsburg-Lothringen"
      points={999999}
      subject="Die faszinierende Geschichte des Heiligen Römischen Reiches Deutscher Nation"
      achievements={["first_correct", "sharpshooter", "underdog"]}
      format="square"
    />
  </div>
)
