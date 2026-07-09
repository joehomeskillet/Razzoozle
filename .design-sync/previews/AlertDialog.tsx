import { AlertDialog } from "@razzoozle/web"

// Rendered permanently open (controlled) so the card shows the dialog itself;
// cfg.overrides.AlertDialog pins cardMode/viewport so the portal stays inside.
export const ConfirmDelete = () => (
  <AlertDialog
    open
    onOpenChange={() => {}}
    title="Delete this quiz?"
    description="This permanently removes “Capitals of Europe” and its 12 questions. Players keep their past results."
    confirmLabel="Delete quiz"
    onConfirm={() => {}}
  />
)
