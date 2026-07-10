import { Prepared } from "@razzoozle/web"

// Frozen-clock captures freeze rAF — motion/useReveal entry states never leave
// opacity 0. Scoped override forces final visual state; tokens/layout untouched.
const RevealAll = () => (
  <style>{`.ds-reveal-all * { opacity: 1 !important; transform: none !important; }`}</style>
)

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  minHeight: 420,
  ["--game-fg" as string]: "#0E1120",
}

export const FourAnswers = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Prepared data={{ totalAnswers: 4, questionNumber: 3 }} />
  </div>
)

export const TwoAnswers = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Prepared data={{ totalAnswers: 2, questionNumber: 7 }} />
  </div>
)
