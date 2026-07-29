import Button from "@razzoozle/web/components/Button"
import Input from "@razzoozle/web/components/Input"
import clsx from "clsx"
import { Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ANSWERS_COLORS } from "@razzoozle/web/features/game/utils/answers"

export interface WordCloudItem {
  text: string
  count: number
}

export interface WordCloudDisplayProps {
  words: WordCloudItem[]
  onSubmitWord?: (text: string) => void
  disabled?: boolean
  maxWords?: number
  testIdPrefix?: string
  className?: string
}

export function WordCloudDisplay({
  words,
  onSubmitWord,
  disabled = false,
  maxWords = 50,
  testIdPrefix = "",
  className,
}: WordCloudDisplayProps) {
  const { t } = useTranslation()
  const [newWord, setNewWord] = useState("")

  const handleWordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWord.trim() || disabled) return
    onSubmitWord?.(newWord.trim())
    setNewWord("")
  }

  const displayedWords = words.slice(0, maxWords)
  const maxCount = Math.max(1, ...words.map((w) => w.count))

  return (
    <div
      className={clsx(
        "mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-3 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-flat)]",
        className,
      )}
      data-testid={`${testIdPrefix}word-cloud-container`}
    >
      {/* Word submission input form */}
      {!disabled && onSubmitWord && (
        <form
          onSubmit={handleWordSubmit}
          className="flex w-full items-center gap-3"
          data-testid={`${testIdPrefix}word-cloud-form`}
        >
          <div className="flex-1 min-w-0">
            <Input
              type="text"
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder={t("game:wordCloud.inputPlaceholder", {
                defaultValue: "Deinen Begriff eingeben...",
              })}
              disabled={disabled}
              data-testid={`${testIdPrefix}word-cloud-input`}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || !newWord.trim()}
            data-testid={`${testIdPrefix}word-cloud-submit`}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("game:wordCloud.addWord", { defaultValue: "Wort hinzufügen" })}
          </Button>
        </form>
      )}

      {displayedWords.length === 0 ? (
        <p
          className="text-center text-sm font-medium text-[var(--ink-muted)]"
          data-testid={`${testIdPrefix}word-cloud-empty`}
        >
          {t("game:wordCloud.emptyHint", {
            defaultValue: "Warten auf Antworten der Spieler...",
          })}
        </p>
      ) : (
        displayedWords.map((item, idx) => {
          // Compute font-size multiplier based on count relative to maxCount (range 1rem to 2.5rem)
          const weightRatio = item.count / maxCount
          const fontSizeRem = (1 + weightRatio * 1.5).toFixed(2)
          const colorClass = ANSWERS_COLORS[idx % ANSWERS_COLORS.length]

          return (
            <span
              key={item.text}
              style={{ fontSize: `${fontSizeRem}rem` }}
              className={clsx(
                "inline-flex items-center rounded-full px-4 py-2 font-bold shadow-sm transition-transform duration-200 hover:scale-105",
                colorClass,
              )}
              data-testid={`${testIdPrefix}word-cloud-item-${item.text}`}
              aria-label={t("game:wordCloud.wordAria", {
                defaultValue: "{{text}} ({{count}} Nennungen)",
                text: item.text,
                count: item.count,
              })}
            >
              {item.text}
              <span className="ml-2 text-xs opacity-75">({item.count})</span>
            </span>
          )
        })
      )}
    </div>
  )
}
