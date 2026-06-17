// Wave C step 2 (PLAYBACK) — resolve SFX URLs from the active theme with a
// fallback to the bundled defaults. A theme may override a slot with a served
// asset ref; a null override (or an absent/old theme.json) falls back to the
// bundled /sounds/x.mp3, keeping playback a no-op until a sound pack is set.
import {
  SOUND_DEFAULTS,
  type SoundSlot,
} from "@razzoozle/common/constants"
import { useThemeStore } from "@razzoozle/web/features/theme/store"

// Subscribes to the active theme so useSound re-initialises when the slot's
// resolved url changes (use-sound re-inits on url arg change).
export const useSoundUrl = (slot: SoundSlot): string =>
  useThemeStore((s) => s.theme.sounds?.[slot]) ?? SOUND_DEFAULTS[slot]
