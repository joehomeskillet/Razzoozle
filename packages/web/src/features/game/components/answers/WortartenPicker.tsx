import Markdown from "@razzoozle/web/components/Markdown"
import { ANSWER_TILE_SURFACE } from "@razzoozle/web/features/game/utils/answers"
import * as Dialog from "@radix-ui/react-dialog"
import clsx from "clsx"
import { X } from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import type { AnswerViewProps } from "./types"

// CSS-only tap scale-down. Solo intentionally omits this — pre-existing
// per-variant drift, preserved as-is (not "fixed" here).
const PRESS_FEEDBACK =
  "transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"

/** Responsive breakpoint: mobile bottom-sheet below, desktop popover at/above. */
const DESKTOP_MEDIA = "(min-width: 768px)"
const POPOVER_GAP = 8
const POPOVER_VIEWPORT_PAD = 8

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

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(DESKTOP_MEDIA).matches,
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(DESKTOP_MEDIA)
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isDesktop
}

/** Fixed popover coords from token rect; flip above when short on space below. */
function positionPopover(
  anchor: DOMRect,
  content: { width: number; height: number },
): CSSProperties {
  const spaceBelow = window.innerHeight - anchor.bottom - POPOVER_GAP
  const placeAbove =
    spaceBelow < content.height && anchor.top > spaceBelow

  let top = placeAbove
    ? anchor.top - content.height - POPOVER_GAP
    : anchor.bottom + POPOVER_GAP

  let left = anchor.left + anchor.width / 2 - content.width / 2
  const maxLeft = window.innerWidth - content.width - POPOVER_VIEWPORT_PAD
  left = Math.max(POPOVER_VIEWPORT_PAD, Math.min(left, maxLeft))

  const maxTop = window.innerHeight - content.height - POPOVER_VIEWPORT_PAD
  top = Math.max(POPOVER_VIEWPORT_PAD, Math.min(top, maxTop))

  return { position: "fixed", top, left, zIndex: 50 }
}

interface PosOptionGridProps {
  tokenIndex: number
  posSet: string[]
  testIdPrefix: string
  isSolo: boolean
  onSelect: (tokenIndex: number, pos: string) => void
  /** Extra classes for layout (sheet grid vs popover wrap). */
  className?: string
}

function PosOptionGrid({
  tokenIndex,
  posSet,
  testIdPrefix,
  isSolo,
  onSelect,
  className,
}: PosOptionGridProps) {
  const { t } = useTranslation()
  return (
    <div className={className}>
      {posSet.map((pos) => (
        <button
          key={pos}
          type="button"
          data-testid={`${testIdPrefix}wortarten-pos-${tokenIndex}-${pos}`}
          onClick={() => onSelect(tokenIndex, pos)}
          className={clsx(
            ANSWER_TILE_SURFACE,
            "min-h-11 min-w-11 px-3 py-2 text-sm font-medium text-[color:var(--game-fg)]",
            !isSolo && PRESS_FEEDBACK,
          )}
        >
          {t(`quizz:wortarten.pos.${pos}`, pos)}
        </button>
      ))}
    </div>
  )
}

interface MobileSheetProps {
  open: boolean
  tokenLabel: string
  tokenIndex: number
  posSet: string[]
  testIdPrefix: string
  isSolo: boolean
  onClose: () => void
  onSelect: (tokenIndex: number, pos: string) => void
}

function MobileBottomSheet({
  open,
  tokenLabel,
  tokenIndex,
  posSet,
  testIdPrefix,
  isSolo,
  onClose,
  onSelect,
}: MobileSheetProps) {
  const { t } = useTranslation()
  const titleId = `${testIdPrefix}wortarten-sheet-title`

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-labelledby={titleId}
          className={clsx(
            ANSWER_TILE_SURFACE,
            "fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-b-0 p-4 pb-[env(safe-area-inset-bottom,1rem)] shadow-[var(--shadow-flat)] outline-none",
            "motion-reduce:transition-none",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <Dialog.Title
              id={titleId}
              className="truncate text-base font-semibold text-[color:var(--game-fg)]"
            >
              {tokenLabel}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className={clsx(
                  "flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-theme)] text-[color:var(--game-fg)]/70 hover:text-[color:var(--game-fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                  PRESS_FEEDBACK,
                )}
                aria-label={t("common:close")}
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <PosOptionGrid
            tokenIndex={tokenIndex}
            posSet={posSet}
            testIdPrefix={testIdPrefix}
            isSolo={isSolo}
            onSelect={onSelect}
            className="grid grid-cols-2 gap-2 sm:grid-cols-3"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface DesktopPopoverProps {
  tokenIndex: number
  posSet: string[]
  testIdPrefix: string
  isSolo: boolean
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onSelect: (tokenIndex: number, pos: string) => void
}

function DesktopPopover({
  tokenIndex,
  posSet,
  testIdPrefix,
  isSolo,
  anchorRef,
  onClose,
  onSelect,
}: DesktopPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: -9999,
    left: -9999,
    zIndex: 50,
    visibility: "hidden",
  })

  const updatePosition = useCallback(() => {
    const anchorEl = anchorRef.current
    const popEl = popoverRef.current
    if (!anchorEl || !popEl) return
    const next = positionPopover(
      anchorEl.getBoundingClientRect(),
      popEl.getBoundingClientRect(),
    )
    setStyle({ ...next, visibility: "visible" })
  }, [anchorRef])

  useLayoutEffect(() => {
    updatePosition()
  }, [updatePosition, posSet, tokenIndex])

  useEffect(() => {
    const onScrollOrResize = () => updatePosition()
    window.addEventListener("resize", onScrollOrResize)
    // Capture scroll from nested containers too.
    window.addEventListener("scroll", onScrollOrResize, true)
    return () => {
      window.removeEventListener("resize", onScrollOrResize)
      window.removeEventListener("scroll", onScrollOrResize, true)
    }
  }, [updatePosition])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      // Token button toggles via its own onClick — do not close here.
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [anchorRef, onClose])

  return createPortal(
    <div
      ref={popoverRef}
      role="listbox"
      style={style}
      className={clsx(ANSWER_TILE_SURFACE, "max-w-[16rem] p-2")}
    >
      <PosOptionGrid
        tokenIndex={tokenIndex}
        posSet={posSet}
        testIdPrefix={testIdPrefix}
        isSolo={isSolo}
        onSelect={onSelect}
        className="flex flex-wrap justify-center gap-1"
      />
    </div>,
    document.body,
  )
}

/**
 * WortartenPicker — sentence-token tap-to-open POS picker (MP + Solo).
 *
 * Pure props: no socket/store access, no sound/haptics. `onChange` carries
 * local UI state only; `onSubmit` just signals intent — the caller builds
 * the wire payload via `buildWortartenAnswer`. `testIdPrefix` doubles as the
 * MP/Solo discriminator for the container/submit-button treatments that
 * genuinely differ between the two (feedback border, width, press-feedback).
 *
 * Adaptive chrome (WP-3a / #316): mobile bottom-sheet (Radix Dialog portal)
 * and desktop fixed popover (createPortal). Token row never reflows.
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
  const isDesktop = useIsDesktop()
  const tokenRefs = useRef<Map<number, HTMLButtonElement | null>>(new Map())
  // Stable ref object for the open token (DesktopPopover needs RefObject).
  const openTokenRef = useRef<HTMLButtonElement | null>(null)
  openTokenRef.current =
    openTokenIndex != null
      ? (tokenRefs.current.get(openTokenIndex) ?? null)
      : null

  const isTokenDisabled = (i: number): boolean =>
    disabledTokens?.includes(i) ?? false

  const closePicker = useCallback(() => {
    onChange({ choices, openTokenIndex: null })
  }, [choices, onChange])

  const handleSelectPos = useCallback(
    (tokenIndex: number, pos: string) => {
      if (disabled) return
      const next = [...choices]
      next[tokenIndex] = pos
      onChange({ choices: next, openTokenIndex: null })
    },
    [choices, disabled, onChange],
  )

  // Every ACTIVE (non-disabled) token must have a choice before submit unlocks.
  const hasIncompleteActiveTokens = choices.some(
    (choice, idx) => !isTokenDisabled(idx) && choice === null,
  )
  const submitDisabled =
    disabled || choices.length === 0 || hasIncompleteActiveTokens

  const tokenList = tokens ?? []
  const posList = posSet ?? []
  const openToken =
    openTokenIndex != null && !isTokenDisabled(openTokenIndex)
      ? tokenList[openTokenIndex]
      : undefined
  const pickerOpen = openTokenIndex != null && openToken !== undefined

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
        {tokenList.map((token, i) => {
          const choice = choices[i] ?? null
          const isOpen = openTokenIndex === i
          const isDisabled = isTokenDisabled(i)

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <button
                type="button"
                ref={(el) => {
                  tokenRefs.current.set(i, el)
                }}
                data-testid={`${testIdPrefix}wortarten-token-${i}`}
                onClick={() =>
                  !disabled &&
                  !isDisabled &&
                  onChange({ choices, openTokenIndex: isOpen ? null : i })
                }
                disabled={disabled || isDisabled}
                aria-expanded={isOpen}
                aria-haspopup={isDesktop ? "listbox" : "dialog"}
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
            </div>
          )
        })}
      </div>

      {pickerOpen &&
        openTokenIndex != null &&
        (isDesktop ? (
          <DesktopPopover
            tokenIndex={openTokenIndex}
            posSet={posList}
            testIdPrefix={testIdPrefix}
            isSolo={isSolo}
            anchorRef={openTokenRef}
            onClose={closePicker}
            onSelect={handleSelectPos}
          />
        ) : (
          <MobileBottomSheet
            open
            tokenLabel={openToken}
            tokenIndex={openTokenIndex}
            posSet={posList}
            testIdPrefix={testIdPrefix}
            isSolo={isSolo}
            onClose={closePicker}
            onSelect={handleSelectPos}
          />
        ))}

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
