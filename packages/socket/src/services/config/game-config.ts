// Game config (config/game.json) — teamMode, lowLatencyMode, joinLocked, etc.
// Extracted verbatim from services/config.ts (SRP split).
import { type GameConfig, gameConfigValidator } from "@razzoozle/common/validators/game-config"
import fs from "fs"
import { getPath } from "@razzoozle/socket/services/config/shared"

export type { GameConfig } from "@razzoozle/common/validators/game-config"

export const getGameConfig = (): GameConfig => {
  const isExists = fs.existsSync(getPath("game.json"))

  if (!isExists) {
    throw new Error("Game config not found")
  }

  // Parse through the zod validator so every field is defaulted/back-filled.
  // A bare `{ managerPassword: "PASSWORD" }` back-fills the whole lowLatencyMode
  // block with `enabled: false`, so existing configs validate unchanged and the
  // auth gate (managerPassword) passes through. On any failure we fall back to
  // the schema defaults (`gameConfigValidator.parse({})`) so the server never
  // crashes on a malformed file — it just behaves as normal mode.
  try {
    const raw = fs.readFileSync(getPath("game.json"), "utf-8")
    const result = gameConfigValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn("Invalid game.json, using defaults:", result.error.issues)
  } catch (error) {
    console.error("Failed to read game config:", error)
  }

  return gameConfigValidator.parse({})
}

export const updateGameConfig = (patch: {
  teamMode?: boolean
  // The `lowLatencyMode.enabled` master switch, flattened for the manager
  // toggle. Deep-merged below so the other lowLatencyMode sub-fields are kept.
  lowLatencyEnabled?: boolean
  joinLocked?: boolean
  randomizeAnswers?: boolean
  scoringMode?: "speed" | "accuracy"
}): GameConfig => {
  const current = getGameConfig()
  const { lowLatencyEnabled, ...flatPatch } = patch
  const merged = {
    ...current,
    ...flatPatch,
    // Only touch the nested enabled flag when the caller provided it; keep the
    // rest of the persisted lowLatencyMode block intact.
    ...(lowLatencyEnabled === undefined
      ? {}
      : {
          lowLatencyMode: { ...current.lowLatencyMode, enabled: lowLatencyEnabled },
        }),
  }
  const result = gameConfigValidator.safeParse(merged)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  fs.writeFileSync(getPath("game.json"), JSON.stringify(result.data, null, 2))

  // Fire-and-forget PG mirror of the behavioral toggles (db-backed modes only),
  // mirroring the submissions dual-write pattern. NEVER mirror managerPassword —
  // Node auth + smoke read the password straight from PG.
  const dbMode = process.env.DATABASE_MODE?.toLowerCase()
  if (dbMode === "dual" || dbMode === "pg" || dbMode === "pg-only") {
    const pgPatch: Record<string, unknown> = {}
    if (patch.teamMode !== undefined) pgPatch.teamMode = patch.teamMode
    if (patch.joinLocked !== undefined) pgPatch.joinLocked = patch.joinLocked
    if (patch.randomizeAnswers !== undefined) pgPatch.randomizeAnswers = patch.randomizeAnswers
    if (patch.scoringMode !== undefined) pgPatch.scoringMode = patch.scoringMode
    if (lowLatencyEnabled !== undefined) pgPatch.lowLatencyMode = { enabled: lowLatencyEnabled }
    if (Object.keys(pgPatch).length > 0) {
      const { storageRepository } =
        require("@razzoozle/socket/services/storage") as typeof import("@razzoozle/socket/services/storage")
      storageRepository()
        .updateGameConfig(pgPatch as Partial<GameConfig>)
        .catch((error) => console.error("game-config pg mirror failed", error))
    }
  }

  return result.data
}

// TODO: Migrate other write sites to use updateGameConfigViaStorage next wave
export async function updateGameConfigViaStorage(
  patch: Partial<GameConfig>,
  expectedVersion?: number,
): Promise<GameConfig> {
  const { storageRepository } =
    require("@razzoozle/socket/services/storage") as typeof import("@razzoozle/socket/services/storage")
  return storageRepository().updateGameConfig(patch, expectedVersion)
}
