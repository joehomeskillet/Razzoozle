import { LabelChip } from "@razzoozle/web"

export const Palette = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <LabelChip label={{ id: 1, name: "Mathe", color: "blue" }} />
    <LabelChip label={{ id: 2, name: "Deutsch", color: "red" }} />
    <LabelChip label={{ id: 3, name: "NMG", color: "green" }} />
    <LabelChip label={{ id: 4, name: "Klasse 5a", color: "yellow" }} />
    <LabelChip label={{ id: 5, name: "Repetition", color: "purple" }} />
    <LabelChip label={{ id: 6, name: "Archiv", color: "gray" }} />
  </div>
)

export const Removable = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <LabelChip label={{ id: 1, name: "Mathe", color: "blue" }} onRemove={() => {}} />
    <LabelChip label={{ id: 2, name: "Klasse 5a", color: "yellow" }} onRemove={() => {}} />
  </div>
)
