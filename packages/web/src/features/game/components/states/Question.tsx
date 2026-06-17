import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import AnswerButton from "@razzoozle/web/features/game/components/AnswerButton"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { SFX } from "@razzoozle/web/features/game/utils/constants"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({
  data: { question, answers, media, cooldown, submittedBy },
}: Props) => {
  const muted = useSoundStore((s) => s.muted)
  const [sfxShow] = useSound(SFX.SHOW_SOUND, {
    volume: 0.5,
    soundEnabled: !muted,
  })
  const { t } = useTranslation()
  const reveal = useReveal()

  // UI-only local countdown to drive the circular timer (this presenter view
  // gets no per-second COOLDOWN broadcast, only the initial `cooldown` total).
  // Purely cosmetic — scoring is server-authoritative and untouched.
  const [remaining, setRemaining] = useState(cooldown)

  useEffect(() => {
    setRemaining(cooldown)
    const id = setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)

    return () => clearInterval(id)
  }, [cooldown])

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  // Preload the CURRENT question image so it is already cached when the answer
  // screen (Answers.tsx) renders the same media. No next-question look-ahead —
  // the SHOW_QUESTION payload carries no hint about the upcoming question.
  const imageUrl =
    media?.type === MEDIA_TYPES.IMAGE ? media.url : undefined
  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.src = imageUrl
  }, [imageUrl])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4 lg:max-w-[85vw]">
      {/* Re-keyed by `question` so the staggered reveal replays on every NEW
          question (mount-on-key). reduced-motion → opacity-only via useReveal. */}
      <motion.div
        key={question}
        className="glass-3 flex flex-1 flex-col items-center justify-center gap-5"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        <motion.h2
          className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          <Markdown>{question}</Markdown>
        </motion.h2>

        {submittedBy && (
          <motion.p
            className="text-sm text-white/60 text-center"
            variants={reveal.item()}
            transition={reveal.spring}
          >
            {t("game:submittedBy", { name: submittedBy })}
          </motion.p>
        )}

        {media?.type === MEDIA_TYPES.IMAGE && (
          <motion.img
            alt={question}
            src={media.url}
            className="max-h-[26vh] w-auto rounded-md"
            variants={reveal.item()}
            transition={reveal.spring}
          />
        )}

        {/* Kahoot-style answer tiles on the presenter big-screen — DISPLAY-ONLY.
            Players answer on their phones (Answers.tsx); these are non-interactive
            (no onClick, disabled + pointer-events-none + cursor-default). We render
            exactly the answers present (choice/boolean = 2..4), shape icons via
            colorIndex. Absent for slider questions, where `answers` is undefined.
            Hot path: tiles reveal via cheap fade+rise items inside the shared
            stagger container — no per-tile layout springs. */}
        {answers && answers.length > 0 && (
          <motion.div
            className="grid w-full grid-cols-2 gap-1 text-lg font-bold text-white md:text-xl lg:gap-3 lg:text-[clamp(1.25rem,3vh,2.5rem)]"
            variants={reveal.container()}
          >
            {answers.map((answer, index) => (
              <motion.div
                key={index}
                variants={reveal.item()}
                transition={reveal.spring}
              >
                <AnswerButton
                  colorIndex={index}
                  disabled
                  aria-disabled="true"
                  tabIndex={-1}
                  className="pointer-events-none cursor-default"
                >
                  <Markdown>{answer}</Markdown>
                </AnswerButton>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
      {/* Prominent Kahoot-style circular countdown, replacing the old
          horizontal progress bar. NOTE: the SHOW_QUESTION payload carries no
          answered/total-player counts (and there's no game context here), so
          the N / M answered counter is intentionally omitted in this view to
          avoid threading new props through many layers. */}
      <div className="mb-8 flex justify-center">
        <CircularTimer
          seconds={remaining}
          total={cooldown}
          size={140}
          className="lg:size-[clamp(140px,18vh,220px)]!"
        />
      </div>
    </section>
  )
}

export default Question
