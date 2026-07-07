// ---- Achievements config (config/achievements.json) -----------------------
// Persisted shape: { [id]: { enabled?, name?, description?, threshold? } }.
// Reads never throw — a missing/corrupt file yields {} (registry defaults). The
// merged list (mergeAchievementsConfig) clamps every threshold and back-fills
// the defaults, so an empty record reproduces the SHIPPED hardcoded behaviour.
// Mirrors the getGameConfig + saveResult patterns (zod-validate, safe-write).
// Extracted verbatim from services/config.ts (SRP split).
import {
  achievementsConfigValidator,
  type AchievementsConfig,
} from "@razzoozle/common/validators/achievements"
import {
  mergeAchievementsConfig,
  type MergedAchievement,
} from "@razzoozle/common/achievements"
import fs from "fs"
import { ensureDir, getPath } from "@razzoozle/socket/services/config/shared"

export const getAchievementsConfig = (): AchievementsConfig => {
  const filePath = getPath("achievements.json")

  if (!fs.existsSync(filePath)) {
    return {}
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const result = achievementsConfigValidator.safeParse(JSON.parse(raw))

    if (result.success) {
      return result.data
    }

    console.warn(
      "Invalid achievements.json, using defaults:",
      result.error.issues,
    )
  } catch (error) {
    console.error("Failed to read achievements config:", error)
  }

  return {}
}

export const getMergedAchievements = (): MergedAchievement[] =>
  mergeAchievementsConfig(getAchievementsConfig())

// Deep-merge a partial patch into the stored record (per-id object merge so a
// patch that only flips `enabled` keeps an existing name/description override),
// validate the merged record, then safe-write it. ensureDir on the config root
// so a fresh volume never errors on the first save.
export const saveAchievementsConfig = (
  patch: AchievementsConfig,
): AchievementsConfig => {
  const current = getAchievementsConfig()
  const merged: AchievementsConfig = { ...current }

  for (const [id, override] of Object.entries(patch)) {
    merged[id] = { ...(current[id] ?? {}), ...override }
  }

  const result = achievementsConfigValidator.safeParse(merged)

  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }

  ensureDir(getPath())
  fs.writeFileSync(
    getPath("achievements.json"),
    JSON.stringify(result.data, null, 2),
  )

  return result.data
}
