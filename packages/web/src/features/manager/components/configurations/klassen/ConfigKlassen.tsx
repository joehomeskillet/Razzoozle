import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Input from "@razzoozle/web/components/Input"
import Button from "@razzoozle/web/components/Button"
import DateInput from "@razzoozle/web/components/DateInput"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { ActionFooter } from "@razzoozle/web/components/ui"
import Checkbox from "@razzoozle/web/components/Checkbox"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMemo, useRef, useState } from "react"
import { EVENTS } from "@razzoozle/common/constants"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"

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
  } = useClassManager({ onBulkSettled: () => bulkSettleRef.current() })

  const bulkSettleRef = useRef<() => void>(() => {})
  const { socket } = useSocket()
  const { t } = useTranslation()

  // Status filter
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Filter classes by status
  const filteredByStatus = useMemo(() => {
    return classes.filter(c => {
      if (statusFilter === 'all') return true
      if (statusFilter === 'active') return c.active !== false
      if (statusFilter === 'inactive') return c.active === false
      return true
    })
  }, [classes, statusFilter])

  // Selection state
  const classIds = useMemo(() => filteredByStatus.map(c => c.id), [filteredByStatus])
  const selection = useEntitySelection(classIds)

  // Bulk operation state
  const [pendingBulkAction, setPendingBulkAction] = useState<'activate' | 'deactivate' | 'delete' | null>(null)
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false)

  // Settled bulk op (BULK_ACTIVE_SET / BULK_DELETED) → reset loading, clear
  // selection, close the confirm dialog (#288). Assigned every render so the
  // ref-forwarded callback always sees the latest states.
  bulkSettleRef.current = () => {
    setBulkOperationLoading(false)
    selection.clear()
    setPendingBulkAction(null)
  }
  bulkSettleRef.current = () => { setBulkOperationLoading(false); selection.clear(); setPendingBulkAction(null) }

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

  const handleBulkActivate = () => {
    setBulkOperationLoading(true)
    socket.emit(EVENTS.CLASS.BULK_SET_ACTIVE, {
      ids: Array.from(selection.selected),
      active: true,
    })
    setPendingBulkAction(null)
  }

  const handleBulkDeactivate = () => {
    setBulkOperationLoading(true)
    socket.emit(EVENTS.CLASS.BULK_SET_ACTIVE, {
      ids: Array.from(selection.selected),
      active: false,
    })
    setPendingBulkAction(null)
  }

  const handleBulkDelete = () => {
    setBulkOperationLoading(true)
    socket.emit(EVENTS.CLASS.BULK_DELETE, {
      ids: Array.from(selection.selected),
    })
    setPendingBulkAction(null)
  }

  // Delete dialog content for bulk delete
  const selectedClassesForDelete = useMemo(() => {
    return filteredByStatus.filter(c => selection.selected.has(c.id))
  }, [filteredByStatus, selection.selected])

  const totalStudents = selectedClassesForDelete.reduce((sum, c) => sum + (c.studentCount ?? 0), 0)
  const totalLabels = selectedClassesForDelete.reduce((sum, c) => sum + (c.labelIds?.length ?? 0), 0)

  const deleteBulkDescription = (
    <div className="space-y-2 text-sm">
      <p>
        {selectedClassesForDelete.slice(0, 5).map(c => c.name).join(", ")}
        {selectedClassesForDelete.length > 5 && ` ${t("manager:bulk.andNMore", { count: selectedClassesForDelete.length - 5 })}`}
      </p>
      <p>{t("manager:classes.deleteImpactStudents", { count: totalStudents })}</p>
      <p>{t("manager:classes.deleteImpactLabels", { count: totalLabels })}</p>
      <p className="text-xs text-[var(--ink-subtle)]">{t("manager:classes.deleteKeepNote")}</p>
    </div>
  )

  const bulkDescriptionWithClassNames = (
    <div className="text-sm">
      {selectedClassesForDelete.slice(0, 5).map(c => c.name).join(", ")}
      {selectedClassesForDelete.length > 5 && ` ${t("manager:bulk.andNMore", { count: selectedClassesForDelete.length - 5 })}`}
    </div>
  )

  return (
    <>
    {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
    <div className="flex flex-1 flex-col pb-20">
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:tabs.klassen")}
          subtitle={t("manager:classes.intro")}
        />
      </div>

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
            className="min-h-11 w-full"
          />
        </div>
      )}

      {filteredByStatus.length > 0 && (
        <div className="mb-4 flex shrink-0 flex-wrap gap-2">
          <FilterPill
            active={statusFilter === 'all'}
            onClick={() => setStatusFilter('all')}
            data-testid="classes-status-filter-all"
          >
            {t("manager:classes.filterAll")}
          </FilterPill>
          <FilterPill
            active={statusFilter === 'active'}
            onClick={() => setStatusFilter('active')}
            data-testid="classes-status-filter-active"
          >
            {t("manager:classes.filterActive")}
          </FilterPill>
          <FilterPill
            active={statusFilter === 'inactive'}
            onClick={() => setStatusFilter('inactive')}
            data-testid="classes-status-filter-inactive"
          >
            {t("manager:classes.filterInactive")}
          </FilterPill>
        </div>
      )}

      {selection.selectionActive && (
        <BulkActionToolbar
          count={selection.selected.size}
          label={t("manager:bulk.selected", { count: selection.selected.size })}
          onClear={selection.clear}
          data-testid="classes-bulk-toolbar"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPendingBulkAction('activate')}
          >
            {t("manager:bulk.activate")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setPendingBulkAction('deactivate')}
          >
            {t("manager:bulk.deactivate")}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setPendingBulkAction('delete')}
          >
            {t("manager:bulk.deleteSelected")}
          </Button>
        </BulkActionToolbar>
      )}

      {filteredByStatus.length > 0 && (
        <SelectAllControl
          id="classes-select-all"
          data-testid="classes-select-all"
          allSelected={selection.allSelected}
          someSelected={selection.someSelected}
          selectedCount={selection.selected.size}
          totalCount={filteredByStatus.length}
          onToggleAll={selection.toggleAll}
        />
      )}

      <ClassList
        classes={filteredByStatus}
        selectedIds={selection.selected}
        onToggleSelect={selection.toggle}
        onToggleSingleAction={(classId, action) => {
          socket.emit(EVENTS.CLASS.SET_ACTIVE, {
            id: classId,
            active: action === 'activate'
          })
        }}
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

      {/* Bulk Activate Dialog */}
      <AlertDialog
        open={pendingBulkAction === 'activate'}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:classes.bulkConfirmTitleActivate", { count: selection.selected.size })}
        description={bulkDescriptionWithClassNames}
        confirmLabel={t("manager:bulk.activate")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkActivate}
      />

      {/* Bulk Deactivate Dialog */}
      <AlertDialog
        open={pendingBulkAction === 'deactivate'}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:classes.bulkConfirmTitleDeactivate", { count: selection.selected.size })}
        description={bulkDescriptionWithClassNames}
        confirmLabel={t("manager:bulk.deactivate")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkDeactivate}
      />

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={pendingBulkAction === 'delete'}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:classes.bulkConfirmTitleDelete", { count: selection.selected.size })}
        description={deleteBulkDescription}
        confirmLabel={t("common:delete")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkDelete}
      />

      {/* Add Student Picker */}
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
          <DateInput
            id="klassen-edit-student-birthdate"
            value={editStudentBirthdate}
            max={todayIso}
            onChange={(e) => setEditStudentBirthdate(e.target.value)}
            className="mt-1 text-lg font-semibold"
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
