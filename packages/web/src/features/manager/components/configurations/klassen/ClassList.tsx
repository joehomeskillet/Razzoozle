import * as Select from "@radix-ui/react-select"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import { assignTriggerClass } from "@razzoozle/web/components/manager/Badge"
import {
  popoverContentClass,
  popoverItemClass,
} from "@razzoozle/web/components/manager/popover"
import ListRow from "@razzoozle/web/features/manager/components/console/ListRow"
import {
  EmptyState,
} from "@razzoozle/web/features/manager/components/console"
import Checkbox from "@razzoozle/web/components/Checkbox"
import Badge from "@razzoozle/web/components/manager/Badge"
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Plus,
  Power,
  SquarePen,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { useLabelManager } from "../labels/useLabelManager"
import Button from "@razzoozle/web/components/Button"

import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"

interface Student {
  id: number
  displayName: string
  createdAt?: string
  birthdate?: string | null
}

interface Class {
  id: number
  name: string
  createdAt: string
  studentCount?: number
  students?: Student[]
  ownerName?: string
  labelIds?: number[]
  active?: boolean
}

interface ClassListProps {
  classes: Class[]
  selectedIds?: Set<number>
  onToggleSelect?: (id: number) => void
  onToggleSingleAction?: (id: number, action: 'activate' | 'deactivate') => void
  onCreateClass: () => void
  onEditClass: (classObj: { id: number; name: string }) => void
  onDeleteClass: (classObj: { id: number; name: string }) => void
  onAddStudent: (classId: number) => void
  onEditStudent: (student: {
    id: number
    displayName: string
    birthdate?: string | null
  }) => void
  onDeleteStudent: (student: { id: number; displayName: string }) => void
  onFetchStudents?: (classId: number) => void
  onAssignLabels?: (classId: number, labelIds: number[]) => void
}

const ClassList = ({
  classes,
  selectedIds,
  onToggleSelect,
  onToggleSingleAction,
  onCreateClass,
  onEditClass,
  onDeleteClass,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onFetchStudents,
  onAssignLabels,
}: ClassListProps) => {
  const { t } = useTranslation()
  const { labels } = useLabelManager()
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null)
  const [pendingLabelPickerId, setPendingLabelPickerId] = useState<number | null>(null)

  if (classes.length === 0) {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <EmptyState
          icon={GraduationCap}
          headline={t("manager:classes.none")}
          hint={t("manager:classes.pleaseCreate")}
          action={{
            label: t("manager:classes.create"),
            onClick: onCreateClass,
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col space-y-3 p-0.5">
      {classes.map((classObj) => {
        const classLabels = (classObj.labelIds ?? [])
          .map((id) => labels.find((l) => l.id === id))
          .filter((l) => l !== undefined)
        const availableLabels = labels.filter(
          (l) => !(classObj.labelIds ?? []).includes(l.id),
        )

        const handleToggleExpand = () => {
          const newId = expandedClassId === classObj.id ? null : classObj.id
          setExpandedClassId(newId)
          if (
            newId !== null &&
            (!classObj.students || classObj.students.length === 0)
          ) {
            onFetchStudents?.(classObj.id)
          }
        }

        const actions: ListRowAction[] = [
          {
            key: `expand-${classObj.id}`,
            icon:
              expandedClassId === classObj.id ? ChevronDown : ChevronRight,
            label:
              expandedClassId === classObj.id
                ? t("common:collapse")
                : t("common:expand"),
            onClick: handleToggleExpand,
            "aria-expanded": expandedClassId === classObj.id,
          },
          {
            key: `toggle-${classObj.id}`,
            icon: Power,
            label: classObj.active !== false ? t("manager:classes.deactivate") : t("manager:classes.activate"),
            onClick: (e) => {
              e.stopPropagation()
              onToggleSingleAction?.(classObj.id, classObj.active !== false ? 'deactivate' : 'activate')
            },
          },
          {
            key: `edit-${classObj.id}`,
            icon: SquarePen,
            label: t("manager:classes.editClass"),
            onClick: () =>
              onEditClass({ id: classObj.id, name: classObj.name }),
          },
          {
            key: `delete-${classObj.id}`,
            icon: Trash2,
            label: t("manager:classes.deleteClass"),
            onClick: () =>
              onDeleteClass({ id: classObj.id, name: classObj.name }),
            destructive: true,
          },
        ]

        const studentCount =
          expandedClassId === classObj.id
            ? (classObj.students ?? []).length
            : (classObj.studentCount ?? 0)

        const footer =
          classLabels.length > 0 || labels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {classLabels.map((label) => (
                <LabelChip
                  key={label.id}
                  label={label}
                  onRemove={() => {
                    const updated = (classObj.labelIds ?? []).filter(
                      (id) => id !== label.id,
                    )
                    onAssignLabels?.(classObj.id, updated)
                  }}
                />
              ))}

              {labels.length > 0 && (
                <Select.Root
                  value={pendingLabelPickerId === classObj.id ? "pending" : ""}
                  onValueChange={(val) => {
                    const labelId = Number(val)
                    const updated = [...(classObj.labelIds ?? []), labelId]
                    onAssignLabels?.(classObj.id, updated)
                    setPendingLabelPickerId(null)
                  }}
                >
                  <Select.Trigger
                    aria-label={t("manager:labels.assignTitle")}
                    className={assignTriggerClass}
                    onClick={() => setPendingLabelPickerId(classObj.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <Plus className="size-3" />
                    <Select.Value
                      placeholder={t("manager:labels.assignTitle")}
                    />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      position="popper"
                      sideOffset={4}
                      className={`z-50 min-w-40 overflow-hidden ${popoverContentClass}`}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <Select.Viewport className="p-1">
                        {availableLabels.length > 0 ? (
                          availableLabels.map((label) => (
                            <Select.Item
                              key={label.id}
                              value={String(label.id)}
                              className={popoverItemClass}
                            >
                              <Select.ItemText>{label.name}</Select.ItemText>
                            </Select.Item>
                          ))
                        ) : (
                          <div className="px-3 py-1.5 text-sm text-[var(--ink-subtle)]">
                            {t("manager:labels.noLabels")}
                          </div>
                        )}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              )}
            </div>
          ) : undefined

        return (
          <div key={classObj.id} className="flex items-start gap-2">
            {onToggleSelect && (
              <div className="mt-3 flex-shrink-0">
                <Checkbox
                  checked={selectedIds?.has(classObj.id) ?? false}
                  onChange={() => {
                    onToggleSelect(classObj.id)
                  }}
                  aria-label={`Klasse auswählen: ${classObj.name}`}
                  data-testid={`class-select-${classObj.id}`}
                />
              </div>
            )}
            <ListRow
              title={classObj.name}
              meta={
                <div className="flex items-center gap-2">
                  <span>{`${studentCount} ${t("manager:classes.studentCount")}`}</span>
                  {classObj.active === false && (
                    <Badge tone="warning">{t("manager:classes.statusInactive", { defaultValue: "Inaktiv" })}</Badge>
                  )}
                </div>
              }
              footer={footer}
              actions={actions}
              expanded={expandedClassId === classObj.id}
              details={
                expandedClassId === classObj.id ? (
                  <div className="space-y-2">
                    {(classObj.students ?? []).length > 0 ? (
                      <>
                        {classObj.students?.map((student) => (
                          <ListRow
                            key={student.id}
                            density="compact"
                            title={student.displayName}
                            actions={[
                              {
                                key: "edit",
                                icon: SquarePen,
                                label: t("manager:classes.editStudent"),
                                onClick: () =>
                                  onEditStudent({
                                    id: student.id,
                                    displayName: student.displayName,
                                    birthdate: student.birthdate,
                                  }),
                              },
                              {
                                key: "delete",
                                icon: Trash2,
                                label: t("manager:classes.deleteStudent"),
                                destructive: true,
                                onClick: () =>
                                  onDeleteStudent({
                                    id: student.id,
                                    displayName: student.displayName,
                                  }),
                              },
                            ]}
                          />
                        ))}
                      </>
                    ) : (
                      <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-center">
                        <p className="text-xs text-[var(--ink-subtle)]">
                          {t("manager:classes.noStudents")}
                        </p>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="primary"
                      size="md"
                      onClick={() => onAddStudent(classObj.id)}
                      className="w-full"
                    >
                      <Plus className="size-4" />
                      {t("manager:classes.addStudent")}
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        )
      })}
    </div>
  )
}

export default ClassList
