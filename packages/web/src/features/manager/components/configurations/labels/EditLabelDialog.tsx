import * as Dialog from "@radix-ui/react-dialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { LABEL_PALETTE } from "@razzoozle/web/components/labels/labelPalette"
import { X } from "lucide-react"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"

import type { Label } from "./useLabelManager"

interface EditLabelDialogProps {
  label: Label | null
  onClose: () => void
  onUpdate: (id: number, name: string, color: string) => void
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
    if (label) {
      onUpdate(label.id, name, color)
      handleClose()
    }
  }

  if (!label) return null

  return (
    <Dialog.Root open={!!label} onOpenChange={handleClose}>
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--border-hairline)] bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold text-gray-900">
            {t("manager:labels.editTitle")}
          </Dialog.Title>
          <Dialog.Close asChild>
            <button className="text-gray-400 hover:text-gray-600">
              <X className="size-5" />
            </button>
          </Dialog.Close>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="label-name-edit" className="block text-sm font-medium text-gray-900">
              {t("manager:labels.namePlaceholder")}
            </label>
            <Input
              id="label-name-edit"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("manager:labels.namePlaceholder")}
              className="mt-2 w-full rounded-lg"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              {t("manager:labels.colorLabel")}
            </label>
            <div className="flex flex-wrap gap-2">
              {LABEL_PALETTE.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => setColor(c.slug)}
                  className="h-8 w-8 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: `var(--label-${c.slug})`,
                    borderColor: color === c.slug ? "var(--color-secondary)" : "var(--border-hairline)",
                    boxShadow: color === c.slug ? "0 0 0 2px white" : "none",
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
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
    </Dialog.Root>
  )
}

export default EditLabelDialog
