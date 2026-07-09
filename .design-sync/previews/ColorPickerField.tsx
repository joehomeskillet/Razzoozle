import { ColorPickerField } from "@razzoozle/web"

export const Basic = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24, maxWidth: 420 }}>
    <ColorPickerField label="Primärfarbe" value="#7C3AED" onChange={() => {}} />
  </div>
)

export const WithContrastPill = () => (
  <div
    style={{
      background: "var(--color-field-cream)",
      padding: 24,
      display: "flex",
      flexDirection: "column",
      gap: 16,
      maxWidth: 420,
    }}
  >
    <ColorPickerField
      label="Antworttext"
      value="#7C3AED"
      onChange={() => {}}
      contrastAgainst="#FFFFFF"
    />
    <ColorPickerField
      label="Hintergrund"
      value="#1E293B"
      onChange={() => {}}
      contrastAgainst="#FFFFFF"
    />
  </div>
)

export const WithAnswerPreview = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24, maxWidth: 420 }}>
    <ColorPickerField
      label="Antwortfarbe A"
      value="#F4B400"
      onChange={() => {}}
      answerPreview={{ text: "#1E293B", label: "A" }}
    />
  </div>
)
