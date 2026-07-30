import clsx from "clsx"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { TYPE_META, TYPE_CATEGORIES } from "@razzoozle/web/lib/questionTypeMeta"
import { useTranslation } from "react-i18next"
import {
  rowRestState,
  rowHoverState,
  rowSelectedState,
  rowFocusState,
  rowShellDensity,
} from "@razzoozle/web/features/manager/components/console/rowStyles"

export interface QuestionTypeDropdownListProps {
  currentType: QuestionTypeKey
  onSelect: (typeId: QuestionTypeKey) => void
  excludeTypes?: QuestionTypeKey[]
  klassenEnabled?: boolean
}

/**
 * Dropdown-spezifische Basis-Klasse: rowShellBase mit überschriebenem Radius (8px statt 16px).
 * Verhindert Spezifitäts-Kollisionen durch separate Konstante (nicht additives Stacking).
 * Grund: Dropdown-Einträge sollen sanftere Radii haben als Manager-Listen-Zeilen.
 */
const dropdownRowShell = "rounded-lg outline-2 -outline-offset-2 transition-colors"

/**
 * QuestionTypeDropdownList — Pure listbox content (portal-free, SSR-testable).
 *
 * Renders TYPE_META grouped by TYPE_CATEGORIES with full A11y semantics.
 * Designed for extraction from Portal wrapper to enable SSR testing.
 */
export function QuestionTypeDropdownList({
  currentType,
  onSelect,
  excludeTypes = [],
  klassenEnabled = false,
}: QuestionTypeDropdownListProps) {
  const { t } = useTranslation("quizz")

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

  return (
    <>
      {typesByCategory.map((category) => (
        <div key={category.id}>
          {/* Category Group */}
          <div
            role="group"
            aria-label={t(category.labelKey)}
            className="sticky top-0 bg-[var(--surface-2)] px-4 py-2"
          >
            <div className="text-xs font-semibold text-[var(--ink-subtle)]">
              {t(category.labelKey)}
            </div>
          </div>

          {/* Category Options */}
          <div className="divide-y divide-[var(--line)]">
            {category.types.map((type) => {
              const Icon = type.icon
              const isSelected = currentType === type.id

              return (
                <button
                  key={type.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`question-type-option-${type.id}`}
                  onClick={() => onSelect(type.id)}
                  className={clsx(
                    dropdownRowShell,
                    "w-full",
                    rowShellDensity.compact,
                    "flex items-center gap-3 text-left px-4 py-2",
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
    </>
  )
}

export default QuestionTypeDropdownList
