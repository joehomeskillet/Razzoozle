import * as Select from "@radix-ui/react-select"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Badge, { assignTriggerClass } from "@razzoozle/web/components/manager/Badge"
import FilterGroup from "@razzoozle/web/components/manager/FilterGroup"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import {
  popoverContentClass,
  popoverItemClass,
} from "@razzoozle/web/components/manager/popover"
import Button from "@razzoozle/web/components/Button"
import Checkbox from "@razzoozle/web/components/Checkbox"
import Input from "@razzoozle/web/components/Input"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import { ActionFooter } from "@razzoozle/web/components/ui"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import { useLabelManager } from "@razzoozle/web/features/manager/components/configurations/labels/useLabelManager"
import {
  BookOpen,
  Library,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  X,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { TYPE_LABEL_KEY } from "./constants"
import { useCatalogManager } from "./useCatalogManager"
import { formatDate } from "./utils"
import { CatalogQuestionModal } from "./CatalogQuestionModal"

const ConfigCatalog = () => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const { labels } = useLabelManager()

  const {
    search,
    setSearch,
    scope,
    setScope,
    selectedLabelId,
    setSelectedLabelId,
    klassenEnabled,
    modalMode,
    editingEntry,
    modalOpen,
    pendingDelete,
    setPendingDelete,
    selected,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    selectionCount,
    selectionActive,
    entries,
    filteredEntries,
    openAddModal,
    openEditModal,
    closeModal,
    handleDelete,
    clearSelection,
    toggleSelect,
    handleBulkDelete,
    handleLabelAssign,
    setPendingOp,
  } = useCatalogManager()

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col pb-20">
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <PageHeader
            title={t("manager:catalog.title")}
            subtitle={t("manager:catalog.intro")}
          />

          <label htmlFor="catalog-search" className="sr-only">
            {t("manager:catalog.search")}
          </label>
          <Input
            id="catalog-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:catalog.searchPlaceholder")}
            className="min-h-11 w-full rounded-[var(--radius-theme)]"
          />

          <FilterGroup label={t("manager:catalog.scope.label")}>
            {(
              [
                { key: "own", label: t("manager:catalog.scope.own") },
                { key: "global", label: t("manager:catalog.scope.global") },
                { key: "all", label: t("manager:catalog.scope.all") },
              ] as const
            ).map((entry) => (
              <FilterPill
                key={entry.key}
                active={scope === entry.key}
                onClick={() => setScope(entry.key)}
              >
                {entry.label}
              </FilterPill>
            ))}
          </FilterGroup>

          {klassenEnabled && (
            <LabelFilterPills
              labels={labels}
              activeId={selectedLabelId}
              onChange={setSelectedLabelId}
            />
          )}
        </div>

        {selectionActive && (
          <div
            role="toolbar"
            aria-label={t("manager:catalog.bulkSelected", {
              count: selectionCount,
              defaultValue: "{{count}} ausgewählt",
            })}
            className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-theme)] bg-[var(--surface-2)] p-2 pl-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={clearSelection}
                aria-label={t("common:cancel")}
                title={t("common:cancel")}
              >
                <X className="size-5" aria-hidden />
              </Button>
              <span className="min-w-0 truncate text-sm font-semibold text-[var(--ink-muted)]">
                {t("manager:catalog.bulkSelected", {
                  count: selectionCount,
                  defaultValue: "{{count}} ausgewählt",
                })}
              </span>
            </div>
            <Button
              size="sm"
              variant="danger"
              className="rounded-lg"
              onClick={() => setBulkDeleteOpen(true)}
              classNameContent="min-w-0 gap-1"
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {t("manager:catalog.bulkDelete", { defaultValue: "Löschen" })}
              </span>
            </Button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            <EmptyState
              icon={Library}
              headline={t("manager:catalog.emptyHeadline")}
              hint={t("manager:catalog.empty")}
              action={{
                label: t("manager:catalog.addManual"),
                onClick: openAddModal,
              }}
            />
          </div>
        ) : filteredEntries.length === 0 ? (
          <EmptyState
            icon={SearchX}
            headline={t("manager:catalog.noResults")}
            hint={t("manager:catalog.search")}
          />
        ) : (
          <motion.div
            className="flex min-h-0 flex-1 flex-col space-y-3 p-0.5"
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={
              reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
            }
          >
            {filteredEntries.map((entry, index) => {
              const type = entry.question.type ?? "choice"
              const source = entry.source ?? "manual"
              const entryLabelIds = entry.labelIds ?? []
              const entryTags = entry.tags ?? []
              const assignedLabels = labels.filter((label) =>
                entryLabelIds.includes(label.id),
              )
              const availableLabels = labels.filter(
                (label) => !entryLabelIds.includes(label.id),
              )
              const hasLabelFooter =
                klassenEnabled &&
                (assignedLabels.length > 0 || availableLabels.length > 0)
              const hasFooter = entryTags.length > 0 || hasLabelFooter

              return (
                <motion.div
                  key={entry.id}
                  data-testid={`catalog-row-${entry.id}`}
                  initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={
                    reducedMotion
                      ? undefined
                      : {
                          duration: 0.28,
                          ease: "easeOut",
                          delay: Math.min(index, 8) * 0.04,
                        }
                  }
                >
                  <ListRow
                    selection={
                      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-3)]">
                        <span className="sr-only">
                          {t("manager:catalog.selectEntry", {
                            name: entry.question.question,
                            defaultValue: '„{{name}}" auswählen',
                          })}
                        </span>
                        <Checkbox
                          data-testid={`catalog-checkbox-${entry.id}`}
                          checked={selected.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                        />
                      </label>
                    }
                    leading={
                      <Library className="size-5 shrink-0 text-[var(--ink-muted)]" />
                    }
                    title={entry.question.question}
                    onClick={() => openEditModal(entry)}
                    bodyLabel={t("manager:catalog.editEntry", {
                      name: entry.question.question,
                      defaultValue: '„{{name}}" bearbeiten',
                    })}
                    meta={
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>
                          {t(TYPE_LABEL_KEY[type] ?? "quizz:type.choice")}
                        </Badge>
                        <Badge className="bg-[var(--surface-3)] text-[var(--ink-medium)]">
                          {t(`manager:catalog.source.${source}`)}
                        </Badge>
                        <span className="text-xs text-[var(--ink-subtle)]">
                          {formatDate(entry.addedAt)}
                        </span>
                      </span>
                    }
                    footer={
                      hasFooter && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {klassenEnabled &&
                            assignedLabels.map((label) => (
                              <LabelChip
                                key={label.id}
                                label={label}
                                onRemove={() => {
                                  handleLabelAssign(
                                    entry.id,
                                    entryLabelIds.filter(
                                      (id) => id !== label.id,
                                    ),
                                  )
                                }}
                              />
                            ))}

                          {klassenEnabled && availableLabels.length > 0 && (
                            <Select.Root
                              value=""
                              onValueChange={(val: string) => {
                                handleLabelAssign(entry.id, [
                                  ...entryLabelIds,
                                  Number(val),
                                ])
                              }}
                            >
                              <Select.Trigger
                                aria-label={t("manager:labels.assignLabel", {
                                  defaultValue: "Label zuweisen",
                                })}
                                onPointerDown={(e) => e.stopPropagation()}
                                className={assignTriggerClass}
                              >
                                <Plus className="size-3" />
                                <Select.Value
                                  placeholder={t("manager:labels.assignTitle", {
                                    defaultValue: "+ Fach",
                                  })}
                                />
                              </Select.Trigger>
                              <Select.Portal>
                                <Select.Content
                                  position="popper"
                                  sideOffset={4}
                                  onCloseAutoFocus={(e) => e.preventDefault()}
                                  className={`z-50 min-w-32 overflow-hidden ${popoverContentClass}`}
                                >
                                  <Select.Viewport className="p-1">
                                    {availableLabels.map((label) => (
                                      <Select.Item
                                        key={label.id}
                                        value={String(label.id)}
                                        className={popoverItemClass}
                                      >
                                        <Select.ItemText>
                                          {label.name}
                                        </Select.ItemText>
                                      </Select.Item>
                                    ))}
                                  </Select.Viewport>
                                </Select.Content>
                              </Select.Portal>
                            </Select.Root>
                          )}

                          {entryTags.map((tag, tagIndex) => (
                            <Badge
                              key={`${tag}-${tagIndex}`}
                              className="bg-[var(--surface-3)] text-[var(--ink-medium)]"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )
                    }
                    actions={[
                      {
                        key: "edit",
                        icon: Pencil,
                        label: t("manager:catalog.edit"),
                        onClick: () => openEditModal(entry),
                      },
                      {
                        key: "delete",
                        icon: Trash2,
                        label: t("manager:catalog.delete"),
                        destructive: true,
                        onClick: () =>
                          setPendingDelete({
                            id: entry.id,
                            question: entry.question.question,
                          }),
                      },
                    ]}
                  />
                </motion.div>
              )
            })}
          </motion.div>
        )}

        <CatalogQuestionModal
          open={modalOpen}
          mode={modalMode}
          editingEntry={editingEntry}
          onClose={closeModal}
          onSaveStart={setPendingOp}
        />

        <AlertDialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null)
            }
          }}
          title={t("manager:catalog.delete")}
          description={t("manager:catalog.deleteConfirm")}
          confirmLabel={t("common:delete")}
          onConfirm={handleDelete}
        />

        <AlertDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          title={t("manager:catalog.bulkDeleteTitle", {
            defaultValue: "Fragen löschen",
          })}
          description={t("manager:catalog.bulkDeleteConfirm", {
            count: selectionCount,
            defaultValue:
              "{{count}} ausgewählte Fragen werden dauerhaft aus dem Katalog entfernt.",
          })}
          confirmLabel={t("common:delete")}
          onConfirm={handleBulkDelete}
        />
      </div>

      <ActionFooter>
        <Button
          data-testid="catalog-create-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={openAddModal}
        >
          <BookOpen className="size-5" aria-hidden />
          <span>{t("manager:catalog.addManual")}</span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigCatalog
