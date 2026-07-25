import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import clsx from "clsx"
import { ThumbsUp, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ANSWERS_COLORS } from "@razzoozle/web/features/game/utils/answers"

export interface BrainstormIdea {
  id: string
  text: string
  authorName?: string
  upvotes: number
  hasVoted?: boolean
}

export interface BrainstormBoardProps {
  ideas: BrainstormIdea[]
  onAddIdea?: (text: string) => void
  onUpvoteIdea?: (ideaId: string) => void
  disabled?: boolean
  maxIdeasPerPlayer?: number
  testIdPrefix?: string
  className?: string
}

export function BrainstormBoard({
  ideas,
  onAddIdea,
  onUpvoteIdea,
  disabled = false,
  testIdPrefix = "",
  className,
}: BrainstormBoardProps) {
  const { t } = useTranslation()
  const [newIdeaText, setNewIdeaText] = useState("")

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newIdeaText.trim() || disabled) return
    onAddIdea?.(newIdeaText.trim())
    setNewIdeaText("")
  }

  // Sort ideas by upvotes descending
  const sortedIdeas = [...ideas].sort((a, b) => b.upvotes - a.upvotes)

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-4xl flex-col gap-6 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}brainstorm-board`}
    >
      {/* Idea submission input form */}
      {!disabled && onAddIdea && (
        <form
          onSubmit={handleAddSubmit}
          className="flex items-center gap-3"
          data-testid={`${testIdPrefix}brainstorm-form`}
        >
          <div className="flex-1">
            <Input
              type="text"
              value={newIdeaText}
              onChange={(e) => setNewIdeaText(e.target.value)}
              placeholder={t("game:brainstorm.inputPlaceholder", {
                defaultValue: "Deine Idee eingeben...",
              })}
              disabled={disabled}
              data-testid={`${testIdPrefix}brainstorm-input`}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || !newIdeaText.trim()}
            data-testid={`${testIdPrefix}brainstorm-submit`}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("game:brainstorm.addIdea", { defaultValue: "Idee hinzufügen" })}
          </Button>
        </form>
      )}

      {/* Ideas Grid */}
      {sortedIdeas.length === 0 ? (
        <p
          className="py-8 text-center text-sm font-medium text-[var(--ink-muted)]"
          data-testid={`${testIdPrefix}brainstorm-empty`}
        >
          {t("game:brainstorm.emptyState", {
            defaultValue: "Noch keine Ideen eingereicht. Sei der Erste!",
          })}
        </p>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3"
          data-testid={`${testIdPrefix}brainstorm-grid`}
        >
          {sortedIdeas.map((idea, idx) => {
            const cardColor = ANSWERS_COLORS[idx % ANSWERS_COLORS.length]

            return (
              <div
                key={idea.id}
                className={clsx(
                  "flex flex-col justify-between rounded-xl p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5",
                  cardColor,
                )}
                data-testid={`${testIdPrefix}brainstorm-card-${idea.id}`}
              >
                <p className="mb-4 text-base font-semibold leading-snug">
                  {idea.text}
                </p>

                <div className="flex items-center justify-between border-t border-black/10 pt-2 text-xs font-medium">
                  {idea.authorName && <span>{idea.authorName}</span>}

                  <button
                    type="button"
                    onClick={() => !disabled && onUpvoteIdea?.(idea.id)}
                    disabled={disabled || idea.hasVoted}
                    className={clsx(
                      "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 font-bold transition-colors",
                      idea.hasVoted
                        ? "bg-black/20 text-white cursor-default"
                        : "bg-black/10 hover:bg-black/20 text-white active:scale-95",
                    )}
                    data-testid={`${testIdPrefix}brainstorm-upvote-${idea.id}`}
                    aria-label={t("game:brainstorm.upvoteAria", {
                      defaultValue: "Idee '{{text}}' unterstützen ({{count}} Stimmen)",
                      text: idea.text,
                      count: idea.upvotes,
                    })}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                    <span>{idea.upvotes}</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
