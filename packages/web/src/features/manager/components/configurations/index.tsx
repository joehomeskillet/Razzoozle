import { EVENTS } from "@razzoozle/common/constants"
import type { ManagerConfig } from "@razzoozle/common/types/manager"
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
import RunningGamesSection from "@razzoozle/web/features/manager/components/console/RunningGamesSection"
import ConsoleShell, {
  type ConsoleNavItem,
} from "@razzoozle/web/features/manager/components/console/ConsoleShell"
import {
  ConfigProvider,
  useConfig,
} from "@razzoozle/web/features/manager/contexts/config-context"
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
  icons as lucideIcons,
} from "lucide-react"
import {
  type ComponentType,
  useState,
} from "react"
import { useTranslation } from "react-i18next"

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
   * Dev mode gate.
   *  - "devMode" → only when RAZZOOLE_DEV is on
   */
  gated?: "devMode"
}

// The built-in sections, in display order. The nav rail maps each to a NavItem;
// the matching component renders in the console panel.
const BUILTIN_TABS: TabDef[] = [
  {
    key: "play",
    nameKey: "manager:tabs.play",
    icon: Play,
    component: ConfigSelectQuizz,
  },
  {
    key: "quizz",
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
    key: "klassen",
    nameKey: "manager:tabs.klassen",
    icon: GraduationCap,
    component: ConfigKlassen,
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
    key: "ki",
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
 * Resolve a manifest icon name to a LucideIcon. Lucide's `icons` aggregate is
 * keyed by PascalCase names (e.g. "Award", "Puzzle"); an unknown / missing name
 * falls back to the generic Puzzle mark so a typo never crashes the nav.
 */
const resolveIcon = (name: string): LucideIcon => {
  const found = (lucideIcons as Record<string, LucideIcon | undefined>)[name]
  return found ?? Puzzle
}

/**
 * Visibility gate for builtins based on role and dev mode.
 */
const isTabAllowed = (
  tab: TabDef,
  opts: { devMode: boolean; role: "admin" | "user" | null },
): boolean => {
  // Dev mode gate
  if (tab.gated === "devMode" && !opts.devMode) {
    return false
  }

  // Role gate
  if (tab.roleGate && tab.roleGate !== opts.role) {
    return false
  }

  return true
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
  const { submissions, devMode } = useConfig()
  const { role } = useManagerStore()

  const tabs = BUILTIN_TABS
  const pendingCount = submissions.filter((s) => s.status === "pending").length

  const handleLogout = () => {
    socket.emit(EVENTS.MANAGER.LOGOUT)
    logout()
  }

  const nav: ConsoleNavItem[] = tabs
    .filter(
      (tab) =>
        isTabAllowed(tab, {
          devMode: Boolean(devMode),
          role: role ?? "user",
        }),
    )
    .map((tab) => ({
      key: tab.key,
      label: t(tab.nameKey, { defaultValue: tab.nameKey }),
      icon: tab.icon,
      count:
        tab.key === "submissions" ? pendingCount : undefined,
    }))

  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0]
  const ActiveComponent = active.component

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
          <button
            type="button"
            className="focus-visible:outline-primary inline-flex size-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={handleLogout}
            title={t("manager:logout")}
            aria-label={t("manager:logout")}
          >
            <LogOut className="size-5" />
          </button>
        </>
      }
    >
      <ActiveComponent />
    </ConsoleShell>
  )
}

interface Props {
  data: ManagerConfig
}

// Persist the open section across reloads so a refresh doesn't dump the manager
// back on the first tab. Client-only; falls back to the first tab when the
// stored key is missing or renamed.
const TAB_STORAGE_KEY = "rahoot_manager_tab"

const Configurations = ({ data }: Props) => {
  const [activeKey, setActiveKey] = useState<string>(() => {
    if (typeof window === "undefined") return BUILTIN_TABS[0].key
    return (
      window.localStorage.getItem(TAB_STORAGE_KEY) ?? BUILTIN_TABS[0].key
    )
  })

  const handleSelect = (key: string) => {
    setActiveKey(key)
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, key)
    } catch {
      // Ignore storage failures (private mode / quota).
    }
  }

  return (
    <ConfigProvider data={data}>
      <ConsoleBody activeKey={activeKey} onSelect={handleSelect} />
    </ConfigProvider>
  )
}

export default Configurations
