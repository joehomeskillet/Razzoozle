import { EVENTS } from "@razzoozle/common/constants"
import type { ManagerConfig } from "@razzoozle/common/types/manager"
import Button from "@razzoozle/web/components/Button"
import LanguageSwitcher from "@razzoozle/web/components/LanguageSwitcher"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import ConfigAI from "@razzoozle/web/features/manager/components/configurations/ConfigAI"
import ConfigAchievements from "@razzoozle/web/features/manager/components/configurations/ConfigAchievements"
import ConfigCatalog from "@razzoozle/web/features/manager/components/configurations/ConfigCatalog"
import ConfigDev from "./ConfigDev"
import ConfigGameMode from "@razzoozle/web/features/manager/components/configurations/ConfigGameMode"
import ConfigManageQuizz from "@razzoozle/web/features/manager/components/configurations/ConfigManageQuizz"
import ConfigMedia from "@razzoozle/web/features/manager/components/configurations/ConfigMedia"
import ConfigProfile from "@razzoozle/web/features/manager/components/configurations/ConfigProfile"
import ConfigResults from "@razzoozle/web/features/manager/components/configurations/ConfigResults"
import ConfigSelectQuizz from "@razzoozle/web/features/manager/components/configurations/ConfigSelectQuizz"
import ConfigSubmissions from "@razzoozle/web/features/manager/components/configurations/ConfigSubmissions"
import ConfigTheme from "@razzoozle/web/features/manager/components/configurations/ConfigTheme"
import ConfigUsers from "@razzoozle/web/features/manager/components/configurations/ConfigUsers"
import ConfigKlassen from "@razzoozle/web/features/manager/components/configurations/klassen"
import ConfigSchueler from "@razzoozle/web/features/manager/components/configurations/schueler"
import ConfigLabels from "@razzoozle/web/features/manager/components/configurations/labels/ConfigLabels"
import RunningGamesSection from "@razzoozle/web/features/manager/components/console/RunningGamesSection"
import ConsoleShell, {
  type ConsoleNavItem,
} from "@razzoozle/web/features/manager/components/console/ConsoleShell"
import {
  ConfigProvider,
  useConfig,
} from "@razzoozle/web/features/manager/contexts/config-context"
import { ActiveConsoleTabProvider } from "@razzoozle/web/features/manager/contexts/active-console-tab"
import { SelectConsoleTabProvider } from "@razzoozle/web/features/manager/contexts/select-console-tab"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import defaultLogo from "@razzoozle/web/assets/logo.svg"
import {
  Award,
  ClipboardList,
  GraduationCap,
  Images,
  Library,
  type LucideIcon,
  ListChecks,
  LogOut,
  Palette,
  Play,
  Puzzle,
  Radio,
  Sparkles,
  Terminal,
  Trophy,
  User,
  UserCog,
  Users,
} from "lucide-react"
import {
  type ComponentType,
  useEffect,
} from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "@tanstack/react-router"

/**
 * AF-15 / #1008 — every manager tab must declare footer policy.
 * `optional`/`none` require a human-readable reason (compile-time via
 * discriminated union). A tab entry without `actionFooter` fails typecheck.
 */
export type ActionFooterPolicy =
  | { actionFooter: "required" }
  | { actionFooter: "optional"; actionFooterReason: string }
  | { actionFooter: "none"; actionFooterReason: string }

/**
 * AF-compact (WP-0 contract): tabs opt into the compact icon-bar footer.
 * "default" = current ActionFooter zones; "compact" = icon-only bar.
 */
export type ActionFooterVariant = "default" | "compact"

export type TabDef = {
  key: string
  nameKey: string
  icon: LucideIcon
  component: ComponentType
  /**
   * Role visibility gate.
   *  - undefined → visible to both user and admin
   *  - "admin" → admin only
   *  - "user" → user only
   */
  roleGate?: "user" | "admin"
  /**
   * Feature gate.
   *  - "devMode" → only when RAZZOOLE_DEV is on
   *  - "klassenEnabled" → only when klassenEnabled is true
   */
  gated?: "devMode" | "klassenEnabled"
  /**
   * Footer variant. "default" → standard ActionFooter zones; "compact" →
   * CompactIconBar. Optional — undefined falls back to "default" at runtime.
   */
  actionFooterVariant?: ActionFooterVariant
} & ActionFooterPolicy

// The built-in sections, in display order. The nav rail maps each to a NavItem;
// the matching component renders in the console panel.
// Exported for route-level default-tab resolution (`/manager/config` redirect).
export const BUILTIN_TABS: TabDef[] = [
  {
    key: "play",
    nameKey: "manager:tabs.play",
    icon: Play,
    component: ConfigSelectQuizz,
    actionFooter: "required",
  },
  {
    key: "quiz",
    nameKey: "manager:tabs.quizz",
    icon: ListChecks,
    component: ConfigManageQuizz,
    actionFooter: "required",
  },
  {
    key: "catalog",
    nameKey: "manager:tabs.catalog",
    icon: Library,
    component: ConfigCatalog,
    actionFooter: "required",
  },
  {
    key: "classes",
    nameKey: "manager:tabs.klassen",
    icon: GraduationCap,
    component: ConfigKlassen,
    gated: "klassenEnabled",
    actionFooter: "required",
  },
  {
    key: "students",
    nameKey: "manager:tabs.schueler",
    icon: Users,
    component: ConfigSchueler,
    gated: "klassenEnabled",
    actionFooter: "required",
  },
  {
    key: "media",
    nameKey: "manager:tabs.media",
    icon: Images,
    component: ConfigMedia,
    actionFooter: "required",
  },
  {
    key: "results",
    nameKey: "manager:tabs.results",
    icon: Trophy,
    component: ConfigResults,
    actionFooter: "none",
    actionFooterReason: "Read-only results list; open/detail/row actions stay local (AF-08).",
  },
  {
    key: "submissions",
    nameKey: "manager:tabs.submissions",
    icon: ClipboardList,
    component: ConfigSubmissions,
    actionFooter: "optional",
    actionFooterReason: "Bulk moderation may register a footer; row approve/reject stay on rows.",
  },
  {
    key: "profile",
    nameKey: "manager:tabs.profile",
    icon: User,
    component: ConfigProfile,
    actionFooter: "optional",
    actionFooterReason: "Per-provider key save is optimistic in content; page-level Save bar only if added later.",
  },
  {
    key: "gamemode",
    nameKey: "manager:tabs.gamemode",
    icon: Users,
    component: ConfigGameMode,
    roleGate: "admin",
    actionFooter: "none",
    actionFooterReason: "Optimistic per-field save; no collective dirty footer (existing product decision).",
  },
  {
    key: "ai",
    nameKey: "manager:tabs.ki",
    icon: Sparkles,
    component: ConfigAI,
    roleGate: "admin",
    actionFooter: "required",
  },
  {
    key: "achievements",
    nameKey: "manager:tabs.achievements",
    icon: Award,
    component: ConfigAchievements,
    roleGate: "admin",
    actionFooter: "required",
  },
  {
    key: "running",
    nameKey: "manager:tabs.running",
    icon: Radio,
    component: RunningGamesSection,
    roleGate: "admin",
    actionFooter: "none",
    actionFooterReason: "Running-games list is operational read-mostly; stop/end actions stay on rows if present.",
  },
  {
    key: "users",
    nameKey: "manager:tabs.users",
    icon: UserCog,
    component: ConfigUsers,
    roleGate: "admin",
    actionFooter: "required",
    actionFooterVariant: "compact",
  },
  {
    key: "design",
    nameKey: "manager:tabs.design",
    icon: Palette,
    component: ConfigTheme,
    roleGate: "admin",
    actionFooter: "required",
  },
  {
    key: "labels",
    nameKey: "manager:tabs.labels",
    icon: Puzzle,
    component: ConfigLabels,
    roleGate: "admin",
    gated: "klassenEnabled",
    actionFooter: "required",
  },
  {
    key: "dev",
    nameKey: "manager:tabs.dev",
    icon: Terminal,
    gated: "devMode",
    roleGate: "admin",
    component: ConfigDev,
    actionFooter: "optional",
    actionFooterReason: "Dev tools may expose page actions later; none reserved until then.",
  },
]

/**
 * Visibility gate for builtins based on role, dev mode, and klassenEnabled.
 */
export const isTabAllowed = (
  tab: TabDef,
  opts: { devMode: boolean; klassenEnabled: boolean; role: "admin" | "user" | null },
): boolean => {
  // Dev mode gate
  if (tab.gated === "devMode" && !opts.devMode) {
    return false
  }

  // Klassen enabled gate
  if (tab.gated === "klassenEnabled" && !opts.klassenEnabled) {
    return false
  }

  // Role gate
  if (tab.roleGate && tab.roleGate !== opts.role) {
    return false
  }

  return true
}

/** localStorage key for last-selected manager tab (reload continuity only). */
export const TAB_STORAGE_KEY = "rahoot_manager_tab"

// Map old German/alternate tab keys to new English keys for backwards compatibility.
export const oldToNewTabKeyMap: Record<string, string> = {
  klassen: "classes",
  schueler: "students",
  ki: "ai",
  quizz: "quiz",
}

/**
 * Default tab for `/manager/config` redirect: last valid stored tab, else first
 * allowed under current role/config gates. Unregistered/missing storage falls
 * through. Does not 404 — always returns a concrete key.
 */
export const resolveDefaultManagerTab = (opts?: {
  devMode?: boolean
  klassenEnabled?: boolean
  role?: "admin" | "user" | null
}): string => {
  const gateOpts = {
    devMode: Boolean(opts?.devMode),
    klassenEnabled: Boolean(opts?.klassenEnabled ?? false),
    role: opts?.role ?? "user",
  }
  const allowed = BUILTIN_TABS.filter((tab) => isTabAllowed(tab, gateOpts))
  const fallback = allowed[0]?.key ?? BUILTIN_TABS[0].key

  try {
    if (typeof window === "undefined") return fallback
    let stored = window.localStorage.getItem(TAB_STORAGE_KEY)
    if (!stored) return fallback
    // Backwards compatibility: map old German keys to new English keys
    if (stored in oldToNewTabKeyMap) {
      stored = oldToNewTabKeyMap[stored]
    }
    // Valid = known builtin key AND currently allowed
    if (allowed.some((tab) => tab.key === stored)) return stored
  } catch {
    // Ignore storage failures (private mode / quota).
  }

  return fallback
}

/**
 * Compact brand mark for the console header band. Mirrors <Background>'s themed
 * branding logic (custom logo wins, else appTitle text, else bundled logo) but
 * sized for an in-panel header rather than the hero slot.
 */
const ConsoleBrand = () => {
  const { theme } = useThemeStore()
  const appTitle = theme.appTitle?.trim()

  if (theme.logo) {
    return (
      <img
        src={theme.logo}
        alt={appTitle ?? "logo"}
        className="h-7 w-auto shrink-0 object-contain"
      />
    )
  }

  if (appTitle) {
    return <span className="truncate">{appTitle}</span>
  }

  return <img src={defaultLogo} alt="logo" className="h-7 w-auto shrink-0" />
}

interface ConsoleBodyProps {
  activeKey: string
  onSelect: (key: string) => void
}

// Inner body lives under ConfigProvider so it can read the live submissions
// count for the "Vorschläge" badge.
const ConsoleBody = ({ activeKey, onSelect }: ConsoleBodyProps) => {
  const { logout } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { submissions, devMode, klassenEnabled } = useConfig()
  const { role } = useManagerStore()

  const tabs = BUILTIN_TABS
  const pendingCount = submissions.filter((s) => s.status === "pending").length
  const gateOpts = {
    devMode: Boolean(devMode),
    klassenEnabled: Boolean(klassenEnabled ?? false),
    role: role ?? "user",
  }
  const allowedTabs = tabs.filter((tab) => isTabAllowed(tab, gateOpts))

  const handleLogout = () => {
    socket.emit(EVENTS.MANAGER.LOGOUT)
    logout()
  }

  const nav: ConsoleNavItem[] = allowedTabs
    .filter((tab) => tab.key !== "profile")
    .map((tab) => ({
    key: tab.key,
    label: t(tab.nameKey, { defaultValue: tab.nameKey }),
    icon: tab.icon,
    count: tab.key === "submissions" ? pendingCount : undefined,
  }))

  // Config hydration signal: klassenEnabled is optional on ManagerConfig and
  // starts undefined until the server CONFIG event sets it (true/false).
  // Until then, allowedTabs under-counts (klassen-gated tabs filtered via
  // Boolean(undefined ?? false)), so falling back to allowedTabs[0] would
  // incorrectly redirect deep-links like /manager/config/classes → play.
  const configHydrated = typeof klassenEnabled !== "undefined"

  // Prefer an allowed match. Before hydration, keep the URL tab even if it is
  // not yet in allowedTabs. Only after hydration fall back to the first allowed.
  const matchedAllowed = allowedTabs.find((tab) => tab.key === activeKey)
  const matchedAny = tabs.find((tab) => tab.key === activeKey)
  const active =
    matchedAllowed ??
    (!configHydrated && matchedAny
      ? matchedAny
      : (allowedTabs[0] ?? tabs[0]))
  const ActiveComponent = active.component

  useEffect(() => {
    // Pre-hydration mismatches are expected while allowedTabs is incomplete —
    // do not navigate away from the URL tab until config has arrived.
    if (!configHydrated) return
    if (active.key !== activeKey) {
      onSelect(active.key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.key, activeKey, configHydrated])

  // Profile lives in headerActions (SDD §4.2), not the nav rail. When the
  // profile route is active the rail correctly has zero selection — the
  // profile button itself is the single active indicator (SDD §4.3).
  const isProfileActive = active.key === "profile"

  return (
    <ConsoleShell
      brand={<ConsoleBrand />}
      title={t("manager:configurationsTitle")}
      nav={nav}
      activeKey={active.key}
      onSelect={onSelect}
      footerPolicy={active.actionFooter}
      headerActions={
        <>
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => onSelect("profile")}
            title={t("manager:tabs.profile")}
            aria-label={t("manager:tabs.profile")}
            aria-current={isProfileActive ? "page" : undefined}
            data-active={isProfileActive ? "true" : undefined}
            className={
              isProfileActive
                ? // Match NavItem active treatment: accent-tint fill + accent-
                  // contrast ink. Keep tint on hover/active so ghost defaults
                  // don't erase the selected state. Ring separates the chip
                  // from the header's own accent-tint gradient wash.
                  "bg-accent-tint text-accent-contrast " +
                    "hover:bg-accent-tint active:bg-accent-tint " +
                    "ring-2 ring-[var(--accent-contrast)]/35"
                : undefined
            }
          >
            <User
              className="size-5"
              strokeWidth={isProfileActive ? 2.6 : 2}
              aria-hidden
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={handleLogout}
            title={t("manager:logout")}
            aria-label={t("manager:logout")}
          >
            <LogOut className="size-5" />
          </Button>
        </>
      }
    >
      <ActiveConsoleTabProvider value={active.key}>
        <SelectConsoleTabProvider onSelect={onSelect}>
        <ActiveComponent />
        </SelectConsoleTabProvider>
      </ActiveConsoleTabProvider>
    </ConsoleShell>
  )
}

interface Props {
  data: ManagerConfig
}

// Active tab is the route param (`/manager/config/$tab`). localStorage is still
// written on change for reload continuity via the bare `/manager/config`
// redirect — it is not the source of truth while the console is open.
const Configurations = ({ data }: Props) => {
  const { tab: activeKey } = useParams({ from: "/manager/config/$tab" })
  const navigate = useNavigate()

  const handleSelect = (key: string) => {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, key)
    } catch {
      // Ignore storage failures (private mode / quota).
    }
    if (key === activeKey) return
    void navigate({
      to: "/manager/config/$tab",
      params: { tab: key },
    })
  }

  return (
    <ConfigProvider data={data}>
      <ConsoleBody activeKey={activeKey} onSelect={handleSelect} />
    </ConfigProvider>
  )
}

export default Configurations
