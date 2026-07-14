import { useTranslation } from "react-i18next"

/**
 * Labels (Fächer) management tab — admin-only definitions for quiz/media/catalog tagging.
 * WP-L0 Scaffold: empty state placeholder.
 * Filled in WP-L2 with CRUD UI, socket wiring via useLabelManager.
 */
const ConfigLabels = () => {
  const { t } = useTranslation()

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("manager:tabs.labels", { defaultValue: "Labels" })}</h2>
        <p className="text-sm text-gray-600">
          {t("manager:labels.description", { defaultValue: "Global labels for organizing quizzes, media, and catalog entries." })}
        </p>
      </div>

      {/* WP-L2 will render the label list and CRUD controls here */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-gray-500">{t("manager:labels.emptyState", { defaultValue: "Scaffold placeholder — label definitions will load here." })}</p>
      </div>
    </div>
  )
}

export default ConfigLabels
