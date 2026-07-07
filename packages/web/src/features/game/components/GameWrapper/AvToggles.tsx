import Button from "@razzoozle/web/components/Button"
import { useSoundStore } from "@razzoozle/web/features/game/stores/sound"
import { useHapticsStore } from "@razzoozle/web/features/game/stores/haptics"
import {
  hapticConfirm,
  isHapticsSupported,
} from "@razzoozle/web/features/game/utils/haptics"
import { Vibrate, VibrateOff, Volume2, VolumeX } from "lucide-react"
import { useTranslation } from "react-i18next"

const AvToggles = () => {
  const { muted, toggle: toggleMuted } = useSoundStore()
  const { enabled: hapticsEnabled, toggle: toggleHaptics } = useHapticsStore()
  const hapticsSupported = isHapticsSupported()
  const { t } = useTranslation()

  return (
    <>
      {/* Global mute toggle — shown for both player and host chrome so
          anyone can silence the game. Wired to the persisted sound
          store; >=44px touch target via Button size="icon" min-h-11. */}
      <Button
        variant="secondary"
        size="icon"
        className="min-h-11 min-w-11"
        onClick={toggleMuted}
        aria-pressed={muted}
        title={t(muted ? "game:controls.unmute" : "game:controls.mute")}
        aria-label={t(
          muted ? "game:controls.unmute" : "game:controls.mute",
        )}
      >
        {muted ? (
          <VolumeX className="size-5" aria-hidden />
        ) : (
          <Volume2 className="size-5" aria-hidden />
        )}
      </Button>
      {/* Haptics toggle — sits next to the global mute so any player
          (or host) can silence phone vibration. Wired to the persisted
          haptics store; >=44px touch target via Button size="icon"
          min-h-11, matching the mute control exactly. */}
      <Button
        variant="secondary"
        size="icon"
        className="min-h-11 min-w-11"
        disabled={!hapticsSupported}
        onClick={() => {
          const wasEnabled = hapticsEnabled
          toggleHaptics()
          if (!wasEnabled) hapticConfirm()
        }}
        aria-pressed={hapticsEnabled}
        title={
          !hapticsSupported
            ? t("game:controls.hapticsUnsupported", {
                defaultValue:
                  "Vibration auf diesem Gerät nicht unterstützt",
              })
            : t(
                hapticsEnabled
                  ? "game:controls.hapticsOff"
                  : "game:controls.hapticsOn",
              )
        }
        aria-label={t(
          hapticsEnabled
            ? "game:controls.hapticsOff"
            : "game:controls.hapticsOn",
        )}
      >
        {hapticsEnabled ? (
          <Vibrate className="size-5" aria-hidden />
        ) : (
          <VibrateOff className="size-5" aria-hidden />
        )}
      </Button>
    </>
  )
}

export default AvToggles
