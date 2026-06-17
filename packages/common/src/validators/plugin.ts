import { z } from "zod"

// Manifest format version. Bumped only on a breaking manifest-shape change; the
// validator coerces a missing field to this so old plugin.json files stay valid.
export const PLUGIN_FORMAT_VERSION = 1

// Safe plugin id: lowercase alnum + dashes, 1–64 chars, must start alnum. Used as
// the on-disk dir name (config/plugins/<id>/), so the server still re-asserts it
// via assertSafeId — this is the wire-level guard, not the filesystem one.
const safeId = /^[a-z0-9][a-z0-9-]{0,63}$/

// A manager plugin manifest (plugin.json at the root of a skeleton-shaped ZIP).
// Mirrors the lenient, default-everything style of themeValidator so a partial or
// older manifest still parses.
export const pluginManifestValidator = z.object({
  formatVersion: z.number().int().min(1).default(PLUGIN_FORMAT_VERSION),
  id: z.string().regex(safeId, "errors:plugin.invalidId"),
  version: z.string().min(1),
  name: z.string().min(1).max(80),
  // Declared capability badges (purely informational in v1 — never enforced).
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
  // Optional i18n bundle: { <lang>: { <key>: <string> } }.
  i18n: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  // RESERVED — v1 only honors "none" (in-process). "iframe" is a future sandbox.
  sandbox: z.enum(["none", "iframe"]).default("none"),
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
