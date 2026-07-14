import { useTranslation } from "react-i18next"

const ConfigSchueler = () => {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {t("manager:schueler.title")}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {t("manager:schueler.description")}
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center rounded-xl border border-[var(--border-hairline)] bg-white p-8">
        <p className="text-sm text-gray-500">
          {t("manager:schueler.empty")}
        </p>
      </div>
    </div>
  )
}

export default ConfigSchueler
