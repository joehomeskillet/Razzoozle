import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { QuestionMedia } from "@razzoozle/common/types/game"
import AlertDialog from "@razzoozle/web/components/AlertDialog"
import { type QuestionWithId } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Check, Music, Trash2, Video } from "lucide-react"
import type { KeyboardEvent, MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

const SlideMedia = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img src={media.url} className="mx-auto max-h-14 w-auto rounded-md" />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return <Video className="mx-auto size-10 text-gray-400" />
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return <Music className="mx-auto size-10 text-gray-400" />
  }

  return null
}

interface Props {
  question: QuestionWithId
  index: number
  isActive: boolean
  canDelete: boolean
  /** True when this card is part of the multi-select set. */
  selected?: boolean
  /** True while a multi-selection is active (≥1 selected) → show checkboxes. */
  selectionActive?: boolean
  /**
   * Click on the card body. Receives the raw event so the sidebar can branch on
   * Ctrl/Cmd (toggle) / Shift (range) vs. a plain click (single-select).
   */
  onClick: (_event: MouseEvent<HTMLDivElement>) => void
  /** Toggle this card in/out of the selection (checkbox affordance). */
  onToggleSelect?: () => void
  onDelete: () => void
  /** Background image asset ref (from the quiz's theme). */
  backgroundImage?: string | null
  /** Background gradient for color-only themes. */
  backgroundGradient?: string
}

const QuizzEditorCard = ({
  question,
  index,
  isActive,
  canDelete,
  selected = false,
  selectionActive = false,
  onClick,
  onToggleSelect,
  onDelete,
  backgroundImage,
  backgroundGradient,
}: Props) => {
  const { t } = useTranslation()

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      // Synthesize a plain click; keyboard activation is always single-select.
      onClick(e as unknown as MouseEvent<HTMLDivElement>)
    }
  }

  const showCheckbox = selectionActive || selected

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-pressed={selected ? "true" : undefined}
      aria-label={t("quizz:slideLabel", { index: index + 1 })}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={twMerge(
        clsx(
          "group relative flex h-36 cursor-pointer flex-col justify-between gap-1 overflow-hidden rounded-xl border-2 border-gray-200 bg-gray-50 px-6 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          {
            "border-primary": isActive,
            "border-primary ring-primary ring-2 ring-offset-1": selected,
          },
        ),
      )}
    >
      {backgroundImage ? (
        <img
          src={backgroundImage}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-20 select-none"
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5"
          style={{ background: backgroundGradient }}
        />
      )}

      <span className="absolute top-2 left-2 z-10 text-xs font-semibold text-gray-500">
        {index + 1}
      </span>

      {showCheckbox && onToggleSelect && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={t("quizz:slideLabel", { index: index + 1 })}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={clsx(
            "absolute bottom-1.5 left-1.5 flex size-5 items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] z-20",
            selected
              ? "border-primary bg-[var(--accent-contrast)] text-white"
              : "border-gray-300 bg-white text-transparent hover:border-gray-400",
          )}
        >
          <Check className="size-3.5" aria-hidden />
        </button>
      )}

      <p className="relative z-10 truncate text-center text-xs font-semibold text-gray-700">
        {question.question || t("quizz:noQuestionYet")}
      </p>

      <div className="relative z-10">
        <SlideMedia media={question.media} />
      </div>

      {question.type === "slider" ? (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-[10px] font-semibold text-gray-500">
          {question.min}–{question.max}
          {question.unit ? ` ${question.unit}` : ""}
        </div>
      ) : question.type === "type-answer" ? (
        <div className="relative z-10 flex h-4 items-center justify-center rounded-md border border-gray-300 text-[10px] font-semibold text-gray-500">
          Aa
        </div>
      ) : question.type === "sentence-builder" ? (
        <div className="relative z-10 flex gap-1">
          {(question.chunks ?? []).slice(0, 3).map((_, i) => (
            <div
              key={i}
              className="h-3 flex-1 rounded-full bg-gray-300"
            />
          ))}
        </div>
      ) : question.type === "poll" ? (
        <div className="relative z-10 flex flex-col gap-1">
          {[0, 1].map((i) => (
            <div key={i} className="h-3 w-full rounded-md border border-gray-300" />
          ))}
        </div>
      ) : question.type === "boolean" ? (
        <div className="relative z-10 grid grid-cols-2 gap-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-4 rounded-md border border-gray-300"
            />
          ))}
        </div>
      ) : (
        <div className="relative z-10 grid grid-cols-2 gap-1">
          {(question.answers ?? []).map((_, i) => (
            <div
              key={i}
              className="flex h-4 flex-1 items-center rounded-md border border-gray-300 px-0.5"
            >
              {(question.solutions ?? []).includes(i) && (
                <div className="ml-auto size-1.5 rounded-full bg-green-400" />
              )}
            </div>
          ))}
        </div>
      )}

      {canDelete && (
        <AlertDialog
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label={t("quizz:question.deleteQuestion")}
              className="focus-visible:outline-primary absolute top-1.5 right-1.5 z-20 rounded-md bg-white p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Trash2 className="size-3.5" />
            </button>
          }
          title={t("quizz:question.deleteQuestion")}
          description={t("quizz:question.deleteQuestionConfirm")}
          confirmLabel={t("common:delete")}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}

export default QuizzEditorCard
