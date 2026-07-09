import { PinInput } from "@razzoozle/web"

export const Empty = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <PinInput value="" onChange={() => {}} />
  </div>
)

export const Filled = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <PinInput value="4291" onChange={() => {}} />
  </div>
)
