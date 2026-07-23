import { createContext, useContext, type Context } from "react"

export type GameAudience = "player" | "presenter" | "display"

export const GameAudienceContext: Context<GameAudience> = createContext<GameAudience>("player")

export function useGameAudience(): GameAudience {
  return useContext(GameAudienceContext)
}

export function audienceFromWrapperProps(
  manager?: boolean,
  controls?: boolean
): GameAudience {
  if (manager && controls !== false) {
    return "presenter"
  }
  if (manager && controls === false) {
    return "display"
  }
  return "player"
}
