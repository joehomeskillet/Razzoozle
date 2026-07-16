import * as Select from "@radix-ui/react-select"
import Button from "@razzoozle/web/components/Button"
import LabelChip from "@razzoozle/web/components/labels/LabelChip"
import type { Label } from "@razzoozle/web/components/labels/LabelChip"
import { assignTriggerClass } from "@razzoozle/web/components/manager/Badge"
import OverflowMenu from "@razzoozle/web/components/manager/OverflowMenu"
import type { QuizzMeta } from "@razzoozle/common/types/game"
import {
  EmptyState,
  ListRow,
} from "@razzoozle/web/features/manager/components/console"
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  ListChecks,
  Plus,
  SearchX,
  SquarePen,
  Trash2,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { EVENTS } from "@razzoozle/common/constants"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"

import type { useQuizzManager } from "./useQuizzManager"
import type { ListRowAction } from "@razzoozle/web/features/manager/components/console"

type QuizzListProps = Pick<
  ReturnType<typeof useQuizzManager>,
  | "quizz"
  | "hasMatches"
  | "activeQuizz"
  | "archivedQuizz"
  | "selected"
  | "showArchived"
  | "navigate"
  | "toggleSelect"
  | "handleExport"
  | "handleArchived"
  | "setPendingDelete"
  | "setPendingDuplicate"
  | "setShowArchived"
> & {
  labels: Label[]
}

const QuizzList = ({
  quizz,
  hasMatches,
  activeQuizz,
  archivedQuizz,
  selected,
  showArchived,
  navigate,
  toggleSelect,
  handleExport,
  handleArchived,
  setPendingDelete,
  setPendingDuplicate,
  setShowArchived,
  labels,
}: QuizzListProps) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const { klassenEnabled } = useConfig()
  const reducedMotion = useReducedMotion()
  const [assigningLabelTo, setAssigningLabelTo] = useState<string | null>(null)

  const handleLabelAssign = (quizzId: string, labelIds: number[]) => {
    socket.emit(EVENTS.LABEL.ASSIGN, {
      entityType: "quizz",
      entityId: quizzId,
      labelIds,
    })
    setAssigningLabelTo(null)
  }

  const getLabelMap = (q: QuizzMeta) => {
    const assigned = new Map(labels.map((l: Label) => [l.id, l]))
    return (q.labelIds ?? []).map((id: number) => assigned.get(id)).filter((l: Label | undefined) => l) as Label[]
  }

  const buildActions = (q: QuizzMeta): ListRowAction[] => [
    {
      key: "edit",
      icon: SquarePen,
      label: t("manager:quizz.edit", { name: q.subject }),
      onClick: () => {
        void navigate({
          to: "/manager/quizz/$quizzId",
          params: { quizzId: q.id },
        })
      },
    },
    {
      key: "duplicate",
      icon: Copy,
      label: t("manager:quizz.duplicate", { name: q.subject }),
      onClick: () =>
        setPendingDuplicate({ id: q.id, subject: q.subject }),
    },
    {
      key: "export",
      icon: Download,
      label: t("manager:quizz.export", { name: q.subject }),
      onClick: () => handleExport(q.id),
    },
    {
      key: "archive",
      icon: Archive,
      label: t("manager:quizz.archive"),
      onClick: () => handleArchived(q.id, true),
    },
    {
      key: "delete",
      icon: Trash2,
      label: t("manager:quizz.delete"),
      destructive: true,
      onClick: () =>
        setPendingDelete({ id: q.id, subject: q.subject }),
    },
  ]

  // D22d: >3 actions → 2 inline + Shared-OverflowMenu (order preserved,
  // destructive last), on every viewport — no longer mobile-gated.
  const ACTION_SPLIT_THRESHOLD = 3

  const getPrimaryActions = (actions: ListRowAction[]): ListRowAction[] =>
    actions.length > ACTION_SPLIT_THRESHOLD ? actions.slice(0, 2) : actions

  const getOverflowActions = (actions: ListRowAction[]): ListRowAction[] =>
    actions.length > ACTION_SPLIT_THRESHOLD ? actions.slice(2) : []

  return quizz.length === 0 ? (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <EmptyState
        icon={ListChecks}
        headline={t("manager:quizz.none")}
        hint={t("manager:quizz.pleaseCreate")}
        action={{
          label: t("manager:quizz.create"),
          onClick: () => {
            void navigate({ to: "/manager/quizz" })
          },
        }}
      />
    </div>
  ) : !hasMatches ? (
    <EmptyState
      icon={SearchX}
      headline={t("manager:quizz.noResults", {
        defaultValue: "Keine Treffer",
      })}
      hint={t("manager:quizz.noResultsHint", {
        defaultValue: "Passe deinen Suchbegriff an.",
      })}
    />
  ) : (
    <motion.div
      className="min-h-0 flex-1 space-y-3 p-0.5"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      {activeQuizz.map((q, index) => {
        const assignedLabels = getLabelMap(q)
        const availableLabels = labels.filter((l: Label) => !assignedLabels.some((al: Label) => al.id === l.id))
        const allActions = buildActions(q)
        const visibleActions = getPrimaryActions(allActions)
        const overflowActions = getOverflowActions(allActions)

        return (
          <motion.div
            key={q.id}
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
            <div className="flex items-center gap-2">
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-3)]">
                <span className="sr-only">
                  {t("manager:quizz.selectQuiz", {
                    name: q.subject,
                    defaultValue: '„{{name}}" auswählen',
                  })}
                </span>
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggleSelect(q.id)}
                  className="size-5 cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                />
              </label>
              <ListRow
                leading={<ListChecks className="size-5 shrink-0 text-[var(--ink-muted)]" />}
                title={q.subject}
                className="min-w-0 flex-1"
                meta={
                  q.questionCount != null ? (
                    <span className="text-xs text-[var(--ink-subtle)]">
                      {t("manager:catalog.count", { count: q.questionCount })}
                    </span>
                  ) : undefined
                }
                actions={visibleActions}
                footer={
                  klassenEnabled && (assignedLabels.length > 0 || availableLabels.length > 0) ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assignedLabels.map((label: Label) => (
                        <LabelChip
                          key={label.id}
                          label={label}
                          onRemove={() => {
                            const newLabelIds = (q.labelIds ?? []).filter((id: number) => id !== label.id)
                            handleLabelAssign(q.id, newLabelIds)
                          }}
                        />
                      ))}

                      {availableLabels.length > 0 && (
                        <Select.Root
                          value={assigningLabelTo === q.id ? "" : ""}
                          onValueChange={(val: string) => {
                            const newLabelIds = [...(q.labelIds ?? []), Number(val)]
                            handleLabelAssign(q.id, newLabelIds)
                          }}
                        >
                          <Select.Trigger
                            aria-label={t("manager:labels.assignLabel", {
                              defaultValue: "Label zuweisen",
                            })}
                            onPointerDown={(e) => e.stopPropagation()}
                            className={assignTriggerClass}
                          >
                            <Plus className="size-3" />
                            <Select.Value
                              placeholder={t("manager:labels.assignTitle", {
                                defaultValue: "+ Fach",
                              })}
                            />
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content
                              position="popper"
                              sideOffset={4}
                              onCloseAutoFocus={(e) => e.preventDefault()}
                              className="z-50 min-w-32 overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] shadow-md"
                            >
                              <Select.Viewport className="p-1">
                                {availableLabels.map((label: Label) => (
                                  <Select.Item
                                    key={label.id}
                                    value={String(label.id)}
                                    className="flex cursor-pointer items-center rounded-sm px-3 py-1.5 text-sm text-[var(--ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] hover:bg-[var(--surface-3)] focus:bg-[var(--surface-3)]"
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
                  ) : undefined
                }
              />
              {overflowActions.length > 0 && (
                <OverflowMenu actions={overflowActions} />
              )}
            </div>
          </motion.div>
        )
      })}

      {archivedQuizz.length > 0 && (
        <div className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--ink-muted)]">
                {t("manager:quizz.archivedSection")}
              </p>
              {showArchived && (
                <p className="mt-1 text-sm text-[var(--ink-subtle)]">
                  {t("manager:quizz.archivedHint")}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived((current) => !current)}
              aria-expanded={showArchived}
            >
              {showArchived
                ? t("manager:quizz.hideArchived")
                : t("manager:quizz.showArchived")}
            </Button>
          </div>

          {showArchived &&
            archivedQuizz.map((q, index) => {
              // D22d archived order: edit → export → restore → delete (destructive last).
              const allActions: ListRowAction[] = [
                {
                  key: "edit",
                  icon: SquarePen,
                  label: t("manager:quizz.edit", {
                    name: q.subject,
                  }),
                  onClick: () => {
                    void navigate({
                      to: "/manager/quizz/$quizzId",
                      params: { quizzId: q.id },
                    })
                  },
                },
                {
                  key: "export",
                  icon: Download,
                  label: t("manager:quizz.export", { name: q.subject }),
                  onClick: () => handleExport(q.id),
                },
                {
                  key: "restore",
                  icon: ArchiveRestore,
                  label: t("manager:quizz.unarchive"),
                  onClick: () => handleArchived(q.id, false),
                },
                {
                  key: "delete",
                  icon: Trash2,
                  label: t("manager:quizz.delete"),
                  destructive: true,
                  onClick: () =>
                    setPendingDelete({
                      id: q.id,
                      subject: q.subject,
                    }),
                },
              ]
              const visibleActions = getPrimaryActions(allActions)
              const overflowActions = getOverflowActions(allActions)

              return (
                <motion.div
                  key={q.id}
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
                  <div className="flex items-center gap-2">
                    <ListRow
                      leading={<ListChecks className="size-5 shrink-0 text-[var(--ink-muted)]" />}
                      title={q.subject}
                      meta={
                        <span className="text-xs text-[var(--ink-subtle)]">
                          {q.questionCount != null
                            ? t("manager:catalog.count", {
                                count: q.questionCount,
                              })
                            : t("manager:quizz.archived")}
                        </span>
                      }
                      className="min-w-0 flex-1 opacity-85"
                      actions={visibleActions}
                    />
                    {overflowActions.length > 0 && (
                      <OverflowMenu actions={overflowActions} />
                    )}
                  </div>
                </motion.div>
              )
            })}
        </div>
      )}
    </motion.div>
  )
}

export default QuizzList
