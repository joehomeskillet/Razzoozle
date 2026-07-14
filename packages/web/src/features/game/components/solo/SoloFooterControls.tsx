import { motion, useReducedMotion } from "motion/react"
import { useTranslation } from "react-i18next"

// ---------------------------------------------------------------------------
// Result-phase footer controls: auto-advance toggle + next/finish button
// ---------------------------------------------------------------------------

interface SoloFooterControlsProps {
  autoAdvance: boolean
  toggleAutoAdvance: () => void
  nextQuestion: () => void
  currentIndex: number
  questions: readonly unknown[]
}

const SoloFooterControls = ({
  autoAdvance,
  toggleAutoAdvance,
  nextQuestion,
  currentIndex,
  questions,
}: SoloFooterControlsProps) => {
  const { t } = useTranslation()
  const reduced = useReducedMotion() ?? false

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-pressed={autoAdvance}
        aria-label={t("game:solo.autoNextTitle", {
          defaultValue: "Automatisch zur nächsten Frage",
        })}
        onClick={toggleAutoAdvance}
        title={t("game:solo.autoNextTitle", {
          defaultValue: "Automatisch zur nächsten Frage",
        })}
        className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
      >
        <span
          className={
            "relative h-5 w-9 rounded-full transition-colors " +
            (autoAdvance ? "bg-primary" : "bg-[color:var(--color-field-ink)]/20")
          }
        >
          <span
            className={
              "absolute top-0.5 size-4 rounded-full bg-white transition-[left] " +
              (autoAdvance ? "left-[18px]" : "left-0.5")
            }
          />
        </span>
        <span className="hidden sm:inline">
          {t("game:solo.autoNext", { defaultValue: "Auto-Weiter" })}{" "}
          {autoAdvance
            ? t("game:controls.autoOn", { defaultValue: "an" })
            : t("game:controls.autoOff", { defaultValue: "aus" })}
        </span>
      </button>
      <motion.button
        type="button"
        onClick={nextQuestion}
        animate={reduced ? undefined : { scale: [1, 1.05, 1] }}
        transition={
          reduced
            ? undefined
            : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
        }
        className="rounded-lg bg-gradient-to-r from-primary to-purple-500 px-5 py-2 text-base font-bold text-white shadow-md shadow-primary/30 transition-all hover:brightness-110 active:scale-95"
      >
        {currentIndex + 1 < questions.length
          ? t("game:solo.next")
          : t("game:solo.finish")}
      </motion.button>
    </div>
  )
}

export default SoloFooterControls
