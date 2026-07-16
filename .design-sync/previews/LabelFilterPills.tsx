import { LabelFilterPills } from "@razzoozle/web"

const LABELS = [
  { id: 1, name: "Mathe", color: "blue" },
  { id: 2, name: "Deutsch", color: "red" },
  { id: 3, name: "NMG", color: "green" },
  { id: 4, name: "Klasse 5a", color: "yellow" },
]

export const AllActive = () => (
  <LabelFilterPills labels={LABELS} activeId={null} onChange={() => {}} />
)

export const LabelActive = () => (
  <LabelFilterPills labels={LABELS} activeId={2} onChange={() => {}} />
)
