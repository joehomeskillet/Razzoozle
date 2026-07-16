import { FilterPill } from "@razzoozle/web"

const noop = () => {}

export const ScopePills = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <FilterPill active onClick={noop}>
      Alle
    </FilterPill>
    <FilterPill active={false} onClick={noop}>
      Eigene
    </FilterPill>
    <FilterPill active={false} onClick={noop}>
      Katalog
    </FilterPill>
  </div>
)

export const WithCount = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <FilterPill active onClick={noop} count={3}>
      Offen
    </FilterPill>
    <FilterPill active={false} onClick={noop} count={12}>
      Bewertet
    </FilterPill>
    <FilterPill active={false} onClick={noop} count={0}>
      Abgelehnt
    </FilterPill>
  </div>
)
