import type { PlayerStatusDataMap } from "@razzia/common/types/game/status"
import Loader from "@razzia/web/components/Loader"
import AvatarPicker from "@razzia/web/features/game/components/join/AvatarPicker"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface Props {
  data: PlayerStatusDataMap["WAIT"]
}

const Wait = ({ data: { text } }: Props) => {
  const { t } = useTranslation()
  const [showPicker, setShowPicker] = useState(true)

  // Only the lobby wait (pre-game) lets the player pick an avatar; the same WAIT
  // state is reused between questions where the picker would be out of place.
  const isLobby = text === "game:waitingForPlayers"

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center">
      <Loader className="h-30" />
      <h2 className="mt-5 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-[clamp(3rem,6vh,6rem)]">
        {t(text)}
      </h2>

      {isLobby && showPicker && (
        <div className="mt-8 w-full max-w-md rounded-xl bg-white/95 p-4 shadow-lg">
          <AvatarPicker onDone={() => setShowPicker(false)} />
        </div>
      )}
    </section>
  )
}

export default Wait
