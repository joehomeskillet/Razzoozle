import Button from "@razzoozle/web/components/Button"
import Badge from "@razzoozle/web/components/manager/Badge"
import DialogPanel from "@razzoozle/web/components/manager/DialogPanel"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import Input from "@razzoozle/web/components/Input"
import EmptyState from "@razzoozle/web/features/manager/components/console/EmptyState"
import ListRow, { type ListRowAction } from "@razzoozle/web/features/manager/components/console/ListRow"
import {
  listContainerMotion,
  listItemMotion,
} from "@razzoozle/web/features/manager/components/console/listMotion"
import {
  createQuizFromTemplate,
  deleteTemplate,
  listTemplates,
  type TemplateMeta,
} from "@razzoozle/web/lib/templatesApi"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { Edit, Trash2, LayoutTemplate } from "lucide-react"
import { motion } from "motion/react"
import { Fragment, useEffect, useState, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "@tanstack/react-router"

export interface TemplatePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRename: (template: TemplateMeta) => void
  onCreate: () => void
}

const TemplatePickerDialog = ({
  open,
  onOpenChange,
  onRename,
  onCreate,
}: TemplatePickerDialogProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useManagerStore((state) => state.role)

  const [templates, setTemplates] = useState<TemplateMeta[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("Alle")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<TemplateMeta | null>(null)

  // Load templates on dialog open
  useEffect(() => {
    if (!open) return

    const loadTemplates = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const data = await listTemplates()
        setTemplates(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : t("manager:templates.loadError"))
      } finally {
        setIsLoading(false)
      }
    }

    loadTemplates()
  }, [open, t])

  // Compute unique categories from templates
  const categories = useMemo(() => {
    const cats = new Set(templates.map((t) => t.category))
    return Array.from(cats).sort()
  }, [templates])

  // Filter templates by search query and category
  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      // Category filter
      if (selectedCategory !== "Alle" && template.category !== selectedCategory) {
        return false
      }

      // Search filter (name, description, tags)
      const query = searchQuery.toLowerCase()
      if (!query) return true

      return (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    })
  }, [templates, searchQuery, selectedCategory])

  // Create quiz from template
  const handleUseTemplate = useCallback(
    async (templateId: string) => {
      try {
        const result = await createQuizFromTemplate(templateId)
        onOpenChange(false)
        navigate({ to: `/manager/quizz/${result.id}` })
      } catch (err) {
        setError(err instanceof Error ? err.message : t("manager:templates.loadError"))
      }
    },
    [navigate, onOpenChange, t],
  )

  // Confirm delete template
  const handleConfirmDelete = useCallback(async () => {
    if (!templateToDelete) return

    try {
      await deleteTemplate(templateToDelete.id)
      setTemplates((prev) => prev.filter((t) => t.id !== templateToDelete.id))
      setDeleteConfirmOpen(false)
      setTemplateToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manager:templates.deleteError"))
      setDeleteConfirmOpen(false)
      setTemplateToDelete(null)
    }
  }, [templateToDelete, t])

  // Request delete template (admin only)
  const handleDeleteTemplate = useCallback((template: TemplateMeta) => {
    setTemplateToDelete(template)
    setDeleteConfirmOpen(true)
  }, [])

  // Retry loading
  const handleRetry = useCallback(() => {
    setError(null)
    const loadTemplates = async () => {
      setIsLoading(true)
      try {
        const data = await listTemplates()
        setTemplates(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : t("manager:templates.loadError"))
      } finally {
        setIsLoading(false)
      }
    }
    loadTemplates()
  }, [t])

  // Render empty state
  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <div aria-live="polite" aria-atomic="true">
          <EmptyState
            icon={LayoutTemplate}
            headline={t("manager:templates.loading")}
            className="mt-6"
          />
        </div>
      )
    }

    if (error) {
      return (
        <EmptyState
          icon={LayoutTemplate}
          headline={t("manager:templates.loadError")}
          action={{ label: "Erneut versuchen", onClick: handleRetry }}
          className="mt-6"
        />
      )
    }

    if (templates.length === 0) {
      return (
        <EmptyState
          icon={LayoutTemplate}
          headline={t("manager:templates.empty.title")}
          hint={t("manager:templates.empty.body")}
          action={
            role === "admin"
              ? { label: t("manager:templates.create"), onClick: onCreate }
              : undefined
          }
          className="mt-6"
        />
      )
    }

    if (filteredTemplates.length === 0) {
      return (
        <EmptyState
          icon={LayoutTemplate}
          headline={t("manager:templates.noMatches")}
          className="mt-6"
        />
      )
    }

    return null
  }

  const emptyState = renderEmptyState()

  return (
    <>
      <DialogPanel
        open={open}
        onOpenChange={onOpenChange}
        titleId="template-picker-title"
        title={t("manager:templates.dialogTitle")}
        maxWidth="lg"
      >
        <div className="mt-6 space-y-4" data-testid="template-picker">
          {/* Search input */}
          {!isLoading && !error && templates.length > 0 && (
            <>
              <Input
                type="text"
                placeholder={t("manager:templates.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="template-search"
              />

              {/* Category filter pills */}
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={selectedCategory === "Alle"}
                  onClick={() => setSelectedCategory("Alle")}
                >
                  {t("manager:templates.allCategories")}
                </FilterPill>
                {categories.map((category) => (
                  <Fragment key={category}>
                    <FilterPill
                      active={selectedCategory === category}
                      onClick={() => setSelectedCategory(category)}
                    >
                      {category}
                    </FilterPill>
                  </Fragment>
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {emptyState}

          {/* Templates list */}
          {!emptyState && (
            <motion.ul
              className="console-scroll max-h-[50vh] space-y-2 overflow-y-auto"
              {...listContainerMotion(false)}
            >
              {filteredTemplates.map((template, index) => {
                const adminActions: ListRowAction[] = []

                if (role === "admin") {
                  adminActions.push(
                    {
                      key: `template-edit-${template.id}`,
                      icon: Edit,
                      label: t("manager:templates.edit"),
                      onClick: () => {
                        onOpenChange(false)
                        navigate({ to: `/manager/template/${template.id}` })
                      },
                    },
                    {
                      key: `template-rename-${template.id}`,
                      icon: Edit,
                      label: "Umbenennen",
                      onClick: () => onRename(template),
                    },
                    {
                      key: `template-delete-${template.id}`,
                      icon: Trash2,
                      label: t("manager:templates.delete"),
                      onClick: () => handleDeleteTemplate(template),
                      destructive: true,
                    },
                  )
                }

                return (
                  <motion.li
                    key={template.id}
                    data-testid={`template-row-${template.id}`}
                    {...listItemMotion(index, false)}
                  >
                    <ListRow
                      title={template.name}
                      meta={`${template.category} · ${t("manager:templates.questionCount", {
                        count: template.questionCount,
                      })}`}
                      density="compact"
                      actions={[
                        {
                          key: `template-use-${template.id}`,
                          icon: LayoutTemplate,
                          label: t("manager:templates.use"),
                          onClick: () => handleUseTemplate(template.id),
                        },
                      ]}
                      overflow={role === "admin" ? <OverflowMenu actions={adminActions} /> : undefined}
                      footer={
                        template.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {template.tags.slice(0, 3).map((tag) => (
                              <Fragment key={tag}>
                                <Badge tone="neutral">
                                  {tag}
                                </Badge>
                              </Fragment>
                            ))}
                            {template.tags.length > 3 && (
                              <Badge tone="neutral">+{template.tags.length - 3}</Badge>
                            )}
                          </div>
                        ) : undefined
                      }
                    />
                  </motion.li>
                )
              })}
            </motion.ul>
          )}

          {/* Admin footer */}
          {role === "admin" && !isLoading && !error && templates.length > 0 && (
            <div className="mt-6 flex justify-end border-t border-[var(--line)] pt-4">
              <Button
                variant="primary"
                onClick={onCreate}
                data-testid="template-create-btn"
              >
                + {t("manager:templates.create")}
              </Button>
            </div>
          )}
        </div>
      </DialogPanel>

      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("manager:templates.deleteConfirm.title", {
          defaultValue: "Template löschen",
        })}
        description={t("manager:templates.deleteConfirm.body")}
        confirmLabel={t("common:delete", { defaultValue: "Löschen" })}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}

export default TemplatePickerDialog
