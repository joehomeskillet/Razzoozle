import type { MediaMeta } from "@razzoozle/common/types/media"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useLabelManager } from "../labels/useLabelManager"
import clsx from "clsx"
import { Check, FileAudio, Film, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"

import MediaInfoDialog, { formatSize } from "./MediaInfoDialog"

const MediaCard = ({
  handleCardSelect,
  handleDelete,
  index,
  isSelected,
  item,
}: {
  handleCardSelect: (
    id: string,
  ) => (event: MouseEvent<HTMLButtonElement>) => void
  handleDelete: (id: string) => void
  index: number
  isSelected: boolean
  item: MediaMeta
}) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const config = useConfig()
  const { labels } = useLabelManager()

  const itemLabels = (item.labelIds ?? [])
    .map((labelId) => labels.find((l) => l.id === labelId))
    .filter((l) => l !== undefined)

  return (
    <motion.article
      key={item.id}
      aria-selected={isSelected}
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface)] outline-2 -outline-offset-2 transition-colors",
        isSelected
          ? "outline-[var(--color-primary)]"
          : "outline-[var(--border-hairline)]",
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
              ? "border-[var(--color-primary)] bg-[var(--accent-contrast)] text-white" /* token-ok: white-on-accent-contrast, AA per tokens.css */
              : "border-[var(--line)] bg-[var(--surface)]/90 text-transparent group-hover:border-[var(--ink-faint)]",
          )}
        >
          <Check className="size-4" aria-hidden />
        </span>
      </button>

      <div className="flex aspect-video items-center justify-center bg-[var(--surface-2)]">
        {item.type === "audio" ? (
          <FileAudio className="size-10 text-[var(--ink-faint)]" aria-hidden />
        ) : item.type === "video" ? (
          <Film className="size-10 text-[var(--ink-faint)]" aria-hidden />
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
          className="truncate text-sm font-semibold text-[var(--ink)]"
          title={item.filename}
        >
          {item.filename}
        </p>

        {/* At-a-glance meta stays to one line so every card is the
            same height; the rest lives behind the ℹ info dialog. */}
        <p className="truncate text-xs text-[var(--ink-subtle)]">
          {formatSize(item.size)}
          {item.type === "image" && item.width && item.height
            ? ` · ${item.width}×${item.height}`
            : ""}
          {config.klassenEnabled && itemLabels.length > 0
            ? ` · ${itemLabels.map((l) => l.name).join(", ")}`
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
}

export default MediaCard
