import {
  generateAvatar,
  type AvatarStyle,
} from "@razzoozle/web/features/game/utils/dicebear"
import clsx from "clsx"
import { useEffect, useState } from "react"
import { twMerge } from "tailwind-merge"

interface Props {
  src?: string
  name: string
  size?: number
  className?: string
}

// Deterministic fallback palette so a given name always renders the same colour
// across roster / leaderboard / podium (no flicker between mounts).
const PALETTE = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-fuchsia-500",
] as const

const DICEBEAR_PREFIX = "dicebear:"

const hashName = (value: string): number => {
  let hash = 0

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }

  return Math.abs(hash)
}

const getInitials = (value: string): string => {
  const words = value.trim().split(/\s+/u).filter(Boolean)

  if (words.length === 0) {
    return "?"
  }

  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase()
  }

  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase()
}

// Round avatar: shows the chosen image (generic-set URL or uploaded data-URL)
// and falls back to deterministic-coloured initials when there is no src or the
// image fails to load. Pure presentation — no socket/store coupling.
const Avatar = ({ src, name, size = 40, className }: Props) => {
  const [errored, setErrored] = useState(false)
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined)
  const isIdentity = typeof src === "string" && src.startsWith(DICEBEAR_PREFIX)

  useEffect(() => {
    setErrored(false)
  }, [src])

  useEffect(() => {
    setResolvedSrc(undefined)

    if (!isIdentity) {
      return
    }

    let active = true
    const [, style, ...seedParts] = src.split(":")
    const seed = seedParts.join(":")

    generateAvatar(style as AvatarStyle, seed)
      .then((uri) => {
        if (active) {
          setResolvedSrc(uri)
        }
      })
      .catch(() => {
        if (active) {
          setErrored(true)
        }
      })

    return () => {
      active = false
    }
  }, [src])

  const imageSrc = isIdentity ? resolvedSrc : src
  const showImage = Boolean(imageSrc) && !errored

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={twMerge(
        clsx(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white select-none",
          showImage ? "bg-gray-200" : PALETTE[hashName(name) % PALETTE.length],
          className,
        ),
      )}
    >
      {showImage ? (
        <img
          src={imageSrc}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}

export default Avatar
