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
import ConfigDisplay from "@razzoozle/web/features/manager/components/configurations/ConfigDisplay"
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
  Monitor,
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

interface TabDef {
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
}

// The built-in sections, in display order. The nav rail maps each to a NavItem;
// the matching component renders in the console panel.
// Exported for route-level default-tab resolution (`/manager/config` redirect).
export const BUILTIN_TABS: TabDef[] = [
  {
    key: "play",
    nameKey: "manager:tabs.play",
    icon: Play,
    component: ConfigSelectQuizz,
  },
  {
    key: "quiz",
    nameKey: "manager:tabs.quizz",
    icon: ListChecks,
    component: ConfigManageQuizz,
  },
  {
    key: "catalog",
    nameKey: "manager:tabs.catalog",
    icon: Library,
    component: ConfigCatalog,
  },
  {
    key: "classes",
    nameKey: "manager:tabs.klassen",
    icon: GraduationCap,
    component: ConfigKlassen,
    gated: "klassenEnabled",
  },
  {
    key: "students",
    nameKey: "manager:tabs.schueler",
    icon: Users,
    component: ConfigSchueler,
    gated: "klassenEnabled",
  },
  {
    key: "media",
    nameKey: "manager:tabs.media",
    icon: Images,
    component: ConfigMedia,
  },
  {
    key: "results",
    nameKey: "manager:tabs.results",
    icon: Trophy,
    component: ConfigResults,
  },
  {
    key: "submissions",
    nameKey: "manager:tabs.submissions",
    icon: ClipboardList,
    component: ConfigSubmissions,
  },
  {
    key: "profile",
    nameKey: "manager:tabs.profile",
    icon: User,
    component: ConfigProfile,
  },
  {
    key: "gamemode",
    nameKey: "manager:tabs.gamemode",
    icon: Users,
    component: ConfigGameMode,
    roleGate: "admin",
  },
  {
    key: "ai",
    nameKey: "manager:tabs.ki",
    icon: Sparkles,
    component: ConfigAI,
    roleGate: "admin",
  },
  {
    key: "achievements",
    nameKey: "manager:tabs.achievements",
    icon: Award,
    component: ConfigAchievements,
    roleGate: "admin",
  },
  {
    key: "running",
    nameKey: "manager:tabs.running",
    icon: Radio,
    component: RunningGamesSection,
    roleGate: "admin",
  },
  {
    key: "users",
    nameKey: "manager:tabs.users",
    icon: UserCog,
    component: ConfigUsers,
    roleGate: "admin",
  },
  {
    key: "design",
    nameKey: "manager:tabs.design",
    icon: Palette,
    component: ConfigTheme,
    roleGate: "admin",
  },
  {
    key: "labels",
    nameKey: "manager:tabs.labels",
    icon: Puzzle,
    component: ConfigLabels,
    roleGate: "admin",
    gated: "klassenEnabled",
  },
  {
    key: "satellite",
    nameKey: "manager:tabs.satellite",
    icon: Monitor,
    component: ConfigDisplay,
    roleGate: "admin",
  },
  {
    key: "dev",
    nameKey: "manager:tabs.dev",
    icon: Terminal,
    gated: "devMode",
    roleGate: "admin",
    component: ConfigDev,
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

  return (
    <ConsoleShell
      brand={<ConsoleBrand />}
      title={t("manager:configurationsTitle")}
      nav={nav}
      activeKey={active.key}
      onSelect={onSelect}
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
            className={active.key === "profile" ? "bg-[var(--accent-tint)]" : undefined}
          >
            <User className="size-5" />
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
