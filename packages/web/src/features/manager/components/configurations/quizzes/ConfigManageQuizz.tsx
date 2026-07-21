import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import FilterGroup from "@razzoozle/web/components/manager/FilterGroup"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import Select from "@razzoozle/web/components/Select"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import { ActionFooter } from "@razzoozle/web/components/ui"
import { Plus, Trash2, Upload, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useMemo, useState } from "react"

import { useLabelManager } from "../labels/useLabelManager"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import QuizzDialogs from "./QuizzDialogs"
import QuizzList from "./QuizzList"
import type { SortKey } from "./types"
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
    selected,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    activeQuizz,
    archivedQuizz,
    hasMatches,
    handleExport,
    clearSelection,
    toggleSelect,
    handleBulkDelete,
    selectionCount,
    selectionActive,
    handleDelete,
    handleDuplicate,
    handleArchived,
    handleImport,
  } = useQuizzManager()
  const { t } = useTranslation()
  const { klassenEnabled } = useConfig()
  const { labels } = useLabelManager()
  const [activeFilterId, setActiveFilterId] = useState<number | null>(null)

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

  return (
    <>
      {/* No min-h-0 here: it breaks sticky ActionFooter (sibling) — see ActionFooter.tsx */}
      <div className="flex flex-1 flex-col pb-20">
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
          onChange={handleImport}
        />

        {quizz.length > 0 && (
          <div className="mb-4 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label htmlFor="quizz-search" className="sr-only">
                {t("manager:quizz.search", { defaultValue: "Quiz suchen" })}
              </label>
              <Input
                id="quizz-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("manager:quizz.searchPlaceholder", {
                  defaultValue: "Nach Thema suchen …",
                })}
                className="min-h-11 w-full rounded-[var(--radius-theme)]"
              />
            </div>
            <div className="shrink-0">
              <label htmlFor="quizz-sort" className="sr-only">
                {t("manager:quizz.sort", { defaultValue: "Sortieren" })}
              </label>
              <Select
                id="quizz-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                aria-label={t("manager:quizz.sort", {
                  defaultValue: "Sortieren",
                })}
              >
                <option value="name-asc">
                  {t("manager:quizz.sortNameAsc", {
                    defaultValue: "Name A–Z",
                  })}
                </option>
                <option value="count-desc">
                  {t("manager:quizz.sortCountDesc", {
                    defaultValue: "Meiste Fragen",
                  })}
                </option>
                <option value="count-asc">
                  {t("manager:quizz.sortCountAsc", {
                    defaultValue: "Wenigste Fragen",
                  })}
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

        {selectionActive && (
          <div
            role="toolbar"
            aria-label={t("manager:quizz.bulkSelected", {
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
                {t("manager:quizz.bulkSelected", {
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
                {t("manager:quizz.bulkDelete", { defaultValue: "Löschen" })}
              </span>
            </Button>
          </div>
        )}

        <QuizzList
          quizz={quizz}
          hasMatches={hasFilteredMatches}
          activeQuizz={filteredActive}
          archivedQuizz={filteredArchived}
          selected={selected}
          showArchived={showArchived}
          navigate={navigate}
          toggleSelect={toggleSelect}
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
          selectionCount={selectionCount}
          handleBulkDelete={handleBulkDelete}
          pendingDuplicate={pendingDuplicate}
          setPendingDuplicate={setPendingDuplicate}
          handleDuplicate={handleDuplicate}
        />
      </div>

      <ActionFooter>
        <Button
          data-testid="quizz-create-btn"
          variant="primary"
          size="lg"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={() => navigate({ to: "/manager/quizz" })}
        >
          <Plus className="size-5" aria-hidden strokeWidth={2.5} />
          <span>{t("manager:quizz.create")}</span>
        </Button>
        <Button
          data-testid="quizz-import-btn"
          variant="secondary"
          size="lg"
          type="button"
          className="w-full rounded-[var(--radius-theme)] sm:w-auto"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-5" aria-hidden />
          <span>{t("manager:quizz.import")}</span>
        </Button>
      </ActionFooter>
    </>
  )
}

export default ConfigManageQuizz
