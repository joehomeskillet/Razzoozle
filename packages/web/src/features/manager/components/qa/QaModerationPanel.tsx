import Button from "@razzoozle/web/components/Button"
import clsx from "clsx"
import { Check, X, Pin, MessageSquare } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface QaQuestion {
  id: string
  text: string
  authorName: string
  upvotes: number
  status: "pending" | "approved" | "dismissed"
  isPinned?: boolean
}

export interface QaModerationPanelProps {
  questions: QaQuestion[]
  onApprove?: (id: string) => void
  onDismiss?: (id: string) => void
  onPin?: (id: string) => void
  disabled?: boolean
  testIdPrefix?: string
  className?: string
}

export function QaModerationPanel({
  questions,
  onApprove,
  onDismiss,
  onPin,
  disabled = false,
  testIdPrefix = "",
  className,
}: QaModerationPanelProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<"pending" | "approved" | "dismissed">("pending")

  const filteredQuestions = questions.filter((q) => q.status === filter)

  return (
    <div
      className={clsx(
        "flex w-full flex-col gap-4 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}qa-moderation-panel`}
    >
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-[var(--color-primary)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">
            {t("manager:qa.title", { defaultValue: "Q&A Live Moderation" })}
          </h2>
        </div>

        <div className="flex gap-2" role="tablist">
          {(["pending", "approved", "dismissed"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={filter === tab}
              onClick={() => setFilter(tab)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                filter === tab
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--ink-medium)] hover:bg-[var(--surface-3)]",
              )}
              data-testid={`${testIdPrefix}qa-tab-${tab}`}
            >
              {t(`manager:qa.tab_${tab}`, {
                defaultValue: tab === "pending" ? "Ausstehend" : tab === "approved" ? "Freigegeben" : "Abgelehnt",
              })}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <p
          className="py-8 text-center text-sm font-medium text-[var(--ink-muted)]"
          data-testid={`${testIdPrefix}qa-empty`}
        >
          {t("manager:qa.empty", { defaultValue: "Keine Fragen in dieser Kategorie." })}
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid={`${testIdPrefix}qa-list`}>
          {filteredQuestions.map((q) => (
            <div
              key={q.id}
              className={clsx(
                "flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-2)] p-4 transition-colors",
                q.isPinned && "ring-2 ring-[var(--color-primary)]",
              )}
              data-testid={`${testIdPrefix}qa-item-${q.id}`}
            >
              <div className="flex-1 space-y-1">
                <p className="text-base font-semibold text-[var(--ink)]">{q.text}</p>
                <div className="flex items-center gap-3 text-xs text-[var(--ink-muted)]">
                  <span>{q.authorName}</span>
                  <span>•</span>
                  <span>{q.upvotes} Stimmen</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {filter === "pending" && onApprove && (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={disabled}
                    onClick={() => onApprove(q.id)}
                    data-testid={`${testIdPrefix}qa-approve-${q.id}`}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Freigeben
                  </Button>
                )}

                {filter === "pending" && onDismiss && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => onDismiss(q.id)}
                    data-testid={`${testIdPrefix}qa-dismiss-${q.id}`}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Ablehnen
                  </Button>
                )}

                {filter === "approved" && onPin && (
                  <Button
                    type="button"
                    variant={q.isPinned ? "primary" : "secondary"}
                    disabled={disabled}
                    onClick={() => onPin(q.id)}
                    data-testid={`${testIdPrefix}qa-pin-${q.id}`}
                  >
                    <Pin className="mr-1 h-4 w-4" />
                    {q.isPinned ? "Angeheftet" : "Anheften"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
