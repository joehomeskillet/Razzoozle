import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import { Trash2, Upload, X } from "lucide-react"
import { useTranslation } from "react-i18next"

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-2">
        <Button
          variant="primary"
          className="flex-1 rounded-xl"
          onClick={() => navigate({ to: "/manager/quizz" })}
        >
          {t("manager:quizz.create")}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="rounded-xl"
          onClick={() => fileInputRef.current?.click()}
          title={t("manager:quizz.import")}
          aria-label={t("manager:quizz.import")}
        >
          <Upload className="size-5" aria-hidden />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImport}
        />
      </div>

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
              className="min-h-11 w-full rounded-xl"
            />
          </div>
          <div className="shrink-0">
            <label htmlFor="quizz-sort" className="sr-only">
              {t("manager:quizz.sort", { defaultValue: "Sortieren" })}
            </label>
            <select
              id="quizz-sort"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              aria-label={t("manager:quizz.sort", {
                defaultValue: "Sortieren",
              })}
              className="focus-visible:border-primary min-h-11 w-full rounded-xl border-2 border-[var(--border-hairline)] p-2 font-semibold focus-visible:outline-none sm:w-auto"
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
            </select>
          </div>
        </div>
      )}

      {selectionActive && (
        <div
          role="toolbar"
          aria-label={t("manager:quizz.bulkSelected", {
            count: selectionCount,
            defaultValue: "{{count}} ausgewählt",
          })}
          className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 p-2 pl-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("common:cancel")}
              title={t("common:cancel")}
              className="focus-visible:outline-primary flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X className="size-5" aria-hidden />
            </button>
            <span className="min-w-0 truncate text-sm font-semibold text-gray-700">
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
        hasMatches={hasMatches}
        activeQuizz={activeQuizz}
        archivedQuizz={archivedQuizz}
        selected={selected}
        showArchived={showArchived}
        navigate={navigate}
        toggleSelect={toggleSelect}
        handleExport={handleExport}
        handleArchived={handleArchived}
        setPendingDelete={setPendingDelete}
        setPendingDuplicate={setPendingDuplicate}
        setShowArchived={setShowArchived}
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
  )
}

export default ConfigManageQuizz
