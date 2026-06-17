import type { PlayerStatusDataMap } from "@razzoozle/common/types/game/status"
import {
  scaleIn,
  useReveal,
} from "@razzoozle/web/features/game/animation/presets"
import { Pause } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

interface Props {
  data: PlayerStatusDataMap["PAUSED"]
}

// Player-facing "paused" screen. The host can pause the game between questions
// (the server only honours PAUSE in safe states); every player sees this hold
// screen until the host resumes. The background + score footer come from
// GameWrapper, so this just centers the pause messaging.
//
// Motion: a calm overlay scale/fade in (and out, when wrapped in AnimatePresence
// by the state switcher) — a lifecycle moment, so a soft spring is fine. The
// inner messaging staggers in gently behind it. All reduced-motion-safe: the
// scale/rise collapses to opacity-only via useReveal().
const Paused = ({ data }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  return (
    <motion.section
      className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center"
      variants={reveal.reduced ? undefined : scaleIn(0.96)}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={reveal.spring}
    >
      <motion.div
        variants={reveal.container(undefined, 0.08)}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center"
      >
        <motion.div variants={reveal.pop(0.8)} transition={reveal.spring}>
          <Pause className="h-24 w-24 text-[color:var(--game-fg)]" aria-hidden />
        </motion.div>
        <motion.h2
          variants={reveal.item()}
          transition={reveal.spring}
          className="mt-5 text-center text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]"
        >
          {t("game:pause.paused")}
        </motion.h2>
        <motion.p
          variants={reveal.item()}
          transition={reveal.spring}
          className="mt-4 text-center text-xl font-semibold text-[color:var(--game-fg)]/80"
        >
          {data.reason ?? t("game:pause.resumeHint")}
        </motion.p>
      </motion.div>
    </motion.section>
  )
}

export default Paused
