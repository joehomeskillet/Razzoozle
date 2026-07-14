import Button from "@razzoozle/web/components/Button"
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

interface Student {
  id: number
  displayName: string
  createdAt?: string
  // ADDENDUM (birthdate): optional — only present once the parallel contract
  // WP lands the field on the wire.
  birthdate?: string | null
}

interface Class {
  id: number
  name: string
  createdAt: string
  studentCount?: number
  students?: Student[]
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
}: ClassListProps) => {
  const { t } = useTranslation()
  const [expandedClassId, setExpandedClassId] = useState<number | null>(null)

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
        {classes.map((classObj) => (
          <div key={classObj.id} className="space-y-1">
            {/* Class Row */}
            <div className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-4 py-3 border border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => {
                  const newId = expandedClassId === classObj.id ? null : classObj.id
                  setExpandedClassId(newId)
                  if (newId !== null && (!classObj.students || classObj.students.length === 0)) {
                    onFetchStudents?.(classObj.id)
                  }
                }}
                className="focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2"
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

              <GraduationCap className="size-5 shrink-0 text-gray-700" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">
                  {classObj.name}
                </p>
                <p className="text-xs text-gray-500">
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
                className="focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2"
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
                className="focus-visible:outline-primary flex size-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2"
                title={t("manager:classes.deleteClass")}
                aria-label={t("manager:classes.deleteClass")}
              >
                <Trash2 className="size-4" />
              </button>
            </div>

            {/* Expanded Students List */}
            {expandedClassId === classObj.id && (
              <div className="space-y-1 pl-10">
                {(classObj.students ?? []).length > 0 ? (
                  <>
                    {classObj.students?.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 border border-[var(--border-hairline)]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">
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
                          className="focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2"
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
                          className="focus-visible:outline-primary flex size-7 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2"
                          title={t("manager:classes.deleteStudent")}
                          aria-label={t("manager:classes.deleteStudent")}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                    <p className="text-xs text-gray-500">
                      {t("manager:classes.noStudents")}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onAddStudent(classObj.id)}
                  className="focus-visible:outline-primary flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-primary)] hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <Plus className="size-4" />
                  {t("manager:classes.addStudent")}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ClassList
