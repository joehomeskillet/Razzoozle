import * as Select from "@radix-ui/react-select"
import Badge, {
  assignTriggerClass,
  chipBase,
} from "@razzoozle/web/components/manager/Badge"
import Checkbox from "@razzoozle/web/components/Checkbox"
import {
  popoverContentClass,
  popoverItemClass,
} from "@razzoozle/web/components/manager/popover"
import ListRow from "@razzoozle/web/features/manager/components/console/ListRow"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console/ListRow"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import { KeyRound, Plus, Power, Trash2, Users, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { SchuelerStudent, StudentClassRef } from "./useSchuelerManager"

interface StudentListProps {
  students: SchuelerStudent[]
  classes: StudentClassRef[]
  /** Row multi-select set; when set with onToggleSelect, row checkboxes render. */
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onToggleActive: (studentId: number, active: boolean) => void
  onShowPin: (studentId: number) => void
  onDelete: (student: { id: number; displayName: string }) => void
  onRemoveFromClass: (data: {
    studentId: number
    displayName: string
    classId: number
    className: string
  }) => void
  onAddToClass: (studentId: number, classId: number) => void
}

// Format a "YYYY-MM-DD" birthdate to a locale-friendly display string. Reused
// duplicated-per-file convention already used elsewhere in this codebase
// (SoloLeaderboard, ConfigResults, MediaInfoDialog) rather than a shared util.
const formatBirthdate = (birthdate: string): string => {
  try {
    return new Date(`${birthdate}T00:00:00`).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return birthdate
  }
}

// Compose display name from firstName/lastName with displayName fallback (for older data).
const getComposedName = (student: SchuelerStudent): string => {
  if (student.firstName) {
    return student.lastName
      ? `${student.firstName} ${student.lastName}`
      : student.firstName
  }
  return student.displayName
}

const StudentList = ({
  students,
  classes,
  selectedIds,
  onToggleSelect,
  onToggleActive,
  onShowPin,
  onDelete,
  onRemoveFromClass,
  onAddToClass,
}: StudentListProps) => {
  const { t } = useTranslation()
  // Reset to "" right after firing so the trigger always shows the "+ Klasse"
  // placeholder again — this is an action menu, not a persistent selection.
  const [pendingClassIdByStudentId, setPendingClassIdByStudentId] = useState<
    Record<number, string>
  >({})

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        headline={t("manager:schueler.noResults")}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-0.5">
      {/* Header select-all + BulkActionToolbar live in ConfigSchueler (above). */}
      {students.map((student) => {
        const composedName = getComposedName(student)
        const availableClasses = classes.filter(
          (c) => !student.classes.some((sc) => sc.id === c.id),
        )
        const pendingClassId = pendingClassIdByStudentId[student.id] ?? ""
        const isSelected = selectedIds?.has(student.id) ?? false

        const actions: ListRowAction[] = [
          {
            key: "toggle-active",
            icon: Power,
            label:
              student.active !== false
                ? t("manager:bulk.deactivate")
                : t("manager:bulk.activate"),
            onClick: () => onToggleActive(student.id, student.active === false),
          },
          {
            key: "show-pin",
            icon: KeyRound,
            label: t("manager:schueler.showPin"),
            onClick: () => onShowPin(student.id),
          },
          {
            key: "delete",
            icon: Trash2,
            label: t("manager:schueler.deleteTitle"),
            onClick: () =>
              onDelete({ id: student.id, displayName: composedName }),
            destructive: true,
          },
        ]

        const title = composedName

        const meta =
          student.birthdate || student.active === false ? (
            <div className="flex items-center gap-2">
              {student.birthdate && (
                <span>{formatBirthdate(student.birthdate)}</span>
              )}
              {student.active === false && (
                <Badge tone="warning">
                  {t("manager:schueler.statusInactive")}
                </Badge>
              )}
            </div>
          ) : undefined

        // Compact class chips (LabelChip pattern) + assign trigger.
        // SDD §9.1 / chipBase: text-xs px-2.5 py-0.5 rounded-full, flex-wrap.
        const footer = (student.classes.length > 0 || availableClasses.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {student.classes.map((c) => (
              <span
                key={c.id}
                className={`${chipBase} gap-1.5 bg-[var(--surface-4)] text-[var(--ink-muted)]`}
              >
                {c.name}
                <button
                  type="button"
                  onClick={() =>
                    onRemoveFromClass({
                      studentId: student.id,
                      displayName: composedName,
                      classId: c.id,
                      className: c.name,
                    })
                  }
                  aria-label={t("common:removeLabelNamed", { name: c.name })}
                  className="ml-0.5 relative inline-flex items-center justify-center text-current hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)] rounded before:absolute before:-inset-3 before:content-['']"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            ))}

            {availableClasses.length > 0 && (
              <Select.Root
                value={pendingClassId}
                onValueChange={(val) => {
                  onAddToClass(student.id, Number(val))
                  setPendingClassIdByStudentId((prev) => ({
                    ...prev,
                    [student.id]: "",
                  }))
                }}
              >
                <Select.Trigger
                  aria-label={t("manager:schueler.addToClass")}
                  className={assignTriggerClass}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Plus className="size-3" aria-hidden />
                  <Select.Value placeholder={t("manager:schueler.addToClass")} />
                </Select.Trigger>
                <Select.Portal>
                  <Select.Content
                    position="popper"
                    sideOffset={4}
                    className={`z-50 min-w-32 overflow-hidden ${popoverContentClass}`}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <Select.Viewport className="p-1">
                      {availableClasses.map((c) => (
                        <Select.Item
                          key={c.id}
                          value={String(c.id)}
                          className={popoverItemClass}
                        >
                          <Select.ItemText>{c.name}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Viewport>
                  </Select.Content>
                </Select.Portal>
              </Select.Root>
            )}
          </div>
        )

        return (
          <ListRow
            key={student.id}
            className="min-w-0"
            selected={isSelected}
            selection={onToggleSelect ? (
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg">
                <Checkbox
                  checked={isSelected}
                  onChange={() => onToggleSelect(student.id)}
                  aria-label={`Schüler auswählen: ${composedName}`}
                  data-testid={`student-select-${student.id}`}
                />
              </label>
            ) : undefined}
            leading={
              <Users className="size-5 shrink-0 text-[var(--ink-muted)]" />
            }
            title={title}
            meta={meta}
            footer={footer}
            actions={actions}
          />
        )
      })}
    </div>
  )
}

export default StudentList
