import { EVENTS } from "@razzia/common/constants"
import type { MediaCategory } from "@razzia/common/constants"
import type { MediaMeta } from "@razzia/common/types/media"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzia/web/features/manager/components/console"
import {
  FileAudio,
  Filter,
  Images,
  SearchX,
  Trash2,
  Upload,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type ChangeEvent,
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

  const requestMedia = useCallback(() => {
    socket.emit(EVENTS.MEDIA.LIST)
  }, [socket])

  useEffect(() => {
    requestMedia()
  }, [requestMedia])

  useEvent(
    EVENTS.MEDIA.DATA,
    useCallback((next: MediaMeta[]) => {
      setItems(next)
    }, []),
  )

  useEvent(
    EVENTS.MEDIA.UPLOAD_SUCCESS,
    useCallback(() => {
      setUploading(false)
      toast.success(t("manager:media.uploaded"))
      requestMedia()
    }, [requestMedia, t]),
  )

  useEvent(
    EVENTS.MEDIA.ERROR,
    useCallback(
      (message: string) => {
        setUploading(false)
        toast.error(t(message))
      },
      [t],
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

  const openFilePicker = () => fileInputRef.current?.click()

  const clearFilters = () => {
    setSearch("")
    setSourceFilter("all")
  }

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Allow re-selecting the same file after an error/completion.
    event.target.value = ""

    if (!file) {
      return
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(t("manager:media.tooLarge"))

      return
    }

    setUploading(true)

    const reader = new FileReader()
    reader.onload = () => {
      socket.emit(EVENTS.MEDIA.UPLOAD, {
        filename: file.name,
        dataUrl: reader.result as string,
        category: UPLOAD_CATEGORY,
      })
    }
    reader.onerror = () => {
      setUploading(false)
      toast.error(t("manager:media.uploadFailed"))
    }
    reader.readAsDataURL(file)
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
          className="grid auto-rows-min grid-cols-2 gap-3 p-0.5 sm:grid-cols-3 xl:grid-cols-4"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {filtered.map((item, index) => (
            <motion.article
              key={item.id}
              className="flex flex-col overflow-hidden rounded-xl bg-white outline-2 -outline-offset-2 outline-gray-200"
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

                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                    {t(`manager:media.category.${item.category}`)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                    {t(`manager:media.source.${item.source}`)}
                  </span>
                </div>

                <p className="text-xs text-gray-500">
                  {formatSize(item.size)} · {formatDate(item.uploadedAt)}
                </p>

                <div className="mt-auto pt-1">
                  <AlertDialog
                    trigger={
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="w-full"
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
          ))}
        </motion.div>
      )}
    </div>
  )
}

export default ConfigMedia
