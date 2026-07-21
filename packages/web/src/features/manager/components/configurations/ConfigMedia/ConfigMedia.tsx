import { EVENTS } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import PageHeader from "@razzoozle/web/components/manager/PageHeader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import LabelFilterPills from "@razzoozle/web/components/labels/LabelFilterPills"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useLabelManager } from "../labels/useLabelManager"
import clsx from "clsx"
import {
  Filter,
  Images,
  SearchX,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import MediaCard from "./MediaCard"
import { useMediaDragDrop } from "./useMediaDragDrop"
import { useMediaSelection } from "./useMediaSelection"
import { useMediaUpload } from "./useMediaUpload"

type MediaScope = "own" | "global" | "all"

const ConfigMedia = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const config = useConfig()
  const { labels } = useLabelManager()

  const [items, setItems] = useState<MediaMeta[]>([])
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"all" | MediaMeta["source"]>(
    "all",
  )
  // Server-side ownership filter (own | global | all), sent on every LIST
  // request — see EVENTS.CATALOG.LIST's doc-comment for the same contract.
  const [scope, setScope] = useState<MediaScope>("all")
  const [labelFilter, setLabelFilter] = useState<number | null>(null)

  const requestMedia = useCallback(() => {
    socket.emit(EVENTS.MEDIA.LIST, { scope })
  }, [socket, scope])

  useEffect(() => {
    requestMedia()
  }, [requestMedia])

  const {
    enqueueFiles,
    fileInputRef,
    handleUpload,
    openFilePicker,
    uploading,
  } = useMediaUpload(requestMedia)

  const {
    dragActive,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useMediaDragDrop(enqueueFiles)

  useEvent(
    EVENTS.MEDIA.DATA,
    useCallback((next: MediaMeta[]) => {
      setItems(next)
    }, []),
  )

  // On label:assigned for media, refetch the media list
  useEvent(
    EVENTS.LABEL.ASSIGNED,
    useCallback((data: { entityType: string }) => {
      if (data.entityType === "media") {
        requestMedia()
      }
    }, [requestMedia]),
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesSource =
        sourceFilter === "all" || item.source === sourceFilter
      const matchesSearch =
        !q ||
        item.filename.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      const matchesLabel =
        labelFilter === null || (item.labelIds?.includes(labelFilter) ?? false)

      return matchesSource && matchesSearch && matchesLabel
    })
  }, [items, search, sourceFilter, labelFilter])

  const {
    bulkDeleteOpen,
    clearSelection,
    handleBulkDelete,
    handleCardSelect,
    selected,
    selectionActive,
    setBulkDeleteOpen,
  } = useMediaSelection({ filtered, items, requestMedia })

  // Compute bulk delete warning: check if any selected item has usage
  const bulkDeleteWarning = useMemo(() => {
    const selectedItems = Array.from(selected).map(
      (id) => items.find((item) => item.id === id),
    ).filter((item): item is MediaMeta => item !== undefined)

    const itemsWithUsage = selectedItems.filter((item) => (item.usage?.length ?? 0) > 0)
    if (itemsWithUsage.length === 0) return null

    const totalUsageCount = itemsWithUsage.reduce(
      (sum, item) => sum + (item.usage?.length ?? 0),
      0,
    )

    return t("manager:media.usage.deleteWarning", {
      count: totalUsageCount,
    })
  }, [selected, items, t])

  const clearFilters = () => {
    setSearch("")
    setSourceFilter("all")
    setLabelFilter(null)
  }

  const handleDelete = (id: string) => {
    socket.emit(EVENTS.MEDIA.DELETE, { id })
  }

  const sourceFilters: Array<{
    key: "all" | MediaMeta["source"]
    label: string
  }> = [
    { key: "all", label: t("manager:media.filters.all") },
    { key: "upload", label: t("manager:media.filters.upload") },
    { key: "ai", label: t("manager:media.filters.ai") },
    { key: "theme", label: t("manager:media.filters.theme") },
  ]

  const scopeFilters: Array<{ key: MediaScope; label: string }> = [
    { key: "own", label: t("manager:media.scope.own", { defaultValue: "Eigene" }) },
    { key: "global", label: t("manager:media.scope.global", { defaultValue: "Global" }) },
    { key: "all", label: t("manager:media.scope.all", { defaultValue: "Alle" }) },
  ]

  return (
    // DnD handlers + the drop overlay live on the OUTER container so dragging a
    // file in works in every state — including an empty library or an empty
    // search result, not just when there are cards to grid.
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex min-h-0 flex-1 flex-col"
    >
      {dragActive && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[var(--radius-theme)] bg-[var(--accent-tint)]/90 text-[var(--accent-contrast)]"
        >
          <UploadCloud className="size-8" aria-hidden />
          <span className="text-sm font-semibold">
            {t("manager:media.dropHint", {
              defaultValue: "Dateien hier ablegen zum Hochladen",
            })}
          </span>
        </div>
      )}
      <div className="mb-4 flex shrink-0 flex-col gap-3">
        <PageHeader
          title={t("manager:media.title")}
          subtitle={t("manager:media.intro")}
          action={
            <>
              <Button
                type="button"
                variant="primary"
                className="shrink-0 rounded-[var(--radius-theme)]"
                onClick={openFilePicker}
                disabled={uploading}
              >
                <Upload className="size-5" aria-hidden />
                {uploading
                  ? t("manager:media.uploading")
                  : t("manager:media.upload")}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*"
                multiple
                className="hidden"
                onChange={handleUpload}
              />
            </>
          }
        />

        <label htmlFor="media-search" className="sr-only">
          {t("manager:media.search")}
        </label>
        <Input
          id="media-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("manager:media.searchPlaceholder")}
          className="min-h-11 w-full rounded-[var(--radius-theme)]"
        />

        <div
          role="group"
          aria-label={t("manager:media.filters.label", {
            defaultValue: "Quelle",
          })}
          className="flex flex-wrap items-center gap-2"
        >
          <Filter className="size-4 text-[var(--ink-faint)]" aria-hidden />
          {sourceFilters.map((entry) => (
            <FilterPill
              key={entry.key}
              active={sourceFilter === entry.key}
              onClick={() => setSourceFilter(entry.key)}
            >
              {entry.label}
            </FilterPill>
          ))}
        </div>

        <div
          role="group"
          aria-label={t("manager:media.scope.label", {
            defaultValue: "Sichtbarkeit",
          })}
          className="flex flex-wrap items-center gap-2"
        >
          {scopeFilters.map((entry) => (
            <FilterPill
              key={entry.key}
              active={scope === entry.key}
              onClick={() => setScope(entry.key)}
            >
              {entry.label}
            </FilterPill>
          ))}
        </div>

        {config.klassenEnabled && labels.length > 0 && (
          <LabelFilterPills
            labels={labels}
            activeId={labelFilter}
            onChange={setLabelFilter}
          />
        )}

        {selectionActive && (
          <div
            role="toolbar"
            aria-label={t("manager:media.bulk.selected", {
              count: selected.size,
              defaultValue: "{{count}} ausgewählt",
            })}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 outline-2 -outline-offset-2 outline-[var(--border-hairline)]"
          >
            <span className="text-sm font-semibold text-[var(--ink-muted)]">
              {t("manager:media.bulk.selected", {
                count: selected.size,
                defaultValue: "{{count}} ausgewählt",
              })}
            </span>
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="ml-auto rounded-lg"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-4" aria-hidden />
              {t("manager:media.bulk.delete", { defaultValue: "Löschen" })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              aria-label={t("common:cancel")}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <EmptyState
            icon={Images}
            headline={t("manager:media.emptyHeadline")}
            hint={t("manager:media.empty")}
            action={{
              label: t("manager:media.upload"),
              onClick: openFilePicker,
            }}
          />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          headline={t("manager:media.noResults")}
          hint={t("manager:media.search")}
          action={{
            label: t("manager:media.filters.all"),
            onClick: clearFilters,
          }}
        />
      ) : (
        <motion.div
          className={clsx(
            "grid auto-rows-min grid-cols-4 gap-2 rounded-[var(--radius-theme)] p-0.5 transition-colors sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
            dragActive &&
              "outline-2 -outline-offset-2 outline-dashed outline-[var(--color-primary)]",
          )}
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {filtered.map((item, index) => {
            const isSelected = selected.has(item.id)

            return (
              <MediaCard
                key={item.id}
                item={item}
                index={index}
                isSelected={isSelected}
                handleCardSelect={handleCardSelect}
                handleDelete={handleDelete}
              />
            )
          })}
        </motion.div>
      )}

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("manager:media.bulk.delete", { defaultValue: "Löschen" })}
        description={
          bulkDeleteWarning
            ? `${t("manager:media.bulk.deleteConfirm", {
                count: selected.size,
                defaultValue: "{{count}} Medien wirklich löschen?",
              })}\n\n${bulkDeleteWarning}`
            : t("manager:media.bulk.deleteConfirm", {
                count: selected.size,
                defaultValue: "{{count}} Medien wirklich löschen?",
              })
        }
        confirmLabel={t("common:delete")}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}

export default ConfigMedia
