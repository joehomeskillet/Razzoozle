import Markdown from "@razzoozle/web/components/Markdown"
import { ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import clsx from "clsx"
import { useTranslation } from "react-i18next"

import type { AnswerViewProps } from "./types"

// CSS-only tap scale-down. Solo intentionally omits this — pre-existing
// per-variant drift, preserved as-is (not "fixed" here).
const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/**
 * WortartenPicker value — one POS choice per sentence token (null = unset),
 * plus which token's POS picker is currently expanded (one at a time).
 */
export interface WortartenValue {
  choices: Array<string | null>
  openTokenIndex: number | null
}

interface Props extends AnswerViewProps<WortartenValue> {
  /** Source sentence (markdown). Server-provided, optional. */
  sentence?: string
  // Whitespace tokens of the sentence — server-split, NEVER re-split here
  // (emoji/grapheme safety — see memory `emoji_grapheme_vs16`).
  tokens?: string[]
  /** Fixed POS label set the player picks from. */
  posSet?: string[]
  /** Indices of tokens that are disabled (not scored/clickable). */
  disabledTokens?: number[]
}

/**
 * WortartenPicker — sentence-token tap-to-open POS picker (MP + Solo).
 *
 * Pure props: no socket/store access, no sound/haptics. `onChange` carries
 * local UI state only; `onSubmit` just signals intent — the caller builds
 * the wire payload via `buildWortartenAnswer`. `testIdPrefix` doubles as the
 * MP/Solo discriminator for the container/submit-button treatments that
 * genuinely differ between the two (feedback border, width, press-feedback).
 */
export default function WortartenPicker({
  value: { choices, openTokenIndex },
  onChange,
  onSubmit,
  disabled,
  feedback,
  testIdPrefix = "",
  sentence,
  tokens,
  posSet,
  disabledTokens,
}: Props) {
  const { t } = useTranslation()
  const isSolo = testIdPrefix === "solo-"

  const isTokenDisabled = (i: number): boolean =>
    disabledTokens?.includes(i) ?? false

  const handleSelectPos = (tokenIndex: number, pos: string) => () => {
    if (disabled) return
    const next = [...choices]
    next[tokenIndex] = pos
    onChange({ choices: next, openTokenIndex: null })
  }

  // Every ACTIVE (non-disabled) token must have a choice before submit unlocks.
  const hasIncompleteActiveTokens = choices.some(
    (choice, idx) => !isTokenDisabled(idx) && choice === null,
  )
  const submitDisabled =
    disabled || choices.length === 0 || hasIncompleteActiveTokens

  return (
    <div
      className={clsx(
        "mx-auto mb-4 flex w-full flex-col gap-4 px-4",
        isSolo
          ? [
              "max-w-3xl rounded-[var(--radius-theme)] border p-4",
              feedback
                ? feedback.correct
                  ? "border-[var(--state-correct)]"
                  : "border-[var(--state-wrong)]"
                : "border-transparent",
            ]
          : "max-w-4xl",
      )}
    >
      {sentence && (
        <p className="text-center text-lg font-semibold text-[color:var(--game-fg)]">
          <Markdown>{sentence}</Markdown>
        </p>
      )}
      <p className="text-center text-sm font-medium text-[color:var(--game-fg)]/80">
        {t("quizz:wortarten.tapHint")}
      </p>

      <div className="flex flex-wrap items-start justify-center gap-2">
        {(tokens ?? []).map((token, i) => {
          const choice = choices[i] ?? null
          const isOpen = openTokenIndex === i
          const isDisabled = isTokenDisabled(i)

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                data-testid={`${testIdPrefix}wortarten-token-${i}`}
                onClick={() =>
                  !disabled &&
                  !isDisabled &&
                  onChange({ choices, openTokenIndex: isOpen ? null : i })
                }
                disabled={disabled || isDisabled}
                aria-expanded={isOpen}
                aria-label={`${t("quizz:wortarten.selectLabel")}: ${token}`}
                className={clsx(
                  ANSWER_TILE_SURFACE,
                  "flex min-h-11 flex-col items-center gap-0.5 px-3 py-2 font-semibold text-[color:var(--game-fg)]",
                  !isSolo && "disabled:opacity-50",
                  isDisabled
                    ? isSolo
                      ? "cursor-not-allowed opacity-40"
                      : "opacity-40"
                    : !disabled && PRESS_FEEDBACK,
                  choice && !isDisabled && "ring-2 ring-[var(--color-accent)]",
                )}
              >
                <span>{token}</span>
                {choice && (
                  <span className="text-xs font-normal text-[color:var(--game-fg)]/60">
                    {t(`quizz:wortarten.pos.${choice}`, choice)}
                  </span>
                )}
              </button>

              {isOpen && !isDisabled && (
                <div
                  className={clsx(
                    ANSWER_TILE_SURFACE,
                    "z-10 flex max-w-[16rem] flex-wrap justify-center gap-1 p-2",
                  )}
                >
                  {(posSet ?? []).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      data-testid={`${testIdPrefix}wortarten-pos-${i}-${pos}`}
                      onClick={handleSelectPos(i, pos)}
                      className={clsx(
                        ANSWER_TILE_SURFACE,
                        "min-h-11 px-3 py-2 text-sm font-medium text-[color:var(--game-fg)]",
                        !isSolo && PRESS_FEEDBACK,
                      )}
                    >
                      {t(`quizz:wortarten.pos.${pos}`, pos)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        data-testid={`${testIdPrefix}wortarten-submit`}
        onClick={onSubmit}
        disabled={submitDisabled}
        className={clsx(
          "mx-auto rounded-xl bg-[var(--color-primary)] px-8 py-3 text-xl font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50 lg:px-12 lg:py-5 lg:text-[clamp(1.25rem,3vh,2.5rem)]",
          !isSolo && PRESS_FEEDBACK,
        )}
      >
        {isSolo && disabled
          ? t("game:slider.submitted")
          : t("game:submitAnswer")}
      </button>
    </div>
  )
}
