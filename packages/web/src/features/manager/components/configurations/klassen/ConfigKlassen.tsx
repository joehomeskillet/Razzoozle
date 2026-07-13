import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Input from "@razzoozle/web/components/Input"
import Button from "@razzoozle/web/components/Button"
import { useTranslation } from "react-i18next"
import { useState } from "react"

import ClassList from "./ClassList"
import { useClassManager } from "./useClassManager"

const ConfigKlassen = () => {
  const {
    classes,
    search,
    setSearch,
    pendingDeleteClass,
    setPendingDeleteClass,
    pendingDeleteStudent,
    setPendingDeleteStudent,
    handleCreateClass,
    handleUpdateClass,
    handleDeleteClass,
    handleAddStudent,
    handleDeleteStudent,
    handleUpdateStudent,
  } = useClassManager()

  const { t } = useTranslation()

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<{
    id: number
    name: string
  } | null>(null)

  const [isAddStudentDialogOpen, setIsAddStudentDialogOpen] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)

  const [isEditStudentDialogOpen, setIsEditStudentDialogOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<{
    id: number
    displayName: string
  } | null>(null)

  // Form states
  const [createName, setCreateName] = useState("")
  const [editName, setEditName] = useState("")
  const [studentName, setStudentName] = useState("")
  const [editStudentName, setEditStudentName] = useState("")

  const handleOpenCreateDialog = () => {
    setCreateName("")
    setIsCreateDialogOpen(true)
  }

  const handleOpenEditDialog = (classObj: { id: number; name: string }) => {
    setEditingClass(classObj)
    setEditName(classObj.name)
    setIsEditDialogOpen(true)
  }

  const handleOpenAddStudentDialog = (classId: number) => {
    setSelectedClassId(classId)
    setStudentName("")
    setIsAddStudentDialogOpen(true)
  }

  const handleOpenEditStudentDialog = (student: {
    id: number
    displayName: string
  }) => {
    setEditingStudent(student)
    setEditStudentName(student.displayName)
    setIsEditStudentDialogOpen(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        onAddStudent={handleOpenAddStudentDialog}
        onEditStudent={handleOpenEditStudentDialog}
        onDeleteStudent={(student) =>
          setPendingDeleteStudent({
            studentId: student.id,
            studentName: student.displayName,
          })
        }
      />

      {/* Create Class Dialog */}
      <AlertDialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateName("")
          }
          setIsCreateDialogOpen(open)
        }}
        title={t("manager:classes.createTitle")}
        description={t("manager:classes.createDescription")}
      >
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ display: isCreateDialogOpen ? "flex" : "none" }}
        />
      </AlertDialog>

      {/* Custom Create Dialog */}
      {isCreateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsCreateDialogOpen(false)} />
          <div className="relative rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:classes.createTitle")}
            </h2>
            <p className="mt-2 text-gray-500">
              {t("manager:classes.createDescription")}
            </p>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t("manager:classes.classNamePlaceholder")}
              className="mt-4 min-h-11 w-full rounded-xl"
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
          </div>
        </div>
      )}

      {/* Edit Class Dialog */}
      {isEditDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsEditDialogOpen(false)} />
          <div className="relative rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:classes.editTitle")}
            </h2>
            <p className="mt-2 text-gray-500">
              {t("manager:classes.editDescription")}
            </p>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t("manager:classes.classNamePlaceholder")}
              className="mt-4 min-h-11 w-full rounded-xl"
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
          </div>
        </div>
      )}

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

      {/* Add Student Dialog */}
      {isAddStudentDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsAddStudentDialogOpen(false)} />
          <div className="relative rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:classes.addStudentTitle")}
            </h2>
            <p className="mt-2 text-gray-500">
              {t("manager:classes.addStudentDescription")}
            </p>
            <Input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder={t("manager:classes.studentNamePlaceholder")}
              className="mt-4 min-h-11 w-full rounded-xl"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsAddStudentDialogOpen(false)}>
                {t("common:cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (selectedClassId !== null) {
                    handleAddStudent(selectedClassId, studentName)
                    setIsAddStudentDialogOpen(false)
                  }
                }}
              >
                {t("common:add")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Dialog */}
      {isEditStudentDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setIsEditStudentDialogOpen(false)} />
          <div className="relative rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 w-full max-w-lg">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:classes.editStudentTitle")}
            </h2>
            <p className="mt-2 text-gray-500">
              {t("manager:classes.editStudentDescription")}
            </p>
            <Input
              value={editStudentName}
              onChange={(e) => setEditStudentName(e.target.value)}
              placeholder={t("manager:classes.studentNamePlaceholder")}
              className="mt-4 min-h-11 w-full rounded-xl"
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setIsEditStudentDialogOpen(false)}>
                {t("common:cancel")}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (editingStudent) {
                    handleUpdateStudent(editingStudent.id, editStudentName)
                    setIsEditStudentDialogOpen(false)
                  }
                }}
              >
                {t("common:save")}
              </Button>
            </div>
          </div>
        </div>
      )}

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
  )
}

export default ConfigKlassen
