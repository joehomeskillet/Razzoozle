// Integration test for the plugin SERVER RUNTIME (services/plugin-runtime.ts):
// install a fixture plugin whose server.js registers a namespaced socket-event
// handler via the host API, load it, simulate the namespaced wire event and
// assert the handler ran (incl. an ack `respond`), then unload it and assert
// the listener is detached (teardown). Also assert a server.js that THROWS on
// register is caught — no throw escapes, the server keeps running.
//
// Mirrors plugin-install.test.ts / skeleton.test.ts: a fresh temp config dir per
// test driven through process.env.CONFIG_PATH + vi.resetModules() so config.ts
// re-reads it and the test never pollutes the real config directory.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import JSZip from "jszip"
import fs from "fs"
import os from "os"
import path from "path"

type ConfigModule = typeof import("@razzoozle/socket/services/config")
type RuntimeModule = typeof import("@razzoozle/socket/services/plugin-runtime")

const loadModules = async (): Promise<{
  config: ConfigModule
  runtime: RuntimeModule
}> => {
  vi.resetModules()

  const config = await import("@razzoozle/socket/services/config")
  const runtime = await import("@razzoozle/socket/services/plugin-runtime")

  return { config, runtime }
}

// A minimal fake socket: records on()/off() so the test can drive a listener and
// assert detachment. trigger() invokes the stored listener for a wire event.
interface FakeSocket {
  id: string
  // event → ordered list of bound listeners, mirroring socket.io's multi-
  // listener model with real reference identity (off removes only the match).
  listeners: Map<string, Array<(...args: unknown[]) => void>>
  on: (event: string, fn: (...args: unknown[]) => void) => void
  off: (event: string, fn: (...args: unknown[]) => void) => void
  trigger: (event: string, ...args: unknown[]) => void
}

const makeSocket = (id: string): FakeSocket => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    id,
    listeners,
    on(event, fn) {
      const fns = listeners.get(event) ?? []
      fns.push(fn)
      listeners.set(event, fns)
    },
    off(event, fn) {
      // Remove only the listener with matching reference identity; drop the
      // event key entirely once no listeners remain.
      const fns = listeners.get(event)

      if (!fns) {
        return
      }

      const next = fns.filter((f) => f !== fn)

      if (next.length === 0) {
        listeners.delete(event)
      } else {
        listeners.set(event, next)
      }
    },
    trigger(event, ...args) {
      for (const fn of listeners.get(event) ?? []) {
        fn(...args)
      }
    },
  }
}

// A minimal fake socket.io Server exposing the connection map at
// io.sockets.sockets (a Map) + an emit() recorder, matching what the runtime
// touches (ioRef.sockets.sockets.values() + ioRef.emit()).
const makeIo = (sockets: Map<string, FakeSocket>) => {
  const emitted: Array<{ event: string; args: unknown[] }> = []

  return {
    io: {
      sockets: { sockets },
      emit(event: string, ...args: unknown[]) {
        emitted.push({ event, args })

        return true
      },
    },
    emitted,
  }
}

// Build a plugin install ZIP from in-memory files: plugin.json (declaring the
// SERVER_HANDLER capability + hooks.server) + a plain-ESM server.js body.
const buildPluginZip = async (
  id: string,
  capabilities: string[],
  serverJs: string,
): Promise<Buffer> => {
  const zip = new JSZip()

  zip.file(
    "plugin.json",
    JSON.stringify({
      formatVersion: 1,
      id,
      version: "1.0.0",
      name: `Fixture ${id}`,
      capabilities,
      tab: { nameKey: id, icon: "Puzzle", gated: "always" },
      hooks: { client: "ui.js", server: "server.js" },
      config: {},
      sandbox: "none",
    }),
  )
  zip.file("ui.js", "export function registerTab() {}\n")
  zip.file("server.js", serverJs)

  return (await zip.generateAsync({ type: "nodebuffer" })) as Buffer
}

// A well-behaved fixture: registers a "ping" handler that records the payload
// into config (so the test can observe it ran) + answers an ack, and returns a
// teardown that flips a module-level flag we can read back via persistConfig.
const GOOD_SERVER_JS = `
export function register(hostApi) {
  hostApi.on("ping", (payload, respond) => {
    hostApi.persistConfig({ lastPing: payload })
    if (respond) respond({ pong: true })
  })

  return () => {
    hostApi.log("teardown ran")
  }
}
`

// A fixture whose register() throws synchronously on load.
const THROWING_SERVER_JS = `
export function register() {
  throw new Error("boom on register")
}
`

// A fixture whose register() is async and REJECTS: its returned promise must be
// awaited + caught by loadPlugin so no unhandled rejection can crash the host.
const ASYNC_REJECT_SERVER_JS = `
export async function register() {
  throw new Error("boom in async register")
}
`

let tmpDir: string
let prevConfigPath: string | undefined

beforeEach(() => {
  prevConfigPath = process.env.CONFIG_PATH
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rahoot-plugin-rt-test-"))
  process.env.CONFIG_PATH = tmpDir
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (prevConfigPath === undefined) {
    delete process.env.CONFIG_PATH
  } else {
    process.env.CONFIG_PATH = prevConfigPath
  }
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("plugin server runtime", () => {
  it("loads a server hook, runs a namespaced handler, then unloads it", async () => {
    const { config, runtime } = await loadModules()

    const record = await config.importPluginZip(
      await buildPluginZip("rt-plugin", ["SERVER_HANDLER"], GOOD_SERVER_JS),
    )

    const socket = makeSocket("s1")
    const sockets = new Map([[socket.id, socket]])
    const { io, emitted } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    const ok = await runtime.loadPlugin(record)
    expect(ok).toBe(true)
    expect(runtime.isPluginLoaded("rt-plugin")).toBe(true)

    // The handler hot-bound onto the already-connected socket under the
    // NAMESPACED wire event.
    const wire = "plugin:rt-plugin:ping"
    expect(socket.listeners.has(wire)).toBe(true)

    // Drive the namespaced event + an ack callback.
    let ackResult: unknown
    socket.trigger(wire, { from: "client" }, (r: unknown) => {
      ackResult = r
    })

    // The handler ran: it answered the ack…
    expect(ackResult).toEqual({ pong: true })
    // …and persisted its config (observable through the index).
    const after = config.readPlugins().find((p) => p.id === "rt-plugin")
    expect(after?.config?.lastPing).toEqual({ from: "client" })
    // persistConfig broadcast the fresh InstalledPlugin[] on PLUGIN_CONFIG.
    expect(emitted.some((e) => e.event === "manager:pluginConfig")).toBe(true)

    // Unload: teardown runs + the listener is detached from the socket.
    runtime.unloadPlugin("rt-plugin")
    expect(runtime.isPluginLoaded("rt-plugin")).toBe(false)
    expect(socket.listeners.has(wire)).toBe(false)

    // After unload the wire event is a no-op (listener gone).
    ackResult = undefined
    socket.trigger(wire, { from: "client2" }, (r: unknown) => {
      ackResult = r
    })
    expect(ackResult).toBeUndefined()
  })

  it("attaches handlers to a socket that connects AFTER load", async () => {
    const { config, runtime } = await loadModules()

    const record = await config.importPluginZip(
      await buildPluginZip("rt-late", ["SERVER_HANDLER"], GOOD_SERVER_JS),
    )

    const sockets = new Map<string, FakeSocket>()
    const { io } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    await runtime.loadPlugin(record)

    // A socket that connects after the plugin loaded gets handlers via
    // attachPluginsToSocket (the index.ts connection wiring).
    const late = makeSocket("late")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.attachPluginsToSocket(late as any)
    expect(late.listeners.has("plugin:rt-late:ping")).toBe(true)
  })

  it("isolates a throwing server hook — no throw escapes, not loaded", async () => {
    const { config, runtime } = await loadModules()

    const record = await config.importPluginZip(
      await buildPluginZip("rt-bad", ["SERVER_HANDLER"], THROWING_SERVER_JS),
    )

    const sockets = new Map<string, FakeSocket>()
    const { io } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    // loadPlugin must NOT throw (error isolation) and must report failure.
    const ok = await runtime.loadPlugin(record)
    expect(ok).toBe(false)
    // The plugin stays installed/enabled in the index (enabled is NOT flipped).
    expect(config.readPlugins().find((p) => p.id === "rt-bad")?.enabled).toBe(
      true,
    )
    // Unloading the errored plugin is a clean no-op.
    expect(() => runtime.unloadPlugin("rt-bad")).not.toThrow()
  })

  it("skips a plugin without the SERVER_HANDLER capability (UI-only)", async () => {
    const { config, runtime } = await loadModules()

    // Declares hooks.server but NOT the server capability → must be skipped.
    const record = await config.importPluginZip(
      await buildPluginZip("rt-ui", ["MANAGER_TAB"], GOOD_SERVER_JS),
    )

    const sockets = new Map<string, FakeSocket>()
    const { io } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    const ok = await runtime.loadPlugin(record)
    expect(ok).toBe(false)
    expect(runtime.isPluginLoaded("rt-ui")).toBe(false)
  })

  it("binds a handler idempotently — re-register fires the handler once", async () => {
    const { config, runtime } = await loadModules()

    // server.js registers the SAME "ping" event twice; the second on() must
    // replace (not stack) the listener so a wire event fires the handler once.
    const REREGISTER_SERVER_JS = `
export function register(hostApi) {
  let calls = 0
  const handler = (payload, respond) => {
    calls += 1
    if (respond) respond({ calls })
  }
  hostApi.on("ping", handler)
  hostApi.on("ping", handler)
}
`

    const record = await config.importPluginZip(
      await buildPluginZip("rt-idem", ["SERVER_HANDLER"], REREGISTER_SERVER_JS),
    )

    const socket = makeSocket("s1")
    const sockets = new Map([[socket.id, socket]])
    const { io } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    const ok = await runtime.loadPlugin(record)
    expect(ok).toBe(true)

    // Exactly one listener is bound for the wire event despite two on() calls.
    const wire = "plugin:rt-idem:ping"
    expect(socket.listeners.get(wire)?.length).toBe(1)

    // Driving the event invokes the handler a single time (ack reports calls=1).
    let ackResult: { calls: number } | undefined
    socket.trigger(wire, { from: "client" }, (r: unknown) => {
      ackResult = r as { calls: number }
    })
    expect(ackResult?.calls).toBe(1)
  })

  it("isolates an async register that REJECTS — no unhandled rejection escapes", async () => {
    const { config, runtime } = await loadModules()

    const record = await config.importPluginZip(
      await buildPluginZip(
        "rt-async-bad",
        ["SERVER_HANDLER"],
        ASYNC_REJECT_SERVER_JS,
      ),
    )

    const sockets = new Map<string, FakeSocket>()
    const { io } = makeIo(sockets)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    runtime.setPluginIo(io as any)

    // A rejecting async register() would, if not awaited, surface as an
    // unhandled rejection (no global handler exists → process exit). Capture
    // any that escape during this load to assert crash-isolation.
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on("unhandledRejection", onUnhandled)

    try {
      // loadPlugin must catch the rejection: report failure, not crash.
      const ok = await runtime.loadPlugin(record)
      expect(ok).toBe(false)
      // The async-rejecting plugin bound no handlers (register never returned a
      // teardown and never reached an on() call) — mirroring the sync-throw
      // path, it is enabled-but-inert, not a live loaded hook.
      expect(
        config.readPlugins().find((p) => p.id === "rt-async-bad")?.enabled,
      ).toBe(true)
      expect(() => runtime.unloadPlugin("rt-async-bad")).not.toThrow()

      // Let any escaped microtask rejection settle before asserting none did.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(unhandled).toHaveLength(0)
    } finally {
      process.off("unhandledRejection", onUnhandled)
    }
  })
})
