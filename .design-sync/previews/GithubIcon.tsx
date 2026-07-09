import { Button, GithubIcon } from "@razzoozle/web"

export const Sizes = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", color: "var(--color-secondary)" }}>
    <GithubIcon size={16} />
    <GithubIcon size={24} />
    <GithubIcon size={32} />
  </div>
)

export const InButton = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button variant="secondary" size="icon" aria-label="View source on GitHub">
      <GithubIcon size={18} />
    </Button>
    <a
      href="#"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 14,
        fontWeight: 600,
        color: "var(--color-primary)",
      }}
    >
      <GithubIcon size={14} />
      Razzoozle - v1.0.0
    </a>
  </div>
)
