import { Question } from "@razzoozle/web"

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

const FLAG_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='66.6' y='0' fill='%23000000'/%3E%3Crect width='320' height='66.6' y='66.6' fill='%23DD0000'/%3E%3Crect width='320' height='66.6' y='133.2' fill='%23FFCE00'/%3E%3C/svg%3E"

export const WithImage = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Question
      data={{
        question: "Which country's flag is this?",
        media: { type: "image", url: FLAG_SVG },
        cooldown: 4,
      }}
    />
  </div>
)

export const TextOnly = () => (
  <div className="ds-reveal-all" style={shell}>
    <RevealAll />
    <Question
      data={{
        question: "What is the capital of Portugal?",
        cooldown: 5,
        submittedBy: "Mara",
      }}
    />
  </div>
)
