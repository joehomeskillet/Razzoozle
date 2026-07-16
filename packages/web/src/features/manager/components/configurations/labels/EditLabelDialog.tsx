import * as Dialog from "@radix-ui/react-dialog"
import { Portal, Overlay } from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelColorPicker from "@razzoozle/web/components/labels/LabelColorPicker"
import { X } from "lucide-react"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"

import type { Label } from "./useLabelManager"

interface EditLabelDialogProps {
  label: Label | null
  onClose: () => void
  onUpdate: (id: number, name: string, color: string) => boolean
}

const EditLabelDialog = ({ label, onClose, onUpdate }: EditLabelDialogProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [color, setColor] = useState("gray")

  useEffect(() => {
    if (label) {
      setName(label.name)
      setColor(label.color)
    }
  }, [label])

  const handleClose = () => {
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (label && onUpdate(label.id, name, color)) {
      handleClose()
    }
  }

  if (!label) return null

  return (
    <Dialog.Root open={label !== null} onOpenChange={handleClose}>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content aria-labelledby="edit-label-dialog-title" className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-6 shadow-lg">
          <div className="flex items-center justify-between">
            <Dialog.Title id="edit-label-dialog-title" className="text-lg font-semibold text-[var(--ink)]">
              {t("manager:labels.editTitle")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="flex min-h-11 min-w-11 items-center justify-center text-[var(--ink-faint)] hover:text-[var(--ink-medium)]" aria-label={t('common:close')}>
                <X className="size-5" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="label-name-edit" className="block text-sm font-medium text-[var(--ink)]">
                {t("manager:labels.namePlaceholder")}
              </label>
              <Input
                id="label-name-edit"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("manager:labels.namePlaceholder")}
                className="mt-2 w-full rounded-[var(--radius-theme)]"
                autoFocus
              />
            </div>
            <LabelColorPicker value={color} onChange={setColor} />
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={handleClose}>
                {t("common:cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button variant="primary" type="submit">
                {t("manager:labels.update")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Portal>
    </Dialog.Root>
  )
}

export default EditLabelDialog
