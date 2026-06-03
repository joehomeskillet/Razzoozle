import { Monitor, Smartphone, Wifi } from "lucide-react"
import { useTranslation } from "react-i18next"

// The "Satellit" config tab. Pairing itself needs a live game (gameId +
// manager password), so this tab is the discoverable entry point that explains
// the beamer/Pi-satellite model and that the phone is the remote control; the
// actual pairing happens from the in-game header control (DisplayControl) once
// a game is running.
const ConfigDisplay = () => {
  const { t } = useTranslation()

  const steps = [
    { icon: Wifi, text: t("manager:satellite.step1") },
    { icon: Monitor, text: t("manager:satellite.step2") },
    { icon: Smartphone, text: t("manager:satellite.step3") },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <p className="text-sm leading-relaxed text-gray-600">
        {t("manager:satellite.description")}
      </p>

      <ol className="flex flex-col gap-2">
        {steps.map(({ icon: Icon, text }, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-md bg-gray-100 p-3"
          >
            <span className="bg-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">
              {i + 1}
            </span>
            <Icon className="mt-0.5 size-5 shrink-0 text-gray-500" />
            <span className="text-sm leading-snug text-gray-700">{text}</span>
          </li>
        ))}
      </ol>

      <p className="rounded-md bg-amber-50 p-3 text-xs leading-snug text-amber-800">
        {t("manager:satellite.hint")}
      </p>
    </div>
  )
}

export default ConfigDisplay
