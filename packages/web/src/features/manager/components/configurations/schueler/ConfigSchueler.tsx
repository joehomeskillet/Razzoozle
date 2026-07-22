import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { ActionFooter } from "@razzoozle/web/components/ui"
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
    handleSetStudentActive,
  } = useSchuelerManager()

  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  return (
    <>
    {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
    <div className="flex flex-1 flex-col gap-4 pb-20">
      <PageHeader
        title={t("manager:schueler.title")}
        subtitle={t("manager:schueler.description")}
      />

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
              className="min-h-11 w-full rounded-[var(--radius-theme)]"
            />
          </div>

          <StudentList
            students={students}
            classes={classes}
            onToggleActive={handleSetStudentActive}
            onShowPin={handleShowPin}
            onDelete={(student) => setPendingDeleteStudent(student)}
            onRemoveFromClass={(data) => setPendingRemoveFromClass(data)}
            onAddToClass={handleAddToClass}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-8">
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

    <ActionFooter>
      <Button
        variant="primary"
        size="lg"
        className="w-full rounded-[var(--radius-theme)] sm:w-auto"
        onClick={() => setIsCreateDialogOpen(true)}
      >
        <Plus className="size-5" aria-hidden strokeWidth={2.5} />
        <span>{t("manager:schueler.create")}</span>
      </Button>
    </ActionFooter>
    </>
  )
}

export default ConfigSchueler
