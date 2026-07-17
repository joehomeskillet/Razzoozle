import * as Select from "@radix-ui/react-select"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import { assignTriggerClass } from "@razzoozle/web/components/manager/Badge"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import {
  popoverContentClass,
  popoverItemClass,
} from "@razzoozle/web/components/manager/popover"
import ListRow from "@razzoozle/web/features/manager/components/console/ListRow"
import {
  EmptyState,
} from "@razzoozle/web/features/manager/components/console"
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Plus,
  SquarePen,
  Trash2,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState, useEffect } from "react"
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
}

interface ClassListProps {
  classes: Class[]
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
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 600 : false
  )

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  const getPrimaryActions = (actions: ListRowAction[]): ListRowAction[] => {
    if (!isMobile) return actions
    return actions.filter((a) => a.key.startsWith("expand-") || a.key.startsWith("edit-"))
  }

  const getOverflowActions = (actions: ListRowAction[]): ListRowAction[] => {
    if (!isMobile) return []
    return actions.filter((a) => a.key.startsWith("delete-"))
  }

  if (classes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center">
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {classes.map((classObj) => {
          const classLabels = (classObj.labelIds ?? [])
            .map((id) => labels.find((l) => l.id === id))
            .filter((l) => l !== undefined)
          const availableLabels = labels.filter(
            (l) => !(classObj.labelIds ?? []).includes(l.id)
          )

          const handleToggleExpand = () => {
            const newId = expandedClassId === classObj.id ? null : classObj.id
            setExpandedClassId(newId)
            if (newId !== null && (!classObj.students || classObj.students.length === 0)) {
              onFetchStudents?.(classObj.id)
            }
          }

          const allActions: ListRowAction[] = [
            {
              key: `expand-${classObj.id}`,
              icon: expandedClassId === classObj.id ? ChevronDown : ChevronRight,
              label: expandedClassId === classObj.id
                ? t("common:collapse")
                : t("common:expand"),
              onClick: handleToggleExpand,
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
          const visibleActions = getPrimaryActions(allActions)
          const overflowActions = getOverflowActions(allActions)

          const footer = (classLabels.length > 0 || labels.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {classLabels.map((label) => (
                <LabelChip
                  key={label.id}
                  label={label}
                  onRemove={() => {
                    const updated = (classObj.labelIds ?? []).filter(
                      (id) => id !== label.id
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
                  >
                    <Plus className="size-3" />
                    <Select.Value placeholder={t("manager:labels.assignTitle")} />
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      position="popper"
                      sideOffset={4}
                      className={`z-50 min-w-40 overflow-hidden ${popoverContentClass}`}
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
          )

          return (
            <div key={classObj.id} className="space-y-1">
              <ListRow
                leading={<GraduationCap className="size-5 shrink-0 text-[var(--ink-muted)]" />}
                title={classObj.name}
                meta={
                  <div className="flex items-center gap-x-2">
                    {classObj.ownerName && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs font-medium text-[var(--ink-subtle)]">
                        {classObj.ownerName}
                      </span>
                    )}
                    <span className="text-xs text-[var(--ink-subtle)]">
                      {expandedClassId === classObj.id
                        ? (classObj.students ?? []).length
                        : classObj.studentCount ?? 0}{" "}
                      {t("manager:classes.studentCount")}
                    </span>
                  </div>
                }
                footer={footer}
                actions={visibleActions}
                overflow={
                  overflowActions.length > 0 && <OverflowMenu actions={overflowActions} />
                }
              />

              {/* Expanded Students List */}
              {expandedClassId === classObj.id && (
                <div className="space-y-1 ml-10">
                  {(classObj.students ?? []).length > 0 ? (
                    <>
                      {classObj.students?.map((student) => (
                        <div
                          key={student.id}
                          className="flex items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 border border-[var(--border-hairline)]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--ink)]">
                              {student.displayName}
                            </p>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              onEditStudent({
                                id: student.id,
                                displayName: student.displayName,
                                birthdate: student.birthdate,
                              })
                            }
                            title={t("manager:classes.editStudent")}
                            aria-label={t("manager:classes.editStudent")}
                          >
                            <SquarePen className="size-3.5" />
                          </Button>

                          <Button
                            type="button"
                            variant="danger"
                            size="icon"
                            onClick={() =>
                              onDeleteStudent({
                                id: student.id,
                                displayName: student.displayName,
                              })
                            }
                            title={t("manager:classes.deleteStudent")}
                            aria-label={t("manager:classes.deleteStudent")}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
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
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ClassList
