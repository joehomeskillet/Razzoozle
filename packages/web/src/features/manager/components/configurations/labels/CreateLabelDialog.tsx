import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelColorPicker from "@razzoozle/web/components/labels/LabelColorPicker"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface CreateLabelDialogProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string, color: string) => boolean
}

const CreateLabelDialog = ({ open, onClose, onCreate }: CreateLabelDialogProps) => {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [color, setColor] = useState("gray")

  const reset = () => {
    setName("")
    setColor("gray")
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (onCreate(name, color)) {
      handleClose()
    }
  }

  return (
    <DialogPanel
      open={open}
      onOpenChange={handleClose}
      titleId="create-label-dialog-title"
      title={t("manager:labels.createTitle")}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="label-name" className="block text-sm font-medium text-[var(--ink)]">
            {t("manager:labels.namePlaceholder")}
          </label>
          <Input
            id="label-name"
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
            {t("manager:labels.create")}
          </Button>
        </div>
      </form>
    </DialogPanel>
  )
}

export default CreateLabelDialog
