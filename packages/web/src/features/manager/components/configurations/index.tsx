import { EVENTS } from "@razzia/common/constants"
import type { ManagerConfig } from "@razzia/common/types/manager"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import ConfigAI from "@razzia/web/features/manager/components/configurations/ConfigAI"
import ConfigCatalog from "@razzia/web/features/manager/components/configurations/ConfigCatalog"
import ConfigDisplay from "@razzia/web/features/manager/components/configurations/ConfigDisplay"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import ConfigResults from "@razzia/web/features/manager/components/configurations/ConfigResults"
import ConfigSelectQuizz from "@razzia/web/features/manager/components/configurations/ConfigSelectQuizz"
import ConfigSubmissions from "@razzia/web/features/manager/components/configurations/ConfigSubmissions"
import ConfigTheme from "@razzia/web/features/manager/components/configurations/ConfigTheme"
import ConsoleShell, {
  type ConsoleNavItem,
} from "@razzia/web/features/manager/components/console/ConsoleShell"
import {
  ConfigProvider,
  useConfig,
} from "@razzia/web/features/manager/contexts/config-context"
import { useThemeStore } from "@razzia/web/features/theme/store"
import defaultLogo from "@razzia/web/assets/logo.svg"
import {
  ClipboardList,
  Library,
  type LucideIcon,
  ListChecks,
  LogOut,
  Monitor,
  Palette,
  Play,
  Sparkles,
  Trophy,
} from "lucide-react"
import { type ComponentType, useState } from "react"
import { useTranslation } from "react-i18next"

interface TabDef {
  key: string
  nameKey: string
  icon: LucideIcon
  component: ComponentType
}

// The 6 sections, in display order. The nav rail maps each to a NavItem; the
// matching component renders in the console panel. Internals are unchanged
// (separate track) — this file only wires them into <ConsoleShell>.
const tabs: TabDef[] = [
  { key: "play", nameKey: "manager:tabs.play", icon: Play, component: ConfigSelectQuizz },
  { key: "quizz", nameKey: "manager:tabs.quizz", icon: ListChecks, component: ConfigManageQuizz },
  { key: "catalog", nameKey: "manager:tabs.catalog", icon: Library, component: ConfigCatalog },
  { key: "ki", nameKey: "manager:tabs.ki", icon: Sparkles, component: ConfigAI },
  { key: "results", nameKey: "manager:tabs.results", icon: Trophy, component: ConfigResults },
  { key: "design", nameKey: "manager:tabs.design", icon: Palette, component: ConfigTheme },
  { key: "satellite", nameKey: "manager:tabs.satellite", icon: Monitor, component: ConfigDisplay },
  { key: "submissions", nameKey: "manager:tabs.submissions", icon: ClipboardList, component: ConfigSubmissions },
]

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
  const { reset } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const { submissions } = useConfig()

  const pendingCount = submissions.filter((s) => s.status === "pending").length

  const handleLogout = () => {
    socket.emit(EVENTS.MANAGER.LOGOUT)
    reset()
  }

  const nav: ConsoleNavItem[] = tabs.map((tab) => ({
    key: tab.key,
    label: t(tab.nameKey),
    icon: tab.icon,
    count: tab.key === "submissions" ? pendingCount : undefined,
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

const Configurations = ({ data }: Props) => {
  const [activeKey, setActiveKey] = useState(tabs[0].key)

  return (
    <ConfigProvider data={data}>
      <ConsoleBody activeKey={activeKey} onSelect={setActiveKey} />
    </ConfigProvider>
  )
}

export default Configurations
