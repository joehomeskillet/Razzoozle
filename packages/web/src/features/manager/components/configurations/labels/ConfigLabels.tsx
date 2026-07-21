import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { Plus, Trash2, Edit2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { Label } from "./useLabelManager"
import { useLabelManager } from "./useLabelManager"
import EditLabelDialog from "./EditLabelDialog"

const ConfigLabels = () => {
  const {
    labels,
    hasLabels,
    pendingDeleteLabel,
    setPendingDeleteLabel,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useLabelManager()

  const { t } = useTranslation()
  const [pendingEditLabel, setPendingEditLabel] = useState<Label | null>(null)
  const [createInput, setCreateInput] = useState("")

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!createInput.trim()) return
    if (handleCreateLabel(createInput)) {
      setCreateInput("")
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
        <PageHeader
          title={t("manager:labels.title")}
          subtitle={t("manager:labels.description")}
        />

        {/* Create Form */}
        <form onSubmit={handleCreateSubmit} className="flex shrink-0 gap-2">
          <Input
            value={createInput}
            onChange={(e) => setCreateInput(e.target.value)}
            placeholder={t("manager:labels.namePlaceholder")}
            className="min-h-11 flex-1 rounded-[var(--radius-theme)]"
            autoFocus
          />
          <Button
            type="submit"
            variant="primary"
            className="shrink-0 rounded-[var(--radius-theme)]"
          >
            <Plus className="size-5" aria-hidden strokeWidth={2.5} />
            <span className="hidden sm:inline">{t("manager:labels.create")}</span>
          </Button>
        </form>

        {hasLabels ? (
          <div className="flex flex-1 flex-col gap-2 overflow-auto">
            {labels.map((label) => (
              <div
                key={label.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-6 w-6 rounded-full border border-[var(--border-hairline)]"
                    style={{ backgroundColor: `var(--label-${label.color}, var(--label-gray))` }}
                  />
                  <span className="text-sm font-medium text-[var(--ink)]">
                    {label.name}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPendingEditLabel(label)}
                    aria-label={t("manager:labels.editLabel")}
                    title={t("manager:labels.editLabel")}
                  >
                    <Edit2 className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="rounded-lg"
                    onClick={() => setPendingDeleteLabel(label)}
                    aria-label={t("manager:labels.deleteLabel")}
                    title={t("manager:labels.deleteLabel")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-8">
            <p className="text-sm text-[var(--ink-subtle)]">
              {t("manager:labels.emptyState")}
            </p>
          </div>
        )}

        <EditLabelDialog
          label={pendingEditLabel}
          onClose={() => setPendingEditLabel(null)}
          onUpdate={handleUpdateLabel}
        />

        {/* Delete Label Dialog */}
        <AlertDialog
          open={pendingDeleteLabel !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDeleteLabel(null)
            }
          }}
          title={t("manager:labels.deleteTitle")}
          description={t("manager:labels.deleteConfirm", {
            name: pendingDeleteLabel?.name ?? "",
          })}
          confirmLabel={t("common:delete")}
          onConfirm={handleDeleteLabel}
        />
      </div>
    </>
  )
}

export default ConfigLabels
