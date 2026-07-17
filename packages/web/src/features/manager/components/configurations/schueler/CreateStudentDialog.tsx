import Button from "@razzoozle/web/components/Button"
import Checkbox from "@razzoozle/web/components/Checkbox"
import DateInput from "@razzoozle/web/components/DateInput"
import Input from "@razzoozle/web/components/Input"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { StudentClassRef } from "./useSchuelerManager"

// Matches the server's UTC "not in the future" check (see class:createStudent).
const todayIso = new Date().toISOString().slice(0, 10)

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onCreate(firstName, lastName || undefined, selectedClassIds.length > 0 ? selectedClassIds : undefined, birthdate || undefined)
    reset()
    onClose()
  }

  return (
    <DialogPanel
      open={open}
      onOpenChange={handleClose}
      titleId="create-student-dialog-title"
      title={t("manager:schueler.createTitle")}
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-[var(--ink-subtle)]">
              {t("manager:schueler.createDescription")}
            </p>

            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("manager:schueler.firstNamePlaceholder")}
              className="min-h-11 w-full rounded-[var(--radius-theme)]"
              autoFocus
            />

            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("manager:schueler.lastNamePlaceholder")}
              className="min-h-11 w-full rounded-[var(--radius-theme)]"
            />

            <div>
              <label
                htmlFor="schueler-create-birthdate"
                className="block text-sm font-medium text-[var(--ink-muted)]"
              >
                {t("manager:schueler.birthdateLabel")}
              </label>
              <DateInput
                id="schueler-create-birthdate"
                value={birthdate}
                max={todayIso}
                onChange={(e) => setBirthdate(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-[var(--ink-muted)]">
                {t("manager:schueler.selectClasses")}
              </p>
              {classes.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--ink-subtle)]">
                  {t("manager:schueler.noClasses")}
                </p>
              ) : (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-[var(--radius-theme)] border border-[var(--border-hairline)] p-2">
                  {classes.map((c) => (
                    <label
                      key={c.id}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-[var(--ink-muted)] hover:bg-[var(--surface-2)]"
                    >
                      <Checkbox
                        checked={selectedClassIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={handleClose}>
                {t("common:cancel")}
              </Button>
              <Button variant="primary" type="submit">
                {t("manager:schueler.create")}
              </Button>
            </div>
          </form>
    </DialogPanel>
  )
}

export default CreateStudentDialog
