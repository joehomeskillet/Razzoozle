import type { MediaMeta } from "@razzoozle/common/types/media"
import Button from "@razzoozle/web/components/Button"
import * as Dialog from "@radix-ui/react-dialog"
import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

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

export const formatSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

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
            <audio controls src={item.url} className="mt-4 w-full" />
          ) : item.type === "video" ? (
            <video
              controls
              src={item.url}
              className="mt-4 aspect-video w-full rounded-lg bg-gray-50"
            />
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

export default MediaInfoDialog
