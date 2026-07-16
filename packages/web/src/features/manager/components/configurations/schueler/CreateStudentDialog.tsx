import * as Dialog from "@radix-ui/react-dialog"
import { Portal, Overlay } from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { X } from "lucide-react"
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
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-lg" role="alertdialog">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-[var(--ink)]">
              {t("manager:schueler.createTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="flex min-h-11 min-w-11 items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink-medium)]" aria-label={t('common:close')}>
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

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
              <input
                id="schueler-create-birthdate"
                type="date"
                value={birthdate}
                max={todayIso}
                onChange={(e) => setBirthdate(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-[var(--radius-theme)] border-2 border-[var(--border-hairline)] p-2 text-lg font-semibold focus-visible:border-[var(--color-primary)] focus-visible:outline-none"
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
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                        className="size-4 rounded border-[var(--border-hairline)] focus-visible:outline-[var(--color-primary)]"
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
        </Dialog.Content>
      </Portal>
    </Dialog.Root>
  )
}

export default CreateStudentDialog
