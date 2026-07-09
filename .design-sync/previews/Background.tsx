import { Background } from "@razzoozle/web"

export const AuthField = () => (
  // Background sizes itself h-dvh and vertically centers its content — the
  // wrapper must be exactly 100dvh or the centered logo falls outside the crop.
  <div style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden" }}>
    <Background field="cream" />
  </div>
)

export const TopAligned = () => (
  <div style={{ position: "relative", width: 560, height: 280, overflow: "hidden" }}>
    <Background field="cream" align="top">
      <p style={{ fontSize: 14, color: "var(--color-secondary)" }}>Enter the game PIN</p>
    </Background>
  </div>
)
