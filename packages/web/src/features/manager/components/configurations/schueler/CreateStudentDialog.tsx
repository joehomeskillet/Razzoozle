import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { StudentClassRef } from "./useSchuelerManager"

interface CreateStudentDialogProps {
  open: boolean
  classes: StudentClassRef[]
  onClose: () => void
  onCreate: (firstName: string, lastName?: string, classIds?: number[], birthdate?: string) => void
}

// CreateStudentDialog — firstName (required) + lastName (optional) + optional native date input (birthdate,
// ADDENDUM) + optional class checkboxes. On submit the dialog closes
// immediately (mirrors ConfigKlassen's create-dialog pattern); the parent
// switches to the PIN dialog once STUDENT_CREATED arrives.
const CreateStudentDialog = ({
  open,
  classes,
  onClose,
  onCreate,
}: CreateStudentDialogProps) => {
  const { t } = useTranslation()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [birthdate, setBirthdate] = useState("")
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([])

  if (!open) {
    return null
  }

  const reset = () => {
    setFirstName("")
    setLastName("")
    setBirthdate("")
    setSelectedClassIds([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const toggleClass = (classId: number) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    )
  }

  const handleSubmit = () => {
    onCreate(firstName, lastName || undefined, selectedClassIds.length > 0 ? selectedClassIds : undefined, birthdate || undefined)
    reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--border-hairline)] bg-[var(--surface)] p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {t("manager:schueler.createTitle")}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {t("manager:schueler.createDescription")}
        </p>

        <Input
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder={t("manager:schueler.firstNamePlaceholder")}
          className="mt-4 min-h-11 w-full rounded-xl"
        />

        <Input
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder={t("manager:schueler.lastNamePlaceholder")}
          className="mt-3 min-h-11 w-full rounded-xl"
        />

        <label
          htmlFor="schueler-create-birthdate"
          className="mt-4 block text-sm font-medium text-gray-700"
        >
          {t("manager:schueler.birthdateLabel")}
        </label>
        <input
          id="schueler-create-birthdate"
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          className="focus-visible:border-primary mt-1 min-h-11 w-full rounded-lg border-2 border-[var(--border-hairline)] p-2 text-lg font-semibold focus-visible:outline-none"
        />

        <p className="mt-4 text-sm font-medium text-gray-700">
          {t("manager:schueler.selectClasses")}
        </p>
        {classes.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">
            {t("manager:schueler.noClasses")}
          </p>
        ) : (
          <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--border-hairline)] p-2">
            {classes.map((c) => (
              <label
                key={c.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedClassIds.includes(c.id)}
                  onChange={() => toggleClass(c.id)}
                  className="focus-visible:outline-primary size-4 rounded border-[var(--border-hairline)]"
                />
                {c.name}
              </label>
            ))}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            {t("common:cancel")}
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            {t("manager:schueler.create")}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CreateStudentDialog
