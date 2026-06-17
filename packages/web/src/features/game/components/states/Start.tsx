import { EVENTS } from "@razzoozle/common/constants"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { hapticCountdown } from "@razzoozle/web/features/game/utils/haptics"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import clsx from "clsx"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_START"]
}

const Start = ({ data: { time, subject } }: Props) => {
  const [showTitle, setShowTitle] = useState(true)
  const [cooldown, setCooldown] = useState(time)
  const muted = useSoundStore((s) => s.muted)
  const reveal = useReveal()

  const boumpUrl = useSoundUrl("boump")
  const [sfxBoump] = useSound(boumpUrl, {
    volume: 0.2,
    soundEnabled: !muted,
  })

  useEvent(EVENTS.GAME.START_COOLDOWN, () => {
    sfxBoump()
    setShowTitle(false)
  })

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    sfxBoump()
    if (sec <= 3) hapticCountdown()
    setCooldown(sec)
  })

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      {showTitle ? (
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
          {subject}
        </h2>
      ) : (
        <>
          <div
            className={clsx(
              `anim-show bg-primary aspect-square h-32 rounded-2xl transition-transform md:h-60 lg:h-[clamp(15rem,30vh,28rem)]`,
            )}
            style={{
              transform: `rotate(${45 * (time - cooldown)}deg)`,
            }}
          ></div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={cooldown}
              variants={reveal.pop()}
              initial="hidden"
              animate="visible"
              transition={reveal.snap}
              className="absolute text-6xl font-bold text-white tabular-nums drop-shadow-md md:text-8xl lg:text-[clamp(6rem,15vh,16rem)]"
            >
              {cooldown}
            </motion.span>
          </AnimatePresence>
        </>
      )}
    </section>
  )
}

export default Start
