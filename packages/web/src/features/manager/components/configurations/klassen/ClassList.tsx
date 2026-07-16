import * as Select from "@radix-ui/react-select"
import Button from "@razzoozle/web/components/Button"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
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
import { useState } from "react"
import { useLabelManager } from "../labels/useLabelManager"

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
      <div className="mb-4 flex shrink-0">
        <Button
          variant="primary"
          className="flex-1 rounded-xl"
          onClick={onCreateClass}
        >
          {t("manager:classes.create")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {classes.map((classObj) => {
          const classLabels = (classObj.labelIds ?? [])
            .map((id) => labels.find((l) => l.id === id))
            .filter((l) => l !== undefined)
          const availableLabels = labels.filter(
            (l) => !(classObj.labelIds ?? []).includes(l.id)
          )

          return (
            <div key={classObj.id} className="space-y-1">
              {/* Class Row */}
              <div className="flex flex-col rounded-xl bg-[var(--surface)] px-4 py-3 border border-[var(--border-hairline)] gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newId = expandedClassId === classObj.id ? null : classObj.id
                      setExpandedClassId(newId)
                      if (newId !== null && (!classObj.students || classObj.students.length === 0)) {
                        onFetchStudents?.(classObj.id)
                      }
                    }}
                    className="focus-visible:outline-[var(--color-primary)] flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-muted)] hover:bg-[var(--surface-3)] focus-visible:outline-2 focus-visible:outline-offset-2"
                    aria-label={
                      expandedClassId === classObj.id
                        ? t("common:collapse")
                        : t("common:expand")
                    }
                  >
                    {expandedClassId === classObj.id ? (
                      <ChevronDown className="size-5" />
                    ) : (
                      <ChevronRight className="size-5" />
                    )}
                  </button>

                  <GraduationCap className="size-5 shrink-0 text-[var(--ink-muted)]" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {classObj.name}
                      </p>
                      {classObj.ownerName && (
                        <span className="shrink-0 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs font-medium text-[var(--ink-subtle)]">
                          {classObj.ownerName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--ink-subtle)]">
                      {expandedClassId === classObj.id
                        ? (classObj.students ?? []).length
                        : classObj.studentCount ?? 0}{" "}
                      {t("manager:classes.studentCount")}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onEditClass({ id: classObj.id, name: classObj.name })
                    }
                    className="focus-visible:outline-[var(--color-primary)] flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2"
                    title={t("manager:classes.editClass")}
                    aria-label={t("manager:classes.editClass")}
                  >
                    <SquarePen className="size-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onDeleteClass({ id: classObj.id, name: classObj.name })
                    }
                    className="focus-visible:outline-[var(--color-primary)] flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)] focus-visible:outline-2 focus-visible:outline-offset-2"
                    title={t("manager:classes.deleteClass")}
                    aria-label={t("manager:classes.deleteClass")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Labels row */}
                <div className="flex flex-wrap items-center gap-1.5 pl-10">
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
                        className="focus-visible:outline-[var(--color-primary)] flex min-h-11 cursor-pointer items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-xs font-medium text-[var(--ink-medium)] hover:bg-[var(--surface-2)]"
                        onClick={() => setPendingLabelPickerId(classObj.id)}
                      >
                        <Plus className="size-3" />
                        <Select.Value placeholder={t("manager:labels.assignTitle")} />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          position="popper"
                          sideOffset={4}
                          className="z-50 min-w-40 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] shadow-md"
                        >
                          <Select.Viewport className="p-1">
                            {availableLabels.length > 0 ? (
                              availableLabels.map((label) => (
                                <Select.Item
                                  key={label.id}
                                  value={String(label.id)}
                                  className="flex cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm text-[var(--ink-muted)] outline-none hover:bg-[var(--surface-3)] focus:bg-[var(--surface-3)]"
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
              </div>

              {/* Expanded Students List */}
              {expandedClassId === classObj.id && (
                <div className="space-y-1 pl-10">
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

                          <button
                            type="button"
                            onClick={() =>
                              onEditStudent({
                                id: student.id,
                                displayName: student.displayName,
                                birthdate: student.birthdate,
                              })
                            }
                            className="focus-visible:outline-[var(--color-primary)] flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--surface-4)] hover:text-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2"
                            title={t("manager:classes.editStudent")}
                            aria-label={t("manager:classes.editStudent")}
                          >
                            <SquarePen className="size-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onDeleteStudent({
                                id: student.id,
                                displayName: student.displayName,
                              })
                            }
                            className="focus-visible:outline-[var(--color-primary)] flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--state-wrong-soft)] hover:text-[var(--state-wrong)] focus-visible:outline-2 focus-visible:outline-offset-2"
                            title={t("manager:classes.deleteStudent")}
                            aria-label={t("manager:classes.deleteStudent")}
                          >
                            <X className="size-3.5" />
                          </button>
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

                  <button
                    type="button"
                    onClick={() => onAddStudent(classObj.id)}
                    className="focus-visible:outline-[var(--color-primary)] flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--accent-tint)] focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Plus className="size-4" />
                    {t("manager:classes.addStudent")}
                  </button>
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
