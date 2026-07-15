import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import CreateStudentDialog from "./CreateStudentDialog"
import PinDialog from "./PinDialog"
import StudentList from "./StudentList"
import { useSchuelerManager } from "./useSchuelerManager"

const ConfigSchueler = () => {
  const {
    students,
    hasStudents,
    search,
    setSearch,
    classes,
    pinView,
    clearPinView,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    pendingRemoveFromClass,
    setPendingRemoveFromClass,
    pendingRegenPin,
    setPendingRegenPin,
    handleCreateStudent,
    handleShowPin,
    handleRegenPin,
    handleDeleteStudent,
    handleRemoveFromClass,
    handleAddToClass,
  } = useSchuelerManager()

  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            {t("manager:schueler.title")}
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-medium)]">
            {t("manager:schueler.description")}
          </p>
        </div>
        <Button
          variant="primary"
          className="shrink-0 rounded-xl"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="size-4" />
          {t("manager:schueler.create")}
        </Button>
      </div>

      {hasStudents ? (
        <>
          <div className="flex shrink-0">
            <label htmlFor="schueler-search" className="sr-only">
              {t("manager:schueler.search")}
            </label>
            <Input
              id="schueler-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("manager:schueler.searchPlaceholder")}
              className="min-h-11 w-full rounded-xl"
            />
          </div>

          <StudentList
            students={students}
            classes={classes}
            onShowPin={handleShowPin}
            onDelete={(student) => setPendingDeleteStudent(student)}
            onRemoveFromClass={(data) => setPendingRemoveFromClass(data)}
            onAddToClass={handleAddToClass}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-8">
          <p className="text-sm text-[var(--ink-subtle)]">
            {t("manager:schueler.empty")}
          </p>
        </div>
      )}

      <CreateStudentDialog
        open={isCreateDialogOpen}
        classes={classes}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateStudent}
      />

      <PinDialog
        data={pinView}
        onClose={clearPinView}
        onRequestRegen={(studentId) => setPendingRegenPin({ studentId })}
      />

      {/* Delete Student Dialog */}
      <AlertDialog
        open={pendingDeleteStudent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteStudent(null)
          }
        }}
        title={t("manager:schueler.deleteTitle")}
        description={t("manager:schueler.deleteConfirm", {
          name: pendingDeleteStudent?.displayName ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteStudent}
      />

      {/* Remove-from-class Dialog */}
      <AlertDialog
        open={pendingRemoveFromClass !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRemoveFromClass(null)
          }
        }}
        title={t("manager:schueler.removeFromClassTitle")}
        description={t("manager:schueler.removeFromClassConfirm", {
          name: pendingRemoveFromClass?.displayName ?? "",
          className: pendingRemoveFromClass?.className ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleRemoveFromClass}
      />

      {/* Regenerate PIN confirm */}
      <AlertDialog
        open={pendingRegenPin !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingRegenPin(null)
          }
        }}
        title={t("manager:schueler.regenPin")}
        description={t("manager:schueler.regenConfirm")}
        confirmLabel={t("manager:schueler.regenPin")}
        onConfirm={handleRegenPin}
      />
    </div>
  )
}

export default ConfigSchueler
