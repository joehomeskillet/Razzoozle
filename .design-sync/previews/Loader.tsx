import { Loader } from "@razzoozle/web"

export const WithCaption = () => (
  <div
    style={{
      background: "var(--color-field-cream)",
      padding: 24,
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    <Loader className="size-7 text-[color:var(--color-primary)]" />
    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-secondary)" }}>
      Loading players…
    </span>
  </div>
)

export const Bare = () => (
  <div style={{ background: "var(--color-field-cream)", padding: 24 }}>
    <Loader className="size-12 text-[color:var(--color-primary)]" />
  </div>
)
