import { ToggleField } from "@razzoozle/web"

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 380 }}>
    <ToggleField label="Team-Modus" checked onChange={() => {}} />
    <ToggleField label="Zufällige Reihenfolge" checked={false} onChange={() => {}} />
    <ToggleField label="Sudden Death" checked disabled onChange={() => {}} />
  </div>
)

export const WithDescription = () => (
  <div style={{ maxWidth: 380 }}>
    <ToggleField
      label="Bots automatisch hinzufügen"
      description="Füllt leere Plätze mit KI-Spielern, wenn zu wenige Menschen beitreten."
      checked
      onChange={() => {}}
    />
  </div>
)
