import { useQuizzEditor } from "@razzoozle/web/features/quizz/contexts/quizz-editor-context"
import { useEffect, useState } from "react"
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
  const {
    currentQuestion,
    currentIndex,
    updateQuestion,
    silentUpdateQuestion,
  } = useQuizzEditor()
  const { t } = useTranslation()
  const [toastError, setToastError] = useState<string>("")

  const sentence = currentQuestion.sentence ?? ""
  const tokens = currentQuestion.tokens ?? []
  const solutions = currentQuestion.solutions ?? []
  const disabledTokens = currentQuestion.disabledTokens ?? []

  // Self-heal: keep posSet fixed to POS_LABELS, solutions.length in lockstep
  // with tokens.length, and disabledTokens in sync (remove indices >= tokens.length).
  // Use silentUpdateQuestion so mount-normalization doesn't mark the editor dirty (#28).
  useEffect(() => {
    const patch: {
      posSet?: string[]
      solutions?: number[]
      disabledTokens?: number[]
    } = {}

    if (!samePosSet(currentQuestion.posSet, POS_LABELS)) {
      patch.posSet = POS_LABELS
    }

    if (tokens.length > 0 && solutions.length !== tokens.length) {
      patch.solutions = tokens.map((_, i) => solutions[i] ?? 0)
    }

    // Filter out disabled indices that are >= tokens.length
    const validDisabledTokens = disabledTokens.filter(
      (idx) => idx < tokens.length,
    )
    if (validDisabledTokens.length !== disabledTokens.length) {
      patch.disabledTokens = validDisabledTokens
    }

    if (Object.keys(patch).length > 0) {
      silentUpdateQuestion(currentIndex, patch)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, tokens.length])

  const handleSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateQuestion(currentIndex, { sentence: e.target.value })
  }

  // Recompute tokens from the current sentence. Solutions are resized to match
  // (index-aligned re-use of existing picks, defaulting new tokens to index 0).
  // Reset disabledTokens to [] (simplest correct semantics on re-tokenize).
  const handleTokenize = () => {
    const nextTokens = tokenizeSentence(sentence)

    if (nextTokens.length === 0) {
      return
    }

    updateQuestion(currentIndex, {
      tokens: nextTokens,
      solutions: nextTokens.map((_, i) => solutions[i] ?? 0),
      posSet: POS_LABELS,
      disabledTokens: [],
    })
  }

  const handlePosChange = (tokenIndex: number, posIndex: number) => {
    const next = tokens.map((_, i) => solutions[i] ?? 0)
    next[tokenIndex] = posIndex
    updateQuestion(currentIndex, { solutions: next })
  }

  // Toggle disable/enable a token. Prevent disabling if it would be the last active token.
  const handleToggleDisable = (tokenIndex: number) => {
    const isCurrentlyDisabled = disabledTokens.includes(tokenIndex)

    if (!isCurrentlyDisabled) {
      // Check if this is the last active token
      const activeCount = tokens.length - disabledTokens.length
      if (activeCount === 1) {
        setToastError(
          t(
            "quizz:wortarten.allTokensDisabledError",
            "Mindestens ein Wort muss aktiv sein",
          ),
        )
        setTimeout(() => setToastError(""), 3000)
        return
      }

      // Disable this token
      updateQuestion(currentIndex, {
        disabledTokens: [...disabledTokens, tokenIndex].sort((a, b) => a - b),
      })
    } else {
      // Enable this token
      updateQuestion(currentIndex, {
        disabledTokens: disabledTokens.filter((idx) => idx !== tokenIndex),
      })
    }
  }

  return (
    <div className="z-10 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-[var(--game-fg)]">
          {t("quizz:wortarten.sentence")}
        </label>
        <textarea
          value={sentence}
          onChange={handleSentenceChange}
          placeholder={t("quizz:wortarten.sentencePlaceholder")}
          className="focus-visible:border-primary focus-visible:ring-primary/30 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-[var(--game-fg)] outline-none placeholder:text-[var(--surface-muted)] focus-visible:ring-2"
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
        <label className="text-sm font-semibold text-[var(--game-fg)]">
          {t("quizz:wortarten.tokensLabel")}
        </label>

        {toastError && (
          <div
            className="rounded-lg border border-[var(--label-red)] bg-[var(--label-red-bg)] px-3 py-2 text-sm text-[var(--label-red)]"
            role="alert"
          >
            {toastError}
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="text-sm text-[var(--surface-muted)]">
            {t("quizz:wortarten.noTokensHint")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tokens.map((token, i) => {
              const isDisabled = disabledTokens.includes(i)
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 ${
                    isDisabled ? "opacity-50" : ""
                  }`}
                >
                  <span
                    className={`min-w-0 flex-1 truncate font-semibold ${
                      isDisabled
                        ? "text-[var(--surface-muted)]"
                        : "text-[var(--game-fg)]"
                    }`}
                  >
                    {token}
                  </span>
                  <select
                    data-testid={`wortarten-editor-pos-${i}`}
                    value={solutions[i] ?? 0}
                    onChange={(e) => handlePosChange(i, Number(e.target.value))}
                    aria-label={`${t("quizz:wortarten.selectLabel")}: ${token}`}
                    disabled={isDisabled}
                    className={`focus-visible:border-primary focus-visible:ring-primary/30 rounded-lg border border-[var(--border-hairline)] bg-white px-2 py-2 text-sm outline-none focus-visible:ring-2 ${
                      isDisabled
                        ? "cursor-not-allowed text-[var(--surface-muted)]"
                        : "text-[var(--game-fg)]"
                    }`}
                  >
                    {POS_LABELS.map((label, idx) => (
                      <option key={label} value={idx}>
                        {t(`quizz:wortarten.pos.${label}`, label)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid={`wortarten-editor-disable-${i}`}
                    onClick={() => handleToggleDisable(i)}
                    aria-label={
                      isDisabled
                        ? t(
                            "quizz:wortarten.enableTokenLabel",
                            "Wort aktivieren",
                          )
                        : t(
                            "quizz:wortarten.disableTokenLabel",
                            "Wort deaktivieren",
                          )
                    }
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-sm font-semibold transition-colors outline-none ${
                      isDisabled
                        ? "bg-[var(--surface-muted)] text-white hover:opacity-80"
                        : "bg-white text-[var(--game-fg)] hover:bg-[var(--surface)]"
                    } focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-2`}
                    title={
                      isDisabled
                        ? t(
                            "quizz:wortarten.enableTokenLabel",
                            "Wort aktivieren",
                          )
                        : t(
                            "quizz:wortarten.disableTokenLabel",
                            "Wort deaktivieren",
                          )
                    }
                  >
                    {isDisabled ? "✓" : "—"}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default QuestionEditorWortarten
