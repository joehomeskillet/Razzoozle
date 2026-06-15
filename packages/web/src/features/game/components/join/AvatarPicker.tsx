import {
  AVATARS_GENERIC,
  AVATAR_MAX_BYTES,
  EVENTS,
} from "@razzoozle/common/constants"
import Avatar from "@razzoozle/web/components/Avatar"
import Button from "@razzoozle/web/components/Button"
import { useSocket } from "@razzoozle/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"
import clsx from "clsx"
import { useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  onDone?: () => void
}

// Lobby avatar picker: choose one of the 4 generic KI avatars or upload an
// image (converted to a size-capped data-URL). The selection is persisted to
// the player store and broadcast to the server via PLAYER.SET_AVATAR so the
// host roster / leaderboard / podium can render it.
const AvatarPicker = ({ onDone }: Props) => {
  const { socket } = useSocket()
  const { player, setAvatar } = usePlayerStore()
  const username = player?.username ?? ""
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | undefined>(player?.avatar)
  const [uploading, setUploading] = useState(false)
  const { t } = useTranslation()

  const choose = (value: string) => {
    setSelected(value)
    setAvatar(value)
    // Typed socket maps SET_AVATAR payload to `unknown`; server validates.
    socket.emit(EVENTS.PLAYER.SET_AVATAR, { avatar: value })
    onDone?.()
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset the input so picking the same file again re-fires onChange.
    event.target.value = ""

    if (!file) {
      return
    }

    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(t("game:avatar.upload"))

      return
    }

    try {
      setUploading(true)
      const reader = new FileReader()

      reader.onload = () => {
        const result = reader.result

        if (typeof result === "string") {
          choose(result)
          toast.success(t("game:avatar.uploaded"))
        }

        setUploading(false)
      }

      reader.onerror = () => {
        setUploading(false)
      }

      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
  }

  return (
    <div className="glass-2 flex w-full flex-col items-center gap-4">
      <p className="text-lg font-bold text-gray-800">{t("game:avatar.title")}</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {AVATARS_GENERIC.map((url, index) => (
          <button
            key={url}
            type="button"
            aria-label={`${t("game:avatar.genericLabel")} ${index + 1}`}
            aria-pressed={selected === url}
            onClick={() => choose(url)}
            className={clsx(
              "rounded-full transition",
              selected === url
                ? "outline-3 outline-offset-2 outline-[var(--color-primary)]"
                : "outline-2 outline-offset-2 outline-transparent hover:outline-gray-300",
            )}
          >
            <Avatar src={url} name={username} size={64} />
          </button>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      <div className="flex flex-col items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? t("game:avatar.uploading") : t("game:avatar.upload")}
        </Button>

        {onDone && (
          <Button variant="ghost" size="sm" onClick={() => onDone()}>
            {t("game:avatar.skip")}
          </Button>
        )}
      </div>
    </div>
  )
}

export default AvatarPicker
