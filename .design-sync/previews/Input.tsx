import { Input } from "@razzoozle/web"

export const Variants = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340 }}>
    <Input variant="md" placeholder="Quiz name" defaultValue="Capitals of Europe" />
    <Input variant="sm" placeholder="Round timer (seconds)" defaultValue="30" />
  </div>
)

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 340 }}>
    <Input placeholder="Player nickname" />
    <Input type="number" defaultValue="100" aria-label="Points per question" />
    <Input defaultValue="Locked round" disabled />
  </div>
)

export const Composed = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 340 }}>
    <label htmlFor="quiz-name-input">Quiz name</label>
    <Input id="quiz-name-input" defaultValue="World Capitals Challenge" />
  </div>
)
