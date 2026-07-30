import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react"
import { useTranslation } from "react-i18next"
import { createPortal } from "react-dom"
import clsx from "clsx"
import { ChevronDown } from "lucide-react"
import type { QuestionTypeKey } from "@razzoozle/web/lib/questionTypeMeta"
import { TYPE_META } from "@razzoozle/web/lib/questionTypeMeta"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useOnClickOutside } from "@razzoozle/web/hooks/useOnClickOutside"
import QuestionTypeDropdownList from "./QuestionTypeDropdownList"
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
}

const POPOVER_GAP = 8
const POPOVER_VIEWPORT_PAD = 8
const OVERLAY_MIN_WIDTH = 240 // px: Mindestbreite damit Inhalte lesbar bleiben (ca. 20 chars @ 12px)

/**
 * Calculate fixed position for the dropdown overlay, with flip-above logic.
 * Overlay-Breite wird an triggerRect.width gekoppelt (mit MIN_WIDTH-Constraint).
 */
function positionDropdown(
  triggerRect: DOMRect,
  contentRect: { width: number; height: number },
): CSSProperties {
  // Berechne Overlay-Breite: min von Trigger-Breite, ansonsten Mindestbreite
  // Dadurch passt sich das Overlay an die verfügbare Leisten-Breite an.
  const overlayWidth = Math.max(triggerRect.width, OVERLAY_MIN_WIDTH)

  const spaceBelow = window.innerHeight - triggerRect.bottom - POPOVER_GAP
  const placeAbove =
    spaceBelow < contentRect.height && triggerRect.top > spaceBelow

  let top = placeAbove
    ? triggerRect.top - contentRect.height - POPOVER_GAP
    : triggerRect.bottom + POPOVER_GAP

  let left = triggerRect.left
  const maxLeft = window.innerWidth - overlayWidth - POPOVER_VIEWPORT_PAD
  left = Math.max(POPOVER_VIEWPORT_PAD, Math.min(left, maxLeft))

  const maxTop = window.innerHeight - contentRect.height - POPOVER_VIEWPORT_PAD
  top = Math.max(POPOVER_VIEWPORT_PAD, Math.min(top, maxTop))

  return { position: "fixed", top, left, zIndex: 50, width: overlayWidth }
}

/**
 * QuestionTypeSelector — Dropdown-based question type picker.
 *
 * Renders TYPE_META grouped by TYPE_CATEGORIES in a dropdown overlay with Portal.
 * Portal positioning: above scroll containers (right sidebar).
 * Full A11y: listbox role, option semantics, arrow-key navigation, focus trap,
 * Escape to close, click-outside to close.
 */
export function QuestionTypeSelector({
  currentType,
  onTypeChange,
  excludeTypes = [],
}: QuestionTypeSelectorProps) {
  const { t } = useTranslation("quizz")
  const config = useManagerStore((s) => s.config)
  const klassenEnabled = config?.klassenEnabled ?? false

  const triggerRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    zIndex: 50,
    visibility: "hidden",
  })

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

  // Handle keyboard navigation and escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setIsOpen(false)
      triggerRef.current?.focus()
    }
  }

  const handleTriggerClick = () => {
    setIsOpen((prev) => !prev)
  }

  const handleOptionSelect = (typeId: QuestionTypeKey) => {
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
        <ChevronDown
          className={clsx(
            "size-4 shrink-0 text-[var(--ink-muted)] transition-transform",
            isOpen && "rotate-180",
          )}
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
            className="console-shell console-scroll max-h-96 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface)] shadow-lg"
          >
            <QuestionTypeDropdownList
              currentType={currentType}
              onSelect={handleOptionSelect}
              excludeTypes={excludeTypes}
              klassenEnabled={klassenEnabled}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

export default QuestionTypeSelector
