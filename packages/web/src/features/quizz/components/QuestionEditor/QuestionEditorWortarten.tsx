import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

// Fixed German POS label set (v1). Matches rust/protocol/src/quizz.rs — the
// server evaluates `answerText` against these EXACT strings via `posSet`, so
// this list must stay in lockstep with the backend contract.
const POS_LABELS = [
  "Nomen",
  "Verb",
  "Adjektiv",
  "Artikel",
  "Pronomen",
  "Adverb",
  "Präposition",
  "Konjunktion",
]

// Deterministic tokenizer: split on whitespace, drop empties. Kept simple on
// purpose — no punctuation stripping, no locale-aware word breaking.
const tokenizeSentence = (sentence: string): string[] =>
  sentence
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)

const samePosSet = (a: string[] | undefined, b: string[]): boolean =>
  !!a && a.length === b.length && a.every((v, i) => v === b[i])

const QuestionEditorWortarten = () => {
  const { currentQuestion, currentIndex, updateQuestion } = useQuizzEditor()
  const { t } = useTranslation()

  const sentence = currentQuestion.sentence ?? ""
  const tokens = currentQuestion.tokens ?? []
  const solutions = currentQuestion.solutions ?? []

  // Self-heal: keep posSet fixed to POS_LABELS and solutions.length in lockstep
  // with tokens.length at all times — the server hard-fails eval on a length
  // mismatch, so this must hold even for questions authored before this editor
  // existed (or edited elsewhere).
  useEffect(() => {
    const patch: { posSet?: string[]; solutions?: number[] } = {}

    if (!samePosSet(currentQuestion.posSet, POS_LABELS)) {
      patch.posSet = POS_LABELS
    }

    if (tokens.length > 0 && solutions.length !== tokens.length) {
      patch.solutions = tokens.map((_, i) => solutions[i] ?? 0)
    }

    if (Object.keys(patch).length > 0) {
      updateQuestion(currentIndex, patch)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tokens.length])

  const handleSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateQuestion(currentIndex, { sentence: e.target.value })
  }

  // Recompute tokens from the current sentence. Solutions are resized to match
  // (index-aligned re-use of existing picks, defaulting new tokens to index 0).
  const handleTokenize = () => {
    const nextTokens = tokenizeSentence(sentence)

    if (nextTokens.length === 0) {
      return
    }

    updateQuestion(currentIndex, {
      tokens: nextTokens,
      solutions: nextTokens.map((_, i) => solutions[i] ?? 0),
      posSet: POS_LABELS,
    })
  }

  const handlePosChange = (tokenIndex: number, posIndex: number) => {
    const next = tokens.map((_, i) => solutions[i] ?? 0)
    next[tokenIndex] = posIndex
    updateQuestion(currentIndex, { solutions: next })
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:wortarten.sentence")}
        </label>
        <textarea
          value={sentence}
          onChange={handleSentenceChange}
          placeholder={t("quizz:wortarten.sentencePlaceholder")}
          className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-gray-800 outline-none placeholder:text-gray-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
          rows={3}
        />
        <button
          type="button"
          onClick={handleTokenize}
          disabled={!sentence.trim()}
          className="flex w-fit items-center justify-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("quizz:wortarten.tokenizeButton")}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-gray-700">
          {t("quizz:wortarten.tokensLabel")}
        </label>

        {tokens.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("quizz:wortarten.noTokensHint")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((token, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-semibold text-gray-800">
                  {token}
                </span>
                <select
                  data-testid={`wortarten-editor-pos-${i}`}
                  value={solutions[i] ?? 0}
                  onChange={(e) => handlePosChange(i, Number(e.target.value))}
                  aria-label={`${t("quizz:wortarten.selectLabel")}: ${token}`}
                  className="rounded-lg border border-[var(--border-hairline)] bg-white px-2 py-2 text-sm text-gray-800 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  {POS_LABELS.map((label, idx) => (
                    <option key={label} value={idx}>
                      {t(`quizz:wortarten.pos.${label}`, label)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default QuestionEditorWortarten
