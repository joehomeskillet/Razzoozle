import { MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMedia } from "@razzia/common/types/game"
import AlertDialog from "@razzia/web/components/AlertDialog"
import { type QuestionWithId } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Music, Trash2, Video } from "lucide-react"
import type { KeyboardEvent } from "react"
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
  onClick: () => void
  onDelete: () => void
}

const QuizzEditorCard = ({
  question,
  index,
  isActive,
  canDelete,
  onClick,
  onDelete,
}: Props) => {
  const { t } = useTranslation()

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      onClick()
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      aria-label={t("quizz:slideLabel", { index: index + 1 })}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={twMerge(
        clsx(
          "group relative flex h-36 cursor-pointer flex-col justify-between gap-1 rounded-xl border-2 border-gray-200 bg-white px-6 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          {
            "border-primary": isActive,
          },
        ),
      )}
    >
      <span className="absolute top-2 left-2 text-xs font-semibold text-gray-400">
        {index + 1}
      </span>
      <p className="truncate text-center text-xs font-semibold text-gray-700">
        {question.question || t("quizz:noQuestionYet")}
      </p>

      <SlideMedia media={question.media} />

      {question.type === "slider" ? (
        <div className="flex h-4 items-center justify-center rounded-md border border-gray-300 text-[10px] font-semibold text-gray-400">
          {question.min}–{question.max}
          {question.unit ? ` ${question.unit}` : ""}
        </div>
      ) : question.type === "type-answer" ? (
        <div className="flex h-4 items-center justify-center rounded-md border border-gray-300 text-[10px] font-semibold text-gray-400">
          Aa
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
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
              className="focus-visible:outline-primary absolute top-1.5 right-1.5 rounded-md bg-white p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
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
