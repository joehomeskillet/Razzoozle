import { MEDIA_TYPES } from "@razzia/common/constants"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import Markdown from "@razzia/web/components/Markdown"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

interface Props {
  data: CommonStatusDataMap["SHOW_QUESTION"]
}

const Question = ({
  data: { question, media, cooldown, submittedBy },
}: Props) => {
  const [sfxShow] = useSound(SFX.SHOW_SOUND, { volume: 0.5 })
  const { t } = useTranslation()

  useEffect(() => {
    sfxShow()
  }, [sfxShow])

  return (
    <section className="relative mx-auto flex h-full w-full max-w-7xl flex-1 flex-col items-center px-4 lg:max-w-[85vw]">
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <h2 className="anim-show text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(2rem,4.5vh,5rem)]">
          <Markdown>{question}</Markdown>
        </h2>

        {submittedBy && (
          <p className="text-sm text-white/60 text-center">
            {t("game:submittedBy", { name: submittedBy })}
          </p>
        )}

        {media?.type === MEDIA_TYPES.IMAGE && (
          <img
            alt={question}
            src={media.url}
            className="max-h-[26vh] w-auto rounded-md"
          />
        )}
      </div>
      <div className="mb-8 h-6 w-full overflow-hidden rounded-full bg-white/15 shadow-inner lg:h-10">
        <div
          className="bg-primary h-full rounded-full"
          style={{ animation: `progressBar ${cooldown}s linear forwards` }}
        ></div>
      </div>
    </section>
  )
}

export default Question
