import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { AllStudent } from "./useClassManager"

interface StudentPickerProps {
  open: boolean
  classId: number | null
  className: string
  allStudents: AllStudent[]
  onClose: () => void
  onSelect: (studentId: number, classId: number) => void
}

// Format a "YYYY-MM-DD" birthdate to a locale-friendly display string —
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

// StudentPicker — replaces the old free-text "add student" dialog. Lists the
// manager's whole roster (ALL_STUDENTS_DATA), greys out students already in
// this class, and adds a click on any other student via MOVE_STUDENT.
// Creating brand-new students no longer happens here (only in the
// Schülerverwaltung tab).
const StudentPicker = ({
  open,
  classId,
  className,
  allStudents,
  onClose,
  onSelect,
}: StudentPickerProps) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (query.length === 0) {
      return allStudents
    }
    return allStudents.filter((s) =>
      s.displayName.toLowerCase().includes(query),
    )
  }, [allStudents, search])

  if (!open || classId === null) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-[var(--ink)]">
          {t("manager:classes.pickerTitle")}
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-subtle)]">
          {t("manager:classes.pickerHint", { className })}
        </p>

        {allStudents.length > 0 && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("manager:classes.pickerSearchPlaceholder")}
            className="mt-4 min-h-11 w-full shrink-0 rounded-xl"
          />
        )}

        <div className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto">
          {allStudents.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--ink-subtle)]">
              {t("manager:classes.pickerEmpty")}
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--ink-subtle)]">
              {t("manager:classes.pickerNoResults")}
            </p>
          ) : (
            filtered.map((student) => {
              const alreadyIn = student.classes.some((c) => c.id === classId)
              return (
                <button
                  key={student.id}
                  type="button"
                  disabled={alreadyIn}
                  onClick={() => onSelect(student.id, classId)}
                  className="focus-visible:outline-[var(--color-primary)] flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 enabled:hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="min-w-0 truncate text-[var(--ink)]">
                    {student.displayName}
                    {student.birthdate && (
                      <span className="ml-2 text-xs font-normal text-[var(--ink-faint)]">
                        {formatBirthdate(student.birthdate)}
                      </span>
                    )}
                  </span>
                  {alreadyIn && (
                    <span className="shrink-0 text-xs text-[var(--ink-faint)]">
                      {t("manager:classes.pickerAlreadyIn")}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="primary" className="rounded-xl" onClick={onClose}>
            {t("common:close")}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default StudentPicker
