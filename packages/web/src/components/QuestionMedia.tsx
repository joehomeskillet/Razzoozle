import { MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMedia as QuestionMediaType } from "@razzia/common/types/game"
import { useEffect } from "react"

interface Props {
  media?: QuestionMediaType
  alt?: string
  // Low-latency mode (preloadNextQuestion): media of the NEXT question to warm
  // the browser cache so it renders instantly when the round advances. OPTIONAL
  // — undefined in normal mode and on the player side unless the current model
  // already exposes next-question media to that audience. This component never
  // renders `next`; it only prefetches its URL. Passing solution-bearing data
  // here would be a leak, so callers MUST only pass already-sent media.
  next?: QuestionMediaType
  // Master gate: only prefetch when preload is enabled. Defaults to false so a
  // caller that doesn't opt in never prefetches (byte-identical normal mode).
  preloadNext?: boolean
}

// Off-DOM prefetch of a media URL. Uses a detached Image for images (broadest
// support, decodes into cache) and a <link rel=prefetch> hint for audio/video.
// Fully crash-guarded: any failure (no DOM, blocked, bad url) is swallowed so
// preload can never break the page.
const prefetchMedia = (media?: QuestionMediaType): (() => void) | undefined => {
  try {
    if (!media?.url || typeof document === "undefined") {
      return undefined
    }

    if (media.type === MEDIA_TYPES.IMAGE) {
      // Detached image: requests + decodes into the HTTP cache, never mounted.
      const img = new Image()
      img.decoding = "async"
      img.src = media.url

      // Nothing to clean up; let GC collect the detached node.
      return undefined
    }

    // Audio / video: a prefetch link hint is enough to warm the cache without
    // autoplaying. Track it so we can remove it on cleanup.
    const link = document.createElement("link")
    link.rel = "prefetch"
    link.as = media.type === MEDIA_TYPES.VIDEO ? "video" : "audio"
    link.href = media.url
    document.head.appendChild(link)

    return () => {
      try {
        link.remove()
      } catch {
        /* Ignore */
      }
    }
  } catch {
    // Preload is best-effort; never throw.
    return undefined
  }
}

const QuestionMedia = ({
  media,
  alt = "",
  next,
  preloadNext = false,
}: Props) => {
  // Prefetch the next question's media when preload is on. No-op otherwise.
  useEffect(() => {
    if (!preloadNext) {
      return
    }

    const cleanup = prefetchMedia(next)

    return cleanup
  }, [preloadNext, next?.url, next?.type])

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
      />
    )
  }

  return null
}

export default QuestionMedia
