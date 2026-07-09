import { ActionFooter, Button } from "@razzoozle/web"

export const SaveCancel = () => (
  <div>
    <p style={{ margin: "0 0 12px" }}>
      Ändere die Einstellungen für „Capitals of Europe" und speichere, wenn du fertig bist.
    </p>
    <ActionFooter>
      <Button variant="secondary">Abbrechen</Button>
      <Button variant="primary">Speichern</Button>
    </ActionFooter>
  </div>
)

export const SingleDangerAction = () => (
  <div>
    <p style={{ margin: "0 0 12px" }}>
      Dieses Quiz endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.
    </p>
    <ActionFooter>
      <Button variant="danger">Quiz löschen</Button>
    </ActionFooter>
  </div>
)
