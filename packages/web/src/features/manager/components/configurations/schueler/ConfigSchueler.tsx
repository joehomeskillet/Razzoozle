import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Checkbox from "@razzoozle/web/components/Checkbox"
import Input from "@razzoozle/web/components/Input"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import { Plus } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import CreateStudentDialog from "./CreateStudentDialog"
import PinDialog from "./PinDialog"
import PrintCredentialsTrigger from "./PrintCredentialsTrigger"
import StudentList from "./StudentList"
import {
  useSchuelerManager,
  type SchuelerStudent,
} from "./useSchuelerManager"

/** Per-class membership of the current selection (SDD §9.3). */
type ClassMembership = "all" | "partial" | "none"

// Compose display name from firstName/lastName with displayName fallback.
const getComposedName = (student: SchuelerStudent): string => {
  if (student.firstName) {
    return student.lastName
      ? `${student.firstName} ${student.lastName}`
      : student.firstName
  }
  return student.displayName
}

const ConfigSchueler = () => {
  const bulkSettleRef = useRef<() => void>(() => {})
  const {
    filteredStudents,
    hasStudents,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
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
    handleBulkSetStudentActive,
    handleBulkDeleteStudents,
    handleBulkAssignStudents,
    handleBulkRemoveStudents,
  } = useSchuelerManager({ onBulkSettled: () => bulkSettleRef.current() })

  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Selection is scoped to the currently filtered list (search + status pills).
  const studentIds = useMemo(
    () => filteredStudents.map((s) => s.id),
    [filteredStudents],
  )
  const selection = useEntitySelection(studentIds)

  // Bulk operation state (SDD §3.2 / §9.3).
  const [pendingBulkAction, setPendingBulkAction] = useState<
    "activate" | "deactivate" | "delete" | null
  >(null)
  // True while a bulk socket op is in flight (set on confirm, cleared on settle).
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false)

  // WP-F2d: class assignment dialog (active classes only, tri-state membership).
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  // User checkbox overrides: true/false after toggle; seeded from membership on open.
  const [classChecks, setClassChecks] = useState<Record<number, boolean>>({})
  // Indeterminate only for partial membership until the user toggles that class.
  const [classIndeterminate, setClassIndeterminate] = useState<
    Record<number, boolean>
  >({})

  // Pattern E5: settled bulk op → reset loading, clear selection, close dialogs.
  bulkSettleRef.current = () => {
    setBulkOperationLoading(false)
    selection.clear()
    setPendingBulkAction(null)
    setShowAssignDialog(false)
  }

  const selectedStudents = useMemo(
    () => filteredStudents.filter((s) => selection.selected.has(s.id)),
    [filteredStudents, selection.selected],
  )

  // SDD §9.3: bulk class dialog shows only active classes.
  const filteredActiveClasses = useMemo(
    () => classes.filter((c) => c.active !== false),
    [classes],
  )

  // Membership of selected students per active class: all | partial | none.
  const membershipState = useMemo(() => {
    const map: Record<number, ClassMembership> = {}
    const selected = selectedStudents
    for (const cls of filteredActiveClasses) {
      if (selected.length === 0) {
        map[cls.id] = "none"
        continue
      }
      let inCount = 0
      for (const s of selected) {
        if (s.classes.some((c) => c.id === cls.id)) {
          inCount += 1
        }
      }
      if (inCount === 0) {
        map[cls.id] = "none"
      } else if (inCount === selected.length) {
        map[cls.id] = "all"
      } else {
        map[cls.id] = "partial"
      }
    }
    return map
  }, [filteredActiveClasses, selectedStudents])

  const openAssignDialog = () => {
    const checks: Record<number, boolean> = {}
    const indet: Record<number, boolean> = {}
    for (const cls of filteredActiveClasses) {
      const state = membershipState[cls.id] ?? "none"
      checks[cls.id] = state !== "none"
      indet[cls.id] = state === "partial"
    }
    setClassChecks(checks)
    setClassIndeterminate(indet)
    setShowAssignDialog(true)
  }

  const toggleClass = (classId: number) => {
    setClassChecks((prev) => ({ ...prev, [classId]: !prev[classId] }))
    setClassIndeterminate((prev) => ({ ...prev, [classId]: false }))
  }

  const targetedClassIds = useMemo(
    () =>
      filteredActiveClasses
        .filter((cls) => classChecks[cls.id])
        .map((cls) => cls.id),
    [filteredActiveClasses, classChecks],
  )

  const namePreview = useMemo(() => {
    const names = selectedStudents.slice(0, 5).map(getComposedName)
    const extra = selectedStudents.length - 5
    if (extra > 0) {
      return `${names.join(", ")} ${t("manager:bulk.andNMore", { count: extra })}`
    }
    return names.join(", ")
  }, [selectedStudents, t])

  const bulkNameDescription = (
    <div className="space-y-2 text-sm">
      <p>{namePreview}</p>
    </div>
  )

  const deleteBulkDescription = (
    <div className="space-y-2 text-sm">
      <p>{namePreview}</p>
      <p className="text-xs text-[var(--ink-subtle)]">
        {t("manager:schueler.deleteImpactNote")}
      </p>
    </div>
  )

  const handleBulkActivate = () => {
    setBulkOperationLoading(true)
    handleBulkSetStudentActive(Array.from(selection.selected), true)
    setPendingBulkAction(null)
  }

  const handleBulkDeactivate = () => {
    setBulkOperationLoading(true)
    handleBulkSetStudentActive(Array.from(selection.selected), false)
    setPendingBulkAction(null)
  }

  const handleBulkDelete = () => {
    setBulkOperationLoading(true)
    handleBulkDeleteStudents(Array.from(selection.selected))
    setPendingBulkAction(null)
  }

  const handleBulkAssign = () => {
    if (targetedClassIds.length === 0 || selection.selected.size === 0) return
    setBulkOperationLoading(true)
    handleBulkAssignStudents(
      Array.from(selection.selected),
      targetedClassIds,
    )
  }

  const handleBulkRemove = () => {
    if (targetedClassIds.length === 0 || selection.selected.size === 0) return
    setBulkOperationLoading(true)
    handleBulkRemoveStudents(
      Array.from(selection.selected),
      targetedClassIds,
    )
  }

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

          {/* SDD §3.2 — status filter pills (All / Active / Inactive) + print entry (SDD §9.5) */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <FilterPill
              active={statusFilter === null}
              onClick={() => setStatusFilter(null)}
            >
              {t("manager:schueler.filterAll")}
            </FilterPill>
            <FilterPill
              active={statusFilter === "active"}
              onClick={() => setStatusFilter("active")}
            >
              {t("manager:schueler.filterActive")}
            </FilterPill>
            <FilterPill
              active={statusFilter === "inactive"}
              onClick={() => setStatusFilter("inactive")}
            >
              {t("manager:schueler.filterInactive")}
            </FilterPill>
            <div className="ml-auto">
              <PrintCredentialsTrigger />
            </div>
          </div>

          {/* SDD §3.2 / §9.3 — bulk toolbar after filter pills, before SelectAllControl + StudentList */}
          {selection.selected.size > 0 && (
            <BulkActionToolbar
              count={selection.selected.size}
              label={t("manager:bulk.selected", {
                count: selection.selected.size,
              })}
              onClear={() => {
                selection.clear()
                setPendingBulkAction(null)
                setShowAssignDialog(false)
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPendingBulkAction("activate")}
                disabled={bulkOperationLoading}
              >
                {t("manager:bulk.activate")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPendingBulkAction("deactivate")}
                disabled={bulkOperationLoading}
              >
                {t("manager:bulk.deactivate")}
              </Button>
              {/* WP-F2d: bulk class assignment dialog (add + remove) */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openAssignDialog}
                disabled={bulkOperationLoading}
              >
                {t("manager:schueler.addToClass")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={openAssignDialog}
                disabled={bulkOperationLoading}
              >
                {t("manager:schueler.removeFromClassTitle")}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => setPendingBulkAction("delete")}
                disabled={bulkOperationLoading}
              >
                {t("manager:bulk.deleteSelected")}
              </Button>
            </BulkActionToolbar>
          )}

          {/* SDD §9.2 — SelectAllControl for the currently filtered list */}
          {filteredStudents.length > 0 && (
            <SelectAllControl
              id="schueler-select-all"
              data-testid="schueler-select-all"
              allSelected={selection.allSelected}
              someSelected={selection.someSelected}
              selectedCount={selection.selected.size}
              totalCount={filteredStudents.length}
              onToggleAll={selection.toggleAll}
            />
          )}

          <StudentList
            students={filteredStudents}
            classes={classes}
            selectedIds={selection.selected}
            onToggleSelect={selection.toggle}
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

      {/* Bulk Activate Dialog (SDD §9.3) */}
      <AlertDialog
        open={pendingBulkAction === "activate"}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:schueler.bulkConfirmTitleActivate", {
          count: selection.selected.size,
        })}
        description={bulkNameDescription}
        confirmLabel={t("manager:bulk.activate")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkActivate}
      />

      {/* Bulk Deactivate Dialog */}
      <AlertDialog
        open={pendingBulkAction === "deactivate"}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:schueler.bulkConfirmTitleDeactivate", {
          count: selection.selected.size,
        })}
        description={bulkNameDescription}
        confirmLabel={t("manager:bulk.deactivate")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkDeactivate}
      />

      {/* Bulk Delete Dialog */}
      <AlertDialog
        open={pendingBulkAction === "delete"}
        onOpenChange={(open) => {
          if (!open) setPendingBulkAction(null)
        }}
        title={t("manager:schueler.bulkConfirmTitleDelete", {
          count: selection.selected.size,
        })}
        description={deleteBulkDescription}
        confirmLabel={t("common:delete")}
        confirmDisabled={bulkOperationLoading}
        onConfirm={handleBulkDelete}
      />

      {/* WP-F2d: Class assignment dialog — active classes only, tri-state membership */}
      <DialogPanel
        open={showAssignDialog}
        onOpenChange={(open) => {
          if (!open) setShowAssignDialog(false)
        }}
        titleId="schueler-assign-dialog-title"
        title={t("manager:schueler.assignDialogTitle")}
        maxWidth="md"
      >
        <p className="mt-2 text-sm text-[var(--ink-subtle)]">
          {t("manager:schueler.assignOnlyActive")}
        </p>

        <div className="mt-4 max-h-60 space-y-1 overflow-y-auto rounded-[var(--radius-theme)] border border-[var(--border-hairline)] p-2">
          {filteredActiveClasses.length === 0 ? (
            <p className="px-2 py-2 text-sm text-[var(--ink-subtle)]">
              {t("manager:schueler.noClasses")}
            </p>
          ) : (
            filteredActiveClasses.map((cls) => (
              <label
                key={cls.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
              >
                <Checkbox
                  checked={Boolean(classChecks[cls.id])}
                  indeterminate={Boolean(classIndeterminate[cls.id])}
                  onChange={() => toggleClass(cls.id)}
                  disabled={bulkOperationLoading}
                />
                {cls.name}
              </label>
            ))
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowAssignDialog(false)}
            disabled={bulkOperationLoading}
          >
            {t("common:cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleBulkAssign}
            disabled={
              bulkOperationLoading ||
              targetedClassIds.length === 0 ||
              selection.selected.size === 0
            }
          >
            {t("common:add")}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleBulkRemove}
            disabled={
              bulkOperationLoading ||
              targetedClassIds.length === 0 ||
              selection.selected.size === 0
            }
          >
            {t("manager:schueler.removeFromClassTitle")}
          </Button>
        </div>
      </DialogPanel>
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
