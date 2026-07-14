import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { X, Plus } from "lucide-react"
import clsx from "clsx"

interface VokabelRow {
  word: string
  translation: string
}

const QuestionEditorVokabel = () => {
  const { currentIndex, addQuestion, removeQuestion, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()
  const [rows, setRows] = useState<VokabelRow[]>([
    { word: "", translation: "" },
  ])
  const [direction, setDirection] = useState<"word-to-translation" | "translation-to-word">("word-to-translation")

  const addRow = () => {
    setRows([...rows, { word: "", translation: "" }])
  }

  const removeRow = (index: number) => {
    if (rows.length > 1) {
      setRows(rows.filter((_, i) => i !== index))
    }
  }

  const updateRow = (index: number, field: "word" | "translation", value: string) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: value }
    setRows(newRows)
  }

  const createQuestions = () => {
    // Filter out empty rows
    const validRows = rows.filter((row) => row.word.trim() && row.translation.trim())

    if (validRows.length === 0) {
      return
    }

    const vokabelIdx = currentIndex

    // Create type-answer questions for each row
    for (let i = 0; i < validRows.length; i++) {
      addQuestion()
    }

    // Update each new question to be a type-answer question with the corresponding pair
    const startIdx = vokabelIdx + 1 // First new question is after the vokabelliste position
    for (let i = 0; i < validRows.length; i++) {
      const [prompt, answer] = direction === "word-to-translation"
        ? [validRows[i].word, validRows[i].translation]
        : [validRows[i].translation, validRows[i].word]

      updateQuestion(startIdx + i, {
        type: "type-answer",
        question: prompt,
        acceptedAnswers: [answer],
        matchMode: "normalized",
        cooldown: 5,
        time: 20,
        answers: undefined,
        solutions: undefined,
        chunks: undefined,
        min: undefined,
        max: undefined,
        correct: undefined,
        step: undefined,
        unit: undefined,
      })
    }

    // Remove the vokabelliste pseudo-question
    removeQuestion(vokabelIdx)
  }

  const hasValidRows = rows.some((row) => row.word.trim() && row.translation.trim())

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:vokabel.direction", "Direction")}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection("word-to-translation")}
            className={clsx(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              direction === "word-to-translation"
                ? "bg-[color-mix(in_srgb,var(--color-primary),white_92%)] text-[var(--accent-contrast)]"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100",
            )}
          >
            {t("quizz:vokabel.wordToTranslation", "Word → Translation")}
          </button>
          <button
            type="button"
            onClick={() => setDirection("translation-to-word")}
            className={clsx(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
              direction === "translation-to-word"
                ? "bg-[color-mix(in_srgb,var(--color-primary),white_92%)] text-[var(--accent-contrast)]"
                : "bg-gray-50 text-gray-700 hover:bg-gray-100",
            )}
          >
            {t("quizz:vokabel.translationToWord", "Translation → Word")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:vokabel.wordList", "Word List")}
        </label>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={row.word}
                onChange={(e) => updateRow(index, "word", e.target.value)}
                placeholder={t("quizz:vokabel.wordPlaceholder", "Word")}
                className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <input
                type="text"
                value={row.translation}
                onChange={(e) => updateRow(index, "translation", e.target.value)}
                placeholder={t("quizz:vokabel.translationPlaceholder", "Translation")}
                className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => removeRow(index)}
                disabled={rows.length <= 1}
                className="flex items-center justify-center rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t("quizz:vokabel.removeRow", "Remove row")}
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Plus className="size-4" />
          {t("quizz:vokabel.addRow", "Add row")}
        </button>
      </div>

      <button
        type="button"
        onClick={createQuestions}
        disabled={!hasValidRows}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
      >
        {t("quizz:vokabel.createQuestions", "Create Questions")}
      </button>
    </div>
  )
}

export default QuestionEditorVokabel
