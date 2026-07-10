import { RoundRecapCard } from "@razzoozle/web"

const wrap = {
  background: "var(--color-field-cream)",
  padding: 24,
  display: "flex",
  gap: 16,
  alignItems: "stretch",
  flexWrap: "wrap" as const,
}

// The `highlight` re-emphasis pulse is scale-only (never opacity) and this
// card's OWN first-appearance reveal is owned by the parent Strip (not used
// here) — no motion risk to work around standalone.
export const KeySweep = () => (
  <div style={wrap}>
    <RoundRecapCard
      award={{ key: "fastest_finger", winnerName: "Mira Solberg", winnerAvatar: "dicebear:bottts:capitals-of-europe-1", value: 820 }}
    />
    <RoundRecapCard award={{ key: "streak", winnerName: "Théo", value: 5 }} />
    <RoundRecapCard award={{ key: "highest_round_score", winnerName: "Anna Kowalski", value: 980 }} />
    <RoundRecapCard award={{ key: "rank_climber", winnerName: "Youssef", value: 3 }} />
    <RoundRecapCard award={{ key: "most_wrong", winnerName: "Priya Nair", value: 2 }} />
  </div>
)

export const NoValueAndHighlight = () => (
  <div style={wrap}>
    <RoundRecapCard award={{ key: "achievement_unlock", winnerName: "Mira Solberg" }} />
    <RoundRecapCard award={{ key: "first_correct", winnerName: "Théo" }} highlight />
  </div>
)
