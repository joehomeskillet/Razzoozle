import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import Markdown from "@razzoozle/web/components/Markdown"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({
  data: { question, media, cooldown, submittedBy },
}: Props) => {
  const muted = useSoundStore((s) => s.muted)
  const showUrl = useSoundUrl("show")
  const [sfxShow] = useSound(showUrl, {
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
        className="glass-3 flex w-full flex-1 flex-col items-center justify-center gap-4 py-6 lg:gap-6"
        variants={reveal.container()}
        initial="hidden"
        animate="visible"
      >
        <motion.h2
          className="text-center text-3xl font-bold text-[color:var(--game-fg)] md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          <Markdown>{question}</Markdown>
        </motion.h2>

        {submittedBy && (
          <motion.p
            className="text-center text-sm text-[color:var(--game-fg)]/60"
            variants={reveal.item()}
            transition={reveal.spring}
          >
            {t("game:submittedBy", { name: submittedBy })}
          </motion.p>
        )}

        {/* 5-second question preview: question + media only. The answer options
            are intentionally NOT shown here — they appear in the answering phase
            (Answers.tsx / SoloAnswers.tsx). When a question has no image we still
            reserve the space with a transparent placeholder so the question and
            countdown stay vertically stable from question to question. */}
        {media?.type === MEDIA_TYPES.IMAGE ? (
          <motion.img
            alt={question}
            src={media.url}
            className="min-h-0 max-h-[28vh] w-auto rounded-md object-contain lg:max-h-[42vh]"
            variants={reveal.item()}
            transition={reveal.spring}
          />
        ) : (
          <motion.div
            aria-hidden
            className="pointer-events-none h-[28vh] w-full max-w-md shrink-0 lg:h-[42vh]"
            variants={reveal.item()}
            transition={reveal.spring}
          />
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
