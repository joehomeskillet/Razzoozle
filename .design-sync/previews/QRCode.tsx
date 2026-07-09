import { QRCode } from "@razzoozle/web"

export const JoinCode = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <QRCode value="https://razzoozle.xyz/join/4291" size={180} />
  </div>
)

export const Small = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <QRCode value="https://razzoozle.xyz/join/7723" size={96} />
  </div>
)
