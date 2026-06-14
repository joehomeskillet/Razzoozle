import type { PlayerStatusDataMap } from "@razzia/common/types/game/status"
import { Pause } from "lucide-react"
import { useTranslation } from "react-i18next"

interface Props {
  data: PlayerStatusDataMap["PAUSED"]
}

// Player-facing "paused" screen. The host can pause the game between questions
// (the server only honours PAUSE in safe states); every player sees this hold
// screen until the host resumes. The background + score footer come from
// GameWrapper, so this just centers the pause messaging.
const Paused = ({ data }: Props) => {
  const { t } = useTranslation()

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <Pause className="h-24 w-24 text-white drop-shadow-lg" aria-hidden />
      <h2 className="mt-5 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
        {t("game:pause.paused")}
      </h2>
      <p className="mt-4 text-center text-xl font-semibold text-white/80 drop-shadow">
        {data.reason ?? t("game:pause.resumeHint")}
      </p>
    </section>
  )
}

export default Paused
