import {
  AVATAR_SVG_MAX_CHARS,
  EVENTS,
} from "@razzoozle/common/constants"
import type { Socket } from "@razzoozle/common/types/game/socket"
import { setAvatarValidator } from "@razzoozle/common/validators/avatar"
import {
  saveEphemeralAvatar,
} from "@razzoozle/socket/services/config"

const DICEBEAR_IDENTITY_RE = /^dicebear:[a-z]+:.+$/

/**
 * Resolve and validate an avatar input (DiceBear identity, SVG data-URI, or raster data-URI).
 * Emits error messages to socket if validation fails.
 * Returns the resolved avatar string or undefined if invalid/empty.
 */
export async function resolveAvatarImpl(
  gameId: string,
  socket: Socket,
  avatar: unknown,
): Promise<string | undefined> {
  if (avatar === undefined || avatar === null || avatar === "") {
    return undefined
  }

  const result = setAvatarValidator.safeParse({ avatar })

  if (!result.success) {
    socket.emit(EVENTS.GAME.ERROR_MESSAGE, result.error.issues[0].message)
    return undefined
  }

  const value = result.data.avatar

  if (value.startsWith("dicebear:")) {
    if (value.length <= 200 && DICEBEAR_IDENTITY_RE.test(value)) {
      return value
    }

    socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:avatar.invalid")
    return undefined
  }

  // SVG data-URIs (our DiceBear-generated avatars) are tiny and render safely in
  // <img> with no script execution, so we store them verbatim — no WebP transcode
  // (saveEphemeralAvatar's decodeDataUrl only accepts raster/base64 data and would
  // reject these). Only a length cap is needed to bound the payload. Raster uploads
  // still go through saveEphemeralAvatar below, unchanged.
  if (value.startsWith("data:image/svg+xml")) {
    if (value.length > AVATAR_SVG_MAX_CHARS) {
      socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:avatar.tooLarge")
      return undefined
    }

    return value
  }

  if (value.startsWith("data:")) {
    try {
      return await saveEphemeralAvatar(gameId, socket.id, value)
    } catch (error) {
      socket.emit(
        EVENTS.GAME.ERROR_MESSAGE,
        error instanceof Error ? error.message : "errors:avatar.invalid",
      )
      return undefined
    }
  }

  socket.emit(EVENTS.GAME.ERROR_MESSAGE, "errors:avatar.invalid")
  return undefined
}
