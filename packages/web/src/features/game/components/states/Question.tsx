import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { CommonStatusDataMap } from "@razzoozle/common/types/game/status"
import { useReveal } from "@razzoozle/web/features/game/animation/presets"
import CircularTimer from "@razzoozle/web/features/game/components/CircularTimer"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useSoundUrl } from "@razzoozle/web/features/game/utils/sfx"
import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"
import QuestionStage from "../stage/QuestionStage"

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

  const mediaNode =
    media?.type === MEDIA_TYPES.IMAGE ? (
      <motion.img
        alt={question}
        src={media.url}
        className="min-h-0 max-h-[28vh] w-auto rounded-md object-contain lg:max-h-[42vh]"
        variants={reveal.item()}
        transition={reveal.spring}
      />
    ) : undefined

  return (
    <QuestionStage
      question={question}
      media={mediaNode}
      hud={
        <CircularTimer
          seconds={remaining}
          total={cooldown}
          size={140}
          className="lg:size-[clamp(140px,18vh,220px)]!"
        />
      }
    >
      {submittedBy && (
        <motion.p
          className="text-center text-sm text-[color:var(--game-fg)]/60"
          variants={reveal.item()}
          transition={reveal.spring}
        >
          {t("game:submittedBy", { name: submittedBy })}
        </motion.p>
      )}
    </QuestionStage>
  )
}

export default Question
