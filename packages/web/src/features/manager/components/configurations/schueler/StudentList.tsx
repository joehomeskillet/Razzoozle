import * as Select from "@radix-ui/react-select"
import { KeyRound, Plus, Trash2, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { SchuelerStudent, StudentClassRef } from "./useSchuelerManager"

interface StudentListProps {
  students: SchuelerStudent[]
  classes: StudentClassRef[]
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

interface StudentRowProps {
  student: SchuelerStudent
  classes: StudentClassRef[]
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

const StudentRow = ({
  student,
  classes,
  onShowPin,
  onDelete,
  onRemoveFromClass,
  onAddToClass,
}: StudentRowProps) => {
  const { t } = useTranslation()
  // Reset to "" right after firing so the trigger always shows the "+ Klasse"
  // placeholder again — this is an action menu, not a persistent selection.
  const [pendingClassId, setPendingClassId] = useState("")

  const availableClasses = classes.filter(
    (c) => !student.classes.some((sc) => sc.id === c.id),
  )

  const composedName = getComposedName(student)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">
          {composedName}
          {student.birthdate && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              {formatBirthdate(student.birthdate)}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {student.classes.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
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
              aria-label={t("manager:schueler.removeFromClassTitle")}
              className="focus-visible:outline-primary flex size-4 items-center justify-center rounded-full hover:bg-gray-200"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}

        {availableClasses.length > 0 && (
          <Select.Root
            value={pendingClassId}
            onValueChange={(val) => {
              onAddToClass(student.id, Number(val))
              setPendingClassId("")
            }}
          >
            <Select.Trigger
              aria-label={t("manager:schueler.addToClass")}
              className="focus-visible:outline-primary flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Plus className="size-3" />
              <Select.Value placeholder={t("manager:schueler.addToClass")} />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="z-50 min-w-32 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] shadow-md"
              >
                <Select.Viewport className="p-1">
                  {availableClasses.map((c) => (
                    <Select.Item
                      key={c.id}
                      value={String(c.id)}
                      className="flex cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm text-gray-700 outline-none hover:bg-gray-100 focus:bg-gray-100"
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

      <button
        type="button"
        onClick={() => onShowPin(student.id)}
        title={t("manager:schueler.showPin")}
        aria-label={t("manager:schueler.showPin")}
        className="focus-visible:outline-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
      >
        <KeyRound className="size-4" />
      </button>

      <button
        type="button"
        onClick={() =>
          onDelete({ id: student.id, displayName: composedName })
        }
        title={t("manager:schueler.deleteTitle")}
        aria-label={t("manager:schueler.deleteTitle")}
        className="focus-visible:outline-primary flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  )
}

const StudentList = ({
  students,
  classes,
  onShowPin,
  onDelete,
  onRemoveFromClass,
  onAddToClass,
}: StudentListProps) => {
  const { t } = useTranslation()

  if (students.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6 text-center text-sm text-gray-500">
        {t("manager:schueler.noResults")}
      </p>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      {students.map((student) => (
        <StudentRow
          key={student.id}
          student={student}
          classes={classes}
          onShowPin={onShowPin}
          onDelete={onDelete}
          onRemoveFromClass={onRemoveFromClass}
          onAddToClass={onAddToClass}
        />
      ))}
    </div>
  )
}

export default StudentList
