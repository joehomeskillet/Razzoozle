import Button from "@razzoozle/web/components/Button"
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
  SearchX,
  SquarePen,
  Trash2,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

import type { useQuizzManager } from "./useQuizzManager"

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
>

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
}: QuizzListProps) => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

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
      {activeQuizz.map((q, index) => (
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
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-gray-100">
              <span className="sr-only">
                {t("manager:quizz.selectQuiz", {
                  name: q.subject,
                  defaultValue: '„{{name}}“ auswählen',
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
              title={q.subject}
              className="min-w-0 flex-1"
              meta={
                q.questionCount != null
                  ? t("manager:catalog.count", { count: q.questionCount })
                  : undefined
              }
              actions={[
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
              ]}
            />
          </div>
        </motion.div>
      ))}

      {archivedQuizz.length > 0 && (
        <div className="space-y-3 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {t("manager:quizz.archivedSection")}
              </p>
              {showArchived && (
                <p className="mt-1 text-sm text-gray-500">
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
            archivedQuizz.map((q, index) => (
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
                <ListRow
                  title={q.subject}
                  meta={
                    q.questionCount != null
                      ? t("manager:catalog.count", {
                          count: q.questionCount,
                        })
                      : t("manager:quizz.archived")
                  }
                  className="opacity-85"
                  actions={[
                    {
                      key: "restore",
                      icon: ArchiveRestore,
                      label: t("manager:quizz.unarchive"),
                      onClick: () => handleArchived(q.id, false),
                    },
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
                  ]}
                />
              </motion.div>
            ))}
        </div>
      )}
    </motion.div>
  )
}

export default QuizzList
