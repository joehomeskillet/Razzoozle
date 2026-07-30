import { useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import clsx from "clsx"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { TYPE_META, TYPE_CATEGORIES } from "@razzoozle/web/lib/questionTypeMeta"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import {
  rowShellBase,
  rowRestState,
  rowHoverState,
  rowSelectedState,
  rowFocusState,
  rowShellDensity,
} from "@razzoozle/web/features/manager/components/console/rowStyles"

export interface QuestionTypeSelectorProps {
  currentType: QuestionTypeKey
  onTypeChange: (next: QuestionTypeKey) => void
  excludeTypes?: QuestionTypeKey[]
}

/**
 * QuestionTypeSelector — Grouped, vertically scrollable question type picker.
 *
 * Renders TYPE_META grouped by TYPE_CATEGORIES (5 groups), with A11y semantics
 * matching the legacy grid picker (radiogroup + roving tabIndex + arrow keys).
 * Uses rowStyles state classes for visual feedback (rest/hover/selected/focus).
 *
 * Props delegate to the caller: this component only handles selection UI,
 * not buildTypePatch or field-clearing logic.
 */
export function QuestionTypeSelector({
  currentType,
  onTypeChange,
  excludeTypes = [],
}: QuestionTypeSelectorProps) {
  const { t } = useTranslation("quizz")
  const config = useManagerStore((s) => s.config)
  const klassenEnabled = config?.klassenEnabled ?? false

  const containerRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<Map<QuestionTypeKey, HTMLButtonElement>>(new Map())

  // Filter types by excludeTypes and klassenEnabled
  const filteredTypes = TYPE_META.filter((meta) => {
    if (excludeTypes.includes(meta.id)) return false
    if (!klassenEnabled && meta.requiresKlassen) return false
    return true
  })

  // Group filtered types by category, in category order
  const typesByCategory = TYPE_CATEGORIES.map((cat) => ({
    ...cat,
    types: filteredTypes.filter((t) => t.category === cat.id),
  })).filter((cat) => cat.types.length > 0)

  // Flat list of all available types (for arrow key navigation)
  const flatTypes = typesByCategory.flatMap((cat) => cat.types)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let delta = 0
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1
    else return

    e.preventDefault()
    const currentIdx = flatTypes.findIndex((tp) => tp.id === currentType)
    const fallbackIdx = currentIdx === -1 ? 0 : currentIdx
    const nextIdx = (fallbackIdx + delta + flatTypes.length) % flatTypes.length
    onTypeChange(flatTypes[nextIdx].id)
  }

  // Focus management: ensure the selected item is focused after selection
  useEffect(() => {
    const button = optionsRef.current.get(currentType)
    if (button && containerRef.current?.contains(document.activeElement)) {
      button.focus()
    }
  }, [currentType])

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={t("quizz:type.selectType", { defaultValue: "Fragetyp wählen" })}
      data-testid="question-type-list"
      className="max-h-96 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)]"
    >
      {typesByCategory.map((category) => (
        <div key={category.id}>
          {/* Category header */}
          <div className="sticky top-0 bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold text-[var(--ink-subtle)] border-b border-[var(--line)]">
            {t(category.labelKey)}
          </div>

          {/* Category options */}
          <div className="divide-y divide-[var(--line)]">
            {category.types.map((type) => {
              const Icon = type.icon
              const isSelected = currentType === type.id

              return (
                <button
                  key={type.id}
                  ref={(el) => {
                    if (el) optionsRef.current.set(type.id, el)
                  }}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  aria-description={t(type.descKey)}
                  data-testid={`question-type-option-${type.id}`}
                  onClick={() => onTypeChange(type.id)}
                  onKeyDown={handleKeyDown}
                  className={clsx(
                    rowShellBase,
                    "w-full",
                    rowShellDensity.compact,
                    "flex items-center gap-3 text-left",
                    "transition-colors",
                    isSelected
                      ? rowSelectedState
                      : clsx(rowRestState, rowHoverState, rowFocusState),
                  )}
                >
                  <Icon className="size-4 shrink-0 text-[var(--ink-muted)]" />
                  <span className="truncate text-sm font-medium text-[var(--ink)]">
                    {t(type.labelKey)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default QuestionTypeSelector
