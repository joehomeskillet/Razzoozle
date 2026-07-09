import { FormSection, Input, LabelRow, ToggleField } from "@razzoozle/web"

export const Basic = () => (
  <FormSection title="Grundeinstellungen">
    <LabelRow label="Quiz name" htmlFor="fs-quiz-name">
      <Input id="fs-quiz-name" defaultValue="Capitals of Europe" />
    </LabelRow>
  </FormSection>
)

export const WithDescription = () => (
  <FormSection title="Spielmodus" description="Legt fest, wie Spieler an der Runde teilnehmen.">
    <ToggleField
      label="Team-Modus"
      checked
      description="Spieler treten in Teams an."
      onChange={() => {}}
    />
  </FormSection>
)

export const MultipleSections = () => (
  <div style={{ maxWidth: 440 }}>
    <FormSection title="Grundeinstellungen">
      <LabelRow label="Quiz name" htmlFor="ms-quiz-name">
        <Input id="ms-quiz-name" defaultValue="World Capitals Challenge" />
      </LabelRow>
    </FormSection>
    <FormSection title="Punkte" description="Wie Punkte pro Frage vergeben werden.">
      <LabelRow label="Punkte pro Frage" htmlFor="ms-points" suffix="Punkte">
        <Input id="ms-points" type="number" variant="sm" defaultValue="100" />
      </LabelRow>
    </FormSection>
  </div>
)
