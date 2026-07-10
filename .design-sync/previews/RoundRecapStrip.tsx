import { RoundRecapStrip } from "@razzoozle/web"

// Frozen-clock captures freeze rAF — motion entry states never leave opacity 0.
const RevealAll = () => (
  <style>{`body * { opacity: 1 !important; transform: none !important; }`}</style>
)

// The strip's own title reads var(--game-fg) (default white, invisible on
// cream) — set it to ink on this cream front-of-house wrapper.
const wrap = {
  background: "var(--color-field-cream)",
  padding: 24,
  ["--game-fg" as string]: "#0E1120",
}

export const ThreeAwards = () => (
  <div style={wrap}>
    <RevealAll />
    <RoundRecapStrip
      awards={[
        { key: "fastest_finger", winnerName: "Mira Solberg", value: 820 },
        { key: "streak", winnerName: "Théo", value: 5 },
        { key: "highest_round_score", winnerName: "Anna Kowalski", value: 980 },
      ]}
    />
  </div>
)

export const SingleAward = () => (
  <div style={wrap}>
    <RevealAll />
    <RoundRecapStrip awards={[{ key: "achievement_unlock", winnerName: "Youssef" }]} />
  </div>
)
