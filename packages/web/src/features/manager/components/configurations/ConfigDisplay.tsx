import { Monitor, Smartphone, Wifi } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

// The "Satellit" config tab. Pairing itself needs a live game (gameId +
// manager password), so this tab is the discoverable entry point that explains
// the beamer/Pi-satellite model and that the phone is the remote control; the
// actual pairing happens from the in-game header control (DisplayControl) once
// a game is running.
const ConfigDisplay = () => {
  const { t } = useTranslation()
  const reducedMotion = useReducedMotion()

  const steps = [
    { icon: Wifi, text: t("manager:satellite.step1") },
    { icon: Monitor, text: t("manager:satellite.step2") },
    { icon: Smartphone, text: t("manager:satellite.step3") },
  ]

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-0.5"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={
        reducedMotion ? undefined : { duration: 0.3, ease: "easeOut" }
      }
    >
      <p className="text-sm leading-relaxed text-gray-600">
        {t("manager:satellite.description")}
      </p>

      <ol className="flex flex-col gap-3">
        {steps.map(({ icon: Icon, text }, i) => (
          <li
            key={i}
            className="flex items-start gap-3 rounded-xl bg-gray-50 p-4 outline-2 -outline-offset-2 outline-gray-200"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-contrast)] text-sm font-bold text-white">
              {i + 1}
            </span>
            <Icon
              className="mt-0.5 size-5 shrink-0 text-gray-400"
              aria-hidden
            />
            <span className="text-sm leading-snug text-gray-700">{text}</span>
          </li>
        ))}
      </ol>

      <p className="rounded-xl bg-amber-50 p-4 text-xs leading-snug text-amber-800">
        {t("manager:satellite.hint")}
      </p>
    </motion.div>
  )
}

export default ConfigDisplay
