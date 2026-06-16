import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react"
import NavItem from "@razzia/web/features/manager/components/console/NavItem"
import "@razzia/web/features/manager/components/console/tokens.css"

export interface ConsoleNavItem {
  /** Stable key used for active comparison + React keys. */
  key: string
  /** Visible, already-translated label. */
  label: string
  icon: LucideIcon
  /** Optional count badge (e.g. moderation queue). */
  count?: number
}

export interface ConsoleShellProps {
  /** Brand mark shown left in the header band (logo / appTitle). */
  brand: ReactNode
  /** Current section title shown in the header band. */
  title: string
  /** Right-hand header slot (language switcher + logout, etc.). */
  headerActions?: ReactNode
  /** Nav entries, in display order. */
  nav: ConsoleNavItem[]
  /** Key of the active entry. */
  activeKey: string
  /** Fired with the selected key on click or keyboard activation. */
  onSelect: (key: string) => void
  /** The active section's content. */
  children: ReactNode
  className?: string
}

/**
 * The admin-console frame (spec §2): branded header band + a left NAV RAIL on
 * wide viewports that collapses to a top horizontal tab-bar on phones, plus the
 * content region.
 *
 * The nav is a single roving `role="tablist"` — arrow keys (Left/Right and
 * Up/Down), Home/End move focus between tabs; Enter/Space (native button) and
 * focus-follow select. Each item is focus-ringed via `NavItem`.
 *
 * Responsive without JS: a `min-[720px]` breakpoint swaps the rail/tab layout.
 * Generic + presentational — i18n strings and the logout/lang controls are
 * passed in.
 */
const ConsoleShell = ({
  brand,
  title,
  headerActions,
  nav,
  activeKey,
  onSelect,
  children,
  className,
}: ConsoleShellProps) => {
  const reducedMotion = useReducedMotion()
  const baseId = useId()
  const tablistRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Reset the content scroll to the top when the active section changes — the
  // single tabpanel is reused across tabs, so without this a switch would
  // inherit the previous tab's scroll offset. Instant (not smooth) to stay calm.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [activeKey])

  const focusItemAt = useCallback((index: number) => {
    const list = tablistRef.current
    if (!list) return
    const items = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    const clamped = (index + items.length) % items.length
    items[clamped]?.focus()
    items[clamped]?.click()
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const foundIndex = nav.findIndex((item) => item.key === activeKey)
      // When activeKey isn't in the list (stale/unknown key), default to the
      // first item so arrow-key nav still works instead of going dead.
      const currentIndex = foundIndex < 0 ? 0 : foundIndex

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault()
          focusItemAt(currentIndex + 1)
          break
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault()
          focusItemAt(currentIndex - 1)
          break
        case "Home":
          event.preventDefault()
          focusItemAt(0)
          break
        case "End":
          event.preventDefault()
          focusItemAt(nav.length - 1)
          break
        default:
          break
      }
    },
    [activeKey, focusItemAt, nav],
  )

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 16 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.32, ease: "easeOut" }
      }
      className={clsx(
        // Fills the full-viewport frame with a UNIFORM margin on every side
        // (m-2/sm:m-3) — flex `align-self: stretch` sizes the width, so no
        // explicit w-full / max-width / mx-auto (those capped + centered on
        // wide screens → unequal left/right vs top/bottom gaps).
        "z-10 m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-lg sm:m-3",
        className,
      )}
    >
      {/* ── Branded header band (spec §2 differentiation move) ───────────── */}
      <header
        className={clsx(
          "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-3 sm:px-6",
          // Subtle accent-tinted gradient → warm, but legible under any theme.
          "bg-gradient-to-r from-[var(--accent-tint)] to-white",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 font-bold text-gray-900">
            {brand}
          </div>
          <span aria-hidden className="hidden h-5 w-px bg-gray-300 sm:block" />
          <h1 className="hidden truncate text-lg font-semibold text-gray-700 sm:block">
            {title}
          </h1>
        </div>
        {headerActions && (
          <div className="ml-auto flex items-center gap-2">{headerActions}</div>
        )}
        {/* Mobile: title sits on its own line under the brand. */}
        <h1 className="w-full truncate text-base font-semibold text-gray-700 sm:hidden">
          {title}
        </h1>
      </header>

      {/* ── Body: rail (≥720px) ↔ top tab-bar (mobile) + content ─────────── */}
      <div className="flex min-h-0 flex-1 flex-col min-[720px]:flex-row">
        <nav
          aria-label={title}
          className={clsx(
            "shrink-0 border-gray-200 bg-gray-50 p-2",
            // Mobile: horizontal scrollable strip. Desktop: fixed-width rail.
            "border-b min-[720px]:w-56 min-[720px]:border-r min-[720px]:border-b-0",
          )}
        >
          <div
            ref={tablistRef}
            role="tablist"
            aria-label={title}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            className={clsx(
              "flex gap-2 overflow-x-auto",
              "min-[720px]:flex-col min-[720px]:overflow-visible",
            )}
          >
            {nav.map((item) => {
              const active = item.key === activeKey
              return (
                <NavItem
                  key={item.key}
                  id={`${baseId}-tab-${item.key}`}
                  aria-controls={`${baseId}-panel`}
                  icon={item.icon}
                  label={item.label}
                  count={item.count}
                  active={active}
                  orientation="vertical"
                  // Rail is vertical; on mobile the flex-row + auto width make it
                  // read as a horizontal strip without a second variant.
                  className="min-[720px]:w-full"
                  onClick={() => onSelect(item.key)}
                />
              )
            })}
          </div>
        </nav>

        <div
          ref={panelRef}
          role="tabpanel"
          id={`${baseId}-panel`}
          aria-labelledby={`${baseId}-tab-${activeKey}`}
          tabIndex={0}
          className={clsx(
            "console-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 sm:p-6",
            "focus-visible:outline-[var(--color-primary)] focus-visible:outline-2 focus-visible:-outline-offset-2",
          )}
        >
          {children}
        </div>
      </div>
    </motion.section>
  )
}

export default ConsoleShell
