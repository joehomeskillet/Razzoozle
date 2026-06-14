import { useTranslation } from "react-i18next"

// SCAFFOLD — filled by the AI work-package (KI tab: text providers
// local/Claude/OpenAI/OpenRouter with model + API key + connectivity test, the
// image provider, and a "generate whole quiz from a topic" panel). Renders an
// empty-state placeholder until then so the tab wiring compiles and is navigable.
const ConfigAI = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 p-6 text-gray-600">
      <h2 className="text-lg font-semibold text-gray-800">
        {t("manager:ai.title")}
      </h2>
      <p className="text-sm">{t("manager:ai.intro")}</p>
    </div>
  )
}

export default ConfigAI
