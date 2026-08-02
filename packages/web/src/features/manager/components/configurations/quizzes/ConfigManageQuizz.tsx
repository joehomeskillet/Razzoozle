import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import FilterGroup from "@razzoozle/web/components/manager/FilterGroup"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import BulkActionToolbar from "@razzoozle/web/components/manager/BulkActionToolbar"
import Select from "@razzoozle/web/components/Select"
import SelectAllControl from "@razzoozle/web/components/manager/SelectAllControl"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import { ActionFooterCompact } from "@razzoozle/web/components/ui"
import { Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"

import { useLabelManager } from "../labels/useLabelManager"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useEntitySelection } from "@razzoozle/web/features/manager/hooks/useEntitySelection"
import TemplatePickerDialog from "@razzoozle/web/features/manager/components/templates/TemplatePickerDialog"
import TemplateMetaDialog from "@razzoozle/web/features/manager/components/templates/TemplateMetaDialog"
import QuizzDialogs from "./QuizzDialogs"
import QuizzList from "./QuizzList"
import type { SortKey } from "./types"
import type { TemplateMeta } from "@razzoozle/web/lib/templatesApi"
import { useQuizzManager } from "./useQuizzManager"

const ConfigManageQuizz = () => {
  const {
    quizz,
    navigate,
    fileInputRef,
    showArchived,
    setShowArchived,
    search,
    setSearch,
    sortKey,
    setSortKey,
    pendingDelete,
    setPendingDelete,
    pendingDuplicate,
    setPendingDuplicate,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    activeQuizz,
    archivedQuizz,
    hasMatches,
    handleExport,
    handleBulkDelete,
    handleDelete,
    handleDuplicate,
    handleArchived,
    handleImport,
  } = useQuizzManager()
  const { t } = useTranslation()
  const { klassenEnabled } = useConfig()
  const { labels } = useLabelManager()
  const [activeFilterId, setActiveFilterId] = useState<number | null>(null)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateMetaOpen, setTemplateMetaOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateMeta | undefined>(undefined)

  const { filteredActive, filteredArchived, hasFilteredMatches } = useMemo(() => {
    if (!klassenEnabled || activeFilterId === null) {
      return {
        filteredActive: activeQuizz,
        filteredArchived: archivedQuizz,
        hasFilteredMatches: hasMatches,
      }
    }

    const filtered = activeQuizz.filter((q) =>
      (q.labelIds ?? []).includes(activeFilterId),
    )
    const filteredArch = archivedQuizz.filter((q) =>
      (q.labelIds ?? []).includes(activeFilterId),
    )

    return {
      filteredActive: filtered,
      filteredArchived: filteredArch,
      hasFilteredMatches: filtered.length > 0 || filteredArch.length > 0,
    }
  }, [klassenEnabled, activeFilterId, activeQuizz, archivedQuizz, hasMatches])

  const selectableQuizIds = useMemo(
    () => filteredActive.map((quiz) => quiz.id),
    [filteredActive],
  )
  const selection = useEntitySelection(selectableQuizIds)

  const handleBulkDeleteConfirm = () => {
    handleBulkDelete(Array.from(selection.selected))
    selection.clear()
  }

  const handleTemplateMetaSaved = () => {
    setTemplateMetaOpen(false)
    setSelectedTemplate(undefined)
  }

  return (
    <>
      {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex shrink-0 flex-col gap-3">
          <PageHeader
            title={t("manager:tabs.quizz")}
            subtitle={t("manager:quizz.intro")}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          data-testid="quizz-file-input"
          onChange={handleImport}
        />

        {quizz.length > 0 && (
          <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label htmlFor="quizz-search" className="sr-only">
                {t("manager:quizz.search")}
              </label>
              <Input
                id="quizz-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("manager:quizz.searchPlaceholder")}
                className="min-h-11 w-full rounded-[var(--radius-theme)]"
              />
            </div>
            <div className="shrink-0">
              <label htmlFor="quizz-sort" className="sr-only">
                {t("manager:quizz.sort")}
              </label>
              <Select
                id="quizz-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                aria-label={t("manager:quizz.sort")}
              >
                <option value="name-asc">
                  {t("manager:quizz.sortNameAsc")}
                </option>
                <option value="count-desc">
                  {t("manager:quizz.sortCountDesc")}
                </option>
                <option value="count-asc">
                  {t("manager:quizz.sortCountAsc")}
                </option>
              </Select>
            </div>
          </div>
        )}

        {klassenEnabled && labels.length > 0 && (
          <div className="mb-4 flex shrink-0">
            <FilterGroup label={t("manager:tabs.labels")}>
              <LabelFilterPills
                labels={labels}
                activeId={activeFilterId}
                onChange={setActiveFilterId}
              />
            </FilterGroup>
          </div>
        )}

        {/* Bulk toolbar: inline only when ≥1 selected (not sticky; ActionFooter stays sticky) */}
        {selection.selectionActive && (
          <BulkActionToolbar
            count={selection.selected.size}
            label={t("manager:quizz.bulkSelected", {
              count: selection.selected.size,
            })}
            onClear={() => selection.clear()}
          >
            <Button
              size="sm"
              variant="danger"
              className="rounded-lg"
              onClick={() => setBulkDeleteOpen(true)}
              classNameContent="min-w-0 gap-1"
            >
              <Trash2 className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {t("manager:quizz.bulkDelete")}
              </span>
            </Button>
          </BulkActionToolbar>
        )}

        {filteredActive.length > 0 && (
          <SelectAllControl
            id="quizz-select-all"
            data-testid="quizz-select-all"
            allSelected={selection.allSelected}
            someSelected={selection.someSelected}
            selectedCount={selection.selected.size}
            totalCount={filteredActive.length}
            onToggleAll={selection.toggleAll}
          />
        )}

        <QuizzList
          quizz={quizz}
          hasMatches={hasFilteredMatches}
          activeQuizz={filteredActive}
          archivedQuizz={filteredArchived}
          selected={selection.selected}
          showArchived={showArchived}
          navigate={navigate}
          toggleSelect={selection.toggle}
          handleExport={handleExport}
          handleArchived={handleArchived}
          setPendingDelete={setPendingDelete}
          setPendingDuplicate={setPendingDuplicate}
          setShowArchived={setShowArchived}
          labels={klassenEnabled ? labels : []}
        />

        <QuizzDialogs
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          handleDelete={handleDelete}
          bulkDeleteOpen={bulkDeleteOpen}
          setBulkDeleteOpen={setBulkDeleteOpen}
          selectionCount={selection.selected.size}
          handleBulkDelete={handleBulkDeleteConfirm}
          pendingDuplicate={pendingDuplicate}
          setPendingDuplicate={setPendingDuplicate}
          handleDuplicate={handleDuplicate}
        />
      </div>

      <ActionFooterCompact
        instanceId="quiz"
        actions={[
          {
            key: "quizz-template",
            iconName: "Template",
            intent: "secondary",
            testId: "quizz-template-btn",
            label: t("manager:templates.open"),
            onClick: () => setTemplatePickerOpen(true),
          },
          {
            key: "quizz-import",
            iconName: "Import",
            intent: "secondary",
            testId: "quizz-import-btn",
            label: t("manager:quizz.import"),
            onClick: () => fileInputRef.current?.click(),
          },
          {
            key: "quizz-create",
            iconName: "Create",
            intent: "primary",
            testId: "quizz-create-btn",
            label: t("manager:quizz.create"),
            onClick: () => navigate({ to: "/manager/quizz" }),
          },
        ]}
      />

      <TemplatePickerDialog
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onRename={(template) => {
          setSelectedTemplate(template)
          setTemplateMetaOpen(true)
        }}
        onCreate={() => {
          setSelectedTemplate(undefined)
          setTemplateMetaOpen(true)
        }}
      />

      <TemplateMetaDialog
        open={templateMetaOpen}
        onOpenChange={setTemplateMetaOpen}
        template={selectedTemplate}
        onSaved={handleTemplateMetaSaved}
      />
    </>
  )
}

export default ConfigManageQuizz
