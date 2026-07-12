import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { useTranslation } from "react-i18next"

const ConfigProfile = () => {
  const { t } = useTranslation()
  const { username } = useManagerStore()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-field-ink)] mb-2">
          {t("manager:tabs.profile")}
        </h2>
        <p className="text-sm text-[var(--color-field-ink)]/60">
          {t("manager:profile.welcome", {
            defaultValue: "Willkommen",
          })}
          {username && `, ${username}`}
        </p>
      </div>

      <div className="bg-white rounded-[var(--radius-theme)] border border-[var(--border-hairline)] p-4 shadow-[var(--shadow-flat)]">
        <p className="text-sm text-[var(--color-field-ink)] text-center">
          {t("manager:profile.description", {
            defaultValue:
              "Dein Profil wird in Kürze verfügbar sein. Hier kannst du später deine Einstellungen, KI-Anbieter und weitere Optionen konfigurieren.",
          })}
        </p>
      </div>
    </div>
  )
}

export default ConfigProfile
