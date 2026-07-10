import { z } from "zod"

// Manifest format version. Bumped only on a breaking manifest-shape change; the
// validator coerces a missing field to this so old plugin.json files stay valid.
export const PLUGIN_FORMAT_VERSION = 1

// Safe plugin id: lowercase alnum + dashes, 1–64 chars, must start alnum. Used as
// the on-disk dir name (config/plugins/<id>/), so the server still re-asserts it
// via assertSafeId — this is the wire-level guard, not the filesystem one.
const safeId = /^[a-z0-9][a-z0-9-]{0,63}$/

// v2 lifecycle hook names (optional in manifests).
export type PluginLifecycleHook =
  | "onQuestionShown"
  | "onResult"
  | "onLeaderboard"
  | "onGameEnd"

export const PLUGIN_LIFECYCLE_HOOKS: PluginLifecycleHook[] = [
  "onQuestionShown",
  "onResult",
  "onLeaderboard",
  "onGameEnd",
]

// Advisory capability strings for display badges (NOT hard gates).
export const LIFECYCLE_HOOKS_CAPABILITY = "lifecycle-hooks"
export const RENDER_SLOT_CAPABILITY = "render-slot"

// A manager plugin manifest (plugin.json at the root of a skeleton-shaped ZIP).
// Mirrors the lenient, default-everything style of themeValidator so a partial or
// older manifest still parses.
export const pluginManifestValidator = z.object({
  formatVersion: z.number().int().min(1).default(PLUGIN_FORMAT_VERSION),
  id: z.string().regex(safeId, "errors:plugin.invalidId"),
  version: z.string().min(1),
  name: z.string().min(1).max(80),
  // Declared capability badges. The server runtime is capability-gated on
  // "SERVER_HANDLER": a server hook is only loaded/run when that badge is
  // present (see plugin-runtime SERVER_CAPABILITY). Other badges are display-only.
  capabilities: z.array(z.string()).default([]),
  // The manager tab this plugin registers. `gated` mirrors the theme-tab dev
  // gating: "always" shows it for every manager, "devMode" only when RAZZOOLE_DEV.
  tab: z.object({
    nameKey: z.string(),
    icon: z.string(),
    gated: z.enum(["always", "devMode"]).default("always"),
  }),
  // Entry-point file names inside the ZIP. `client` is the browser UI bundle;
  // `server` is the optional (v1) server hook module.
  hooks: z
    .object({
      client: z.string().default("ui.js"),
      server: z.string().optional(),
    })
    .default({ client: "ui.js" }),
  // Free-form plugin config bag (validated/owned by the plugin itself).
  config: z.record(z.string(), z.unknown()).default({}),
  // RESERVED (v2) — validated but inert in v1. Optional i18n bundle:
  // { <lang>: { <key>: <string> } }. Not yet merged into the manager's i18next.
  i18n: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  // RESERVED (v2) — validated but inert in v1: only "none" (in-process) is
  // honoured; "iframe" is a future sandbox and runs nowhere yet.
  sandbox: z.enum(["none", "iframe"]).default("none"),
  // v2 LIFECYCLE HOOKS: optional server-side lifecycle event subscriptions.
  // When present, the server emits lifecycle events to this plugin.
  lifecycleHooks: z
    .array(z.enum(["onQuestionShown", "onResult", "onLeaderboard", "onGameEnd"]))
    .optional(),
  // v2 RENDER SLOT: optional in-game render hook for displaying plugin UI
  // during specific game phases. When present, the plugin can register a
  // renderSlot to contribute DOM to the game screen at the specified events.
  renderSlot: z
    .object({
      events: z.array(
        z.enum(["SHOW_QUESTION", "SHOW_RESULT", "SHOW_LEADERBOARD", "FINISHED"]),
      ),
    })
    .optional(),
})

// Single source of truth: a parsed/persisted manifest IS a `PluginManifest`.
export type PluginManifest = z.infer<typeof pluginManifestValidator>

// The shape stored in config/plugins/index.json and surfaced in ManagerConfig.
// A lightweight, enable-flag-bearing view over an installed plugin — NOT the full
// manifest (the manager UI doesn't need hooks/tab/i18n to render the toggle row).
export interface InstalledPlugin {
  id: string
  name: string
  version: string
  enabled: boolean
  capabilities: string[]
  config?: Record<string, unknown>
}
