import * as Dialog from "@radix-ui/react-dialog"
import clsx from "clsx"
import type { LucideIcon } from "lucide-react"
import { Menu, X } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import NavItem from "@razzoozle/web/features/manager/components/console/NavItem"
import SubGroup from "@razzoozle/web/features/manager/components/console/SubGroup"
import "@razzoozle/web/features/manager/components/console/tokens.css"

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

// The desktop-rail breakpoint (design.md Mobile-First scale: 920/600/375).
// Below it, the persistent rail is swapped for a hamburger-triggered Drawer
// (D12) — deciding *where* the nav DOM mounts (rail vs. Radix Dialog portal)
// needs JS, so this is the one deliberate JS breakpoint in an otherwise
// CSS-responsive shell. Keep this value in sync with the `min-[920px]:`
// Tailwind classes below.
const NAV_DESKTOP_QUERY = "(min-width: 920px)"

const useIsDesktopNav = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(NAV_DESKTOP_QUERY).matches,
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const mql = window.matchMedia(NAV_DESKTOP_QUERY)
    const handleChange = () => setIsDesktop(mql.matches)
    handleChange()
    mql.addEventListener("change", handleChange)
    return () => mql.removeEventListener("change", handleChange)
  }, [])

  return isDesktop
}

interface NavSection {
  /** i18n key for the group heading, or null for an ungrouped tail bucket. */
  labelKey: string | null
  items: ConsoleNavItem[]
}

// The D12 mobile-nav IA (design.md §8·B) — 18 flat nav items collapse into 4
// groups, in this exact order, on both the Drawer (mobile) and the rail
// (desktop; D12 applies to both).
const NAV_GROUPS: { labelKey: string; keys: readonly string[] }[] = [
  {
    labelKey: "manager:tabs.groups.operations",
    keys: ["play", "running", "results", "achievements"],
  },
  {
    labelKey: "manager:tabs.groups.content",
    keys: ["quizz", "catalog", "media", "submissions"],
  },
  {
    labelKey: "manager:tabs.groups.school",
    keys: ["klassen", "schueler", "users", "labels"],
  },
  {
    labelKey: "manager:tabs.groups.system",
    keys: ["design", "gamemode", "ki", "satellite", "profile", "dev"],
  },
]

/**
 * Buckets the flat nav array into the D12 groups, in the documented order.
 * A key the caller passes that isn't part of the documented groups (a future,
 * unmapped section) still renders — appended, ungrouped — so a new tab never
 * silently disappears from the nav.
 */
const groupNavItems = (nav: ConsoleNavItem[]): NavSection[] => {
  const byKey = new Map(nav.map((item) => [item.key, item]))
  const used = new Set<string>()

  const sections = NAV_GROUPS.map(({ labelKey, keys }): NavSection => {
    const items = keys
      .map((key) => byKey.get(key))
      .filter((item): item is ConsoleNavItem => item !== undefined)
    items.forEach((item) => used.add(item.key))
    return { labelKey, items }
  }).filter((section) => section.items.length > 0)

  const rest = nav.filter((item) => !used.has(item.key))
  if (rest.length > 0) {
    sections.push({ labelKey: null, items: rest })
  }

  return sections
}

/**
 * The admin-console frame (spec §2): branded header band + a left NAV RAIL on
 * wide viewports (≥920px), or a hamburger-triggered Drawer below it (D12),
 * plus the content region. Both nav surfaces group the same 18 sections into
 * the 4 D12 IA groups via {@link SubGroup}.
 *
 * The nav is a single roving `role="tablist"` — arrow keys (Left/Right and
 * Up/Down), Home/End move focus between tabs. On the rail, focus-follows-
 * select (arrow keys switch the active section immediately, matching a
 * classic tab-widget); the Drawer is an overlay the user must explicitly
 * dismiss, so there arrow keys only move focus — Enter/Space or a click
 * select (and close the Drawer). Each item is focus-ringed via `NavItem`.
 *
 * Generic + presentational except for the D12 group labels and the Drawer's
 * own chrome strings (menu button, close button, title), which this
 * component translates itself — every OTHER string (brand, title, nav
 * labels, header actions) is still passed in by the caller.
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
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()
  const baseId = useId()
  const tablistRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const isDesktop = useIsDesktopNav()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Reset the content scroll to the top when the active section changes — the
  // single tabpanel is reused across tabs, so without this a switch would
  // inherit the previous tab's scroll offset. Instant (not smooth) to stay calm.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [activeKey])

  // Resizing past the rail breakpoint mid-interaction shouldn't leave a
  // stray open Drawer overlaying the now-visible rail.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false)
  }, [isDesktop])

  const sections = useMemo(() => groupNavItems(nav), [nav])
  const orderedNav = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  )

  const focusItemAt = useCallback(
    (index: number) => {
      const list = tablistRef.current
      if (!list) return
      const items = list.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      const clamped = (index + items.length) % items.length
      items[clamped]?.focus()
      if (isDesktop) {
        items[clamped]?.click()
      }
    },
    [isDesktop],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const foundIndex = orderedNav.findIndex((item) => item.key === activeKey)
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
          focusItemAt(orderedNav.length - 1)
          break
        default:
          break
      }
    },
    [activeKey, focusItemAt, orderedNav],
  )

  const handleDrawerSelect = useCallback(
    (key: string) => {
      onSelect(key)
      setDrawerOpen(false)
    },
    [onSelect],
  )

  const renderNavSections = (onItemSelect: (key: string) => void) => (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={title}
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      className="flex flex-col gap-3 overflow-y-auto nav-scroll"
    >
      {sections.map((section, index) => (
        <SubGroup
          key={section.labelKey ?? `nav-group-${index}`}
          className="flex flex-col gap-1"
        >
          {section.labelKey && (
            <p className="px-1 pb-1 text-xs font-semibold tracking-wide text-[var(--ink-faint)] uppercase">
              {t(section.labelKey)}
            </p>
          )}
          {section.items.map((item) => (
            <NavItem
              key={item.key}
              id={`${baseId}-tab-${item.key}`}
              aria-controls={`${baseId}-panel`}
              icon={item.icon}
              label={item.label}
              count={item.count}
              active={item.key === activeKey}
              orientation="vertical"
              className="w-full"
              onClick={() => onItemSelect(item.key)}
            />
          ))}
        </SubGroup>
      ))}
    </div>
  )

  const showRail = isDesktop && !drawerOpen
  // Tabs mount only in the active surface (rail or open drawer). Radix Dialog
  // unmounts portal content when closed, so mobile+closed has no tab nodes —
  // fall back to aria-label so aria-labelledby never points at a missing id.
  const activeTabId = `${baseId}-tab-${activeKey}`
  const tabsMounted = showRail || drawerOpen
  const activeTabLabel =
    orderedNav.find((item) => item.key === activeKey)?.label ?? title

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
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
          // `console-shell` pins the brand tokens to fixed values (tokens.css) so an
          // active skeleton/theme never recolors the admin console — it stays a
          // stable workspace regardless of the player-facing theme.
          "console-shell z-10 m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-theme)] bg-[var(--surface-2)] shadow-lg sm:m-3",
          className,
        )}
      >
        {/* ── Branded header band (spec §2 differentiation move) ───────────── */}
        <header
          className={clsx(
            "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] px-4 py-3 sm:px-6",
            // Subtle accent-tinted gradient → warm, but legible under any theme.
            "bg-gradient-to-r from-[var(--accent-tint)] to-white",
          )}
        >
          {!isDesktop && (
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label={t("manager:aria.openNav", {
                  defaultValue: "Open navigation",
                })}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <Menu className="size-5" aria-hidden />
              </button>
            </Dialog.Trigger>
          )}
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 font-bold text-[var(--ink)]">
              {brand}
            </div>
            <span
              aria-hidden
              className="hidden h-5 w-px bg-[var(--line)] sm:block"
            />
            <h1 className="hidden truncate text-lg font-bold text-[var(--ink-muted)] sm:block">
              {title}
            </h1>
          </div>
          {headerActions && (
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
            </div>
          )}
          {/* Mobile: title sits on its own line under the brand. */}
          <h1 className="w-full truncate text-lg font-bold text-[var(--ink-muted)] sm:hidden">
            {title}
          </h1>
        </header>

        {/* ── Body: rail (≥920px) ↔ Drawer trigger (mobile) + content ──────── */}
        <div className="flex min-h-0 flex-1 flex-col min-[920px]:flex-row">
          {showRail && (
            <nav
              aria-label={title}
              className="w-56 shrink-0 overflow-y-auto nav-scroll border-r border-[var(--line)] bg-[var(--surface-2)] p-2"
            >
              {renderNavSections(onSelect)}
            </nav>
          )}

          <div
            ref={panelRef}
            role="tabpanel"
            id={`${baseId}-panel`}
            aria-labelledby={tabsMounted ? activeTabId : undefined}
            aria-label={tabsMounted ? undefined : activeTabLabel}
            tabIndex={0}
            className={clsx(
              "console-scroll flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 sm:p-6",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-primary)]",
            )}
          >
            {children}
          </div>
        </div>
      </motion.section>

      {/* ── Mobile nav Drawer (D12 + D10 dialog standard) ─────────────────── */}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-3 bg-[var(--surface)] p-3 shadow-xl focus-visible:outline-none"
        >
          <div className="flex items-center justify-between px-1">
            <Dialog.Title className="text-sm font-semibold text-[var(--ink-muted)]">
              {t("manager:aria.navTitle", { defaultValue: "Navigation" })}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label={t("common:close")}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[var(--ink-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
              >
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          {renderNavSections(handleDrawerSelect)}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default ConsoleShell
