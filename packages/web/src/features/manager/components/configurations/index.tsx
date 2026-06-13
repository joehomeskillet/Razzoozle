import { EVENTS } from "@razzia/common/constants"
import type { ManagerConfig } from "@razzia/common/types/manager"
import Card from "@razzia/web/components/Card"
import LanguageSwitcher from "@razzia/web/components/LanguageSwitcher"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import ConfigDisplay from "@razzia/web/features/manager/components/configurations/ConfigDisplay"
import ConfigManageQuizz from "@razzia/web/features/manager/components/configurations/ConfigManageQuizz"
import ConfigResults from "@razzia/web/features/manager/components/configurations/ConfigResults"
import ConfigSelectQuizz from "@razzia/web/features/manager/components/configurations/ConfigSelectQuizz"
import ConfigSubmissions from "@razzia/web/features/manager/components/configurations/ConfigSubmissions"
import ConfigTabButton from "@razzia/web/features/manager/components/configurations/ConfigTabButton"
import ConfigTheme from "@razzia/web/features/manager/components/configurations/ConfigTheme"
import { ConfigProvider } from "@razzia/web/features/manager/contexts/config-context"
import { LogOut } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

const tabs = [
  {
    nameKey: "manager:tabs.play",
    component: ConfigSelectQuizz,
  },
  {
    nameKey: "manager:tabs.quizz",
    component: ConfigManageQuizz,
  },
  {
    nameKey: "manager:tabs.results",
    component: ConfigResults,
  },
  {
    nameKey: "manager:tabs.design",
    component: ConfigTheme,
  },
  {
    nameKey: "manager:tabs.satellite",
    component: ConfigDisplay,
  },
  {
    nameKey: "manager:tabs.submissions",
    component: ConfigSubmissions,
  },
]

interface Props {
  data: ManagerConfig
}

const Configurations = ({ data }: Props) => {
  const [selectedTab, setSelectedTab] = useState(0)
  const { reset } = useManagerStore()
  const { socket } = useSocket()
  const { t } = useTranslation()
  const TabComponent = tabs[selectedTab].component

  const handleSelect = (index: number) => () => {
    setSelectedTab(index)
  }

  const handleLogout = () => {
    socket.emit(EVENTS.MANAGER.LOGOUT)
    reset()
  }

  return (
    <ConfigProvider data={data}>
      <Card className="max-h-[80svh] w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-semibold">
            {t("manager:configurationsTitle")}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              className="focus-visible:outline-primary rounded-sm p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={handleLogout}
              title={t("manager:logout")}
              aria-label={t("manager:logout")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <div
          role="tablist"
          aria-label={t("manager:configurationsTitle")}
          className="flex shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100"
        >
          {tabs.map((tab, index) => (
            <ConfigTabButton
              key={tab.nameKey}
              id={`config-tab-${index}`}
              aria-controls={`config-tabpanel-${index}`}
              active={index === selectedTab}
              onClick={handleSelect(index)}
            >
              {t(tab.nameKey)}
            </ConfigTabButton>
          ))}
        </div>
        <hr className="my-4 text-gray-100" />
        <div
          role="tabpanel"
          id={`config-tabpanel-${selectedTab}`}
          aria-labelledby={`config-tab-${selectedTab}`}
          tabIndex={0}
          className="focus-visible:outline-primary flex min-h-0 flex-1 flex-col focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <TabComponent />
        </div>
      </Card>
    </ConfigProvider>
  )
}

export default Configurations
