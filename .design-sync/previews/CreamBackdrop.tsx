import { CreamBackdrop } from "@razzoozle/web"

export const Default = () => (
  <div
    style={{
      position: "relative",
      width: 560,
      height: 280,
      overflow: "hidden",
      background: "var(--color-field-cream)",
    }}
  >
    <CreamBackdrop />
    <div
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 20,
        fontWeight: 700,
        color: "var(--color-secondary)",
      }}
    >
      Waiting for the host to start…
    </div>
  </div>
)

export const DenseIcons = () => (
  <div
    style={{
      position: "relative",
      width: 560,
      height: 280,
      overflow: "hidden",
      background: "var(--color-field-cream)",
    }}
  >
    <CreamBackdrop iconCount={4} intensity={0.6} />
  </div>
)
