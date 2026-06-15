import { EVENTS } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface MediaPickerModalProps {
  open: boolean
  onClose: () => void
  onSelect: (url: string) => void
}

const MediaPickerModal = ({
  open,
  onClose,
  onSelect,
}: MediaPickerModalProps) => {
  const { socket } = useSocket()
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [items, setItems] = useState<MediaMeta[]>([])
  const [search, setSearch] = useState("")

  const requestMedia = useCallback(() => {
    socket.emit(EVENTS.MEDIA.LIST)
  }, [socket])

  useEffect(() => {
    if (open) {
      requestMedia()
    }
  }, [open, requestMedia])

  // Move focus into the dialog on open so keyboard users land inside it.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  useEvent(
    EVENTS.MEDIA.DATA,
    useCallback((next: MediaMeta[]) => {
      setItems(next)
    }, []),
  )

  // Image media only — the question editor's library picker sets an image url.
  const images = useMemo(
    () => items.filter((item) => item.type === "image"),
    [items],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    if (!q) {
      return images
    }

    return images.filter(
      (item) =>
        item.filename.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    )
  }, [images, search])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-picker-title"
        className="flex max-h-[88svh] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-gradient-to-r from-[var(--accent-tint)] to-white px-4 py-3 sm:px-6">
          <h2
            id="media-picker-title"
            className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900"
          >
            {t("manager:mediaPicker.title", {
              defaultValue: "Aus Bibliothek wählen",
            })}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("common:cancel")}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white/70 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-gray-50 p-4 sm:p-6">
          <label htmlFor="media-picker-search" className="sr-only">
            {t("manager:mediaPicker.search", { defaultValue: "Suchen" })}
          </label>
          <Input
            id="media-picker-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("manager:mediaPicker.searchPlaceholder", {
              defaultValue: "Bilder durchsuchen …",
            })}
            className="min-h-11 w-full rounded-xl bg-white"
          />

          {images.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 outline-2 -outline-offset-2 outline-gray-200">
              {t("manager:mediaPicker.empty", {
                defaultValue:
                  "Noch keine Bilder in der Bibliothek. Lade welche im Medien-Tab hoch.",
              })}
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-gray-500 outline-2 -outline-offset-2 outline-gray-200">
              {t("manager:mediaPicker.noResults", {
                defaultValue: "Keine passenden Bilder gefunden.",
              })}
            </p>
          ) : (
            <motion.div
              className="grid auto-rows-min grid-cols-2 gap-3 p-0.5 sm:grid-cols-3"
              initial={reducedMotion ? false : { opacity: 0, y: 12 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={
                reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
              }
            >
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.url)
                    onClose()
                  }}
                  title={item.filename}
                  className="group flex min-h-11 flex-col overflow-hidden rounded-xl bg-white text-left outline-2 -outline-offset-2 outline-gray-200 transition-colors hover:outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                >
                  <div className="flex aspect-video items-center justify-center bg-gray-50">
                    <img
                      src={item.url}
                      alt={item.filename}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  </div>
                  <p
                    className="truncate px-3 py-2 text-xs font-semibold text-gray-700"
                    title={item.filename}
                  >
                    {item.filename}
                  </p>
                </button>
              ))}
            </motion.div>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common:cancel")}
          </Button>
        </footer>
      </section>
    </div>
  )
}

export default MediaPickerModal
