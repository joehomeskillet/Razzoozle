import clsx from "clsx"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { EmojiPinSetEntry } from "@razzoozle/common/types/game/socket"
import { fetchWithAuth } from "@razzoozle/web/lib/api"

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  error?: string
  disabled?: boolean
}

// Grapheme-aware splitting: handles multi-codepoint emoji (e.g., "🕷️")
const splitGraphemes = (value: string): string[] => {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return Array.from(segmenter.segment(value), (s) => s.segment)
  }
  return Array.from(value)
}

const EmojiPinInput = ({ value, onChange, error, disabled = false }: Props) => {
  const { t } = useTranslation()
  const [emojiSet, setEmojiSet] = useState<EmojiPinSetEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const slotRefs = useRef<Array<HTMLDivElement | null>>([])
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)

  // Fetch emoji set from server
  useEffect(() => {
    const fetchEmojiSet = async () => {
      try {
        const response = await fetchWithAuth("/api/emoji-pin-set")
        if (!response.ok) {
          console.error("Failed to fetch emoji set:", response.statusText)
          return
        }
        const data = await response.json()
        setEmojiSet(Array.isArray(data) ? data : [])
      } catch (err) {
        console.error("Error fetching emoji set:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchEmojiSet()
  }, [])

  // Filter emoji based on search query (by German label)
  const filteredEmoji = emojiSet.filter((entry) =>
    entry.label.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleSlotClick = (index: number) => {
    if (disabled) return
    setActiveSlot(index)
    setSearchQuery("")
    setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  const handleEmojiSelect = (emoji: string) => {
    if (activeSlot === null) return
    const next = [...value]
    next[activeSlot] = emoji
    onChange(next)

    // Advance to next empty slot or close picker
    const nextEmptySlot = next.findIndex((e, i) => !e && i > activeSlot)
    if (nextEmptySlot !== -1) {
      setActiveSlot(nextEmptySlot)
      setSearchQuery("")
    } else {
      setActiveSlot(null)
      setSearchQuery("")
    }
  }

  const handleSlotKeyDown =
    (index: number) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return

      // Enter opens picker
      if (e.key === "Enter") {
        e.preventDefault()
        handleSlotClick(index)
        return
      }

      // Backspace clears slot and moves to previous
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault()
        if (value[index]) {
          const next = [...value]
          next[index] = ""
          onChange(next)
        }
        if (index > 0) {
          slotRefs.current[index - 1]?.focus()
        }
        return
      }

      // Tab moves to next slot
      if (e.key === "Tab") {
        const nextIndex = e.shiftKey ? index - 1 : index + 1
        if (nextIndex >= 0 && nextIndex < 4) {
          e.preventDefault()
          slotRefs.current[nextIndex]?.focus()
        }
        return
      }

      // Arrow left/right moves between slots
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        if (index > 0) {
          slotRefs.current[index - 1]?.focus()
        }
        return
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        if (index < 3) {
          slotRefs.current[index + 1]?.focus()
        }
        return
      }

      // Arrow up/down or any character opens picker
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault()
        handleSlotClick(index)
        return
      }

      // Any printable character opens picker and starts search
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        setActiveSlot(index)
        setSearchQuery(e.key)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setActiveSlot(null)
      setSearchQuery("")
      slotRefs.current[activeSlot ?? 0]?.focus()
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      // Focus first option in picker list
      const firstOption = pickerRef.current?.querySelector("[role='option']")
      ;(firstOption as HTMLDivElement)?.focus()
      return
    }

    if (e.key === "Enter" && filteredEmoji.length > 0) {
      e.preventDefault()
      handleEmojiSelect(filteredEmoji[0].emoji)
    }
  }

  const handlePickerOptionKeyDown =
    (emoji: string) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        handleEmojiSelect(emoji)
        return
      }

      if (e.key === "Escape") {
        e.preventDefault()
        setActiveSlot(null)
        setSearchQuery("")
        slotRefs.current[activeSlot ?? 0]?.focus()
        return
      }

      if (e.key === "ArrowDown") {
        e.preventDefault()
        const currentOption = e.currentTarget
        const nextOption = currentOption.nextElementSibling as HTMLDivElement
        nextOption?.focus()
        return
      }

      if (e.key === "ArrowUp") {
        e.preventDefault()
        const currentOption = e.currentTarget
        const prevOption = currentOption.previousElementSibling as HTMLDivElement
        prevOption?.focus()
      }
    }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return
    e.preventDefault()
    const pasted = e.clipboardData.getData("text")
    const emojis = splitGraphemes(pasted).slice(0, 4)
    const next = [...value]
    emojis.forEach((emoji, i) => {
      if (i < 4) next[i] = emoji
    })
    onChange(next)
  }

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node) &&
        slotRefs.current &&
        !slotRefs.current.some((ref) => ref?.contains(event.target as Node))
      ) {
        setActiveSlot(null)
        setSearchQuery("")
      }
    }

    if (activeSlot !== null) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [activeSlot])

  return (
    <div>
      {/* Label */}
      <label
        htmlFor="emoji-pin-1"
        className="mb-3 block text-sm font-semibold text-[var(--game-fg)]"
      >
        {t("game:emojiPin.label", { defaultValue: "Confirm with your PIN" })}
      </label>

      {/* Slots wrapper */}
      <div
        className="flex gap-3"
        aria-label={t("game:emojiPin.wrapperAria", { defaultValue: "Emoji PIN input" })}
        onPaste={handlePaste}
        role="group"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              slotRefs.current[i] = el
            }}
            id={`emoji-pin-${i + 1}`}
            tabIndex={0}
            role="button"
            aria-pressed={activeSlot === i}
            aria-label={t("game:emojiPin.slotAria", {
              defaultValue: "PIN slot {{slot}} of 4: {{emoji}}",
              slot: i + 1,
              emoji: value[i] || "empty",
            })}
            aria-invalid={!!error}
            aria-describedby={error ? "emoji-pin-error" : undefined}
            onKeyDown={handleSlotKeyDown(i)}
            onClick={() => handleSlotClick(i)}
            className={clsx(
              "flex size-12 min-h-11 min-w-11 items-center justify-center rounded-lg border-2 text-4xl",
              {
                "border-[var(--border-hairline)] bg-[var(--surface)]": !error,
                "border-[var(--state-wrong)] bg-[var(--surface)]": error,
                "ring-2 ring-[var(--color-primary)] ring-offset-2":
                  activeSlot === i,
                "cursor-pointer hover:bg-[var(--surface-3)]": !disabled && !value[i],
                "cursor-default opacity-60": disabled,
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]":
                  true,
                outline: false,
              },
            )}
            style={{
              outlineOffset: "-4px",
            }}
          >
            {value[i] || (
              <span className="text-xl text-[var(--border-hairline)]">·</span>
            )}
          </div>
        ))}
      </div>

      {/* Picker popover */}
      {activeSlot !== null && (
        <div
          ref={pickerRef}
          className="absolute z-50 mt-2 w-80 rounded-[var(--radius-theme)] border border-[var(--border-hairline)] bg-[var(--surface)] shadow-[var(--shadow-flat)]"
          role="combobox"
          aria-label={t("game:emojiPin.pickerLabel", {
            defaultValue: "Emoji picker",
          })}
          aria-expanded={activeSlot !== null}
        >
          {/* Search input */}
          <div className="border-b border-[var(--border-hairline)] p-3">
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t("game:emojiPin.searchPlaceholder", {
                defaultValue: "Search by name...",
              })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              autoComplete="off"
            />
          </div>

          {/* Emoji list */}
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
                {t("game:emojiPin.loading", { defaultValue: "Loading..." })}
              </div>
            ) : filteredEmoji.length > 0 ? (
              filteredEmoji.map((entry) => (
                <div
                  key={entry.emoji}
                  role="option"
                  tabIndex={0}
                  onClick={() => handleEmojiSelect(entry.emoji)}
                  onKeyDown={handlePickerOptionKeyDown(entry.emoji)}
                  className={clsx(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--surface-3)]",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                  )}
                >
                  <span className="text-2xl">{entry.emoji}</span>
                  <span className="text-sm text-[var(--ink-muted)]">
                    {entry.label}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-[var(--ink-muted)]">
                {t("game:emojiPin.noResults", { defaultValue: "No emoji found" })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          id="emoji-pin-error"
          role="alert"
          className="mt-2 text-sm font-medium text-[var(--state-wrong)]"
        >
          {error}
        </div>
      )}
    </div>
  )
}

export default EmojiPinInput
