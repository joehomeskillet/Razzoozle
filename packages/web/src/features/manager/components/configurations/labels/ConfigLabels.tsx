import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { Plus, Trash2, Edit2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { Label } from "./useLabelManager"
import { useLabelManager } from "./useLabelManager"
import CreateLabelDialog from "./CreateLabelDialog"
import EditLabelDialog from "./EditLabelDialog"

const ConfigLabels = () => {
  const {
    labels,
    hasLabels,
    search,
    setSearch,
    pendingDeleteLabel,
    setPendingDeleteLabel,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useLabelManager()

  const { t } = useTranslation()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [pendingEditLabel, setPendingEditLabel] = useState<Label | null>(null)

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 pb-20">
        <div>
          <h2 className="text-base font-semibold text-[var(--ink)]">
            {t("manager:labels.title")}
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-medium)]">
            {t("manager:labels.description")}
          </p>
        </div>

        {hasLabels ? (
          <>
            <div className="flex shrink-0">
              <label htmlFor="labels-search" className="sr-only">
                {t("manager:labels.filterLabel")}
              </label>
              <Input
                id="labels-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("manager:labels.namePlaceholder")}
                className="min-h-11 w-full rounded-[var(--radius-theme)]"
              />
            </div>

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
                    >
                      <Edit2 className="size-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setPendingDeleteLabel(label)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] p-8">
            <p className="text-sm text-[var(--ink-subtle)]">
              {t("manager:labels.emptyState")}
            </p>
          </div>
        )}

        <CreateLabelDialog
          open={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={handleCreateLabel}
        />

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

      <ActionFooter>
        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="size-5" aria-hidden strokeWidth={2.5} />
          <span>{t("manager:labels.create")}</span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigLabels
