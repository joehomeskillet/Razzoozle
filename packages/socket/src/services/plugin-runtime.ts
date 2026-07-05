// ── Plugin server runtime (WP3) ───────────────────────────────────────────
//
// Runs an installed + enabled plugin's optional server hook (manifest
// hooks.server, e.g. "server.js") IN-PROCESS. v1 trust model: a plugin is
// manager-gated on install, so its server code runs with the host's privileges
// (sandbox is RESERVED for v2 — manifest.sandbox "iframe" is honoured nowhere
// yet). This module is the only place that loads + executes that runtime file.
//
// EVENT NAMESPACING (the wire contract): a plugin calls hostApi.on("foo", fn)
// and hostApi.broadcast("bar", payload); on the wire these become
//   "plugin:<id>:foo"   (inbound, client → this handler)
//   "plugin:<id>:bar"   (outbound, io.emit to every client)
// so a plugin can NEVER register/hijack a builtin event (manager:*, game:*, …).
// The plugin never sees the raw io/socket — only the namespaced hostApi.
//
// PLUGIN server.js CONTRACT (expected exports):
//   export function register(hostApi): (() => void) | void
//   // or `export default register` / `export default { register }`
//   // returns an OPTIONAL teardown called on unload.
//
// BUNDLE-SAFE LOAD: packages/socket is type:module (dev = tsx/ESM,
// prod = a single esbuild-bundled dist/index.cjs). The plugin file is installed
// at RUNTIME under config/plugins/<id>/ and is NOT part of the bundle, so it is
// loaded with a DYNAMIC import() of a runtime file URL (pathToFileURL). esbuild
// preserves a runtime import() of a variable specifier, and Node supports
// import() from a CJS module, so this works in BOTH dev and the bundled prod.
// Never use require() (breaks in the ESM dev context) and never a static import.

import { statSync } from "node:fs"
import { pathToFileURL } from "node:url"
import type { Server as RawServer, Socket as RawSocket } from "socket.io"
import type {
  InstalledPlugin,
  PluginLifecycleHook,
} from "@razzoozle/common/validators/plugin"
import { EVENTS } from "@razzoozle/common/constants"
import {
  assertSafeId,
  pluginServerPath,
  readPlugins,
  setPluginConfig,
} from "@razzoozle/socket/services/config"

// The capability badge a plugin MUST declare (in manifest/InstalledPlugin
// capabilities) for its server hook to be loaded. UI-only plugins (no server
// capability) are skipped entirely — their hooks.server, if any, is inert.
export const SERVER_CAPABILITY = "SERVER_HANDLER"

// The host API surface handed to a plugin's register(hostApi). NAMESPACED +
// capability-aware: it never exposes the raw io/socket. on() registrations are
// tracked for teardown; broadcast()/persistConfig() are namespaced to the
// plugin's own wire prefix.
export interface PluginHostApi {
  // The owning plugin's id (read-only convenience for the plugin).
  readonly id: string
  // Register a socket-event handler. The wire event is namespaced to
  // "plugin:<id>:<event>" so a plugin can only ever listen to its own surface.
  on: (event: string, handler: PluginEventHandler) => void
  // Emit to every connected client on the plugin namespace
  // "plugin:<id>:<event>".
  broadcast: (event: string, payload?: unknown) => void
  // The plugin's persisted config bag (from the InstalledPlugin index entry).
  readConfig: () => Record<string, unknown>
  // Merge-persist the plugin's config bag, then broadcast the fresh
  // InstalledPlugin[] (EVENTS.MANAGER.PLUGIN_CONFIG) so every manager reflects
  // it live, mirroring the WP2 manager handlers.
  persistConfig: (config: Record<string, unknown>) => void
  // Prefixed console logging ("[plugin:<id>] …").
  log: (...args: unknown[]) => void
  // Re-exported id guard for plugins that build their own sub-ids.
  assertSafeId: (id: string) => void
}

// A plugin event handler. The optional second arg is socket.io's ack callback
// (when the client emits with an ack); the handler may call respond(result).
export type PluginEventHandler = (
  payload: unknown,
  respond?: (result: unknown) => void,
) => void | Promise<void>

// A loaded plugin's live state: its teardown (if register returned one), the
// wire-event → bound-listener map (so the exact same fn ref can be socket.off'd
// on unload), and an `errored` flag set when import/register threw.
interface LoadedPlugin {
  id: string
  teardown?: () => void
  // wireEvent ("plugin:<id>:<event>") → the listener bound onto every socket.
  handlers: Map<string, (...args: unknown[]) => void>
  errored: boolean
}

// id → LoadedPlugin. A plugin is in this registry iff its server hook has been
// loaded (regardless of errored state). unloadPlugin removes it.
const registry = new Map<string, LoadedPlugin>()

// Track loaded plugin module URLs and file metadata to avoid unbounded ESM
// cache growth. When the same plugin is reloaded without file changes, reuse
// the cached URL so the ESM loader doesn't create a new module entry.
const pluginModuleCache = new Map<
  string,
  { mtime: number; version: string; url: string }
>()

// The live socket.io Server. Set ONCE at boot (index.ts) before any plugin is
// loaded or any socket connects. Kept as the untyped raw socket.io Server so
// the dynamic "plugin:<id>:<event>" names type-check (the project's strict
// typed Server only knows builtin events).
let ioRef: RawServer | null = null

export const setPluginIo = (io: RawServer): void => {
  ioRef = io
}

const wireEvent = (id: string, event: string): string =>
  `plugin:${id}:${event}`

// Iterate every currently-connected socket. socket.io exposes the live
// connection map at io.sockets.sockets (Map<socketId, Socket>).
const connectedSockets = (): RawSocket[] => {
  if (!ioRef) {
    return []
  }

  return Array.from(ioRef.sockets.sockets.values())
}

const buildHostApi = (plugin: InstalledPlugin): PluginHostApi => {
  const { id } = plugin

  return {
    id,
    on: (event, handler) => {
      const loaded = registry.get(id)

      if (!loaded) {
        return
      }

      const wire = wireEvent(id, event)

      // The bound listener forwards the socket.io args to the plugin handler.
      // socket.io passes (payload, ack?) — we surface payload + an optional
      // respond callback. Any throw inside the plugin handler is isolated so a
      // buggy plugin can never crash the server's event loop.
      const listener = (...args: unknown[]): void => {
        const payload = args[0]
        const ack =
          typeof args[args.length - 1] === "function"
            ? (args[args.length - 1] as (result: unknown) => void)
            : undefined

        try {
          const maybePromise = handler(payload, ack)

          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.catch((error: unknown) => {
              console.error(`[plugin:${id}] handler "${event}" rejected:`, error)
            })
          }
        } catch (error) {
          console.error(`[plugin:${id}] handler "${event}" threw:`, error)
        }
      }

      // De-dupe: if the plugin re-registers the same event, detach the old
      // listener from every socket first so we never double-fire.
      const existing = loaded.handlers.get(wire)

      if (existing) {
        for (const socket of connectedSockets()) {
          socket.off(wire, existing)
        }
      }

      loaded.handlers.set(wire, listener)

      // Hot-bind onto every already-connected socket so a plugin enabled at
      // runtime starts receiving events immediately. off() first so the same
      // listener can never be attached twice to one socket (idempotent bind).
      for (const socket of connectedSockets()) {
        socket.off(wire, listener)
        socket.on(wire, listener)
      }
    },
    broadcast: (event, payload) => {
      if (!ioRef) {
        return
      }

      ioRef.emit(wireEvent(id, event), payload)
    },
    readConfig: () => {
      const current = readPlugins().find((p) => p.id === id)

      return current?.config ?? {}
    },
    persistConfig: (config) => {
      setPluginConfig(id, config)

      if (ioRef) {
        ioRef.emit(EVENTS.MANAGER.PLUGIN_CONFIG, readPlugins())
      }
    },
    log: (...args) => {
      console.log(`[plugin:${id}]`, ...args)
    },
    assertSafeId,
  }
}

// Should this plugin's server hook be loaded? It must declare the SERVER
// capability AND have a resolvable on-disk server hook (manifest hooks.server).
const hasServerHook = (plugin: InstalledPlugin): boolean =>
  plugin.enabled &&
  plugin.capabilities.includes(SERVER_CAPABILITY) &&
  pluginServerPath(plugin.id) !== null

// The minimal shape a plugin server hook may export: a top-level register()
// and/or a default export (function or { register }). Resolved by extractRegister.
type PluginModule = {
  register?: unknown
  default?: unknown
}

type RegisterFn = (api: PluginHostApi) => unknown

// Narrow a dynamically-imported module to its register() function, accepting
// `export function register`, `export default register`, or
// `export default { register }`. Returns null when no register() is exported.
const extractRegister = (mod: PluginModule): RegisterFn | null => {
  if (typeof mod.register === "function") {
    return mod.register as RegisterFn
  }

  const def = mod.default

  if (
    def &&
    typeof def === "object" &&
    typeof (def as { register?: unknown }).register === "function"
  ) {
    return (def as { register: RegisterFn }).register
  }

  if (typeof def === "function") {
    return def as RegisterFn
  }

  return null
}

// Load + run a single plugin's server hook. Capability-gated, fully crash-
// isolated: a server.js that throws on import OR inside register() is caught,
// logged and the plugin is marked `errored` (its `enabled` flag is NOT
// flipped) — the server never crashes. Returns true if a hook was actually run.
export const loadPlugin = async (plugin: InstalledPlugin): Promise<boolean> => {
  if (!ioRef) {
    console.error(
      `[plugin:${plugin.id}] cannot load: plugin io not initialised`,
    )

    return false
  }

  try {
    assertSafeId(plugin.id)
  } catch {
    return false
  }

  // Capability gate: UI-only plugins (no SERVER_HANDLER) are skipped silently.
  if (
    !plugin.enabled ||
    !plugin.capabilities.includes(SERVER_CAPABILITY)
  ) {
    return false
  }

  const serverPath = pluginServerPath(plugin.id)

  if (!serverPath) {
    return false
  }

  // Tear down any prior load of the same id before re-loading (idempotent).
  if (registry.has(plugin.id)) {
    unloadPlugin(plugin.id)
  }

  const loaded: LoadedPlugin = {
    id: plugin.id,
    handlers: new Map(),
    errored: false,
  }
  registry.set(plugin.id, loaded)

  try {
    // Check file metadata to avoid unbounded ESM cache growth on plugin reloads.
    // If the plugin file and version haven't changed since last load, reuse the
    // cached import URL; otherwise create a fresh one with a timestamp.
    const stats = statSync(serverPath)
    const cached = pluginModuleCache.get(plugin.id)

    let importUrl: string
    if (
      cached &&
      cached.mtime === stats.mtime.getTime() &&
      cached.version === plugin.version
    ) {
      // File and version unchanged; reuse cached URL to hit ESM module cache.
      importUrl = cached.url
    } else {
      // File changed or version bumped; create fresh cache-buster query string.
      const cacheBust = `?v=${encodeURIComponent(plugin.version)}&t=${Date.now()}`
      importUrl = pathToFileURL(serverPath).href + cacheBust
      pluginModuleCache.set(plugin.id, {
        mtime: stats.mtime.getTime(),
        version: plugin.version,
        url: importUrl,
      })
    }

    // BUNDLE-SAFE dynamic import of a runtime file URL (see file header). The
    // specifier is a variable, so esbuild preserves the import() instead of
    // trying to bundle the (non-existent-at-build-time) plugin file.
    const mod = (await import(importUrl)) as PluginModule

    const register = extractRegister(mod)

    if (!register) {
      throw new Error("server hook exports no register() function")
    }

    // AWAIT the register result inside this try/catch. register() may be a
    // sync fn returning a teardown, OR an `async function register()` whose
    // returned promise rejects. Promise.resolve(...) normalises both: it
    // resolves to a sync teardown fn unchanged, awaits a promise to its
    // resolved teardown, and lets a rejecting async register reject HERE —
    // caught by the surrounding catch (loadPlugin returns false, plugin
    // marked errored, enabled NOT flipped) so a broken server.js never
    // crashes the host via an unhandled rejection.
    const teardown = await Promise.resolve(register(buildHostApi(plugin)))

    if (typeof teardown === "function") {
      loaded.teardown = teardown as () => void
    }

    console.log(`[plugin:${plugin.id}] server hook loaded`)

    return true
  } catch (error) {
    // ERROR ISOLATION: never let a broken plugin escape. register() may have
    // already hot-bound live listeners onto connected sockets via hostApi.on()
    // BEFORE throwing — leaving them attached would keep a failed plugin live.
    // unloadPlugin detaches every bound listener from every socket and drops
    // the registry entry (crash-isolated; teardown is undefined here, so it is
    // a clean detach-and-delete). Log loudly, report failure.
    console.error(`[plugin:${plugin.id}] failed to load server hook:`, error)
    loaded.errored = true
    unloadPlugin(plugin.id)

    return false
  }
}

// Tear down a loaded plugin: call its teardown (crash-isolated), detach every
// registered listener from every connected socket, and drop it from the
// registry. Safe to call for an unknown / never-loaded id (no-op).
export const unloadPlugin = (id: string): void => {
  const loaded = registry.get(id)

  if (!loaded) {
    return
  }

  if (loaded.teardown) {
    try {
      loaded.teardown()
    } catch (error) {
      console.error(`[plugin:${id}] teardown threw:`, error)
    }
  }

  for (const [wire, listener] of loaded.handlers) {
    for (const socket of connectedSockets()) {
      socket.off(wire, listener)
    }
  }

  registry.delete(id)
  console.log(`[plugin:${id}] server hook unloaded`)
}

// Attach every currently-registered plugin handler onto a NEWLY connected
// socket (called from the io.on("connection") wiring in index.ts, AFTER the
// builtin socketHandlers). This is how a plugin loaded BEFORE a client connects
// gets its handlers onto that client; loadPlugin() handles the inverse
// (hot-bind onto already-connected sockets).
export const attachPluginsToSocket = (socket: RawSocket): void => {
  for (const loaded of registry.values()) {
    for (const [wire, listener] of loaded.handlers) {
      // off() first so a re-attach (e.g. attach + a hot-bind racing the same
      // freshly-connecting socket) can never double-bind the same listener.
      socket.off(wire, listener)
      socket.on(wire, listener)
    }
  }
}

// Boot: load every enabled plugin that declares a server hook. Crash-isolated
// per-plugin (loadPlugin swallows its own errors), so one broken plugin never
// blocks the others or the server boot.
export const loadEnabledPlugins = async (): Promise<void> => {
  for (const plugin of readPlugins()) {
    if (hasServerHook(plugin)) {
      await loadPlugin(plugin)
    }
  }
}

// Test/introspection helper: is a plugin currently loaded (server hook ran)?
export const isPluginLoaded = (id: string): boolean => registry.has(id)

// v2 LIFECYCLE DISPATCH: emit a lifecycle hook to all loaded plugins. Fire-and-
// forget; each plugin is crash-isolated so a throwing plugin never breaks the
// game round. Plugins that don't have a listener registered on the lifecycle
// event are silently skipped. This is called from round-manager at strategic
// game state transitions (onQuestionShown, onResult, onLeaderboard, onGameEnd).
export const emitLifecycle = (
  hook: PluginLifecycleHook,
  payload: { gameId: string; status: string; data: unknown },
): void => {
  if (!ioRef) {
    return
  }

  for (const loaded of registry.values()) {
    try {
      ioRef.emit(wireEvent(loaded.id, `lifecycle:${hook}`), payload)
    } catch (error) {
      console.error(
        `[plugin:${loaded.id}] lifecycle hook "${hook}" failed:`,
        error,
      )
    }
  }
}
