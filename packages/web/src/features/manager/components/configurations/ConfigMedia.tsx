import { EVENTS } from "@razzoozle/common/constants"
import type { MediaCategory } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import * as Dialog from "@radix-ui/react-dialog"
import clsx from "clsx"
import {
  Check,
  FileAudio,
  Filter,
  Images,
  Info,
  SearchX,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

// 8 MiB cap mirrors the theme-background upload ceiling (ConfigTheme.tsx).
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

const formatDate = (iso: string) => {
  const d = new Date(iso)

  return `${d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Categories the manager may upload into. AI-generated and theme-managed
// buckets are populated by other flows, so a manual upload defaults to the
// neutral "generated" library bucket only when nothing else is selected.
const UPLOAD_CATEGORY: MediaCategory = "generated"

// Per-card "info" affordance — keeps every card uniform/compact while the full
// metadata (category, source, exact dimensions + date, larger preview) lives
// behind a reused Radix dialog, opened from the ℹ button on each card.
const MediaInfoDialog = ({ item }: { item: MediaMeta }) => {
  const { t } = useTranslation()
  const detailsLabel = t("manager:media.details", { defaultValue: "Details" })

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={detailsLabel}
          title={detailsLabel}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-gray-400 outline-2 -outline-offset-2 outline-gray-200 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          <Info className="size-4" aria-hidden />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade-in fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
        >
          <Dialog.Title className="truncate text-lg font-semibold text-gray-900">
            {item.filename}
          </Dialog.Title>

          {item.type === "audio" ? (
            <div className="mt-4 flex aspect-video w-full items-center justify-center rounded-lg bg-gray-50">
              <FileAudio className="size-12 text-gray-300" aria-hidden />
            </div>
          ) : (
            <img
              src={item.url}
              alt=""
              className="mt-4 aspect-video w-full rounded-lg bg-gray-50 object-contain"
            />
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
              {t(`manager:media.category.${item.category}`)}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
              {t(`manager:media.source.${item.source}`)}
            </span>
          </div>

          <p className="mt-3 text-sm text-gray-500">
            {formatSize(item.size)}
            {item.type === "image" && item.width && item.height
              ? ` · ${item.width}×${item.height}`
              : ""}
            {` · ${formatDate(item.uploadedAt)}`}
          </p>

          <div className="mt-6 flex justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">
                {t("common:close", { defaultValue: "Schließen" })}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const ConfigMedia = () => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [items, setItems] = useState<MediaMeta[]>([])
  const [search, setSearch] = useState("")
  const [sourceFilter, setSourceFilter] = useState<"all" | MediaMeta["source"]>(
    "all",
  )
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  // Multi-select state keyed by media id. `anchor` is the pivot for Shift+click
  // range selection (set on the last plain/ctrl click). Pattern mirrors
  // QuizzEditorSidebar, but indexed by stable ids since `filtered` reorders.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Pending upload queue. The backend acks one upload at a time via
  // UPLOAD_SUCCESS / ERROR, so we drain the queue serially: shift the next file,
  // read it, emit, and pull again on the next ack. A ref holds the live queue so
  // the event callbacks always see the current tail without re-subscribing.
  const queueRef = useRef<File[]>([])
  // Mirror of `uploading` so the enqueue logic reads the live value without a
  // stale closure (state updates are async; the ref is set synchronously).
  const uploadingRef = useRef(false)
  // Drag-enter/leave fire per child element; a counter tracks real boundary
  // crossings so the highlight doesn't flicker over nested cards.
  const dragDepth = useRef(0)
  // Holds the latest pumpQueue so sendFile's async FileReader callbacks can
  // advance the queue without a circular useCallback dependency.
  const pumpQueueRef = useRef<() => boolean>(() => false)

  // Single source of truth for flipping the uploading flag so the ref and the
  // state never drift apart.
  const setUploadingFlag = useCallback((value: boolean) => {
    uploadingRef.current = value
    setUploading(value)
  }, [])

  const requestMedia = useCallback(() => {
    socket.emit(EVENTS.MEDIA.LIST)
  }, [socket])

  useEffect(() => {
    requestMedia()
  }, [requestMedia])

  const sendFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        socket.emit(EVENTS.MEDIA.UPLOAD, {
          filename: file.name,
          dataUrl: reader.result as string,
          category: UPLOAD_CATEGORY,
        })
      }
      reader.onerror = () => {
        toast.error(t("manager:media.uploadFailed"))
        // Surface the error but keep draining: advance to the next queued file
        // (or settle to idle) just like onload does on success.
        pumpQueueRef.current()
      }
      reader.readAsDataURL(file)
    },
    [socket, t],
  )

  // Pull the next valid file off the queue (skipping oversized ones with a
  // toast) and start its upload. Returns false when the queue is drained.
  const pumpQueue = useCallback(() => {
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()

      if (!next) {
        continue
      }

      if (next.size > MAX_UPLOAD_BYTES) {
        toast.error(t("manager:media.tooLarge"))

        continue
      }

      setUploadingFlag(true)
      sendFile(next)

      return true
    }

    setUploadingFlag(false)

    return false
  }, [sendFile, setUploadingFlag, t])

  // Keep the ref pointed at the latest pumpQueue identity.
  pumpQueueRef.current = pumpQueue

  // Validate + enqueue a batch (file picker or drop), then kick the pump if idle.
  const enqueueFiles = useCallback(
    (files: File[]) => {
      const accepted = files.filter((file) => {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(t("manager:media.tooLarge"))

          return false
        }

        return true
      })

      if (accepted.length === 0) {
        return
      }

      // Read the live uploading value via the ref so a batch enqueued right
      // after a previous one can't see a stale `false` and double-pump.
      const wasIdle = queueRef.current.length === 0 && !uploadingRef.current
      queueRef.current.push(...accepted)

      if (wasIdle) {
        pumpQueue()
      }
    },
    [pumpQueue, t],
  )

  useEvent(
    EVENTS.MEDIA.DATA,
    useCallback((next: MediaMeta[]) => {
      setItems(next)
    }, []),
  )

  useEvent(
    EVENTS.MEDIA.UPLOAD_SUCCESS,
    useCallback(() => {
      toast.success(t("manager:media.uploaded"))
      requestMedia()
      // Advance to the next queued file (or settle to idle).
      pumpQueue()
    }, [pumpQueue, requestMedia, t]),
  )

  useEvent(
    EVENTS.MEDIA.ERROR,
    useCallback(
      (message: string) => {
        toast.error(t(message, { defaultValue: message }))
        // Skip the failed item and keep draining the rest of the batch.
        pumpQueue()
      },
      [pumpQueue, t],
    ),
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

      return matchesSource && matchesSearch
    })
  }, [items, search, sourceFilter])

  // Drop any ids that no longer exist (e.g. after a delete / list refresh) so
  // the selection set can't accumulate stale entries.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const live = new Set(items.map((item) => item.id))
      const next = new Set([...prev].filter((id) => live.has(id)))

      return next.size === prev.size ? prev : next
    })
  }, [items])

  const openFilePicker = () => fileInputRef.current?.click()

  const clearFilters = () => {
    setSearch("")
    setSourceFilter("all")
  }

  const clearSelection = () => {
    setSelected(new Set())
    setAnchor(null)
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
    setAnchor(id)
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // Allow re-selecting the same file(s) after an error/completion.
    event.target.value = ""

    enqueueFiles(files)
  }

  const handleDelete = (id: string) => {
    socket.emit(EVENTS.MEDIA.DELETE, { id })
  }

  const handleBulkDelete = () => {
    selected.forEach((id) => {
      socket.emit(EVENTS.MEDIA.DELETE, { id })
    })
    // No per-id ack, so refresh the list once after firing the batch; MEDIA.DATA
    // resyncs the grid and MEDIA.ERROR (listened above) surfaces any failures.
    requestMedia()
    clearSelection()
    setBulkDeleteOpen(false)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // Required so the browser treats this element as a valid drop target.
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault()
    }
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return
    }

    dragDepth.current += 1
    setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) {
      return
    }

    dragDepth.current = Math.max(0, dragDepth.current - 1)

    if (dragDepth.current === 0) {
      setDragActive(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)

    const files = Array.from(event.dataTransfer.files ?? [])
    enqueueFiles(files)
  }

  // Card click → toggle membership. Plain click toggles a single card; Shift
  // selects the contiguous range from the anchor; Ctrl/Cmd toggles too. Range
  // operates over the currently filtered order so it matches what the user sees.
  const handleCardSelect =
    (id: string) => (event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && anchor) {
        const order = filtered.map((item) => item.id)
        const from = order.indexOf(anchor)
        const to = order.indexOf(id)

        if (from !== -1 && to !== -1) {
          const lo = Math.min(from, to)
          const hi = Math.max(from, to)
          // Union the range with the existing selection so shift-click extends
          // rather than replaces what the user already picked.
          setSelected((prev) => {
            const next = new Set(prev)
            for (const rangeId of order.slice(lo, hi + 1)) {
              next.add(rangeId)
            }

            return next
          })

          return
        }
      }

      toggleSelect(id)
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

  const selectionActive = selected.size > 0

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
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[var(--accent-tint)]/90 text-[var(--accent-contrast)]"
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {t("manager:media.title")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              {t("manager:media.intro")}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            className="shrink-0 rounded-xl"
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
            accept="image/*,audio/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        <label htmlFor="media-search" className="sr-only">
          {t("manager:media.search")}
        </label>
        <Input
          id="media-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("manager:media.searchPlaceholder")}
          className="min-h-11 w-full rounded-xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-gray-400" aria-hidden />
          {sourceFilters.map((entry) => {
            const active = sourceFilter === entry.key

            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setSourceFilter(entry.key)}
                aria-pressed={active}
                className={
                  active
                    ? "inline-flex min-h-9 items-center rounded-full bg-[var(--accent-tint)] px-3 text-sm font-semibold text-[var(--accent-contrast)] outline-2 -outline-offset-2 outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                    : "inline-flex min-h-9 items-center rounded-full bg-gray-100 px-3 text-sm font-semibold text-gray-600 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                }
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        {selectionActive && (
          <div
            role="toolbar"
            aria-label={t("manager:media.bulk.selected", {
              count: selected.size,
              defaultValue: "{{count}} ausgewählt",
            })}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 outline-2 -outline-offset-2 outline-gray-200"
          >
            <span className="text-sm font-semibold text-gray-700">
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
            <button
              type="button"
              onClick={clearSelection}
              aria-label={t("common:cancel")}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
            >
              <X className="size-4" aria-hidden />
            </button>
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
            "grid auto-rows-min grid-cols-2 gap-3 rounded-2xl p-0.5 transition-colors sm:grid-cols-3 xl:grid-cols-4",
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
              <motion.article
                key={item.id}
                aria-selected={isSelected}
                className={clsx(
                  "group relative flex flex-col overflow-hidden rounded-xl bg-white outline-2 -outline-offset-2 transition-colors",
                  isSelected
                    ? "outline-[var(--color-primary)]"
                    : "outline-gray-200",
                )}
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
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-label={t("manager:media.bulk.toggle", {
                    name: item.filename,
                    defaultValue: "{{name}} auswählen",
                  })}
                  onClick={handleCardSelect(item.id)}
                  className="absolute top-0 left-0 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-tl-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                >
                  <span
                    className={clsx(
                      "flex size-7 items-center justify-center rounded-md border-2 transition-colors",
                      isSelected
                        ? "border-[var(--color-primary)] bg-[var(--accent-contrast)] text-white"
                        : "border-gray-300 bg-white/90 text-transparent group-hover:border-gray-400",
                    )}
                  >
                    <Check className="size-4" aria-hidden />
                  </span>
                </button>

                <div className="flex aspect-video items-center justify-center bg-gray-50">
                  {item.type === "audio" ? (
                    <FileAudio className="size-10 text-gray-300" aria-hidden />
                  ) : (
                    <img
                      src={item.url}
                      alt={item.filename}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-3">
                  <p
                    className="truncate text-sm font-semibold text-gray-900"
                    title={item.filename}
                  >
                    {item.filename}
                  </p>

                  {/* At-a-glance meta stays to one line so every card is the
                      same height; the rest lives behind the ℹ info dialog. */}
                  <p className="truncate text-xs text-gray-500">
                    {formatSize(item.size)}
                    {item.type === "image" && item.width && item.height
                      ? ` · ${item.width}×${item.height}`
                      : ""}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-1">
                    <MediaInfoDialog item={item} />
                    <AlertDialog
                      trigger={
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="flex-1"
                        >
                          <Trash2 className="size-4" aria-hidden />
                          {t("manager:media.delete")}
                        </Button>
                      }
                      title={t("manager:media.delete")}
                      description={t("manager:media.deleteConfirm", {
                        name: item.filename,
                      })}
                      confirmLabel={t("common:delete")}
                      onConfirm={() => handleDelete(item.id)}
                    />
                  </div>
                </div>
              </motion.article>
            )
          })}
        </motion.div>
      )}

      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t("manager:media.bulk.delete", { defaultValue: "Löschen" })}
        description={t("manager:media.bulk.deleteConfirm", {
          count: selected.size,
          defaultValue: "{{count}} Medien wirklich löschen?",
        })}
        confirmLabel={t("common:delete")}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}

export default ConfigMedia
