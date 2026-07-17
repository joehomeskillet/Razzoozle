import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Input from "@razzoozle/web/components/Input"
import Button from "@razzoozle/web/components/Button"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"

import ClassList from "./ClassList"
import StudentPicker from "./StudentPicker"
import { useClassManager } from "./useClassManager"

// Matches the server's UTC "not in the future" check (see class:updateStudent).
const todayIso = new Date().toISOString().slice(0, 10)

const ConfigKlassen = () => {
  const {
    classes,
    allStudents,
    search,
    setSearch,
    pendingDeleteClass,
    setPendingDeleteClass,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    handleCreateClass,
    handleUpdateClass,
    handleDeleteClass,
    handleMoveStudent,
    handleDeleteStudent,
    handleUpdateStudent,
    handleFetchStudents,
    handleAssignLabels,
  } = useClassManager()

  const { t } = useTranslation()

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<{
    id: number
    name: string
  } | null>(null)

  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [pickerClassId, setPickerClassId] = useState<number | null>(null)
  const pickerClassName =
    classes.find((c) => c.id === pickerClassId)?.name ?? ""

  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<{
    id: number
    displayName: string
    firstName?: string
    lastName?: string
    birthdate?: string | null
  } | null>(null)

  // Form states
  const [createName, setCreateName] = useState("")
  const [editName, setEditName] = useState("")
  const [editStudentFirstName, setEditStudentFirstName] = useState("")
  const [editStudentLastName, setEditStudentLastName] = useState("")
  const [editStudentBirthdate, setEditStudentBirthdate] = useState("")

  const handleOpenCreateDialog = () => {
    setCreateName("")
    setIsCreateDialogOpen(true)
  }

  const handleOpenEditDialog = (classObj: { id: number; name: string }) => {
    setEditingClass(classObj)
    setEditName(classObj.name)
    setIsEditDialogOpen(true)
  }

  const handleOpenPicker = (classId: number) => {
    setPickerClassId(classId)
    setIsPickerOpen(true)
  }

  const handleOpenEditStudentDialog = (student: {
    id: number
    displayName: string
    firstName?: string
    lastName?: string
    birthdate?: string | null
  }) => {
    setEditingStudent(student)
    // Prefill from firstName/lastName if available; otherwise split displayName on first space
    if (student.firstName) {
      setEditStudentFirstName(student.firstName)
      setEditStudentLastName(student.lastName ?? "")
    } else {
      const parts = student.displayName.split(" ")
      setEditStudentFirstName(parts[0] ?? "")
      setEditStudentLastName(parts.slice(1).join(" ") ?? "")
    }
    setEditStudentBirthdate(student.birthdate ?? "")
    setIsEditStudentDialogOpen(true)
  }

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col pb-20">
      {classes.length > 0 && (
        <div className="mb-4 flex shrink-0">
          <label htmlFor="classes-search" className="sr-only">
            {t("manager:classes.search")}
          </label>
          <Input
            id="classes-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:classes.searchPlaceholder")}
            className="min-h-11 w-full rounded-xl"
          />
        </div>
      )}

      <ClassList
        classes={classes}
        onCreateClass={handleOpenCreateDialog}
        onEditClass={handleOpenEditDialog}
        onDeleteClass={(classObj) => setPendingDeleteClass(classObj)}
        onAddStudent={handleOpenPicker}
        onEditStudent={handleOpenEditStudentDialog}
        onDeleteStudent={(student) =>
          setPendingDeleteStudent({
            studentId: student.id,
            studentName: student.displayName,
          })
        }
        onFetchStudents={handleFetchStudents}
        onAssignLabels={handleAssignLabels}
      />

      {/* Create Class Dialog */}
      <DialogPanel
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        titleId="create-class-dialog-title"
        title={t("manager:classes.createTitle")}
      >
        <p className="mt-2 text-sm text-[var(--ink-subtle)]">
          {t("manager:classes.createDescription")}
        </p>
        <Input
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          placeholder={t("manager:classes.classNamePlaceholder")}
          className="mt-4 min-h-11 w-full rounded-[var(--radius-theme)]"
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsCreateDialogOpen(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              handleCreateClass(createName)
              setIsCreateDialogOpen(false)
            }}
          >
            {t("common:create")}
          </Button>
        </div>
      </DialogPanel>

      {/* Edit Class Dialog */}
      <DialogPanel
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        titleId="edit-class-dialog-title"
        title={t("manager:classes.editTitle")}
      >
        <p className="mt-2 text-sm text-[var(--ink-subtle)]">
          {t("manager:classes.editDescription")}
        </p>
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder={t("manager:classes.classNamePlaceholder")}
          className="mt-4 min-h-11 w-full rounded-[var(--radius-theme)]"
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (editingClass) {
                handleUpdateClass(editingClass.id, editName)
                setIsEditDialogOpen(false)
              }
            }}
          >
            {t("common:save")}
          </Button>
        </div>
      </DialogPanel>

      {/* Delete Class Dialog */}
      <AlertDialog
        open={pendingDeleteClass !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteClass(null)
          }
        }}
        title={t("manager:classes.deleteTitle")}
        description={t("manager:classes.deleteConfirm", {
          name: pendingDeleteClass?.name ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteClass}
      />

      {/* Add Student Picker — replaces the old free-text dialog. Creating new
          students now happens only in the Schülerverwaltung tab. */}
      <StudentPicker
        open={isPickerOpen}
        classId={pickerClassId}
        className={pickerClassName}
        allStudents={allStudents}
        onClose={() => setIsPickerOpen(false)}
        onSelect={handleMoveStudent}
      />

      {/* Edit Student Dialog */}
      <DialogPanel
        open={isEditStudentDialogOpen}
        onOpenChange={setIsEditStudentDialogOpen}
        titleId="edit-student-dialog-title"
        title={t("manager:classes.editStudentTitle")}
      >
        <p className="mt-2 text-sm text-[var(--ink-subtle)]">
          {t("manager:classes.editStudentDescription")}
        </p>
        <Input
          value={editStudentFirstName}
          onChange={(e) => setEditStudentFirstName(e.target.value)}
          placeholder={t("manager:schueler.firstNamePlaceholder")}
          className="mt-4 min-h-11 w-full rounded-[var(--radius-theme)]"
          autoFocus
        />
        <Input
          value={editStudentLastName}
          onChange={(e) => setEditStudentLastName(e.target.value)}
          placeholder={t("manager:schueler.lastNamePlaceholder")}
          className="mt-3 min-h-11 w-full rounded-[var(--radius-theme)]"
        />
        <div>
          <label
            htmlFor="klassen-edit-student-birthdate"
            className="mt-4 block text-sm font-medium text-[var(--ink-muted)]"
          >
            {t("manager:schueler.birthdateLabel")}
          </label>
          <input
            id="klassen-edit-student-birthdate"
            type="date"
            value={editStudentBirthdate}
            max={todayIso}
            onChange={(e) => setEditStudentBirthdate(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-[var(--radius-theme)] border-2 border-[var(--border-hairline)] p-2 text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsEditStudentDialogOpen(false)}>
            {t("common:cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (editingStudent) {
                handleUpdateStudent(
                  editingStudent.id,
                  editStudentFirstName,
                  editStudentLastName || undefined,
                  editStudentBirthdate || undefined,
                )
                setIsEditStudentDialogOpen(false)
              }
            }}
          >
            {t("common:save")}
          </Button>
        </div>
      </DialogPanel>

      {/* Delete Student Dialog */}
      <AlertDialog
        open={pendingDeleteStudent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteStudent(null)
          }
        }}
        title={t("manager:classes.deleteStudentTitle")}
        description={t("manager:classes.deleteStudentConfirm", {
          name: pendingDeleteStudent?.studentName ?? "",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleDeleteStudent}
      />
    </div>

    <ActionFooter>
      <Button
        data-testid="klassen-create-btn"
        variant="primary"
        size="lg"
        className="w-full rounded-[var(--radius-theme)] sm:w-auto"
        onClick={handleOpenCreateDialog}
      >
        <Plus className="size-5" aria-hidden strokeWidth={2.5} />
        <span>{t("manager:classes.create")}</span>
      </Button>
    </ActionFooter>
    </>
  )
}

export default ConfigKlassen
