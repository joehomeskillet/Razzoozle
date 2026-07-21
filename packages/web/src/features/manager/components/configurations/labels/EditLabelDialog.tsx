import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelColorPicker from "@razzoozle/web/components/labels/LabelColorPicker"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
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
    <DialogPanel
      open={label !== null}
      onOpenChange={handleClose}
      titleId="edit-label-dialog-title"
      title={t("manager:labels.editTitle")}
      maxWidth="md"
    >
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
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t("common:cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button variant="primary" type="submit">
            {t("manager:labels.update")}
          </Button>
        </div>
      </form>
    </DialogPanel>
  )
}

export default EditLabelDialog
