import { ScoreToast } from "@razzoozle/web"

// Frozen-clock captures freeze rAF — motion/useReveal entry states never leave
// opacity 0. Scoped override forces final visual state; tokens/layout untouched.
const RevealAll = () => (
  <style>{`body * { opacity: 1 !important; transform: none !important; }`}</style>
)

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  minHeight: 160,
}

export const Correct = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <ScoreToast correct points={380} visible />
  </div>
)

export const Wrong = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <ScoreToast correct={false} points={0} visible />
  </div>
)
