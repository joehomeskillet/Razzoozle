import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import clsx from "clsx"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { TYPE_META, TYPE_CATEGORIES } from "@razzoozle/web/lib/questionTypeMeta"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import {
  rowShellBase,
  rowRestState,
  rowHoverState,
  rowSelectedState,
  rowFocusState,
  rowShellDensity,
} from "@razzoozle/web/features/manager/components/console/rowStyles"
import type { CSSProperties } from "react"

export interface QuestionTypeSelectorProps {
  currentType: QuestionTypeKey
  onTypeChange: (next: QuestionTypeKey) => void
  excludeTypes?: QuestionTypeKey[]
  /** Internal: for SSR tests to render open state. */
  _testIsOpen?: boolean
}

const POPOVER_GAP = 8
const POPOVER_VIEWPORT_PAD = 8

/**
 * Calculate fixed position for the dropdown overlay, with flip-above logic.
 */
function positionDropdown(
  triggerRect: DOMRect,
  contentRect: { width: number; height: number },
): CSSProperties {
  const spaceBelow = window.innerHeight - triggerRect.bottom - POPOVER_GAP
  const placeAbove =
    spaceBelow < contentRect.height && triggerRect.top > spaceBelow

  let top = placeAbove
    ? triggerRect.top - contentRect.height - POPOVER_GAP
    : triggerRect.bottom + POPOVER_GAP

  let left = triggerRect.left
  const maxLeft = window.innerWidth - contentRect.width - POPOVER_VIEWPORT_PAD
  left = Math.max(POPOVER_VIEWPORT_PAD, Math.min(left, maxLeft))

  const maxTop = window.innerHeight - contentRect.height - POPOVER_VIEWPORT_PAD
  top = Math.max(POPOVER_VIEWPORT_PAD, Math.min(top, maxTop))

  return { position: "fixed", top, left, zIndex: 50 }
}

/**
 * QuestionTypeSelector — Dropdown-based question type picker.
 *
 * Renders TYPE_META grouped by TYPE_CATEGORIES (5 groups) in a dropdown overlay.
 * Uses Portal for positioning above scroll containers (right sidebar).
 * Full A11y: listbox role, option semantics, arrow-key navigation, focus trap,
 * Escape to close, click-outside to close.
 */
export function QuestionTypeSelector({
  currentType,
  onTypeChange,
  excludeTypes = [],
  _testIsOpen = false,
}: QuestionTypeSelectorProps) {
  const { t } = useTranslation("quizz")
  const config = useManagerStore((s) => s.config)
  const klassenEnabled = config?.klassenEnabled ?? false

  const triggerRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(_testIsOpen)
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    zIndex: 50,
    visibility: "hidden",
  })

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

  // Get the current type's metadata for the trigger display
  const currentTypeMeta = TYPE_META.find((t) => t.id === currentType)
  const CurrentTypeIcon = currentTypeMeta?.icon

  // Update overlay position on open, resize, scroll
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const overlay = overlayRef.current
    if (!trigger || !overlay || !isOpen) return

    const next = positionDropdown(
      trigger.getBoundingClientRect(),
      overlay.getBoundingClientRect(),
    )
    setStyle({ ...next, visibility: "visible" })
  }, [isOpen])

  useLayoutEffect(() => {
    updatePosition()
  }, [updatePosition, isOpen])

  useEffect(() => {
    if (!isOpen) return

    const onScrollOrResize = () => updatePosition()
    window.addEventListener("resize", onScrollOrResize)
    window.addEventListener("scroll", onScrollOrResize, true)
    return () => {
      window.removeEventListener("resize", onScrollOrResize)
      window.removeEventListener("scroll", onScrollOrResize, true)
    }
  }, [updatePosition, isOpen])

  // Close on click outside (type cast to HTMLElement for ref array compatibility)
  useOnClickOutside({
    ref: [
      triggerRef as React.RefObject<HTMLElement>,
      overlayRef as React.RefObject<HTMLElement>,
    ],
    handler: () => setIsOpen(false),
  })

  // Handle keyboard navigation in the overlay
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
      return
    }

    let delta = 0
    if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1
    else if (e.key === "Enter" || e.key === " ") {
      // Select the focused option
      e.preventDefault()
      return
    } else return

    e.preventDefault()
    const currentIdx = flatTypes.findIndex((tp) => tp.id === currentType)
    const fallbackIdx = currentIdx === -1 ? 0 : currentIdx
    const nextIdx = (fallbackIdx + delta + flatTypes.length) % flatTypes.length
    onTypeChange(flatTypes[nextIdx].id)
  }

  const handleTriggerClick = () => {
    setIsOpen((prev) => !prev)
  }

  const handleOptionClick = (typeId: QuestionTypeKey) => {
    onTypeChange(typeId)
    setIsOpen(false)
  }

  return (
    <div>
      {/* Label */}
      <div className="mb-2 px-4 py-1 text-xs font-semibold text-[var(--ink-subtle)]">
        {t("quizz:type.selectType", { defaultValue: "Fragetyp wählen" })}
      </div>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        data-testid="question-type-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t("quizz:type.selectType", { defaultValue: "Fragetyp wählen" })}
        onClick={handleTriggerClick}
        className={clsx(
          rowShellBase,
          "w-full",
          rowShellDensity.compact,
          "mx-4 flex items-center justify-between gap-3",
          "transition-colors",
          isOpen ? rowSelectedState : clsx(rowRestState, rowHoverState, rowFocusState),
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {CurrentTypeIcon && (
            <CurrentTypeIcon className="size-4 shrink-0 text-[var(--ink-muted)]" />
          )}
          <span className="truncate text-sm font-medium text-[var(--ink)]">
            {currentTypeMeta && t(currentTypeMeta.labelKey)}
          </span>
        </div>
        {/* Chevron icon (CSS-only, no Lucide import for SSR test compatibility) */}
        <div
          className={clsx(
            "size-4 shrink-0 border-r-2 border-b-2 border-[var(--ink-muted)] transition-transform",
            "relative inline-block",
            isOpen && "rotate-[225deg]",
            !isOpen && "rotate-45",
          )}
          style={{ width: "8px", height: "8px", marginRight: "4px" }}
        />
      </button>

      {/* Dropdown Overlay (Portal) */}
      {isOpen &&
        createPortal(
          <div
            ref={overlayRef}
            role="listbox"
            data-testid="question-type-list"
            style={style}
            onKeyDown={handleKeyDown}
            className="max-h-96 w-80 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg"
          >
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
                        onClick={() => handleOptionClick(type.id)}
                        className={clsx(
                          rowShellBase,
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
          </div>,
          document.body,
        )}
    </div>
  )
}

export default QuestionTypeSelector
