import { EVENTS } from "@razzoozle/common/constants"
import type { SubmissionCategory } from "@razzoozle/common/constants"
import type {
  Submission,
  SubmissionStatus,
} from "@razzoozle/common/types/submission"
import FilterPill from "@razzoozle/web/components/manager/FilterPill"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { EmptyState } from "@razzoozle/web/features/manager/components/console"
import { useConfig } from "@razzoozle/web/features/manager/contexts/config-context"
import { CheckCircle2, Filter, Inbox, XCircle } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { SubmissionCard } from "./SubmissionCard"
import { SubmitLinkCard } from "./SubmitLinkCard"

const ConfigSubmissions = () => {
  const { socket } = useSocket()
  const { submissions, quizz: quizzList } = useConfig()
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus>("pending")
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveToCatalog, setApproveToCatalog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [previewId, setPreviewId] = useState<string | null>(null)
  // WP-17 — moderator reject form: which card's reject panel is open + the
  // optional reason note and optional category override captured before confirm.
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectCategory, setRejectCategory] = useState<SubmissionCategory | "">(
    "",
  )
  // Full submissions (with the complete question object) fetched over the
  // existing socket contract; the config-context list is meta-only (text).
  const [full, setFull] = useState<Submission[]>([])
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  // Request the full submissions on mount; refresh after any moderation action
  // so a just-approved/rejected/edited question drops out of the preview cache.
  const requestFull = useCallback(() => {
    socket.emit(EVENTS.MANAGER.LIST_SUBMISSIONS)
  }, [socket])

  useEffect(() => {
    requestFull()
  }, [requestFull])

  useEvent(
    EVENTS.MANAGER.SUBMISSIONS_DATA,
    useCallback((subs: Submission[]) => {
      setFull(subs)
    }, []),
  )

  // ponytail: success is optimistic; failures now surface via SUBMISSION_ERROR
  useEvent(
    EVENTS.MANAGER.SUBMISSION_ERROR,
    useCallback(
      (msg: string) => {
        toast.error(t(msg, { defaultValue: msg }))
      },
      [t],
    ),
  )

  const fullById = (id: string) => full.find((s) => s.id === id)?.question
  // WP-17 — the meta list (config-context) omits category/rejectionReason; read
  // them from the full SUBMISSIONS_DATA record for the rejected-card display.
  const recordById = (id: string) => full.find((s) => s.id === id)

  const pending = submissions.filter((s) => s.status === "pending")
  const approved = submissions.filter((s) => s.status === "approved")
  const rejected = submissions.filter((s) => s.status === "rejected")

  // Filter chips. Nav-badge stays = pending count (computed elsewhere); these
  // counts are purely the per-section totals shown next to each chip.
  const statusFilters: { key: SubmissionStatus; label: string; count: number }[] =
    [
      {
        key: "pending",
        label: t("manager:submissions.statusFilter.pending", {
          defaultValue: "Offen",
        }),
        count: pending.length,
      },
      {
        key: "approved",
        label: t("manager:submissions.statusFilter.approved", {
          defaultValue: "Angenommen",
        }),
        count: approved.length,
      },
      {
        key: "rejected",
        label: t("manager:submissions.statusFilter.rejected", {
          defaultValue: "Abgelehnt",
        }),
        count: rejected.length,
      },
    ]

  const visible = submissions.filter((s) => s.status === statusFilter)

  const handleOpenApprove = (id: string) => () => {
    setEditingId(null)
    setApproveToCatalog(false)
    setApprovingId((current) => (current === id ? null : id))
  }

  const handleApprove = (id: string, quizzId: string) => () => {
    socket.emit(EVENTS.MANAGER.APPROVE_SUBMISSION, { id, quizzId })
    setApprovingId(null)
    setApproveToCatalog(false)
    setPreviewId(null)
    requestFull()
    toast.success(t("manager:submissions.approve"))
  }

  const handleApproveToCatalog = (id: string) => () => {
    socket.emit(EVENTS.MANAGER.APPROVE_SUBMISSION, { id, toCatalog: true })
    setApprovingId(null)
    setApproveToCatalog(false)
    setPreviewId(null)
    requestFull()
    toast.success(t("manager:submissions.approve"))
  }

  const handleOpenEdit = (id: string, question: string) => () => {
    setApprovingId(null)
    setApproveToCatalog(false)

    if (editingId === id) {
      setEditingId(null)

      return
    }

    setEditingId(id)
    setEditValue(question)
  }

  const handleSaveEdit = (id: string) => () => {
    const trimmed = editValue.trim()

    if (!trimmed) {
      return
    }

    // The server validates the FULL questionValidator object, not a bare
    // string. The inline editor only changes the question TEXT, so merge the
    // edited text back into the complete question object (from SUBMISSIONS_DATA)
    // and emit that — otherwise inline edits fail server-side validation.
    const fullQuestion = fullById(id)

    if (!fullQuestion) {
      return
    }

    socket.emit(EVENTS.MANAGER.EDIT_SUBMISSION, {
      id,
      question: { ...fullQuestion, question: trimmed },
    })
    setEditingId(null)
    requestFull()
  }

  const handleCancelEdit = () => {
    setEditingId(null)
  }

  const handleOpenReject = (id: string) => () => {
    setApprovingId(null)
    setApproveToCatalog(false)
    setEditingId(null)
    setRejectReason("")
    setRejectCategory("")
    setRejectingId((current) => (current === id ? null : id))
  }

  const handleCancelReject = () => {
    setRejectingId(null)
    setRejectReason("")
    setRejectCategory("")
  }

  const handleReject = (id: string) => () => {
    const trimmed = rejectReason.trim()
    // WP-17 — only attach optional fields when set so an empty form never
    // overwrites a previously-recorded reason/category with a blank value.
    socket.emit(EVENTS.MANAGER.REJECT_SUBMISSION, {
      id,
      ...(trimmed ? { reason: trimmed } : {}),
      ...(rejectCategory ? { category: rejectCategory } : {}),
    })
    setRejectingId(null)
    setRejectReason("")
    setRejectCategory("")
    setPreviewId(null)
    requestFull()
    toast.success(t("manager:submissions.reject"))
  }

  const handleTogglePreview = (id: string) => () => {
    setPreviewId((current) => (current === id ? null : id))
  }

  // Nothing has ever been submitted — keep the original full-screen empty state.
  if (submissions.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
        <EmptyState
          icon={Inbox}
          headline={t("manager:submissions.emptyHeadline")}
          hint={t("manager:submissions.empty")}
          action={{
            label: t("manager:tabs.catalog"),
            onClick: () =>
              window.dispatchEvent(
                new CustomEvent("manager:config-tab", { detail: "catalog" }),
              ),
          }}
        />

        <SubmitLinkCard />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Status filter chips — switch the visible section between
          Offen / Angenommen / Abgelehnt. */}
      <div
        className="mb-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("manager:submissions.statusFilter.label", {
          defaultValue: "Nach Status filtern",
        })}
      >
        <Filter className="size-4 text-[var(--ink-faint)]" aria-hidden />
        {statusFilters.map((entry) => (
          <FilterPill
            key={entry.key}
            active={statusFilter === entry.key}
            onClick={() => {
              setStatusFilter(entry.key)
              setApprovingId(null)
              setEditingId(null)
              setPreviewId(null)
              setRejectingId(null)
            }}
          >
            <span className="mx-1 inline-flex items-center gap-2">
              {entry.label}
              <span
                className={
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums " +
                  (statusFilter === entry.key
                    ? "bg-[color:var(--color-field-ink)]/10 text-[color:var(--color-field-ink)]"
                    : "bg-[var(--surface-4)] text-[var(--ink-medium)]")
                }
              >
                {entry.count}
              </span>
            </span>
          </FilterPill>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-4">
          <EmptyState
            icon={
              statusFilter === "approved"
                ? CheckCircle2
                : statusFilter === "rejected"
                  ? XCircle
                  : Inbox
            }
            headline={t("manager:submissions.statusEmpty.headline", {
              defaultValue: "Keine Vorschläge in dieser Ansicht",
            })}
            hint={t("manager:submissions.statusEmpty.hint", {
              defaultValue:
                "Wähle einen anderen Status, um weitere Vorschläge zu sehen.",
            })}
          />

          {statusFilter === "pending" && <SubmitLinkCard />}
        </div>
      ) : (
        <motion.div
          className="min-h-0 flex-1 space-y-3 p-0.5"
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={
            reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
          }
        >
          {visible.map((s, index) => (
            <SubmissionCard
              key={s.id}
              s={s}
              index={index}
              reducedMotion={reducedMotion}
              previewId={previewId}
              editingId={editingId}
              editValue={editValue}
              setEditValue={setEditValue}
              approvingId={approvingId}
              approveToCatalog={approveToCatalog}
              setApproveToCatalog={setApproveToCatalog}
              rejectingId={rejectingId}
              rejectReason={rejectReason}
              setRejectReason={setRejectReason}
              rejectCategory={rejectCategory}
              setRejectCategory={setRejectCategory}
              quizzList={quizzList}
              fullById={fullById}
              recordById={recordById}
              handleOpenApprove={handleOpenApprove}
              handleApprove={handleApprove}
              handleApproveToCatalog={handleApproveToCatalog}
              handleOpenEdit={handleOpenEdit}
              handleSaveEdit={handleSaveEdit}
              handleCancelEdit={handleCancelEdit}
              handleOpenReject={handleOpenReject}
              handleCancelReject={handleCancelReject}
              handleReject={handleReject}
              handleTogglePreview={handleTogglePreview}
            />
          ))}

          {statusFilter === "pending" && <SubmitLinkCard />}
        </motion.div>
      )}
    </div>
  )
}

export default ConfigSubmissions
