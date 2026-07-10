import { RecapSequence } from "@razzoozle/web"

// Frozen-clock captures freeze rAF — motion entry states never leave opacity 0
// (RecapSequence's card-to-card 3D flip otherwise risks landing at rotateY
// 45deg — the card edge-on, effectively a blank sliver).
const RevealAll = () => (
  <style>{`body * { opacity: 1 !important; transform: none !important; }`}</style>
)

// In-game big-screen card — dark ink stage field, default white --game-fg
// (correct contrast; no override needed here, unlike a cream front-of-house
// screen).
const stage = {
  position: "relative" as const,
  width: 900,
  height: 640,
  background: "var(--color-field-ink)",
  overflow: "hidden",
}

// autoMode={false} — no auto-advance timer, so the capture always lands on
// the first card deterministically.
export const EndGameSuperlatives = () => (
  <div style={stage}>
    <RevealAll />
    <RecapSequence
      superlatives={[
        { key: "fastest_finger", winnerName: "Mira Solberg", value: 1240 },
        { key: "longest_streak", winnerName: "Théo", value: 7 },
      ]}
      autoMode={false}
      onComplete={() => {}}
    />
  </div>
)

export const RoundAwards = () => (
  <div style={stage}>
    <RevealAll />
    <RecapSequence
      roundAwards={[
        { key: "streak", winnerName: "Anna Kowalski", value: 5 },
        { key: "achievement_unlock", winnerName: "Youssef" },
      ]}
      autoMode={false}
      onComplete={() => {}}
    />
  </div>
)
