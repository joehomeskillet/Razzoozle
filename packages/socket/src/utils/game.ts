import { MAX_POINTS } from "@razzoozle/common/constants"
import type { Socket } from "@razzoozle/common/types/game/socket"
import Game from "@razzoozle/socket/services/game"
import Registry from "@razzoozle/socket/services/registry"
import { nanoid } from "nanoid"

export const withGame = (
  gameId: string | undefined,
  socket: Socket,
  callback: (_game: Game) => void | Promise<void>,
): void => {
  if (!gameId) {
    socket.emit("game:errorMessage", "errors:game.notFound")

    return
  }

  const registry = Registry.getInstance()
  const game = registry.getGameById(gameId)

  if (!game) {
    socket.emit("game:errorMessage", "errors:game.notFound")

    return
  }

  callback(game)
}

export const createInviteCode = (length = 6) => {
  let result = ""
  const characters = "0123456789"
  const charactersLength = characters.length

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * charactersLength)
    result += characters.charAt(randomIndex)
  }

  return result
}

export const normalizeFilename = (subject: string) => {
  const slug = subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .slice(0, 10)

  const shortId = nanoid(8)

  return `${slug}-${shortId}`
}

export const timeToPoint = (
  startTime: number,
  secondes: number,
  mode: "speed" | "accuracy" = "speed",
): number => {
  let points = MAX_POINTS

  const actualTime = Date.now()
  const tempsPasseEnSecondes = (actualTime - startTime) / 1000

  // If the time window has passed, return 0 regardless of mode.
  if (tempsPasseEnSecondes > secondes) {
    return 0
  }

  // Accuracy mode: return full base points for answers within the window (no time decay).
  if (mode === "accuracy") {
    return points
  }

  // Speed mode: apply time decay (existing behavior).
  points -= (MAX_POINTS / secondes) * tempsPasseEnSecondes
  points = Math.max(0, points)

  return points
}
