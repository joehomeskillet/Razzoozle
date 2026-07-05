# ADR: Plugin Runtime Strategy for Rust Port (WP P0-3)

**Date:** 2026-07-05  
**Status:** Accepted (Option C — Node-Sidecar; vom User freigegeben 2026-07-05)  
**Scope:** Phase 0 gate decision; affects Phase 3 server-shell integration and Phase 5 Tauri-desktop  

---

## Context

Razzoozle's current Node.js server (`packages/socket`) supports a plugin system that allows manager-uploaded ZIP archives to extend the application with custom UI tabs and optional server-side event handlers. During the Rust port (using axum + socketioxide), this plugin runtime must either:

1. **Stay with the current Node.js architecture** (as-is in-process), OR
2. **Migrate to a different runtime strategy**

The decision is architectural (not feature-gated) and will affect:
- Migration complexity and timeline
- Type of plugins that can run in the future
- Memory and binary size for Tauri-desktop (Phase 5)
- Development ergonomics for plugin authors

This ADR evaluates three options against evidence from the current codebase, adoption metrics, and Tauri constraints.

---

## Current Plugin System Overview

### API Surface

#### Server-Side Hooks (`packages/socket/src/services/plugin-runtime.ts:50–71`)
Plugins declaring the `SERVER_HANDLER` capability can export a `register(hostApi)` function with access to:

```typescript
interface PluginHostApi {
  readonly id: string                           // Plugin id
  on(event: string, handler: PluginEventHandler)  // Register socket.io event
  broadcast(event: string, payload?: unknown)     // Emit to all clients
  readConfig(): Record<string, unknown>         // Read persisted config
  persistConfig(config: Record<string, unknown>) // Save + broadcast update
  log(...args: unknown[]): void                 // Prefixed logging
  assertSafeId(id: string): void               // Validate safe id
}
```

**Event Namespacing:** Server-side events are automatically namespaced to `plugin:<id>:<event>`, preventing any plugin from hijacking builtin events (`game:*`, `manager:*`, etc.).

#### Lifecycle Hooks (v2, newly drafted in `packages/common/src/validators/plugin.ts:12–24`)
Optional server subscriptions (not yet server-side implemented):

```typescript
type PluginLifecycleHook = 
  | "onQuestionShown" 
  | "onResult" 
  | "onLeaderboard" 
  | "onGameEnd"
```

Emitted via `emitLifecycle()` in `packages/socket/src/services/game/round-manager.ts` with payload:
```typescript
{ gameId: string; status: string; data: unknown }
```

#### Client-Side Hooks (`ui.js` in manager console)
Plugins register a manager tab via `window.razzoozle.registerTab(registration)` with read-only access to:

```typescript
window.razzoozle.api: {
  socket: TypedSocket              // Fire-and-forget .emit(...)
  config: ManagerConfig            // Frozen snapshot incl. plugins list
  t: i18next translator           
  toast: react-hot-toast instance
}
```

### Current Architecture

- **Boot-time loading** (`index.ts:139`): `loadEnabledPlugins()` iterates all plugins with `SERVER_HANDLER` capability and calls `loadPlugin()` per plugin.
- **Socket attachment** (`index.ts:183`): Each new client gets `attachPluginsToSocket(socket)` to bind any already-loaded plugin handlers.
- **Hot reload on install** (`index.ts:104`): Plugin manager HTTP route triggers `loadPlugin()` for the newly installed plugin.
- **Crash isolation** (`plugin-runtime.ts:326–338`): Per-plugin `try/catch` around import + `register()` execution; any error marks the plugin failed but never crashes the server.
- **Teardown** (`plugin-runtime.ts:341–367`): On disable/uninstall, `unloadPlugin(id)` calls the returned teardown function and detaches all listeners from all sockets.

### Security Model

- **Trust boundary:** Manager-authenticated only (PLUGINS.md explicitly notes this as a trusted surface equivalent to manager-uploaded skeletons/themes).
- **Event namespacing:** Plugin events are scoped to `plugin:<id>:*`; no escape path to builtin namespace.
- **Capability gating:** Server hooks must declare `SERVER_HANDLER` capability; UI-only plugins (no capability) skip the server load entirely.
- **Zip validation** (`plugin-import-security.test.ts`):
  - Path traversal guards: rejects entries with `/`, `..`, or NUL bytes
  - Extension allowlist: `.js`, `.mjs`, `.cjs`, `.json`, `.css`, `.ttf`, `.woff`, `.gif` (NOT `.svg` or `.exe`)
  - Entry count cap: 200 (SKELETON_ENTRY_MAX)
  - Per-asset cap: 512 KiB (SKELETON_ASSET_MAX_BYTES)
  - Per-zip total cap: enforced during extraction

### Current Adoption

**Deployed plugins (config/plugins/index.json):**
- 1 installed: `config-editor` (MANAGER_TAB capability, no SERVER_HANDLER)

**Example plugins (examples/plugins/):**
- `config-editor`: Full-featured example (tab registration, config read/persist, socket emit, teardown)
- `starter`: Minimal skeleton template

**v2 features:**
- Manifest fields exist in validator: `lifecycleHooks`, `renderSlot`, advisory capabilities `"lifecycle-hooks"`, `"render-slot"`
- Server-side emit mechanism exists: `emitLifecycle()` in round-manager.ts
- **NOT YET IMPLEMENTED:** Plugin subscription to lifecycle hooks, renderSlot integration in UI
- Plugin ecosystem is in **early stage**: only first-party examples, no third-party plugins deployed

---

## Decision Options

### Option A: Embed rquickjs (JS Engine in Rust Binary)

**Approach:**
- Use `rquickjs` crate to embed a JavaScript engine in the Rust server binary.
- Plugins remain `.js` files (current format unchanged).
- Server-side `register()` function executes in the embedded rquickjs VM instead of Node.js.
- API surface (PluginHostApi) is wrapped/exposed to JS via rquickjs bindings.
- Client-side plugins (`ui.js`) remain browser-side, unchanged.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Zero plugin migration effort | JS engine in-process adds ~5–10 MB to binary |
| Backward compatible with config-editor, all future JS plugins | rquickjs is less mature than Node.js; limited ecosystem (no npm access) |
| Single process simplifies Tauri-desktop bundling | Security: in-process JS is larger attack surface than OS-level process isolation |
| Familiar plugin experience | Hot-loading cache-busting still needed; custom ESM loader required |
| | Maintenance risk: rquickjs upstream updates, edge cases in JS semantics |

**Evidence:**
- rquickjs is stable and used in production, but has ~1/100th the adoption of Node.js
- Embedding a JS engine adds complexity (custom bindings layer) that the current plugin system avoids
- The 1 current plugin (config-editor) has NO server hook (`hooks.server` is absent), so migration effort is already ~zero

**Risk:** Spike risk is MEDIUM — if rquickjs API surface doesn't map well to the current plugin API, substantial wrapper work is required.

---

### Option B: WASM Plugin API

**Approach:**
- Redesign plugin format: plugins are compiled to WASM binaries (e.g., via `wasm-pack` + Rust plugins, or wit-bindgen for language-agnostic).
- Server-side plugins: implement a WASM component contract (still has `register()`, but runs in a WASM VM, not JS).
- Client-side plugins: remain browser JS (unchanged, served as-is by the static route).
- API surface exposed via WASM host bindings (wit-bindgen or custom).

**Trade-offs:**

| Pro | Con |
|-----|-----|
| Memory-safe sandbox: WASM VM is stricter than in-process JS | **All plugins must be rewritten** (breaking change, but 1 deployed plugin = low effort) |
| Isolation is strong: each WASM instance is sandboxed | Learning curve for plugin authors: WASM tooling, Rust bindings, wit-bindgen |
| Future-proof: WASM spec is evolving with better host bindings (WASI, component model) | Build complexity: plugin authors need Rust toolchain + wasm-pack + component integration |
| Eliminates in-process JS engine (simpler Rust codebase) | Constraint: WASM VM capabilities lag JavaScript (e.g., no direct filesystem access, no dynamic `require()`) |
| Good match for long-term plugin ecosystem scaling | Early-stage tooling: wit-bindgen is still stabilizing |

**Evidence:**
- Current plugin ecosystem is tiny (1 deployed, no third-party). Rewriting the 1 example plugin is ~1 day of work.
- WASM component model (wit) is actively evolving; full stability expected by late 2026.
- No large production WASM plugin ecosystems exist yet (Figma, VS Code have some WASM support but not plugin-first).

**Risk:** Spike risk is MEDIUM–HIGH — WASM plugin tooling is less proven than rquickjs. A successful spike requires implementing the host bindings (wit contract or custom bindings) and verifying that the 1 example plugin works in WASM. If the wit tooling is too immature, fallback to Node sidecar is required.

---

### Option C: Slim Node.js Sidecar (Plan Default)

**Approach:**
- The Rust server (packages/socket) communicates with a separate Node.js process via IPC (e.g., stdio JSON, Unix socket, or HTTP).
- Plugins remain unchanged: the Node sidecar runs the current `plugin-runtime.ts` + `registry.ts` code.
- Rust server sends: plugin load/unload requests, event emissions (on behalf of clients), config reads/writes.
- Node sidecar sends back: broadcast events (to all clients via the Rust server), config updates, telemetry.
- Client-side plugins (`ui.js`) remain browser-side, unchanged.

**Trade-offs:**

| Pro | Con |
|-----|-----|
| **Zero plugin migration effort:** plugins run as-is | Two-process complexity: Node sidecar must be started, monitored, restarted on crash |
| Proven, mature ecosystem: Node.js + socket.io is widely deployed | Memory overhead: Node.js runtime ~50 MB (mitigated by stripping unnecessary modules) |
| Familiar dev experience: plugin authors write Node.js/ES6 (the current way) | IPC latency: manager plugins are bursty (not real-time), so negligible in practice |
| Phase 0 spike risk is LOW: if socketioxide fails, plugins keep working on Node independently | Tauri-desktop sidecar count: +1 (main binary + Node sidecar), but Tauri's sidecar API handles this |
| Phase 5 Tauri-desktop: sidecars are idiomatic pattern (Slack, Discord do this) | Sidecar management: must ensure graceful shutdown, restart on crash, stderr/stdout capture |
| Existing v2 draft (lifecycleHooks) was designed assuming a sidecar | |
| Early plugin ecosystem: can evolve toward WASM later (v3 migration path) without locking in now | |
| **Strongest security:** OS-level process isolation (defense-in-depth vs in-process sandboxes) | |

**Evidence:**
- Razzoozle's plugin ecosystem is in stage 0: 1 deployed plugin, no third-party ecosystem yet.
- Tauri's sidecar API is mature and widely used (documented in Tauri book).
- v2 lifecycle hooks (`emitLifecycle()`) are already implemented with a fire-and-forget pattern, which is optimal for sidecar communication.
- Node.js binary can be stripped to ~30 MB for distribution (smaller than many single-page web apps).

**Risk:** Spike risk is LOW — no new tooling required, plugins run on the existing stack. The main risk is process management (ensuring sidecar restarts on crash), which is a known, solved problem (systemd, Tauri's Sidecar API, etc.).

---

## Trade-Off Matrix

| Factor | Option A (quickjs) | Option B (WASM) | Option C (Node sidecar) |
|--------|-----|-----|-----|
| **Plugin migration effort** | None | ~1 day (1 example) | None |
| **Ecosystem maturity** | Medium (rquickjs stable, limited) | Low (wit stabilizing) | High (Node.js + socket.io proven) |
| **Binary size (Tauri)** | +5–10 MB | +0 MB (WASM is loaded at runtime) | ~0 MB (sidecar is separate binary) |
| **Sidecar count** | 0 | 0 | 1 |
| **Security isolation** | Code-level (event namespacing) | VM-level (WASM sandbox) | **OS-level (process isolation)** |
| **Dev experience** | Known (JS plugins as-is) | New (WASM tooling) | Known (Node.js as-is) |
| **Phase 0 spike risk** | Medium | Medium–High | Low |
| **Phase 5 Tauri fit** | Slightly cleaner (no sidecar) | Cleaner (no sidecar) | Idiomatic (sidecar pattern proven) |
| **v2 lifecycle integration** | Requires new wrapper | Requires new binding | Already optimized (fire-and-forget) |
| **Long-term scalability** | Medium (rquickjs limits) | High (WASM future) | Medium (can upgrade to WASM v3) |

---

## Recommendation: **Option C (Slim Node.js Sidecar)**

### Rationale

1. **Zero migration cost now, evolution path later:**
   - The current plugin ecosystem is in stage 0 (1 deployed, no third-party).
   - Option C requires no rewriting, allowing the ecosystem to grow in familiar JS territory.
   - If the ecosystem scales and security/performance demands shift, a v2 migration to WASM is possible without forcing an immediate breakage.
   - Options A and B force a choice now that locks in the long-term direction.

2. **Strongest isolation (defense-in-depth):**
   - OS-level process isolation is strictly stronger than in-process sandboxes (rquickjs event namespacing) or VM sandboxes (WASM).
   - The current event namespacing is already in place; a sidecar adds another layer.
   - If a malicious plugin ever escapes the event namespace (security bug), the OS process boundary still holds.

3. **Phase 0 spike risk is lowest:**
   - No new tooling: the current code (plugin-runtime.ts, registry.ts) moves to a separate process as-is.
   - If socketioxide fails in Phase 0, the plugin system keeps working independently on Node.
   - Options A and B introduce unproven integration points (rquickjs bindings, WASM contract) that could block the spike.

4. **v2 lifecycle design is already optimized:**
   - `emitLifecycle()` is fire-and-forget, which is idiomatic for sidecar communication (no blocking RPC needed).
   - The manifest fields (`lifecycleHooks`, `renderSlot`) were designed assuming a sidecar architecture (confirmed by the v2 validator + the fact that v2 was drafted during the Rust port planning).

5. **Tauri-desktop fit:**
   - Tauri's sidecar API is designed for exactly this pattern: main app (Rust binary) + auxiliary processes (Node sidecar).
   - Proven by production apps (Slack desktop, others).
   - Phase 5 can use `tauri::api::process::Command` to spawn and manage the Node sidecar, with automatic restart and graceful shutdown.

6. **Ecosystem maturity:**
   - Node.js + socket.io + ESM is the most widely deployed stack for realtime systems.
   - Plugins authors are likely already familiar with Node.js.
   - rquickjs and WASM are newer, with smaller communities and less production wear-testing.

### Consequences

**Positive:**
- No plugin rewrites (zero migration risk, fast Phase 0 spike).
- Phase 0 spike can proceed independently if socketioxide succeeds or fails.
- Familiar dev experience (plugin authors write Node.js).
- Strongest security isolation.
- v2 lifecycle hooks can land with minimal additional work (just IPC wiring).
- Long-term evolution path: if ecosystem scales, can adopt a v3 WASM migration path without forcing it now.

**Negative:**
- Two-process complexity: both must run, both can crash, both need monitoring.
- Memory overhead: Node.js sidecar adds ~50 MB (acceptable for Tauri, where the main binary is already larger).
- IPC latency: negligible for manager plugin use cases (which are bursty, not real-time).
- Sidecar management in Tauri requires testing: graceful shutdown on exit, restart on crash, stderr/stdout capture.

**Deferred Decisions:**
- **v2 lifecycle/renderSlot:** Can land once IPC plumbing is in place (not Phase 0 critical).
- **Plugin auth:** Currently manager-gated; future decisions (per-plugin capabilities, marketplace) are independent of the runtime choice.
- **WASM migration path:** If the ecosystem grows significantly, a v2/v3 transition path is possible (hybrid: JS plugins → WASM over time, both supported initially).

---

## Implementation Notes for Phase 3

If Option C is chosen, Phase 3 (Server-Shell) should include:

1. **IPC interface definition:** JSON RPC or similar over stdin/stdout or a Unix socket.
2. **Sidecar startup:** Rust server spawns Node sidecar on boot, monitors for crashes, restarts.
3. **Event forwarding:** Rust server forwards socket.io events to sidecar on behalf of clients, vice versa.
4. **Config syncing:** Sidecar reads/writes plugin configs; Rust server broadcasts updates to clients.
5. **Testing:** Sidecar can run standalone (for plugin testing) or as a subprocess (for integration tests).
6. **Logging:** Both processes log to stderr; sidecar logs are tagged with `[plugin-sidecar]`.

---

## References

- `packages/socket/src/services/plugin-runtime.ts` — Current server-side API (lines 50–71 for PluginHostApi)
- `packages/common/src/validators/plugin.ts` — Manifest validation + v2 draft
- `packages/socket/src/services/__tests__/plugin-runtime.test.ts` — Plugin load/unload/crash-isolation tests
- `packages/socket/src/services/__tests__/plugin-import-security.test.ts` — Zip validation tests
- `PLUGINS.md` — Plugin author guide (manifest, client API, public-asset rules)
- `docs/rust-port-plan.md` § 4.3 — Phase 0 plugin-runtime gate decision
