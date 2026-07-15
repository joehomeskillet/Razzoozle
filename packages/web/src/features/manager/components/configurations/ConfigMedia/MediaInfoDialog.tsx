import { EVENTS } from "@razzoozle/common/constants"
import type { MediaMeta } from "@razzoozle/common/types/media"
import Badge from "@razzoozle/web/components/manager/Badge"
import Button from "@razzoozle/web/components/Button"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import {
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { useLabelManager } from "../labels/useLabelManager"
import * as Dialog from "@radix-ui/react-dialog"
import * as Select from "@radix-ui/react-select"
import { Info, Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
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
  const { socket } = useSocket()
  const config = useConfig()
  const { labels } = useLabelManager()
  const [selectedLabelId, setSelectedLabelId] = useState<string>("")
  const [localLabelIds, setLocalLabelIds] = useState<number[]>(item.labelIds ?? [])

  const detailsLabel = t("manager:media.details", { defaultValue: "Details" })

  const itemLabels = useMemo(
    () => localLabelIds
      .map((labelId) => labels.find((l) => l.id === labelId))
      .filter((l) => l !== undefined),
    [localLabelIds, labels],
  )

  const availableLabels = useMemo(
    () => labels.filter((l) => !localLabelIds.includes(l.id)),
    [labels, localLabelIds],
  )

  const handleAddLabel = useCallback(
    (labelId: string) => {
      const id = Number(labelId)
      if (id && !localLabelIds.includes(id)) {
        const newLabelIds = [...localLabelIds, id]
        setLocalLabelIds(newLabelIds)
        socket.emit(EVENTS.LABEL.ASSIGN, {
          entityType: "media",
          entityId: item.id,
          labelIds: newLabelIds,
        })
        setSelectedLabelId("")
      }
    },
    [localLabelIds, socket, item.id],
  )

  const handleRemoveLabel = useCallback((labelId: number) => {
    const newLabelIds = localLabelIds.filter((id) => id !== labelId)
    setLocalLabelIds(newLabelIds)
    socket.emit(EVENTS.LABEL.ASSIGN, {
      entityType: "media",
      entityId: item.id,
      labelIds: newLabelIds,
    })
  }, [localLabelIds, socket, item.id])

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={detailsLabel}
          title={detailsLabel}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-faint)] outline-2 -outline-offset-2 outline-gray-200 transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--ink-medium)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
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
          <Dialog.Title className="truncate text-lg font-semibold text-[var(--ink)]">
            {item.filename}
          </Dialog.Title>

          {item.type === "audio" ? (
            <audio controls src={item.url} className="mt-4 w-full" />
          ) : item.type === "video" ? (
            <video
              controls
              src={item.url}
              className="mt-4 aspect-video w-full rounded-lg bg-[var(--surface-2)]"
            />
          ) : (
            <img
              src={item.url}
              alt=""
              className="mt-4 aspect-video w-full rounded-lg bg-[var(--surface-2)] object-contain"
            />
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge className="inline-flex items-center rounded-full bg-[var(--surface-4)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-muted)]">
              {t(`manager:media.category.${item.category}`)}
            </Badge>
            <span className="inline-flex items-center rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs font-semibold text-[var(--ink-medium)]">
              {t(`manager:media.source.${item.source}`)}
            </span>
          </div>

          <p className="mt-3 text-sm text-[var(--ink-subtle)]">
            {formatSize(item.size)}
            {item.type === "image" && item.width && item.height
              ? ` · ${item.width}×${item.height}`
              : ""}
            {` · ${formatDate(item.uploadedAt)}`}
          </p>

          {config.klassenEnabled && (
            <div className="mt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-[var(--ink)]">
                  {t("manager:labels.assignLabel", { defaultValue: "Fächer" })}
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {itemLabels.map((label) => (
                    <LabelChip
                      key={label.id}
                      label={label}
                      onRemove={() => handleRemoveLabel(label.id)}
                    />
                  ))}
                  {availableLabels.length > 0 && (
                    <Select.Root
                      value={selectedLabelId}
                      onValueChange={handleAddLabel}
                    >
                      <Select.Trigger
                        aria-label={t("manager:labels.addLabel")}
                        className="focus-visible:outline-primary flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2 py-0.5 text-xs font-medium text-[var(--ink-medium)] hover:bg-[var(--surface-2)]"
                      >
                        <Plus className="size-3" />
                        <Select.Value
                          placeholder={t("manager:labels.addLabel", {
                            defaultValue: "+ Fach",
                          })}
                        />
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          position="popper"
                          sideOffset={4}
                          className="z-50 min-w-32 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] shadow-md"
                        >
                          <Select.Viewport className="p-1">
                            {availableLabels.map((label) => (
                              <Select.Item
                                key={label.id}
                                value={String(label.id)}
                                className="flex cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm text-[var(--ink-muted)] outline-none hover:bg-[var(--surface-3)] focus:bg-[var(--surface-3)]"
                              >
                                <Select.ItemText>{label.name}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  )}
                </div>
              </div>
            </div>
          )}

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
