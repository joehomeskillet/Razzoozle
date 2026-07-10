import { AnswerButton } from "@razzoozle/web"

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  ["--game-fg" as string]: "#0E1120",
}

const ANSWERS = ["Paris", "Berlin", "Madrid", "Rome"]

export const Unrevealed = () => (
  <div style={shell}>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        maxWidth: 480,
      }}
    >
      {ANSWERS.map((label, i) => (
        <AnswerButton key={label} colorIndex={i}>
          {label}
        </AnswerButton>
      ))}
    </div>
  </div>
)

export const Revealed = () => (
  <div style={shell}>
    <div style={{ display: "flex", gap: 12, maxWidth: 480 }}>
      <AnswerButton colorIndex={0} correct>
        Paris
      </AnswerButton>
      <AnswerButton colorIndex={1} correct={false}>
        Berlin
      </AnswerButton>
    </div>
  </div>
)
