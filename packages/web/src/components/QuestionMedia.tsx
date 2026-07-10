import { MEDIA_TYPES } from "@razzoozle/common/constants"
import type { QuestionMedia as QuestionMediaType } from "@razzoozle/common/types/game"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"

interface Props {
  media?: QuestionMediaType
  alt?: string
}

const QuestionMedia = ({
  media,
  alt = "",
}: Props) => {
  // Global mute gate: when the player has muted in-game sound, autoplaying
  // question media must be silent too. `controls` stays so a user can manually
  // unmute an individual clip.
  const muted = useSoundStore((s) => s.muted)

  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img
        alt={alt}
        src={media.url}
        className="max-h-60 w-auto rounded-md sm:max-h-100"
      />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return (
      <video
        className="m-4 mb-2 aspect-video max-h-60 w-auto rounded-md px-4 sm:max-h-100"
        src={media.url}
        autoPlay
        controls
        muted={muted}
      />
    )
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return (
      <audio
        className="m-4 mb-2 w-auto rounded-md"
        src={media.url}
        autoPlay
        controls
        muted={muted}
      />
    )
  }

  return null
}

export default QuestionMedia
