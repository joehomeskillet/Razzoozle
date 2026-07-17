import { EVENTS } from "@razzoozle/common/constants"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import QuestionEditor from "@razzoozle/web/features/quizz/components/QuestionEditor"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useLabelManager } from "@razzoozle/web/features/manager/components/configurations/labels/useLabelManager"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { CatalogQuestionFormProps } from "./types"
import { parseTags } from "./utils"

export const CatalogQuestionForm = ({
  mode,
  editingEntry,
  tagsValue,
  onTagsChange,
  onClose,
  onSaveStart,
  selectedLabelIds = [],
  onLabelIdsChange,
}: CatalogQuestionFormProps) => {
  const { currentQuestion } = useQuizzEditor()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { labels } = useLabelManager()
  const klassenEnabled = useManagerStore((s) => s.config?.klassenEnabled ?? false)

  const handleLabelToggle = (labelId: number) => {
    const newIds = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId]
    onLabelIdsChange?.(newIds)

    // Existing entry: assign immediately (mirrors Media/Classes pattern) instead
    // of waiting for form save. New entries have no id yet — see handleSave.
    if (klassenEnabled && mode === "edit" && editingEntry?.id) {
      socket.emit(EVENTS.LABEL.ASSIGN, {
        entityType: "catalog",
        entityId: editingEntry.id,
        labelIds: newIds,
      })
    }
  }

  const handleSave = () => {
    const { id: _id, ...question } = currentQuestion
    const tags = parseTags(tagsValue)
    const payloadTags = tags.length > 0 ? tags : undefined

    onSaveStart(mode)

    if (mode === "edit" && editingEntry) {
      socket.emit(EVENTS.CATALOG.UPDATE, {
        id: editingEntry.id,
        question,
        tags: payloadTags,
      })

      return
    }

    socket.emit(EVENTS.CATALOG.ADD, {
      question,
      tags: payloadTags,
      source: "manual",
    })
  }

  // Assign pre-selected labels when add-mode succeeds and receives the new ID
  useEvent(
    EVENTS.CATALOG.ADD_SUCCESS,
    useCallback(
      (payload: { id: string }) => {
        if (mode === "add" && selectedLabelIds.length > 0 && payload?.id) {
          socket.emit(EVENTS.LABEL.ASSIGN, {
            entityType: "catalog",
            entityId: String(payload.id),
            labelIds: selectedLabelIds,
          })
        }
      },
      [mode, selectedLabelIds, socket],
    ),
  )

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--surface-2)]">
        <div className="flex min-h-0 flex-1 flex-col">
          <QuestionEditor excludeTypes={["vokabelliste"]} />
        </div>

        <div className="flex shrink-0 flex-col gap-4 border-t border-[var(--line)] bg-[var(--surface-2)] p-4 sm:p-6">
          <section className="flex flex-col gap-2">
            <label
              htmlFor="catalog-tags"
              className="w-fit text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase"
            >
              {t("manager:catalog.tags")}
            </label>
            <div className="rounded-[var(--radius-theme)] bg-[var(--surface)] p-4 shadow-sm">
              <Input
                id="catalog-tags"
                value={tagsValue}
                onChange={(e) => onTagsChange(e.target.value)}
                placeholder={t("manager:catalog.tagsPlaceholder")}
                className="min-h-11 w-full rounded-[var(--radius-theme)]"
              />
            </div>
          </section>

          {klassenEnabled && labels.length > 0 && (
            <section className="flex flex-col gap-2">
              <label className="w-fit text-xs font-semibold tracking-wide text-[var(--ink-subtle)] uppercase">
                {t("manager:labels.assignLabel", { defaultValue: "Labels zuweisen" })}
              </label>
              <div className="rounded-[var(--radius-theme)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  {labels.length === 0 ? (
                    <p className="text-sm text-[var(--ink-subtle)]">
                      {t("manager:labels.noLabels", { defaultValue: "Keine Labels verfügbar" })}
                    </p>
                  ) : (
                    labels.map((label) => {
                      const isSelected = selectedLabelIds.includes(label.id)
                      return (
                        <Button
                          key={label.id}
                          type="button"
                          variant="ghost"
                          size="md"
                          onClick={() => handleLabelToggle(label.id)}
                          className={`rounded-full px-3 py-1.5 text-xs ${
                            isSelected
                              ? "ring-2 ring-offset-2 ring-[var(--color-primary)]"
                              : "border border-[var(--line)] hover:border-[var(--ink-medium)]"
                          }`}
                          classNameContent="gap-1.5"
                        >
                          <LabelChip label={label} />
                        </Button>
                      )
                    })
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--line)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common:cancel")}
        </Button>
        <Button type="button" variant="primary" onClick={handleSave}>
          {t("common:save")}
        </Button>
      </footer>
    </>
  )
}
