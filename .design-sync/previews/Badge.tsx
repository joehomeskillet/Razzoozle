import { Badge } from "@razzoozle/web"

export const Defaults = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <Badge>12 Fragen</Badge>
    <Badge>Lehrer</Badge>
    <Badge>Entwurf</Badge>
    <Badge>4</Badge>
  </div>
)

export const CustomStyling = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <Badge className="inline-flex items-center rounded-full bg-[var(--label-green-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--answer-text)]">
      Aktiv
    </Badge>
    <Badge className="inline-flex items-center rounded-full bg-[var(--surface-4)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
      1080p
    </Badge>
  </div>
)
