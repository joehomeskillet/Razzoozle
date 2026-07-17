import { autoGenerateChunks } from "@razzoozle/common/utils/chunks"
import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const QuestionEditorSentence = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const chunks = currentQuestion.chunks ?? []
  const [localSentence, setLocalSentence] = useState(chunks.join(" "))

  const updateChunk = (index: number, value: string) => {
    const next = chunks.map((c, i) => (i === index ? value : c))
    updateQuestion(currentIndex, { chunks: next })
  }

  const addChunk = () => {
    if (chunks.length >= 16) {
      return
    }
    updateQuestion(currentIndex, { chunks: [...chunks, ""] })
  }

  const removeChunk = (index: number) => {
    if (chunks.length <= 2) {
      return
    }
    const next = chunks.filter((_, i) => i !== index)
    updateQuestion(currentIndex, { chunks: next })
  }

  const moveChunkUp = (index: number) => {
    if (index <= 0) {
      return
    }
    const next = [...chunks]
    const temp = next[index]!
    next[index] = next[index - 1]!
    next[index - 1] = temp
    updateQuestion(currentIndex, { chunks: next })
  }

  const moveChunkDown = (index: number) => {
    if (index >= chunks.length - 1) {
      return
    }
    const next = [...chunks]
    const temp = next[index]!
    next[index] = next[index + 1]!
    next[index + 1] = temp
    updateQuestion(currentIndex, { chunks: next })
  }

  const handleAutoGenerate = () => {
    if (localSentence.trim()) {
      const generated = autoGenerateChunks(localSentence)
      updateQuestion(currentIndex, { chunks: generated })
    }
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:sentenceBuilder.sentenceLabel", {
            defaultValue: "Correct sentence",
          })}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={localSentence}
            onChange={(e) => setLocalSentence(e.target.value)}
            className="focus-visible:border-primary focus-visible:ring-primary/30 flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:ring-2"
            placeholder={t("quizz:sentenceBuilder.sentencePlaceholder", {
              defaultValue: "Type the correct sentence...",
            })}
          />
          <button
            type="button"
            onClick={handleAutoGenerate}
            disabled={!localSentence.trim()}
            className="bg-primary hover:bg-primary/90 focus-visible:ring-primary/30 flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
          >
            {t("quizz:sentenceBuilder.autoGenerate", {
              defaultValue: "Auto-generate",
            })}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">
            {t("quizz:sentenceBuilder.chunksLabel", {
              defaultValue: "Chunks",
            })}
          </div>
          <button
            type="button"
            onClick={addChunk}
            disabled={chunks.length >= 16}
            aria-label={t("quizz:sentenceBuilder.addChunk", {
              defaultValue: "Add chunk",
            })}
            className="focus-visible:ring-primary/30 flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {chunks.map((chunk, i) => (
            <div key={i} className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => moveChunkUp(i)}
                disabled={i === 0}
                aria-label={t("quizz:sentenceBuilder.moveUp", {
                  defaultValue: "Move up",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => moveChunkDown(i)}
                disabled={i === chunks.length - 1}
                aria-label={t("quizz:sentenceBuilder.moveDown", {
                  defaultValue: "Move down",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <ArrowDown className="size-4" />
              </button>
              <input
                className="focus-visible:border-primary focus-visible:ring-primary/30 flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:ring-2"
                placeholder={t("quizz:sentenceBuilder.chunkPlaceholder", {
                  defaultValue: "Chunk",
                })}
                value={chunk}
                onChange={(e) => updateChunk(i, e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeChunk(i)}
                disabled={chunks.length <= 2}
                aria-label={t("quizz:sentenceBuilder.removeChunk", {
                  index: i + 1,
                  defaultValue: "Remove chunk",
                })}
                className="focus-visible:ring-primary/30 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
              >
                <Minus className="size-5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-600">
          {t("quizz:sentenceBuilder.preview", {
            defaultValue: "Players will see these chips shuffled",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          {chunks.map((chunk, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
            >
              {chunk || "—"}
            </span>
          ))}
        </div>
      </div>

      {chunks.length < 2 && (
        <p className="text-sm text-amber-700">
          {t("quizz:sentenceBuilder.minChunksRequired", {
            defaultValue: "At least 2 chunks required",
          })}
        </p>
      )}
    </div>
  )
}

export default QuestionEditorSentence
