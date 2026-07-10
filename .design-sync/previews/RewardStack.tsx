import { RewardStack } from "@razzoozle/web"

// Frozen-clock captures freeze rAF — motion entry states never leave opacity 0.
const RevealAll = () => (
  <style>{`body * { opacity: 1 !important; transform: none !important; }`}</style>
)

const wrap = {
  background: "var(--color-field-cream)",
  padding: 24,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
}

export const FullStack = () => (
  <div style={wrap}>
    <RevealAll />
    <RewardStack
      achievementIds={["perfect_game", "first_responder"]}
      bonusPoints={150}
      streakBonus
      streak={4}
      bonus
      firstCorrect
      visible
      tone="compact"
    />
  </div>
)

export const ToastTone = () => (
  <div style={wrap}>
    <RevealAll />
    <RewardStack achievementIds={["speed_demon"]} visible tone="toast" />
  </div>
)
