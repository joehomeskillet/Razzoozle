// i18n regression guard for achievement locale entries (achievements.ts ↔ de/game.json).
//
// Pure TS — no React, no jsdom. Ensures every ACHIEVEMENT_META id resolves to an
// object with a non-empty string `name` in the German locale, not a raw string or
// missing key (production bug: parent i18n key resolved to an object).

import { describe, expect, it } from "vitest"
import { ACHIEVEMENT_META } from "./achievements"
import deGame from "../../../locales/de/game.json"

const achievements = deGame.achievements as Record<string, { name?: string }>

describe("de locale achievement labels", () => {
  it("every ACHIEVEMENT_META id has a non-empty string name in de locale", () => {
    for (const id of Object.keys(ACHIEVEMENT_META)) {
      const entry = achievements[id]
      expect(entry, `missing de locale entry for ${id}`).toBeTruthy()
      expect(typeof entry.name, `de achievements.${id}.name must be a string`).toBe("string")
      expect((entry.name ?? "").length).toBeGreaterThan(0)
    }
  })

  it("the parent achievements.<id> key is an OBJECT, never a raw string (regression guard)", () => {
    for (const id of Object.keys(ACHIEVEMENT_META)) {
      const entry = achievements[id]
      expect(typeof entry, `achievements.${id} must be an object, not a string`).toBe("object")
      expect(entry).not.toBeNull()
    }
  })
})
