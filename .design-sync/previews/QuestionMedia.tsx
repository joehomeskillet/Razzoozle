import { QuestionMedia } from "@razzoozle/web"

const FLAG_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='66.6' y='0' fill='%23000000'/%3E%3Crect width='320' height='66.6' y='66.6' fill='%23DD0000'/%3E%3Crect width='320' height='66.6' y='133.2' fill='%23FFCE00'/%3E%3C/svg%3E"

export const Image = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <QuestionMedia
      media={{ type: "image", url: FLAG_SVG }}
      alt="Flag of Germany"
    />
  </div>
)

export const None = () => (
  <div
    style={{
      background: "var(--color-field-cream)",
      padding: 24,
      minHeight: 60,
    }}
  >
    <QuestionMedia />
  </div>
)
