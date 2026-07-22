import AlertDialog from "@razzoozle/web/components/AlertDialog"
import { useTranslation } from "react-i18next"

import type { useQuizzManager } from "./useQuizzManager"

type QuizzDialogsProps = Pick<
  ReturnType<typeof useQuizzManager>,
  | "pendingDelete"
  | "setPendingDelete"
  | "handleDelete"
  | "bulkDeleteOpen"
  | "setBulkDeleteOpen"
  | "selectionCount"
  | "handleBulkDelete"
  | "pendingDuplicate"
  | "setPendingDuplicate"
  | "handleDuplicate"
>

const QuizzDialogs = ({
  pendingDelete,
  setPendingDelete,
  handleDelete,
  bulkDeleteOpen,
  setBulkDeleteOpen,
  selectionCount,
  handleBulkDelete,
  pendingDuplicate,
  setPendingDuplicate,
  handleDuplicate,
}: QuizzDialogsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
        title={t("manager:quizz.delete")}
        description={t("manager:quizz.deleteConfirm", {
          name: pendingDelete?.subject ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDelete}
      />

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("manager:quizz.bulkDeleteTitle")}
        description={t("manager:quizz.bulkDeleteConfirm", { count: selectionCount })}
        confirmLabel={t("common:delete")}
        onConfirm={handleBulkDelete}
      />

      <AlertDialog
        open={pendingDuplicate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDuplicate(null)
          }
        }}
        title={t("manager:quizz.duplicateTitle")}
        description={t("manager:quizz.duplicateConfirm", { name: pendingDuplicate?.subject ?? "" })}
        confirmLabel={t("manager:quizz.duplicateAction")}
        onConfirm={handleDuplicate}
      />
    </>
  )
}

export default QuizzDialogs
