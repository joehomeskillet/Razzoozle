import { DoorOpen } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

import { useReveal } from "@razzoozle/web/features/game/animation/presets"

interface Props {
  // OPTIONAL — when wired through the player route's GAME.RESET handler the
  // server message (e.g. "errors:game.managerDisconnected") is forwarded so the
  // copy can adapt; absent => the generic ended-by-host message.
  data?: { message?: string }
}

// Player-facing "the host ended the game" view. The server signals the host
// leaving via notifyManagerGone -> GAME.RESET("errors:game.managerDisconnected").
// Rendered instead of a silent reset so players get a clear, non-error-toast
// explanation that the host closed the room (not a connection glitch).
const Ended = ({ data }: Props) => {
  const { t } = useTranslation()
  const reveal = useReveal()

  return (
    <motion.section
      className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4"
      variants={reveal.container()}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={reveal.pop()} transition={reveal.spring}>
        <DoorOpen className="h-24 w-24 text-white drop-shadow-lg" aria-hidden />
      </motion.div>
      <motion.h2
        className="mt-5 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {t("game:ended.byHost.title", {
          defaultValue: "Der Host hat das Spiel beendet",
        })}
      </motion.h2>
      <motion.p
        className="mt-4 text-center text-xl font-semibold text-white/80 drop-shadow"
        variants={reveal.item()}
        transition={reveal.spring}
      >
        {data?.message
          ? t(data.message)
          : t("game:ended.byHost.hint", {
              defaultValue: "Danke fürs Mitspielen.",
            })}
      </motion.p>
    </motion.section>
  )
}

export default Ended
