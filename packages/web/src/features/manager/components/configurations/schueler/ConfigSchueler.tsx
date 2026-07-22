import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Checkbox from "@razzoozle/web/components/Checkbox"
import Input from "@razzoozle/web/components/Input"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import { Plus } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import CreateStudentDialog from "./CreateStudentDialog"
import PinDialog from "./PinDialog"
import StudentList from "./StudentList"
import {
  useSchuelerManager,
  type SchuelerStudent,
} from "./useSchuelerManager"

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
  } = useSchuelerManager({ onBulkSettled: () => bulkSettleRef.current() })

  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

  // Selection is scoped to the currently filtered list (search + status pills).
  const studentIds = useMemo(
    () => filteredStudents.map((s) => s.id),
    [filteredStudents],
  )
  const selection = useEntitySelection(studentIds)

  // Bulk operation state (SDD §3.2 / §9.3). Add/remove-class = Runde D.
  const [pendingBulkAction, setPendingBulkAction] = useState<
    "activate" | "deactivate" | "delete" | null
  >(null)
  const [bulkOperationLoading, setBulkOperationLoading] = useState(false)

  // Pattern E5: settled bulk op → reset loading, clear selection, close dialog.
  bulkSettleRef.current = () => {
    setBulkOperationLoading(false)
    selection.clear()
    setPendingBulkAction(null)
  }

  const selectedStudents = useMemo(
    () => filteredStudents.filter((s) => selection.selected.has(s.id)),
    [filteredStudents, selection.selected],
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

          {/* SDD §3.2 — status filter pills (All / Active / Inactive) */}
          <div className="flex shrink-0 flex-wrap gap-2">
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
          </div>

          {/* SDD §9.2 — header select-all for the currently filtered list */}
          {filteredStudents.length > 0 && (
            <div className="mb-0 flex shrink-0 items-center gap-3">
              <Checkbox
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAll}
                aria-label={t("manager:schueler.selectAll")}
                data-testid="schueler-select-all"
              />
              <span className="text-sm text-[var(--ink-subtle)]">
                {t("manager:bulk.selectFiltered", {
                  count: selection.selected.size,
                  total: filteredStudents.length,
                })}
              </span>
            </div>
          )}

          {/* SDD §3.2 — bulk toolbar after filter pills + header checkbox */}
          {selection.selectionActive && (
            <div className="mb-0 w-full shrink-0">
              <BulkActionToolbar
                count={selection.selected.size}
                label={t("manager:bulk.selected", {
                  count: selection.selected.size,
                })}
                onClear={selection.clear}
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
                {/* Add/Remove class bulk = Runde D */}
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
            </div>
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
