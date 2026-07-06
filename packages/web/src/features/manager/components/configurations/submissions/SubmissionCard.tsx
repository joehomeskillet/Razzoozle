import { SUBMISSION_CATEGORIES } from "@razzoozle/common/constants"
import type { SubmissionCategory } from "@razzoozle/common/constants"
import type { Question, QuizzMeta } from "@razzoozle/common/types/game"
import type {
  Submission,
  SubmissionMeta,
} from "@razzoozle/common/types/submission"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import clsx from "clsx"
import { Check, ChevronDown } from "lucide-react"
import { motion } from "motion/react"
import type { Dispatch, SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { formatDate } from "./formatDate"
import { QuestionPreview } from "./QuestionPreview"
import { StatusBadge } from "./StatusBadge"

interface SubmissionCardProps {
  s: SubmissionMeta
  index: number
  reducedMotion: boolean | null
  previewId: string | null
  editingId: string | null
  editValue: string
  setEditValue: Dispatch<SetStateAction<string>>
  approvingId: string | null
  approveToCatalog: boolean
  setApproveToCatalog: Dispatch<SetStateAction<boolean>>
  rejectingId: string | null
  rejectReason: string
  setRejectReason: Dispatch<SetStateAction<string>>
  rejectCategory: SubmissionCategory | ""
  setRejectCategory: Dispatch<SetStateAction<SubmissionCategory | "">>
  quizzList: QuizzMeta[]
  fullById: (id: string) => Question | undefined
  recordById: (id: string) => Submission | undefined
  handleOpenApprove: (id: string) => () => void
  handleApprove: (id: string, quizzId: string) => () => void
  handleApproveToCatalog: (id: string) => () => void
  handleOpenEdit: (id: string, question: string) => () => void
  handleSaveEdit: (id: string) => () => void
  handleCancelEdit: () => void
  handleOpenReject: (id: string) => () => void
  handleCancelReject: () => void
  handleReject: (id: string) => () => void
  handleTogglePreview: (id: string) => () => void
}

const SubmissionCard = ({
  s,
  index,
  reducedMotion,
  previewId,
  editingId,
  editValue,
  setEditValue,
  approvingId,
  approveToCatalog,
  setApproveToCatalog,
  rejectingId,
  rejectReason,
  setRejectReason,
  rejectCategory,
  setRejectCategory,
  quizzList,
  fullById,
  recordById,
  handleOpenApprove,
  handleApprove,
  handleApproveToCatalog,
  handleOpenEdit,
  handleSaveEdit,
  handleCancelEdit,
  handleOpenReject,
  handleCancelReject,
  handleReject,
  handleTogglePreview,
}: SubmissionCardProps) => {
  const { t } = useTranslation()

  const previewOpen = previewId === s.id
  const fullQuestion = fullById(s.id)
  const isPending = s.status === "pending"

  return (
    <motion.div
      className="rounded-xl bg-white p-4 outline-2 -outline-offset-2 outline-gray-200"
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
      {!isPending &&
        (() => {
          const rejRecord = recordById(s.id)

          return (
            <div className="mb-2 space-y-1.5">
              <StatusBadge status={s.status} />
              {/* WP-17 — surface the moderator note on rejected cards. */}
              {s.status === "rejected" && rejRecord?.rejectionReason && (
                <p className="text-sm text-red-700">
                  {t("manager:submissions.rejectedBecause", {
                    reason: rejRecord?.rejectionReason,
                    defaultValue: "Abgelehnt: {{reason}}",
                  })}
                </p>
              )}
            </div>
          )
        })()}

      {isPending && editingId === s.id ? (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          variant="sm"
          className="min-h-11 w-full rounded-lg"
          aria-label={t("manager:submissions.edit")}
        />
      ) : (
        <p className="line-clamp-2 font-semibold text-gray-900">{s.question}</p>
      )}

      <p className="mt-1 text-sm text-gray-500">
        {t("manager:submissions.submittedBy", {
          name: s.submittedBy,
        })}
        {" · "}
        {t("manager:submissions.submittedAt", {
          date: formatDate(s.submittedAt),
        })}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {isPending && (
          <>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11"
              onClick={handleOpenApprove(s.id)}
            >
              {t("manager:submissions.approve")}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={handleOpenEdit(s.id, s.question)}
            >
              {t("manager:submissions.edit")}
            </Button>
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={handleTogglePreview(s.id)}
          aria-expanded={previewOpen}
          classNameContent="gap-1.5"
        >
          {previewOpen
            ? t("manager:submissions.hidePreview")
            : t("manager:submissions.preview")}
          <ChevronDown
            className={clsx(
              "size-4 transition-transform",
              previewOpen && "rotate-180",
            )}
            aria-hidden
          />
        </Button>

        {isPending && editingId === s.id && (
          <>
            <Button
              variant="primary"
              size="sm"
              className="min-h-11"
              onClick={handleSaveEdit(s.id)}
            >
              {t("common:save")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={handleCancelEdit}
            >
              {t("common:cancel")}
            </Button>
          </>
        )}

        {isPending && (
          <Button
            variant="danger"
            size="sm"
            className="min-h-11"
            onClick={handleOpenReject(s.id)}
            aria-expanded={rejectingId === s.id}
          >
            {t("manager:submissions.reject")}
          </Button>
        )}
      </div>

      {previewOpen &&
        (fullQuestion ? (
          <QuestionPreview question={fullQuestion} />
        ) : (
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
            {t("manager:submissions.previewLabels.loading")}
          </p>
        ))}

      {isPending && approvingId === s.id && (
        <div className="mt-3 space-y-2 rounded-lg bg-gray-50 p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={approveToCatalog}
              onChange={(event) => setApproveToCatalog(event.target.checked)}
              className="accent-primary focus-visible:outline-primary size-5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <span>{t("manager:catalog.approveToCatalog")}</span>
          </label>
          <p className="text-sm text-gray-500">
            {t("manager:catalog.approveToCatalogHint")}
          </p>
          {!approveToCatalog && (
            <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              {t("manager:submissions.selectQuizz")}
            </p>
          )}
          {approveToCatalog ? (
            <Button
              variant="primary"
              size="sm"
              type="button"
              className="min-h-11 w-full p-3 font-medium"
              onClick={handleApproveToCatalog(s.id)}
            >
              {t("manager:catalog.approveToCatalog")}
            </Button>
          ) : quizzList.length === 0 ? (
            <p className="text-sm text-gray-500">
              {t("manager:quizz.notFound")}
            </p>
          ) : (
            quizzList.map((quizz) => (
              <Button
                key={quizz.id}
                variant="secondary"
                size="sm"
                type="button"
                className="min-h-11 w-full p-3 font-medium"
                classNameContent="w-full justify-between gap-2"
                onClick={handleApprove(s.id, quizz.id)}
              >
                <span className="min-w-0 truncate text-gray-900">
                  {quizz.subject}
                </span>
                <Check
                  className="size-5 shrink-0 text-[var(--accent-contrast)]"
                  aria-hidden
                />
              </Button>
            ))
          )}
        </div>
      )}

      {/* WP-17 — inline reject form: optional reason note + optional
          category override, then a confirm dialog. */}
      {isPending && rejectingId === s.id && (
        <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3">
          <div className="space-y-1.5">
            <label
              htmlFor={`reject-reason-${s.id}`}
              className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              {t("manager:submissions.rejectReason.label", {
                defaultValue: "Begründung (optional)",
              })}
            </label>
            <textarea
              id={`reject-reason-${s.id}`}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t("manager:submissions.rejectReason.placeholder", {
                defaultValue: "Warum wird diese Frage abgelehnt?",
              })}
              className="focus-visible:outline-primary w-full resize-y rounded-lg bg-white px-3 py-2 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-200 focus-visible:outline-2 focus-visible:-outline-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor={`reject-category-${s.id}`}
              className="text-xs font-semibold tracking-wide text-gray-500 uppercase"
            >
              {t("manager:submissions.category.label", {
                defaultValue: "Kategorie",
              })}
            </label>
            <select
              id={`reject-category-${s.id}`}
              value={rejectCategory}
              onChange={(event) =>
                setRejectCategory(event.target.value as SubmissionCategory | "")
              }
              className="focus-visible:outline-primary min-h-11 w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-900 outline-1 -outline-offset-1 outline-gray-200 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <option value="">—</option>
              {SUBMISSION_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {t(`manager:submissions.category.${cat}`, {
                    defaultValue: cat,
                  })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <AlertDialog
              trigger={
                <Button variant="danger" size="sm" className="min-h-11">
                  {t("manager:submissions.reject")}
                </Button>
              }
              title={t("manager:submissions.reject")}
              description={t("manager:submissions.confirmReject")}
              confirmLabel={t("common:delete")}
              onConfirm={handleReject(s.id)}
            />
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              onClick={handleCancelReject}
            >
              {t("common:cancel")}
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export { SubmissionCard }
