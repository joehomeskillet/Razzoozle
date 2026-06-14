import { useTranslation } from "react-i18next"

// SCAFFOLD — filled by the catalog work-package (question bank management:
// list / add / edit / delete with tags; pairs with CatalogPickerModal in the
// editor). Renders an empty-state placeholder until then so the KI/Katalog tab
// wiring compiles and is navigable.
const ConfigCatalog = () => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2 p-6 text-gray-600">
      <h2 className="text-lg font-semibold text-gray-800">
        {t("manager:catalog.title")}
      </h2>
      <p className="text-sm">{t("manager:catalog.empty")}</p>
    </div>
  )
}

export default ConfigCatalog
