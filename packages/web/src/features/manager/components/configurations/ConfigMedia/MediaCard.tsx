import type { MediaMeta } from "@razzoozle/common/types/media"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Badge from "@razzoozle/web/components/manager/Badge"
import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Check, FileAudio, Film, Info, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import type { MouseEvent } from "react"
import { useMemo, useRef, useState } from "react"
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialogTriggerRef = useRef<HTMLButtonElement>(null)

  const usageCount = item.usage?.length ?? 0
  const quizTitles = useMemo(() => {
    if (!item.usage || item.usage.length === 0) return ""
    return item.usage.map((entry) => entry.quizTitle).join(", ")
  }, [item.usage])

  const deleteWarningText = useMemo(() => {
    if (usageCount === 0) return null
    return t("manager:media.usage.deleteWarning", {
      count: usageCount,
    })
  }, [t, usageCount])

  return (
    <motion.article
      key={item.id}
      role="option"
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
      {/* Checkbox overlay — always visible, top-left */}
      <Button
        type="button"
        role="checkbox"
        aria-checked={isSelected}
        aria-label={t("manager:media.bulk.toggle", {
          name: item.filename,
          defaultValue: "{{name}} auswählen",
        })}
        onClick={handleCardSelect(item.id)}
        variant="ghost"
        size="icon"
        className="absolute top-0 left-0 z-10 rounded-tl-[var(--radius-theme)] focus-visible:-outline-offset-2"
      >
        <span
          className={clsx(
            "flex size-6 items-center justify-center rounded-lg border-2 transition-colors",
            isSelected
              ? "border-[var(--color-primary)] bg-[var(--accent-contrast)] text-white" /* token-ok: white-on-accent-contrast, AA per tokens.css */
              : "border-[var(--line)] bg-[var(--surface)]/90 text-transparent group-hover:border-[var(--ink-faint)]",
          )}
        >
          <Check className="size-3" aria-hidden />
        </span>
      </Button>

      {/* Thumbnail — square, responsive; click opens details dialog */}
      <div
        className="flex aspect-square items-center justify-center bg-[var(--surface-2)] cursor-pointer relative"
        onClick={() => setDialogOpen(true)}
      >
        {item.type === "audio" ? (
          <FileAudio className="size-8 text-[var(--ink-faint)]" aria-hidden />
        ) : item.type === "video" ? (
          <Film className="size-8 text-[var(--ink-faint)]" aria-hidden />
        ) : (
          <img
            src={item.url}
            alt={item.filename}
            loading="lazy"
            className="size-full object-cover"
          />
        )}

        {/* Usage badge — top-right, only when used */}
        {usageCount > 0 && (
          <div className="absolute top-2 right-2 z-20" title={quizTitles}>
            <Badge
              className="bg-[var(--status-online-bg)] text-[var(--status-online-text)]"
              aria-label={t("manager:media.usage.count", {
                count: usageCount,
                defaultValue: "Used in {{count}} question(s)",
              })}
            >
              {t("manager:media.usageBadge", {
                count: usageCount,
                defaultValue: "{{count}}×",
              })}
            </Badge>
          </div>
        )}

        {/* Hover overlay — info + delete buttons, hidden by default */}
        <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <Button
            ref={dialogTriggerRef}
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-lg bg-[var(--surface)]/90 text-[var(--ink)] hover:bg-[var(--surface)]"
            onClick={(e) => {
              e.stopPropagation()
              setDialogOpen(true)
            }}
            aria-label={t("manager:media.details", { defaultValue: "Details" })}
          >
            <Info className="size-4" aria-hidden />
          </Button>
          <AlertDialog
            trigger={
              <Button
                onClick={(e) => e.stopPropagation()}
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 rounded-lg bg-[var(--state-wrong-soft)] text-[var(--state-wrong)] hover:bg-[var(--state-wrong)]/20"
                aria-label={t("manager:media.delete")}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            }
            title={t("manager:media.delete")}
            description={
              deleteWarningText
                ? `${t("manager:media.deleteConfirm", {
                    name: item.filename,
                  })}\n\n${deleteWarningText}`
                : t("manager:media.deleteConfirm", {
                    name: item.filename,
                  })
            }
            confirmLabel={t("common:delete")}
            onConfirm={() => handleDelete(item.id)}
          />
        </div>
      </div>

      {/* Compact meta line — ONE line only: filename · size · dims */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
        <p className="truncate text-xs font-semibold text-[var(--ink)]" title={item.filename}>
          {item.filename} · {formatSize(item.size)}
          {item.type === "image" && item.width && item.height
            ? ` · ${item.width}×${item.height}`
            : ""}
        </p>
      </div>

      {/* Info dialog — triggered by click or external state */}
      <MediaInfoDialog
        item={item}
        open={dialogOpen}
        onOpenChange={setDialogOpen}

      />
    </motion.article>
  )
}

export default MediaCard
