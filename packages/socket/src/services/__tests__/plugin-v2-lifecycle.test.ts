import { describe, it, expect } from "vitest"
import {
  pluginManifestValidator,
  PLUGIN_LIFECYCLE_HOOKS,
  LIFECYCLE_HOOKS_CAPABILITY,
  RENDER_SLOT_CAPABILITY,
  type PluginLifecycleHook,
} from "@razzoozle/common/validators/plugin"

describe("plugin v2 manifest validation", () => {
  it("validates a v1 manifest without v2 fields (backward-compat)", () => {
    const v1Manifest = {
      formatVersion: 1,
      id: "old-plugin",
      version: "1.0.0",
      name: "Old Plugin",
      capabilities: [],
      tab: { nameKey: "old", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js" },
      config: {},
    }

    const result = pluginManifestValidator.safeParse(v1Manifest)
    expect(result.success).toBe(true)
    if (result.success) {
      // Should not have lifecycleHooks or renderSlot
      expect(result.data.lifecycleHooks).toBeUndefined()
      expect(result.data.renderSlot).toBeUndefined()
    }
  })

  it("validates a v2 manifest with lifecycleHooks", () => {
    const v2Manifest = {
      formatVersion: 1,
      id: "v2-plugin",
      version: "2.0.0",
      name: "V2 Plugin",
      capabilities: ["lifecycle-hooks"],
      tab: { nameKey: "v2", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js" },
      config: {},
      lifecycleHooks: ["onQuestionShown", "onResult"],
    }

    const result = pluginManifestValidator.safeParse(v2Manifest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lifecycleHooks).toEqual([
        "onQuestionShown",
        "onResult",
      ])
    }
  })

  it("validates a v2 manifest with renderSlot", () => {
    const v2Manifest = {
      formatVersion: 1,
      id: "v2-render-plugin",
      version: "2.0.0",
      name: "V2 Render Plugin",
      capabilities: ["render-slot"],
      tab: { nameKey: "v2render", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js" },
      config: {},
      renderSlot: {
        events: ["SHOW_QUESTION", "SHOW_RESULT"],
      },
    }

    const result = pluginManifestValidator.safeParse(v2Manifest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.renderSlot?.events).toEqual([
        "SHOW_QUESTION",
        "SHOW_RESULT",
      ])
    }
  })

  it("validates a v2 manifest with both lifecycleHooks and renderSlot", () => {
    const v2FullManifest = {
      formatVersion: 1,
      id: "v2-full-plugin",
      version: "2.0.0",
      name: "V2 Full Plugin",
      capabilities: ["lifecycle-hooks", "render-slot"],
      tab: { nameKey: "v2full", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js", server: "server.js" },
      config: {},
      lifecycleHooks: ["onQuestionShown", "onResult", "onLeaderboard"],
      renderSlot: {
        events: [
          "SHOW_QUESTION",
          "SHOW_RESULT",
          "SHOW_LEADERBOARD",
          "FINISHED",
        ],
      },
    }

    const result = pluginManifestValidator.safeParse(v2FullManifest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lifecycleHooks).toEqual([
        "onQuestionShown",
        "onResult",
        "onLeaderboard",
      ])
      expect(result.data.renderSlot?.events).toEqual([
        "SHOW_QUESTION",
        "SHOW_RESULT",
        "SHOW_LEADERBOARD",
        "FINISHED",
      ])
    }
  })

  it("exports PLUGIN_LIFECYCLE_HOOKS constant array", () => {
    expect(PLUGIN_LIFECYCLE_HOOKS).toEqual([
      "onQuestionShown",
      "onResult",
      "onLeaderboard",
      "onGameEnd",
    ])
    // Verify it can be used as a valid enum for lifecycle hooks
    expect(PLUGIN_LIFECYCLE_HOOKS.length).toBe(4)
  })

  it("exports advisory capability strings", () => {
    expect(LIFECYCLE_HOOKS_CAPABILITY).toBe("lifecycle-hooks")
    expect(RENDER_SLOT_CAPABILITY).toBe("render-slot")
  })

  it("rejects invalid lifecycleHooks values", () => {
    const invalidManifest = {
      formatVersion: 1,
      id: "invalid-plugin",
      version: "1.0.0",
      name: "Invalid Plugin",
      capabilities: [],
      tab: { nameKey: "invalid", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js" },
      config: {},
      lifecycleHooks: ["onQuestionShown", "invalidHook"],
    }

    const result = pluginManifestValidator.safeParse(invalidManifest)
    expect(result.success).toBe(false)
  })

  it("rejects invalid renderSlot events", () => {
    const invalidManifest = {
      formatVersion: 1,
      id: "invalid-render-plugin",
      version: "1.0.0",
      name: "Invalid Render Plugin",
      capabilities: [],
      tab: { nameKey: "invalidrender", icon: "Puzzle", gated: "always" as const },
      hooks: { client: "ui.js" },
      config: {},
      renderSlot: {
        events: ["SHOW_QUESTION", "INVALID_EVENT"],
      },
    }

    const result = pluginManifestValidator.safeParse(invalidManifest)
    expect(result.success).toBe(false)
  })

  it("type exports PluginLifecycleHook correctly", () => {
    const hooks: PluginLifecycleHook[] = [
      "onQuestionShown",
      "onResult",
      "onLeaderboard",
      "onGameEnd",
    ]
    expect(hooks).toHaveLength(4)
  })
})
