import Avatar from "@razzoozle/web/components/Avatar"
import StatusBadge from "@razzoozle/web/components/StatusBadge"
import type { RosterEntry } from "@razzoozle/common"
import clsx from "clsx"
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  roster: RosterEntry[]
  value: number | null
  onChange: (studentId: number) => void
  disabled?: boolean
}

/**
 * PlayerNameSelect — searchable listbox for selecting a student name from class roster.
 * Used in class-mode join flow (Stage 3).
 *
 * Renders a search input above a scrollable list of roster entries. Each row displays:
 * [Avatar] [Name] [Status/Already-Joined badge] [Radio button]
 *
 * Already-joined rows are greyed out and not selectable.
 */
const PlayerNameSelect = ({ roster, value, onChange, disabled = false }: Props) => {
  const { t } = useTranslation()
  const [search, setSearch] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)

  // Filter roster by search term (case-insensitive, displayName only)
  const filteredRoster = roster.filter((entry) =>
    entry.displayName.toLowerCase().includes(search.toLowerCase()),
  )

  // Handle search input change
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setHighlightedIndex(filteredRoster.length > 0 ? 0 : null)
  }

  // Handle row click to select
  const handleRowClick = (studentId: number, alreadyJoined: boolean) => {
    if (!disabled && !alreadyJoined) {
      onChange(studentId)
    }
  }

  // Handle keyboard navigation in list
  const handleListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (filteredRoster.length === 0) {
      return
    }

    const len = filteredRoster.length
    const currentIndex = highlightedIndex !== null ? highlightedIndex : 0

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault()
        const nextIndex = currentIndex < len - 1 ? currentIndex + 1 : 0
        setHighlightedIndex(nextIndex)
        break
      }
      case "ArrowUp": {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : len - 1
        setHighlightedIndex(prevIndex)
        break
      }
      case "Enter": {
        e.preventDefault()
        const highlightedEntry = filteredRoster[currentIndex]
        if (
          highlightedEntry &&
          !disabled &&
          !highlightedEntry.alreadyJoined
        ) {
          onChange(highlightedEntry.studentId)
        }
        break
      }
      case "Escape": {
        e.preventDefault()
        // Clear selection/highlighting
        setHighlightedIndex(null)
        searchInputRef.current?.focus()
        break
      }
      default:
        break
    }
  }

  // Handle keyboard nav from search input
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (filteredRoster.length === 0) {
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex(0)
      listContainerRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div>
        <label htmlFor="student-search" className="sr-only">
          {t("game:nameSelect.searchLabel", {
            defaultValue: "Find your name",
          })}
        </label>
        <input
          ref={searchInputRef}
          id="student-search"
          type="text"
          value={search}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
          placeholder={t("game:nameSelect.searchPlaceholder", {
            defaultValue: "Type to find yourself",
          })}
          maxLength={40}
          disabled={disabled}
          className={clsx(
            "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] px-4 py-3 text-[var(--game-fg)] placeholder-gray-400",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
            disabled && "cursor-not-allowed opacity-50",
          )}
          aria-label={t("game:nameSelect.searchLabel", {
            defaultValue: "Find your name",
          })}
        />
      </div>

      {/* Roster listbox */}
      {filteredRoster.length > 0 ? (
        <div
          ref={listContainerRef}
          role="listbox"
          className={clsx(
            "flex max-h-[300px] flex-col gap-2 overflow-y-auto rounded-lg border border-[var(--border-hairline)] bg-white p-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
          )}
          onKeyDown={handleListKeyDown}
          tabIndex={0}
          aria-label={t("game:nameSelect.rosterLabel", {
            defaultValue: "Student roster",
          })}
        >
          {filteredRoster.map((entry, index) => {
            const isSelected = value === entry.studentId
            const isHighlighted = highlightedIndex === index
            const isDisabledRow = disabled || entry.alreadyJoined

            return (
              <div
                key={entry.studentId}
                role="option"
                aria-selected={isSelected}
                aria-disabled={isDisabledRow}
                onClick={() => handleRowClick(entry.studentId, entry.alreadyJoined)}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border-hairline)] px-4 py-3 transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]",
                  isHighlighted && !isDisabledRow
                    ? "bg-blue-50"
                    : "bg-[var(--surface)]",
                  isDisabledRow && "cursor-not-allowed opacity-50",
                  isSelected && !isDisabledRow
                    ? "ring-2 ring-[var(--color-primary)]"
                    : "",
                )}
                tabIndex={isHighlighted ? 0 : -1}
                onMouseEnter={() => !isDisabledRow && setHighlightedIndex(index)}
              >
                {/* Avatar */}
                <Avatar src={undefined} name={entry.displayName} size={40} />

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p
                    className="truncate text-sm font-medium text-[var(--game-fg)]"
                    title={entry.displayName}
                  >
                    {entry.displayName}
                  </p>
                </div>

                {/* Status badge or already-joined indicator */}
                {entry.alreadyJoined && (
                  <StatusBadge
                    status="online"
                    className="shrink-0 text-xs"
                  >
                    {t("game:nameSelect.alreadyJoined", {
                      defaultValue: "Joined",
                    })}
                  </StatusBadge>
                )}

                {/* Selection radio */}
                <input
                  type="radio"
                  name="student-select"
                  value={entry.studentId}
                  checked={isSelected}
                  onChange={() => handleRowClick(entry.studentId, entry.alreadyJoined)}
                  disabled={isDisabledRow}
                  className={clsx(
                    "shrink-0 accent-[var(--color-primary)]",
                    isDisabledRow && "cursor-not-allowed",
                  )}
                  aria-label={t("game:nameSelect.selectStudent", {
                    defaultValue: "Select {{ name }}",
                    name: entry.displayName,
                  })}
                />
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty state */
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface)] py-8 text-center text-sm text-gray-500"
        >
          {t("game:nameSelect.empty", {
            defaultValue: "No students found. Contact your teacher.",
          })}
        </div>
      )}
    </div>
  )
}

export default PlayerNameSelect
