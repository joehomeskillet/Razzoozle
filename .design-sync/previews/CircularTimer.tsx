import { CircularTimer } from "@razzoozle/web"

const shell = {
  background: "var(--color-field-cream)",
  padding: 24,
  ["--game-fg" as string]: "#0E1120",
}

export const MidCountdown = () => (
  <div style={shell}>
    <CircularTimer seconds={36} total={60} size={120} />
  </div>
)

export const Urgent = () => (
  <div style={shell}>
    <CircularTimer seconds={8} total={60} size={120} />
  </div>
)

export const Full = () => (
  <div style={shell}>
    <CircularTimer seconds={58} total={60} size={120} />
  </div>
)
