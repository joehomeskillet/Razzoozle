import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import { Plus, SquarePen, Tags, Trash2 } from "lucide-react"
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
            aria-label={t("manager:labels.create")}
          >
            <Plus className="size-5" aria-hidden strokeWidth={2.5} />
            <span className="hidden sm:inline">
              {t("manager:labels.create")}
            </span>
          </Button>
        </form>

        {hasLabels ? (
          <div className="flex flex-1 flex-col space-y-3 overflow-auto p-0.5">
            {labels.map((label) => {
              const actions: ListRowAction[] = [
                {
                  key: "edit",
                  icon: SquarePen,
                  label: t("manager:labels.editLabel"),
                  onClick: () => setPendingEditLabel(label),
                  title: t("manager:labels.editLabel"),
                },
                {
                  key: "delete",
                  icon: Trash2,
                  label: t("manager:labels.deleteLabel"),
                  destructive: true,
                  onClick: () => setPendingDeleteLabel(label),
                  title: t("manager:labels.deleteLabel"),
                },
              ]
              return (
                <ListRow
                  key={label.id}
                  density="compact"
                  leading={
                    <div
                      className="h-6 w-6 rounded-full border border-[var(--border-hairline)]"
                      style={{
                        backgroundColor: `var(--label-${label.color}, var(--label-gray))`,
                      }}
                    />
                  }
                  title={label.name}
                  actions={actions}
                />
              )
            })}
          </div>
        ) : (
          <EmptyState icon={Tags} headline={t("manager:labels.emptyState")} />
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
