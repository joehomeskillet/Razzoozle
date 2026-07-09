import { Input, LabelRow } from "@razzoozle/web"

export const Variants = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
    <LabelRow label="Quiz name" htmlFor="quiz-name">
      <Input id="quiz-name" defaultValue="Capitals of Europe" />
    </LabelRow>
    <LabelRow label="Points per question" htmlFor="points" suffix="Punkte">
      <Input id="points" type="number" variant="sm" defaultValue="100" />
    </LabelRow>
  </div>
)

export const WithDescription = () => (
  <div style={{ maxWidth: 420 }}>
    <LabelRow
      label="Round timer"
      htmlFor="timer"
      suffix="Sekunden"
      description="Wie lange Spieler Zeit haben, um eine Antwort zu geben."
    >
      <Input id="timer" type="number" variant="sm" defaultValue="30" />
    </LabelRow>
  </div>
)

export const ReadOnlyRow = () => (
  <div style={{ maxWidth: 420 }}>
    <LabelRow label="Spielcode" suffix="6-stellig">
      <span>ABC123</span>
    </LabelRow>
  </div>
)
