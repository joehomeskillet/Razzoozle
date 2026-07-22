import * as Select from "@radix-ui/react-select"
import Badge, { assignTriggerClass } from "@razzoozle/web/components/manager/Badge"
import Button from "@razzoozle/web/components/Button"
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
      {students.map((student) => {
        const composedName = getComposedName(student)
        const availableClasses = classes.filter(
          (c) => !student.classes.some((sc) => sc.id === c.id),
        )
        const pendingClassId = pendingClassIdByStudentId[student.id] ?? ""

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

        const footer = (student.classes.length > 0 || availableClasses.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {student.classes.map((c) => (
              <Badge
                key={c.id}
                className="gap-1.5 bg-[var(--surface-3)] text-[var(--ink-muted)]"
              >
                {c.name}
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() =>
                    onRemoveFromClass({
                      studentId: student.id,
                      displayName: composedName,
                      classId: c.id,
                      className: c.name,
                    })
                  }
                  aria-label={t("manager:schueler.removeFromClassTitle")}
                  className="relative rounded-full before:absolute before:-inset-3 before:content-['']"
                >
                  <X className="size-4" />
                </Button>
              </Badge>
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
                  <Plus className="size-3" />
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
          <div key={student.id} className="flex items-start gap-2">
            {onToggleSelect && (
              <div className="mt-3 flex-shrink-0">
                <Checkbox
                  checked={selectedIds?.has(student.id) ?? false}
                  onChange={() => {
                    onToggleSelect(student.id)
                  }}
                  aria-label={`Schüler auswählen: ${composedName}`}
                  data-testid={`student-select-${student.id}`}
                />
              </div>
            )}
            <ListRow
              leading={
                <Users className="size-5 shrink-0 text-[var(--ink-muted)]" />
              }
              title={title}
              meta={meta}
              footer={footer}
              actions={actions}
            />
          </div>
        )
      })}
    </div>
  )
}

export default StudentList
