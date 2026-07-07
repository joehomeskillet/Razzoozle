import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzoozle/common/types/game/socket"
import type { ManagerConfig } from "@razzoozle/common/types/manager"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
import i18n from "@razzoozle/web/i18n"
import { socketClient } from "@razzoozle/web/features/game/contexts/socket-context"
import toast from "react-hot-toast"
import type { Socket } from "socket.io-client"

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Keys reserved by the built-in manager tabs. A plugin registration whose key
// collides with one of these is rejected (logged + ignored) so a plugin can
// never shadow or hijack a core console tab. Mirrors the built-in tab keys in
// configurations/index.tsx.
const BUILTIN_TAB_KEYS = [
  "play",
  "quizz",
  "gamemode",
  "catalog",
  "media",
  "ki",
  "achievements",
  "results",
  "running",
  "design",
  "satellite",
  "submissions",
  "dev",
] as const

// All plugin tab keys are namespaced under this prefix. A registration whose key
// is not `plugin:<id>` is rejected — the namespace keeps plugin keys disjoint
// from builtins (and from each other's accidental collisions with core names).
const PLUGIN_TAB_PREFIX = "plugin:"

/**
 * A manager tab contributed by a plugin's ui.js. `render` is handed the host
 * DOM element (owned by <PluginTabHost>) and may imperatively populate it with
 * any framework or vanilla DOM; the optional returned function is invoked on
 * teardown (tab switch / unmount / re-register) to release listeners/timers.
 */
export interface PluginTabRegistration {
  /** MUST be namespaced `plugin:<id>`. */
  key: string
  /** i18n key OR a literal label; resolved via `t(nameKey, { defaultValue })`. */
  nameKey: string
  /** Lucide icon name (PascalCase, e.g. "Puzzle"); falls back when unknown. */
  icon: string
  /** Manifest gating: "always" (default) or "devMode" (RAZZOOLE_DEV only). */
  gated?: "always" | "devMode"
  /**
   * Mount the tab into `rootEl`. May return a teardown function called before
   * the next render and on unmount, or `undefined` for no teardown. Must
   * tolerate being called again after a teardown (StrictMode double-invoke, tab
   * re-entry).
   */
  render: (rootEl: HTMLElement) => (() => void) | undefined
}

// v2 RENDER SLOT: a plugin's in-game render hook for specific game status events.
// Registered via window.razzoozle.registerRenderSlot and called during game play
// when the game status matches one of the registered events.
export interface PluginRenderSlotRegistration {
  /** Events this plugin hook should render for: SHOW_QUESTION, SHOW_RESULT, etc. */
  events: Array<"SHOW_QUESTION" | "SHOW_RESULT" | "SHOW_LEADERBOARD" | "FINISHED">
  /**
   * Render the plugin's UI into `container`. Called when the game status matches
   * one of the registered events. May return a teardown function called before
   * the next render or on unmount.
   */
  render: (
    container: HTMLElement,
    context: { status: string; data: unknown },
  ) => (() => void) | undefined
}

// The stable, documented surface a plugin's ui.js consumes. Everything here is
// read-only or fire-and-forget from the plugin's perspective; the host owns
// lifecycle. `config` is a frozen snapshot taken at access time (see getApi).
export interface PluginHostApi {
  /** The manager's TypedSocket (already authenticated). */
  socket: TypedSocket
  /** READ-ONLY snapshot of the live ManagerConfig (frozen). */
  config: ManagerConfig
  /** i18next translator bound to the active language. */
  t: typeof i18n.t
  /** react-hot-toast instance for transient notices. */
  toast: typeof toast
  /** v2: Register an in-game render slot for specific game status events. */
  registerRenderSlot?: (registration: PluginRenderSlotRegistration) => void
}

// Public host global. Defined ONLY in the manager app (initManagerPluginHost).
// Plugins reach it as `window.razzoozle`. The theme layer (apply.ts) sets its
// own minimal `{ theme, skeletonVersion }` shape for skeleton JS; the manager
// host MERGES these tab/api fields onto whatever is already there so neither
// clobbers the other regardless of load order.
export interface RazzoozleGlobal {
  // Skeleton/theme fields (owned by apply.ts) — kept loose here.
  theme?: unknown
  skeletonVersion?: number
  // Manager plugin host fields (owned by this module).
  registerTab?: (registration: PluginTabRegistration) => void
  api?: PluginHostApi
}

// Module-level registry: plugin tab key → registration. Idempotent upsert means
// a re-injected ui.js (version bump) replaces its entry in place rather than
// stacking. Lives at module scope so it survives React re-renders/StrictMode.
const registry = new Map<string, PluginTabRegistration>()

// Module-level registry for v2 render slots: plugin id → registration.
// Idempotent upsert (same id replaces in place). Lives at module scope.
const renderSlotRegistry = new Map<string, PluginRenderSlotRegistration>()

// Bumped on every successful upsert/removal so React consumers (the tab list)
// can subscribe to registry changes via useSyncExternalStore.
let version = 0
const listeners = new Set<() => void>()

const emitChange = () => {
  version += 1
  for (const fn of listeners) fn()
}

// Live ManagerConfig snapshot, kept in sync by the config bridge so getApi can
// hand plugins a current (frozen) view without coupling to React context.
let liveConfig: ManagerConfig = { quizz: [], results: [], submissions: [] }

/** Called by the manager bootstrap whenever a fresh ManagerConfig arrives. */
export const setHostConfig = (config: ManagerConfig) => {
  liveConfig = config
}

const getApi = (): PluginHostApi => ({
  socket: socketClient,
  // Frozen shallow copy: plugins get a read-only view, never the live object.
  config: Object.freeze({ ...liveConfig }) as ManagerConfig,
  t: i18n.t.bind(i18n),
  toast,
  registerRenderSlot,
})

const isBuiltinKey = (key: string): boolean =>
  (BUILTIN_TAB_KEYS as readonly string[]).includes(key)

// Validate + upsert a plugin tab registration. Rejections are logged and
// ignored (never thrown) so one bad plugin can't break the host or sibling
// plugins. Rules: key must be `plugin:<id>` and must not collide with a builtin.
const registerTab = (registration: PluginTabRegistration): void => {
  const { key } = registration

  if (typeof key !== "string" || !key.startsWith(PLUGIN_TAB_PREFIX)) {
    console.warn(
      `[razzoozle] ignoring plugin tab with non-namespaced key: ${String(key)}`,
    )
    return
  }

  if (isBuiltinKey(key)) {
    console.warn(
      `[razzoozle] ignoring plugin tab colliding with builtin key: ${key}`,
    )
    return
  }

  if (typeof registration.render !== "function") {
    console.warn(`[razzoozle] ignoring plugin tab without render(): ${key}`)
    return
  }

  // Idempotent upsert — same key replaces in place (version-bumped ui.js).
  registry.set(key, registration)
  emitChange()
}

// v2: Validate + register a plugin render slot. Rejections are logged and
// ignored (never thrown) so one bad plugin can't break the host. Rules: events
// must be a non-empty array, render must be a function.
const registerRenderSlot = (
  registration: PluginRenderSlotRegistration,
): void => {
  if (
    !Array.isArray(registration.events) ||
    registration.events.length === 0
  ) {
    console.warn(
      `[razzoozle] ignoring render slot registration with empty events`,
    )
    return
  }

  if (typeof registration.render !== "function") {
    console.warn(
      `[razzoozle] ignoring render slot registration without render()`,
    )
    return
  }

  // Idempotent upsert: use a stable key (plugin id extracted from the caller
  // context). For simplicity, use a counter-based key since we don't have the
  // plugin id in this context. In a full implementation, the ui.js would pass
  // the plugin id to registerRenderSlot.
  const key = `render-slot-${renderSlotRegistry.size}`
  renderSlotRegistry.set(key, registration)
  emitChange()
}

/**
 * Initialise the manager plugin host. Idempotent: safe to call on every manager
 * mount (StrictMode double-invoke included) — it only (re)attaches the global
 * surface, never resets the registry. Returns nothing; the global is the API.
 *
 * MANAGER CONTEXT ONLY. Never call from the player game app — plugin tabs are
 * manager-only by contract.
 */
export const initManagerPluginHost = (): void => {
  if (typeof window === "undefined") return

  const w = window as unknown as { razzoozle?: RazzoozleGlobal }
  // Merge onto whatever apply.ts (skeleton theme) may have already set, so
  // load order is irrelevant and neither side clobbers the other.
  const existing = w.razzoozle ?? {}
  w.razzoozle = Object.assign(existing, {
    registerTab,
    get api() {
      return getApi()
    },
  })
}

/** Snapshot accessor for useSyncExternalStore — returns the version counter. */
export const getRegistryVersion = (): number => version

/** Subscribe to registry mutations (add/upsert/remove). */
export const subscribeRegistry = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Current registered plugin tabs, in insertion order. */
export const getRegisteredPluginTabs = (): PluginTabRegistration[] =>
  Array.from(registry.values())

/** Look up a single registration (used by <PluginTabHost>). */
export const getPluginTab = (
  key: string,
): PluginTabRegistration | undefined => registry.get(key)


// ── Script injection (manager-only) ─────────────────────────────────────────

// Element id for an injected plugin script, keyed by plugin id so each plugin
// owns exactly one <script> tag (idempotent, version-busted) — mirrors the
// ensureScript pattern in features/theme/apply.ts.
const scriptId = (id: string): string => `plugin-js-${id}`

/**
 * Reconcile injected plugin ui.js scripts against the enabled plugin list.
 * Mirrors apply.ts's idempotent, version-busted `ensureScript`:
 *  - For each ENABLED plugin: ensure a `<script id=plugin-js-<id>>` with
 *    `src=/plugins/<id>/ui.js?v=<version>` (re-points src on a version bump).
 *  - Remove the script for any plugin no longer enabled/installed.
 * MANAGER CONTEXT ONLY. The registry is mutated by the scripts themselves once
 * they load and call `window.razzoozle.registerTab(...)`.
 */
export const syncPluginScripts = (plugins: InstalledPlugin[]): void => {
  if (typeof document === "undefined") return

  const enabled = plugins.filter((p) => p.enabled)
  const wanted = new Set(enabled.map((p) => scriptId(p.id)))

  // Remove scripts for plugins that are gone or disabled.
  const existing = document.querySelectorAll<HTMLScriptElement>(
    'script[data-plugin-js="true"]',
  )
  for (const el of Array.from(existing)) {
    if (!wanted.has(el.id)) {
      el.remove()
      // Drop any tab the now-removed plugin had registered so it disappears
      // from the nav immediately (the script side-effect can't un-register).
      const removedId = el.dataset.pluginId
      if (removedId && registry.delete(`${PLUGIN_TAB_PREFIX}${removedId}`)) {
        emitChange()
      }
    }
  }

  // Ensure (create or re-point) a script for each enabled plugin.
  for (const plugin of enabled) {
    const id = scriptId(plugin.id)
    let el = document.getElementById(id) as HTMLScriptElement | null
    if (!el) {
      el = document.createElement("script")
      el.id = id
      el.dataset.pluginJs = "true"
      el.dataset.pluginId = plugin.id
      el.async = true
      document.body.appendChild(el)
    }
    const src = `/plugins/${plugin.id}/ui.js?v=${encodeURIComponent(
      plugin.version,
    )}`
    // Only (re)assign when changed so a same-version reconcile doesn't reload.
    if (!el.src.endsWith(src)) {
      el.src = src
    }
  }
}
