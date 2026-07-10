# Design: Plugin-JS-Runtime auf dem Rust-Backend

> Erstellt 2026-07-10 im P4-Design-Spike. Zwei unabhängige Designs + Cross-Vendor-Judgment.
> Provenienz: Design A = GPT-5.6 via `codex exec --sandbox read-only` · Design B = Grok-4.5 via `grok -p -m grok-4.5` · Judge = Gemini via `agy -p` (Judge-Regel 2026-07-05: Judge ≠ Worker-Vendor). Brief: scratchpad/p4-design-brief.md.
> **Status: proposed — Implementation erst nach User-Go (P5e).**

---

## TEIL 1 — JUDGMENT (Gemini, autoritative Synthese)

# Architecture Judgment: Rust Backend Plugin-JS-Runtime

## 1. CONSENSUS
Both designs correctly converge on several fundamental facts regarding the current state of the Razzoozle plugin architecture:
- **Two Distinct APIs:** There is a clear distinction between the server-side (`PluginHostApi` used by `server.js`) and client-side (`window.razzoozle.api` used by `ui.js`) capabilities. UI-only plugins (like `config-editor`) already function correctly on the Rust backend since they do not execute server hooks.
- **YAGNI (You Aren't Gonna Need It) on Full JS Execution:** The current production and example plugins are exclusively UI-based. There are zero plugins actively using `SERVER_HANDLER` that require backend JavaScript execution.
- **Embedding an Engine is the Wrong Move:** Embedding QuickJS, V8, or Boa directly into the Rust backend is universally rejected. It breaks Node ESM (`import()`) compatibility, introduces massive build complexity to the slim Rust binary, and solves a problem that currently has no consumers.
- **WASM is a Breaking Change:** Shifting to a WASM ABI is recognized as a theoretical future enhancement (v2 sandbox) but breaks backward compatibility with existing ZIP formats and `server.js` plugins.
- **Twin Parity is Broken:** The current architecture splits the broadcast domain. A Node-side broadcast via `io.emit` will not reach clients connected to the Rust backend (via `/_rust/`).
- **Lifecycle is S2C:** Both identify that `emitLifecycle` does not invoke a server-side Javascript handler directly; it acts as a server-to-client (S2C) broadcast (`io.emit("plugin:<id>:lifecycle:<hook>")`).

## 2. CONTRADICTIONS & VERDICT
- **Contradiction 1: Immediate Architecture Action**
  - *Design A* insists that a dedicated Node sidecar must be built *immediately* (Phase 1/2) as the single recommendation.
  - *Design B* advocates for an "Honest Status Quo" (Option 4) to fix parity and docs now, while *deferring* the Node sidecar (Option 2) until a real `SERVER_HANDLER` plugin exists.
  - **Verdict:** **Design B is correct.** Building a complex IPC bridge (sidecar) to support exactly zero currently existing server plugins is a textbook violation of Agile and YAGNI principles. Phase 1 must focus on fixing state coherence and being honest about the lack of server-hook support on Rust.
- **Contradiction 2: Lifecycle Hook Filtering**
  - *Design A* claims `emitLifecycle` ignores the manifest's `lifecycleHooks` list.
  - *Design B* merely states it broadcasts to every loaded plugin in the registry.
  - **Verdict:** **Design A is correct.** Code review of `packages/socket/src/services/plugin-runtime.ts:437-440` shows an unconditional loop over `registry.values()` that emits to all loaded plugins without filtering against `manifest.lifecycleHooks`.

## 3. BLIND SPOTS
- **Rust `socketioxide` Limitations (Both missed depth):** While Design B briefly mentions "socketioxide dynamic event names / ack parity" in its uncertainty register, neither design fully analyzes that routing arbitrary dynamic `plugin:<id>:<event>` namespaces and handling Socket.IO ACKs over IPC back to a specific Rust client is notoriously difficult with the current Rust `socketioxide` crate's typed handler model. 
- **Missing `assets/**` File Mirroring (Design B missed this):** Design A correctly spotted a critical data-loss defect: Rust's Postgres file-map builder (`rust/server/src/socket/manager/plugins.rs:329-345`) only walks one directory level (`std::fs::read_dir`). It completely drops nested `assets/**` files during DB mirroring. Design B failed to catch this defect in its parity assessment.

## 4. CITATION AUDIT
- **`packages/socket/src/services/plugin-runtime.ts:424-445` (Design A & B):** Accurately cited. This confirms `emitLifecycle` is a S2C broadcast via `ioRef.emit`.
- **`rust/server/src/socket/manager/plugins.rs:15-19` (Design A & B):** Accurately cited. The documentation explicitly states "HONEST DEFER" and that Rust cannot run plugin JS.
- **`rust/server/src/socket/manager/plugins.rs:329-345` (Design A):** Accurately cited. The code explicitly does `if path.is_file() && !path.is_symlink()` on a single `read_dir`, proving the lack of recursive directory walking for nested assets.
- **`packages/socket/src/services/plugin-runtime.ts:5-7` (Design B):** Accurately cited. Proves the V1 trust model gives host privileges and that `sandbox: "iframe"` is reserved for future use.

## 5. FINAL RECOMMENDATION
**Adopt Design B's Phased Approach (Honest Status Quo -> Deferred Sidecar), but mandate Design A's bug fixes in Phase 0.**

**What to build NOW (Phase 0/1 - Honest Status Quo):**
1. **Fix the recursive file-map bug in Rust:** `plugins.rs` must be updated to recursively walk `assets/**` when mirroring plugins to Postgres.
2. **Correct the Docs:** Update `PLUGINS.md` to truthfully state that Node *does* execute `server.js` for `SERVER_HANDLER` plugins, while Rust explicitly defers this.
3. **Manager UX Warning:** If an installed plugin demands `SERVER_HANDLER`, the manager UI should surface a non-blocking warning if the client is connected to the Rust backend.
4. **Implement Rust S2C Lifecycle Emits:** Implement the pure Rust `plugin:<id>:lifecycle:<hook>` S2C emits for game transitions, requiring zero JS runtime.

**What to build LATER (Phase 2 - Node Sidecar):**
When (and only when) a product requirement introduces a `SERVER_HANDLER` plugin that *must* run on Rust clients, implement the **Node Sidecar via IPC** (Option 2). Rust will act purely as an event broker, forwarding C2S payloads over Unix domain sockets to a constrained Node worker, and proxying the resulting S2C broadcasts back to Rust-connected clients.

**What NOT to build:**
- **DO NOT** embed QuickJS, V8, or Boa into the Rust game server.
- **DO NOT** create a WASM ABI for plugins at this time.
- **DO NOT** build the Node sidecar IPC bridge during this phase.

## 6. RISK REGISTER (For the Deferred Sidecar approach)
1. **Risk:** **`socketioxide` dynamic routing/ACK limitations.** 
   - *Mitigation:* Before building the sidecar, conduct a technical spike to prove `socketioxide` can dynamically register wildcard event listeners (`plugin:*`) and serialize/deserialize Socket.IO ACKs over IPC.
2. **Risk:** **Split-brain broadcast domain.** A sidecar broadcast event generated by a Node client might not reach a Rust client, or vice-versa, if IPC fan-out isn't bidirectional.
   - *Mitigation:* The IPC protocol must mandate that the sidecar *never* emits directly via `ioRef`. It must return a `Broadcast` action to the active backend (Rust or Node) to handle the network fan-out.
3. **Risk:** **Sidecar crashing takes down plugin functionality for Rust clients.**
   - *Mitigation:* Design the IPC bridge with strict timeouts, backpressure limits, and run the sidecar under a supervisor that restarts it independently of the Rust game loop. Rust must fail gracefully (e.g., manager errors) without dropping the WebSocket connection.
4. **Risk:** **Undocumented Node ambient APIs used by future plugins.** Since the sidecar runs real Node ESM, authors might start using `fs` or `http` which break when isolation is eventually introduced.
   - *Mitigation:* Document the `PluginHostApi` as the *only* stable server contract. Wrap the sidecar execution in a container with a read-only filesystem and no external network egress from day one.
5. **Risk:** **Race conditions between Postgres hydration and IPC startup.** If Rust hydrates an updated plugin from the DB but the sidecar is still running an old generation of the ESM module in memory.
   - *Mitigation:* The IPC protocol must include generation IDs/versions (`load(pluginId, version)`). Rust must explicitly command the sidecar to unload the old module and dynamically import the new one, blocking client events until the sidecar confirms successful reload.
I have completed the judgment and output the full markdown evaluation for the Rust Backend Plugin-JS-Runtime architecture, and executed the verbal announcement via `echo_speak`. My recommendation strictly follows Agile principles by advising against immediately building heavy components (embedded JS engine, WASM, or the Node IPC sidecar) until there is a tangible plugin utilizing the `SERVER_HANDLER` that requires it, whilst identifying a crucial missing piece in data consistency regarding directory recursion during Postgres mirroring that must be addressed in the short term. Let me know if you need any additional code deep-dives or adjustments to the decision matrix!

---

## TEIL 2 — Design A (GPT-5.6 / codex)

# Design: Plugin-JS-Runtime Support for Razzoozle’s Rust Backend

**Decision:** Keep Rust authoritative for Rust-side sockets and wire emissions. Execute unchanged `server.js` hooks in a dedicated Node sidecar over authenticated IPC. Do not embed a JavaScript engine or introduce a WASM ABI now.

Repo-derived facts below carry `file:line` citations. Effort and size figures are architecture estimates, not measured results.

## 1. Findings from code analysis

### 1.1 Two distinct plugin APIs exist

Razzoozle has a server-side `PluginHostApi` for `server.js` and a much broader browser-side API under `window.razzoozle`.

#### Server-side `PluginHostApi`

A server hook must export named `register`, a default function, or a default object containing `register`. Registration may be synchronous or asynchronous and may return a teardown function. [packages/socket/src/services/plugin-runtime.ts:218-249](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:218) [packages/socket/src/services/plugin-runtime.ts:334-346](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:334)

Complete API:

| Member | Current semantics |
|---|---|
| `id` | Read-only plugin ID. |
| `on(event, handler)` | Registers inbound `plugin:<id>:<event>` handler. |
| `broadcast(event, payload?)` | Global `io.emit("plugin:<id>:<event>")`; no room or backend targeting. |
| `readConfig()` | Reads current plugin config from installed index; defaults to `{}`. |
| `persistConfig(patch)` | Shallow-merges config and emits fresh `InstalledPlugin[]` through `manager:pluginConfig`. |
| `log(...args)` | Prefixes output with `[plugin:<id>]`. |
| `assertSafeId(id)` | Exposes host safe-ID guard. |

[packages/socket/src/services/plugin-runtime.ts:53-72](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:53) [packages/socket/src/services/plugin-runtime.ts:127-208](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:127)

Handlers receive only the first Socket.IO argument as payload and an optional final acknowledgement callback as `respond`. They receive no socket identity, role, game, room, handshake, or targeted-emission primitive. [packages/socket/src/services/plugin-runtime.ts:74-79](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:74) [packages/socket/src/services/plugin-runtime.ts:141-163](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:141)

The API hides raw Socket.IO objects, but this is not a security boundary: `server.js` executes inside the Node process with full host privileges. `sandbox: "iframe"` is validated but inert. [packages/socket/src/services/plugin-runtime.ts:3-7](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:3) [packages/common/src/validators/plugin.ts:59-64](/nvmetank1/projects/Razzoozle/source/packages/common/src/validators/plugin.ts:59)

#### Browser-side plugin host

`window.razzoozle` exposes:

- `registerTab(...)`
- `api.socket`
- `api.config`
- `api.t`
- `api.toast`
- optional `api.registerRenderSlot`

[packages/web/src/features/manager/plugins/host.ts:45-108](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:45) [packages/web/src/features/manager/plugins/host.ts:138-145](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:138)

`api.socket` is the actual shared `Socket.IO` client, not a plugin-only facade. A UI plugin can therefore invoke every manager, game, quiz, catalog, AI, theme, media, results, display, player, and plugin event allowed by server-side authorization. [packages/common/src/types/game/socket.ts:105-268](/nvmetank1/projects/Razzoozle/source/packages/common/src/types/game/socket.ts:105) [packages/common/src/types/game/socket.ts:270-492](/nvmetank1/projects/Razzoozle/source/packages/common/src/types/game/socket.ts:270)

`api.config` is only shallow-frozen; nested arrays and objects retain their original references. [packages/web/src/features/manager/plugins/host.ts:129-145](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:129)

`registerRenderSlot` stores registrations, but the rendering component currently mounts and clears a placeholder without iterating that registry. The advertised render-slot path is therefore incomplete. [packages/web/src/features/manager/plugins/host.ts:180-210](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:180) [packages/web/src/features/game/components/PluginRenderSlot.tsx:21-40](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/game/components/PluginRenderSlot.tsx:21)

### 1.2 Server-hook loading and wire behavior

A hook loads only when its plugin is enabled, declares `SERVER_HANDLER`, and has a valid regular file named by `hooks.server`. [packages/socket/src/services/plugin-runtime.ts:211-216](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:211) [packages/socket/src/services/plugin-runtime.ts:271-283](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:271) [packages/socket/src/services/config/plugins.ts:475-511](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/config/plugins.ts:475)

`on("ping")` becomes `plugin:<id>:ping`. Re-registering the same event replaces its existing listener. Listeners attach to every current and future socket without role or manager-auth filtering. Any connected client that knows the event name can invoke the handler, while the plugin cannot identify that client through its API. [packages/socket/src/services/plugin-runtime.ts:114-183](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:114) [packages/socket/src/services/plugin-runtime.ts:394-407](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:394)

`broadcast` reaches every client connected to that Node process, including unrelated games. It does not reach Rust-connected clients. [packages/socket/src/services/plugin-runtime.ts:185-191](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:185)

Load failures are isolated: import errors, missing `register`, synchronous exceptions, and rejected async registration remove already-bound listeners and leave the plugin installed but inert. Handler failures are logged without automatic error acknowledgement. [packages/socket/src/services/plugin-runtime.ts:297-363](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:297) [packages/socket/src/services/plugin-runtime.ts:145-162](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:145)

There are no registration, handler, CPU, memory, or concurrency limits. An infinite synchronous loop can block the Node event loop. Async teardown is also unsupported because teardown return values are not awaited. [packages/socket/src/services/plugin-runtime.ts:334-342](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:334) [packages/socket/src/services/plugin-runtime.ts:376-381](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:376)

### 1.3 Lifecycle surface and current defects

Defined lifecycle names are:

- `onQuestionShown`
- `onResult`
- `onLeaderboard`
- `onGameEnd`

[packages/common/src/validators/plugin.ts:12-24](/nvmetank1/projects/Razzoozle/source/packages/common/src/validators/plugin.ts:12)

Current triggers:

| Hook | Status | Current multiplicity |
|---|---|---|
| `onQuestionShown` | `SHOW_QUESTION` | Once per question. |
| `onResult` | `SHOW_RESULT` | Once per player because call sits inside player loop. |
| `onLeaderboard` | `SHOW_LEADERBOARD` | Once per leaderboard transition. |
| `onGameEnd` | `FINISHED` | Once per game completion. |

[packages/socket/src/services/game/round-manager.ts:601-620](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/game/round-manager.ts:601) [packages/socket/src/services/game/round-manager/results-broadcast.ts:144-189](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/game/round-manager/results-broadcast.ts:144) [packages/socket/src/services/game/round-manager/leaderboard-flow.ts:191-205](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/game/round-manager/leaderboard-flow.ts:191) [packages/socket/src/services/game/round-manager/leaderboard-flow.ts:232-248](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/game/round-manager/leaderboard-flow.ts:232)

Every payload currently has `{gameId, status, data: {}}`. [packages/socket/src/services/plugin-runtime.ts:429-440](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:429)

Critical mismatch: `emitLifecycle` calls server `io.emit`, making lifecycle an outbound client wire event. It does not invoke a server-side handler registered through `hostApi.on`. It also broadcasts to every loaded server plugin and ignores each manifest’s `lifecycleHooks` list. [packages/socket/src/services/plugin-runtime.ts:424-445](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:424) [packages/common/src/validators/plugin.ts:65-69](/nvmetank1/projects/Razzoozle/source/packages/common/src/validators/plugin.ts:65)

Therefore “server lifecycle hooks” do not currently exist as executable server callbacks. They are namespaced browser broadcasts tied indirectly to loaded `SERVER_HANDLER` plugins.

### 1.4 ZIP compatibility and Rust status

Rust accepts the existing manifest and ZIP shape, including `.js`, `.mjs`, `.cjs`, and `hooks.server`. Existing ZIPs are installation-compatible. [rust/server/src/socket/manager/plugins_zip.rs:33-36](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins_zip.rs:33) [rust/server/src/socket/manager/plugins_zip.rs:142-151](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins_zip.rs:142)

Rust enforces:

- 16 MiB encoded-input basis
- 200 entries
- 32 MiB total decompressed data
- 512 KiB per file
- extension allowlist
- traversal, absolute-path, NUL, and symlink filtering

[rust/server/src/socket/manager/plugins_zip.rs:21-36](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins_zip.rs:21) [rust/server/src/socket/manager/plugins_zip.rs:217-312](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins_zip.rs:217)

Rust registers only install, remove, and set-config handlers. It explicitly does not load or unload `server.js`. [rust/server/src/socket/manager/plugins.rs:15-19](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:15) [rust/server/src/socket/manager/plugins.rs:254-258](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:254) [rust/server/src/socket/manager/plugins.rs:319-324](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:319)

Rust mutation broadcasts reach only clients attached to that Rust server. Postgres mirroring runs afterward in detached tasks, so mutation success is reported before cross-process durable synchronization finishes. [rust/server/src/socket/manager/plugins.rs:239-250](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:239) [rust/server/src/socket/manager/plugins.rs:319-349](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:319)

Relevant consistency defects:

- ZIP extraction lacks rollback after directory creation and sequential file writes. [rust/server/src/socket/manager/plugins_zip.rs:287-328](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins_zip.rs:287)
- Index and revision writes are direct, non-atomic filesystem writes. [rust/server/src/socket/manager/plugins.rs:166-198](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:166)
- Concurrent mutations have no lock around read-check-write sequences. [rust/server/src/socket/manager/plugins.rs:277-317](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:277)
- Rust’s Postgres file-map builder walks one directory level; nested `assets/**` are omitted. Node’s implementation is recursive. [rust/server/src/socket/manager/plugins.rs:329-345](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:329) [packages/socket/src/services/config/plugins.ts:23-47](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/config/plugins.ts:23)
- Rust boot hydration restores files but does not rebuild `index.json`, even though manager config reads that index. [rust/server/src/db/config.rs:76-109](/nvmetank1/projects/Razzoozle/source/rust/server/src/db/config.rs:76) [rust/server/src/db/config.rs:128-230](/nvmetank1/projects/Razzoozle/source/rust/server/src/db/config.rs:128) [rust/server/src/socket/manager/config_helper.rs:19-22](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/config_helper.rs:19)
- Node launches Postgres hydration and runtime loading independently, creating a boot race despite comments describing ordered hydration. [packages/socket/src/index.ts:144-157](/nvmetank1/projects/Razzoozle/source/packages/socket/src/index.ts:144)

These defects must be repaired before adding any runtime; otherwise plugin activation depends on restart timing and which twin handled installation.

### 1.5 Deployment and routing reality

Checked-in Rust Compose runs a combined nginx/web/Node app, standalone Rust server, and shared Postgres. Only the app mounts the `config` volume; Rust has no config mount. [compose.rust.yml:15-58](/nvmetank1/projects/Razzoozle/source/compose.rust.yml:15)

nginx routes:

- `/ws` to Node
- `/_rust/*` to Rust
- `/plugins/*` always to Node

[docker/nginx.conf:48-58](/nvmetank1/projects/Razzoozle/source/docker/nginx.conf:48) [docker/nginx.conf:118-149](/nvmetank1/projects/Razzoozle/source/docker/nginx.conf:118)

Browser code opens one Socket.IO connection, choosing `/ws` or `/_rust/socket.io/`. `api.socket` points to that same connection. nginx cannot route individual `plugin:*` frames after the WebSocket upstream has been selected. [packages/web/src/features/game/contexts/socket-context.tsx:129-162](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/game/contexts/socket-context.tsx:129) [packages/web/src/features/manager/plugins/host.ts:83-94](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:83)

Rust-selected UI plugins still fetch `/plugins/<id>/ui.js` from Node. A Rust-origin install can therefore announce success while Node’s local plugin cache still lacks the asset. [packages/web/src/features/manager/plugins/host.ts:263-312](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/manager/plugins/host.ts:263) [docker/nginx.conf:118-129](/nvmetank1/projects/Razzoozle/source/docker/nginx.conf:118)

Current Rust image uses a `rust:1-bookworm` builder, installs only `mold`, builds one release binary, and copies it into `debian:bookworm-slim`. Runtime image contains no Node or JS engine. [rust/Dockerfile:6-40](/nvmetank1/projects/Razzoozle/source/rust/Dockerfile:6)

Live Docker configuration could not be inspected because this session lacks Docker-socket permission. Production topology beyond repo files and supplied brief remains unverified.

### 1.6 What installed plugins need

Checked-out installation contains one enabled plugin, `config-editor`, with only `MANAGER_TAB` and `CONFIG`. It has no `SERVER_HANDLER`. [config/plugins/index.json:1-12](/nvmetank1/projects/Razzoozle/source/config/plugins/index.json:1)

Both checked-in example manifests are UI-only. No checked-in `examples/plugins/*/server.js` exists in this checkout; server-hook examples are synthesized only in tests. [examples/plugins/config-editor/plugin.json:1-17](/nvmetank1/projects/Razzoozle/source/examples/plugins/config-editor/plugin.json:1) [examples/plugins/starter/plugin.json:1-15](/nvmetank1/projects/Razzoozle/source/examples/plugins/starter/plugin.json:1) [packages/socket/src/services/__tests__/plugin-runtime.test.ts:100-167](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/__tests__/plugin-runtime.test.ts:100)

Current verified workload therefore needs install/config/static-asset parity, not server-side JavaScript execution. Production Postgres may contain additional plugins; that inventory was not available.

Documentation also drifts from implementation: `PLUGINS.md` still says `server.js` is reserved and never executed, while Node’s install handler now loads it. [PLUGINS.md:13-16](/nvmetank1/projects/Razzoozle/source/PLUGINS.md:13) [packages/socket/src/handlers/manager/plugins.ts:51-57](/nvmetank1/projects/Razzoozle/source/packages/socket/src/handlers/manager/plugins.ts:51)

## 2. Option evaluation

Scores use 1 = poor and 5 = strong. Weeks are one experienced engineer, including tests and deployment work but excluding review queues.

| Option | Format compatibility | Security | Twin parity | Operations / size | Estimate | YAGNI |
|---|---:|---:|---:|---|---:|---|
| Embedded rquickjs/QuickJS | 3 | 2 | 4 | Smallest embedded engine; native C build added | 7–11 weeks | Poor now |
| Embedded deno_core/V8 | 4 for JS, lower for Node APIs | 2 | 4 | Largest binary/build impact; V8 artifact dominates | 9–14 weeks | Very poor |
| Embedded Boa | 2–3 | 2 | 4 | Pure Rust; exact binary delta unknown | 10–16 weeks | Very poor |
| Dedicated Node sidecar | 5 | 4 with hardening | 5 | Extra service; Rust image unchanged | 6–9 weeks | Acceptable when gated |
| WASM ABI | 1 for existing ZIPs | 5 | 5 eventually | New runtime and packaging toolchain | 12–20 weeks | Worst |
| Current Node delegation | 1 on Rust as-is | 1–2 | 0 as-is | No added service, but incoherent | 0 weeks incomplete; 4–7 to bridge | Good only as deferral |

Exact stripped-binary and image deltas require build spikes; current Cargo manifest contains none of these runtimes. [rust/server/Cargo.toml:6-29](/nvmetank1/projects/Razzoozle/source/rust/server/Cargo.toml:6)

### Option 1: Embedded JavaScript engine

#### rquickjs / QuickJS

**Compatibility:** Plain ESM using only current `PluginHostApi` can be supported. Node built-ins, package resolution, timers, fetch, `process`, CommonJS details, and undocumented ambient behavior would require compatibility shims. Existing arbitrary Node-oriented `server.js` files cannot be guaranteed unchanged.

**Sandbox:** QuickJS allows memory, stack, and interrupt limits, and `rquickjs` provides an asynchronous runtime plus Rust Future/Promise bridging. This controls resources but remains native code inside the Rust process; an engine vulnerability or host-binding error shares Rust server failure scope. [rquickjs AsyncRuntime](https://docs.rs/rquickjs/latest/rquickjs/struct.AsyncRuntime.html) [rquickjs async/module support](https://docs.rs/rquickjs/latest/rquickjs/)

**Twin parity:** Rust could emit directly through its own `SocketIo`, but a common conformance suite would still be required to keep event naming, acknowledgements, broadcast audience, config merging, failures, and lifecycle ordering identical to Node.

**Build and size:** Smallest embedded candidate. It adds QuickJS C compilation and linking to the current mold-based build. Exact release-binary and image deltas remain unknown.

**Verdict:** Technically plausible only if compatibility is narrowed to documented host API and server hooks are proven to avoid Node APIs. That evidence does not exist.

#### deno_core / V8

**Compatibility:** Strongest ECMAScript behavior among embedded choices, but `deno_core` is not Node. Node built-ins and package semantics still require implementation or explicit denial.

**Sandbox:** V8 isolate boundaries and restricted Rust ops limit exposed capabilities, but an isolate is not an OS process boundary. Rust must drive `JsRuntime::run_event_loop` on Tokio and implement every host op. [deno_core README](https://docs.rs/crate/deno_core/latest/source/README.md) [deno_core JsRuntime](https://docs.rs/deno_core/latest/deno_core/struct.JsRuntime.html)

**Build and size:** Highest complexity. V8 initialization, native artifacts, longer builds, and much larger binary/image footprint conflict with the current slim one-binary goal documented for Rust. [rust/README.md:13-17](/nvmetank1/projects/Razzoozle/source/rust/README.md:13)

**Verdict:** Most expensive way to retain only partial Node compatibility.

#### Boa

**Compatibility:** Boa is an experimental JavaScript engine, not a Node runtime. Promise jobs and async host work require an explicit job executor. [Boa introduction](https://boajs.dev/docs/intro) [Boa job API](https://docs.rs/boa_engine/latest/boa_engine/job/)

**Sandbox:** Pure Rust removes a C++/C engine from the build, but untrusted code still executes in-process. Runtime limits cover loops, recursion, and stack, not complete process isolation. [Boa runtime limits](https://docs.rs/boa_engine/latest/boa_engine/vm/struct.RuntimeLimits.html)

**Verdict:** Highest compatibility risk with no compensating current need.

### Option 2: Dedicated Node sidecar for plugin hooks

**Compatibility:** Best option. It can reuse Node’s actual dynamic-import behavior and preserve ZIP, manifest, export shapes, `register(api)`, async registration, acknowledgements, teardown, and Node module semantics.

**Security:** Better fault boundary than an embedded engine. Run the sidecar as non-root with:

- read-only root filesystem and plugin mount
- no Docker socket
- no Postgres credentials
- no inbound TCP listener
- Unix-domain IPC only
- dropped capabilities
- CPU, memory, process, and file-descriptor limits
- per-plugin worker isolation and execution deadlines

This still does not sandbox browser `ui.js`, which retains full authenticated manager-socket access.

**Twin parity:** Rust remains sole wire-event owner for Rust-connected clients. Sidecar returns actions; it never emits to browser sockets directly.

Required IPC messages:

- `load(pluginId, version, path, generation)`
- `loaded/subscriptions/error`
- `unload(pluginId, generation)`
- `clientEvent(pluginId, event, payload, socketId, requestId)`
- `ack(requestId, payload)`
- `broadcast(pluginId, event, payload, audience)`
- `readConfig/persistConfig`
- `lifecycle(pluginId, hook, payload)`
- `log`
- `heartbeat`

Frames need a maximum size, protocol version, plugin generation, request correlation, timeout, cancellation, and backpressure policy. A length-prefixed binary-safe encoding avoids losing Socket.IO binary payloads.

**Operations:** Adds one small Node service and IPC volume. Rust binary and slim runtime image remain unchanged. Existing combined app already runs Node, but plugin execution should not reuse the full Node game server: that would preserve its broad privileges and couple Rust availability to unrelated Node game state.

**YAGNI:** Sidecar can remain disabled until an enabled plugin declares `SERVER_HANDLER`. Current `config-editor` needs no sidecar process.

**Compatibility caveat:** Strong sandboxing may break undocumented plugins that intentionally access arbitrary files or networks. Compatibility guarantee should cover ZIP format and observed Node runtime contract. Any ambient-Node dependencies found during inventory need explicit capabilities or a temporary compatibility profile.

### Option 3: WASM plugin ABI

**Compatibility:** A new `server.wasm` plus WIT ABI breaks existing `server.js` plugins unless both formats remain supported. An install-time JS-to-WASM wrapper would embed a JS engine inside WASM, retain semantic gaps, and add another toolchain.

**Security:** Strongest capability model. WASM guests start without ambient authority, and Wasmtime supports memory isolation, resource limiting, async host functions, and capability-based WASI access. [Wasmtime security](https://docs.wasmtime.dev/security.html) [Wasmtime Rust API](https://docs.wasmtime.dev/api/wasmtime/)

**Twin parity:** A well-designed WIT contract could make Rust and Node consume the same action-oriented ABI. That is a future plugin-format redesign, not backward-compatible Rust support.

**Operations:** Requires Wasmtime/Wasmi selection, WIT versioning, guest SDKs, packaging rules, signing policy, migration tools, and dual-runtime support during transition.

**YAGNI:** No verified installed plugin needs server execution. Introducing an incompatible ABI now solves a hypothetical ecosystem problem.

**Verdict:** Valid future `formatVersion: 2` direction, rejected for current requirement.

### Option 4: Keep plugin execution on Node

As implemented, this is not coherent:

1. Rust-selected clients send `plugin:*` through their single Rust Socket.IO connection. [packages/web/src/features/game/contexts/socket-context.tsx:154-162](/nvmetank1/projects/Razzoozle/source/packages/web/src/features/game/contexts/socket-context.tsx:154)
2. nginx routes connections by path, not individual Socket.IO event name. [docker/nginx.conf:48-58](/nvmetank1/projects/Razzoozle/source/docker/nginx.conf:48) [docker/nginx.conf:131-149](/nvmetank1/projects/Razzoozle/source/docker/nginx.conf:131)
3. Rust has no `plugin:*` runtime handlers. [rust/server/src/socket/manager/plugins.rs:254-258](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:254)
4. Node broadcasts reach only Node-connected sockets. [packages/socket/src/services/plugin-runtime.ts:185-191](/nvmetank1/projects/Razzoozle/source/packages/socket/src/services/plugin-runtime.ts:185)
5. Rust lifecycle transitions never reach Node’s plugin runtime.
6. Rust installs do not hot-load Node runtime, and Postgres mirroring is asynchronous. [rust/server/src/socket/manager/plugins.rs:319-349](/nvmetank1/projects/Razzoozle/source/rust/server/src/socket/manager/plugins.rs:319)
7. Shared Postgres stores plugin files and metadata, not live sockets, rooms, acknowledgements, event ordering, or authentication sessions. [db/migrations/006_media_plugin_blobs.sql:6-15](/nvmetank1/projects/Razzoozle/source/db/migrations/006_media_plugin_blobs.sql:6)

Making this option correct requires either:

- a Rust-to-Node server bridge, which effectively becomes Option 2 but coupled to the full Node backend, or
- a second browser-to-Node plugin socket for every relevant manager/player/display, with duplicated authentication, merged event streams, and deduplication.

Server bridge is safer than secondary browser sockets. Once that bridge exists, a dedicated sidecar is cleaner than using the full Node twin.

## 3. Single recommendation

## Adopt a dedicated Node plugin sidecar with Rust as event broker

This is the only option that simultaneously:

- preserves existing ZIP and `server.js` semantics;
- avoids embedding untrusted native engine code inside Rust game server;
- keeps Rust authoritative for Rust sockets, rooms, acknowledgements, and ordering;
- allows exact Node/Rust golden-wire comparison;
- avoids V8/QuickJS/Boa compatibility work before any real server plugin needs it;
- remains dormant for current UI-only plugins.

A linked but missing ADR is already referenced as “Node-sidecar” in Rust documentation; source contains no implementation. [rust/README.md:19-20](/nvmetank1/projects/Razzoozle/source/rust/README.md:19)

### Target ownership model

| Concern | Owner |
|---|---|
| ZIP validation, metadata, durable config | Rust mutation service plus Postgres |
| `server.js` import and JavaScript execution | Node sidecar |
| Plugin subscription registry | Rust broker, populated by sidecar |
| Client Socket.IO event receipt | Active backend |
| Ack delivery | Active backend using correlated sidecar response |
| Final plugin broadcast | Active backend only |
| Lifecycle transition source | Active game backend |
| Static `ui.js` and assets | One canonical synchronized asset service |
| Health, limits, restart | Container supervisor/orchestrator |

Rule: one component owns each final wire emission. Sidecar must return `broadcast` actions to Rust; it must never also emit through Node Socket.IO for Rust-origin events.

### Phase 0 — Freeze contract and repair storage coherence

- Inventory production `installed_plugins` and archive all `SERVER_HANDLER` ZIPs.
- Convert current Node runtime tests into engine-neutral conformance fixtures.
- Record exact behavior for export shapes, registration, duplicate `on`, ack, async failure, teardown, config merge, global broadcast, and reload.
- Decide whether `onResult` remains per-player or becomes once-per-round. Recommendation: fix it once-per-round in Node and Rust under one versioned golden test.
- Define lifecycle explicitly as either outbound UI notification or server callback. Recommendation: preserve outbound wire lifecycle; introduce a separate future `onLifecycle` server API if required.
- Fix recursive Rust file mirroring, index hydration, Node hydration ordering, atomic mutations, locking, and failed-install rollback.
- Do not start runtime work until Rust-origin install guarantees that metadata and `/plugins/<id>/ui.js` are available before success broadcast.

**Exit criterion:** UI-only plugins behave identically after install, restart, config change, and removal on both twins.

### Phase 1 — Define and build IPC broker contract

- Version protocol independently from plugin manifest version.
- Use authenticated Unix-domain IPC with restrictive filesystem permissions.
- Add generation IDs so stale worker replies cannot act after reload/unload.
- Correlate acknowledgements to originating Rust socket and request.
- Bound message size, in-flight requests, queue depth, handler duration, and late responses.
- Define sidecar-down behavior: plugin handler remains unavailable, original socket gets no false success, manager receives explicit runtime-health status.
- Validate every sidecar action against originating plugin identity; a plugin cannot broadcast or persist config for another plugin.

**Exit criterion:** Fake sidecar passes broker tests for ordering, ack correlation, restart, timeout, and duplicate suppression.

### Phase 2 — Implement Node compatibility sidecar

- Load unchanged `server.js` with Node dynamic import.
- Reproduce all three accepted export shapes and async registration behavior.
- Implement existing host API as IPC-backed proxies.
- Isolate plugins in separate workers so an infinite loop can be terminated without killing sibling plugins.
- Load before install success; unload and run teardown before file removal.
- Keep sidecar disabled when no enabled plugin declares `SERVER_HANDLER`.

**Exit criterion:** Existing Node runtime fixture ZIPs pass unchanged against Rust plus sidecar.

### Phase 3 — Establish twin-parity gate

Run identical fixture plugins against Node and Rust-sidecar paths and compare:

- exact event name
- payload shape
- acknowledgement payload
- global audience
- emission count
- ordering against game-status frames
- config result
- load/unload behavior
- restart behavior
- failure visibility

Include lifecycle tests for all four hooks and an explicit regression test for `onResult` multiplicity.

**Exit criterion:** Golden traces match, except explicitly versioned and documented corrections.

### Phase 4 — Harden deployment

- Run sidecar as non-root with read-only filesystem.
- Mount only plugin directory and IPC socket.
- Remove network access unless an explicit capability grants it.
- Drop Linux capabilities and apply memory, CPU, PID, and file-descriptor limits.
- Add health checks, restart backoff, structured logs, and metrics without logging plugin payloads by default.
- Document that UI plugins remain trusted manager code; sidecar hardening affects only `server.js`.

**Exit criterion:** Sidecar crash, plugin crash, infinite loop, malformed IPC frame, and oversized payload cannot stop Rust game loop.

### Phase 5 — Reassess only with evidence

After real plugin usage exists, reconsider:

- rquickjs if every server plugin uses only constrained host API and eliminating Node footprint becomes valuable;
- WASM as opt-in `formatVersion: 2` for new plugins requiring stronger sandboxing;
- removal of sidecar only after compatibility telemetry proves safe.

No embedded-engine or WASM work belongs in initial implementation.

### Final risk statement

Hard requirement “existing ZIPs keep working” and strong sandboxing conflict if existing hooks rely on unrestricted Node filesystem, process, or network access. Current checkout provides no real server-hook plugin corpus to resolve that conflict. Node sidecar minimizes compatibility risk while creating an OS boundary; Phase 0 production inventory must define exact ambient-API compatibility before lockdown.

---

## TEIL 3 — Design B (Grok-4.5 / xAI)

# Design: Plugin JS Runtime Support for the Razzoozle Rust Backend

**Status:** architecture design only (no implementation)  
**Date:** 2026-07-10  
**Scope:** make Rust-backend clients get equivalent plugin *server* behavior to Node — or document a deliberate, coherent non-goal.  
**Non-goals:** redesign of client-side `ui.js` host API; iframe sandbox (already reserved v2); multi-tenant untrusted-plugin marketplace.

---

## 1. Findings from code analysis

### 1.1 Two different “PluginHostApi” surfaces (must not be conflated)

There are **two** host APIs with the same conceptual name:

| Surface | Location | Consumer | Has `socket`? |
| --- | --- | --- | --- |
| **Server host API** | `packages/socket/src/services/plugin-runtime.ts` | `server.js` via `register(hostApi)` | **No** — raw `io`/`socket` deliberately withheld |
| **Client host API** | `packages/web/src/features/manager/plugins/host.ts` | `ui.js` via `window.razzoozle.api` | **Yes** — `api.socket` is the manager’s authenticated socket |

Server contract header states the plugin “never sees the raw io/socket — only the namespaced hostApi” (`plugin-runtime.ts:14`).

Client contract exposes `api.socket` for fire-and-forget manager emits (`host.ts:83–85`, `PLUGINS.md:113`, used by `examples/plugins/config-editor/ui.js:113–114`).

**Implication for Rust:** UI plugins that only call `manager:pluginSetConfig` already work on either backend once the manager handlers exist (they do on Rust). Server-hook plugins are a separate problem.

---

### 1.2 Server capability surface (full inventory)

Source of truth: `packages/socket/src/services/plugin-runtime.ts`.

#### Load gates

A server hook is loaded only when **all** of:

1. `ioRef` was set at boot (`setPluginIo`, `plugin-runtime.ts:110–112`, called from `packages/socket/src/index.ts:100`).
2. Plugin `enabled === true` (`plugin-runtime.ts:272–277`).
3. Capability includes exact string `SERVER_HANDLER` (`SERVER_CAPABILITY`, `plugin-runtime.ts:47`, gate at `272–277`).
4. On-disk server file resolves via `pluginServerPath(id)` (manifest `hooks.server`, path under `config/plugins/<id>/`, non-symlink regular file) (`plugin-runtime.ts:279–283`, resolution in `packages/socket/src/services/config/plugins.ts:481–508`).

UI-only plugins (no `SERVER_HANDLER`) are skipped silently (`plugin-runtime.ts:271–277`, test coverage `plugin-runtime.test.ts:315+`).

#### Module contract

Expected export shapes (`plugin-runtime.ts:16–19`, extract logic `230–249`):

- `export function register(hostApi)`
- or `export default register`
- or `export default { register }`

`register` may be sync or async; return value may be a teardown `() => void` (`plugin-runtime.ts:334–346`). Load uses dynamic `import()` of a file URL with cache-bust query (`plugin-runtime.ts:323–326`) — **requires a real Node ESM loader**, not a toy interpreter subset.

#### Server `PluginHostApi` methods (`plugin-runtime.ts:53–72`, built at `127–209`)

| Method | Behavior | Wire / side effect |
| --- | --- | --- |
| `id` | plugin id (readonly) | none |
| `on(event, handler)` | bind namespaced C2S handler on **every connected socket** | wire event `plugin:<id>:<event>` (`114–115`, bind `175–183`) |
| `broadcast(event, payload?)` | `io.emit` to **all** clients | wire event `plugin:<id>:<event>` (`185–190`) |
| `readConfig()` | read own bag from disk index | none |
| `persistConfig(config)` | shallow-merge via `setPluginConfig`, then `io.emit(MANAGER.PLUGIN_CONFIG, …)` | `manager:pluginConfig` (`197–202`) |
| `log(...args)` | `console.log("[plugin:<id>]", …)` | none |
| `assertSafeId(id)` | re-export of host id guard | none |

Handler signature: `(payload, respond?) => void | Promise<void>` with optional socket.io ack (`plugin-runtime.ts:74–79`, listener wrapping `145–163`). Throws and promise rejections are crash-isolated (`152–162`).

**Not exposed to server plugins:** raw `Socket` / `Server`, rooms, join/leave, HTTP, filesystem, DB, other plugins’ namespaces, builtin event registration.

#### Lifecycle registry operations

| Op | Role | Citations |
| --- | --- | --- |
| `setPluginIo(io)` | one-shot boot inject of socket.io Server | `110–112`, `index.ts:100` |
| `loadPlugin(plugin)` | unload-if-present → import → register → optional teardown | `256–364` |
| `unloadPlugin(id)` | teardown + detach all listeners from all sockets | `369–392` |
| `attachPluginsToSocket(socket)` | bind current handlers on new connection | `399–408`, `index.ts:199` |
| `loadEnabledPlugins()` | boot all eligible plugins | `413–419`, `index.ts:155–157` |
| `isPluginLoaded(id)` | test helper | `422` |
| `emitLifecycle(hook, payload)` | see §1.3 | `429–447` |

Install path calls `loadPlugin` after ZIP import (`handlers/manager/plugins.ts:53–56`); remove calls `unloadPlugin` before delete (`76–78`).

Trust model v1: manager-gated install ⇒ **host privileges**; sandbox reserved (`plugin-runtime.ts:5–7`). Manifest `sandbox: "iframe"` validated but inert (`validators/plugin.ts:62–64`).

---

### 1.3 Lifecycle hooks — what they actually do today

Declared hook names (`validators/plugin.ts:13–24`):

- `onQuestionShown`
- `onResult`
- `onLeaderboard`
- `onGameEnd`

Dispatch sites on Node:

| Hook | Call site |
| --- | --- |
| `onQuestionShown` | `round-manager.ts:620` |
| `onResult` | `round-manager/results-broadcast.ts:188` |
| `onLeaderboard` | `round-manager/leaderboard-flow.ts:248` |
| `onGameEnd` | `round-manager/leaderboard-flow.ts:205` |

**Critical semantic:** `emitLifecycle` does **not** invoke `register()` callbacks or `hostApi.on` handlers. It does:

```text
for each loaded plugin in registry:
  io.emit("plugin:<id>:lifecycle:<hook>", { gameId, status, data })
```

(`plugin-runtime.ts:437–439`).

So lifecycle is a **server → client** broadcast under the plugin namespace, gated on “server hook successfully loaded,” not a server-side plugin function call. A `server.js` that only wants lifecycle must either:

- listen on the client (`ui.js` / socket client) for `plugin:<id>:lifecycle:…`, or
- mis-use `hostApi.on("lifecycle:…")` which would only fire on **client-emitted** events of that name (different direction).

Rust has **no** equivalent emit in the game loop today (no matches for `emitLifecycle` / `lifecycle:` under `rust/server`).

---

### 1.4 Plugin ZIP / on-disk format (must keep working)

#### Layout (author-facing)

Documented in `PLUGINS.md:20–28` and mirrored by importer:

- `plugin.json` (required)
- `ui.js` (client entry; public route hard-codes this name for serving)
- `server.js` (optional server hook filename; actual name from `hooks.server`)
- `assets/**` (public static)

**Doc drift note:** `PLUGINS.md:15–16` and `:27` still say `server.js` is “RESERVED, stored but NOT executed.” That is **false for Node** after WP3 — `loadPlugin` executes it (`handlers/manager/plugins.ts:53–56`, runtime module header `plugin-runtime.ts:1–7`). Treat code + tests as SoT; docs need a separate fix.

#### Rust install path (format-compatible today)

`rust/server/src/socket/manager/plugins_zip.rs` implements Node-parity import:

- Caps: 16 MiB raw / matching b64 cap (`23–25`), 200 entries (`27`), 32 MiB total / 512 KiB per file (`28–31`)
- Extension allowlist includes `js`/`mjs`/`cjs` (`33–36`) — **server.js is stored**
- Manifest accepts `hooks.server`, `lifecycleHooks`, `renderSlot`, `sandbox` (`142–201`)
- Zip-slip guards (`54–58`, `292–306`)
- Writes under `config/plugins/<id>/` + index upsert (`289–328`)

Handlers in `plugins.rs`: install / remove / set-config with auth, revision ring, DB mirror (`254–258`, install `277–363`). Honest defer comments: **no** `loadPlugin` / `unloadPlugin` (`15–19`, `321–323`, `396–398`).

Existing ZIPs therefore **already install** on Rust. What is missing is **execution** of `hooks.server`, not extraction.

---

### 1.5 What is actually installed today (YAGNI baseline)

| Plugin | Path | Capabilities | `hooks.server` | Needs server runtime? |
| --- | --- | --- | --- | --- |
| **config-editor** (live) | `config/plugins/config-editor/` + `config/plugins/index.json` | `MANAGER_TAB`, `CONFIG` | absent | **No** — only client `api.socket.emit("manager:pluginSetConfig", …)` |
| **config-editor** (example) | `examples/plugins/config-editor/` | same | absent | No |
| **starter** (example) | `examples/plugins/starter/` | docs mention `SERVER_HANDLER` as optional | no server.js in tree | No |

There is **no production or example plugin** in-repo that ships a real `server.js` + `SERVER_HANDLER`. Server runtime is exercised only by **synthetic fixtures** in `plugin-runtime.test.ts` (`GOOD_SERVER_JS` etc.).

**YAGNI conclusion:** shipping a full JS engine in the Rust binary to run zero real plugins is over-engineering. Design must still leave a path for the *contract* (tests + future plugins), but default phases should not pay V8/QuickJS cost until a real consumer exists.

---

### 1.6 Twin deployment reality

| Fact | Citation |
| --- | --- |
| Two compose twins | `compose.node.yml`, `compose.rust.yml` |
| Rust stack: `app` (nginx+web+Node) + `rust` + shared Postgres | `compose.rust.yml:15–58` |
| Client backend switch is **connection-level**, not event-level | nginx `/ws` → Node `3001` (`docker/nginx.conf:48–58`); `/_rust/` → `rust:3020` (`131–149`) |
| Shared Postgres, hand-managed compose | `compose.rust.yml:12–13`, `46–58` |
| **Config volume mounted only on `app`, not on `rust`** | `compose.rust.yml:30–31` vs `46–58` (no volumes on rust) |
| Rust image expects `CONFIG_PATH=/config`, empty dirs | `rust/Dockerfile:34–38` |
| Rust plugin paths use `get_config_path()` | `plugins.rs:70–72`, `http/mod.rs:88–101` |
| Rust still hydrates plugins from PG into its local config dir | `main.rs` hydrate call; `db/config.rs:102–228` |
| Slim multi-stage Rust image (no Node, no GPU) | `rust/Dockerfile:6–40` |
| Intel host / no CUDA | environment constraint (brief); no CUDA deps in Dockerfile |

**Broadcast twin-parity semantics (definition used below):**

A client connected to backend **A** must observe the same plugin-related wire events (namespaced `plugin:<id>:*` C2S handlers, S2C broadcasts, lifecycle S2C, and `manager:pluginConfig` after plugin config mutations initiated by server plugins) as a client connected to backend **B** for the same logical game/manager session — or the product must **explicitly** declare that plugin server features are Node-only and UI must not claim otherwise.

Today that definition is **violated** for any client on `/_rust` when a server-hook plugin is loaded only in Node’s process.

---

### 1.7 Gap summary: Rust status quo vs Node

| Concern | Node | Rust today |
| --- | --- | --- |
| ZIP install / remove / set-config | yes + load/unload | install/remove/config only (`plugins.rs:15–19`) |
| Static `/plugins/:id/*` | yes (socket HTTP) | yes (`http/mod.rs:129`) |
| Execute `server.js` | yes (`plugin-runtime.ts`) | **no** |
| Bind `plugin:<id>:<event>` handlers | yes | **no** |
| `broadcast` from plugins | yes | **no** |
| Lifecycle S2C emits during game | yes (4 call sites) | **no** |
| Shared live disk with Node twin | Node has volume | rust service **not** on same volume in compose |
| PG mirror of plugins | yes | yes (upsert/delete/hydrate) |

---

## 2. Option-by-option evaluation

Scoring criteria (each option):

1. **Plugin-format compatibility** — existing ZIPs keep working without rewrite  
2. **Security / sandboxing**  
3. **Twin-parity of plugin broadcasts**  
4. **Operational complexity** (compose/deploy/Docker)  
5. **Effort (weeks)** — order-of-magnitude, single engineer familiar with repo  
6. **YAGNI** — matches actually-installed plugin needs  

Scale notes: effort assumes parity with *current* Node contract (namespaced host API + ESM `register`), not a redesign of the plugin model.

---

### Option 1 — Embedded JS engine in the Rust server

Candidates: **rquickjs/QuickJS**, **deno_core/V8**, **boa**.

#### Fit to the contract

Node runtime loads **real ESM modules** from disk via dynamic `import()` (`plugin-runtime.ts:323–326`) and expects:

- modern JS (async `register`, Promises in handlers)
- Node-ish failure isolation (try/catch around plugin code only — not a sandbox)

QuickJS / Boa: no Node module system; incomplete ESM; no `import()` of arbitrary host files without a custom loader. Many “works in Node” plugins (if authors use `node:` builtins later) break.

deno_core / V8: closer to ESM, but still not Node; still needs a custom host API bridge; binary size and build complexity jump hard on a slim multi-stage Debian image.

#### Async bridge

Plugin handlers are async-capable (`PluginEventHandler` may return Promise — `plugin-runtime.ts:76–79`). Rust side is tokio + socketioxide. Any engine needs:

- JS → Rust: `on` registration, `broadcast`, `persistConfig`
- Rust → JS: inbound wire events with optional ack
- careful re-entrancy (plugin broadcast during game loop)

This is weeks of glue, not a crate drop-in.

#### Scoring

| Criterion | Score | Notes |
| --- | --- | --- |
| Format compatibility | **Medium–Low** | ZIP files install; execution is a **dialect**, not Node. ESM/`import` plugins may fail silently or need restricted author guide. |
| Security / sandboxing | **Medium** (potential) | Best *theoretical* place to add real sandbox later. **Today’s contract is host privileges** (`plugin-runtime.ts:5–7`) — embedding does not automatically improve security unless you deliberately restrict host API + resource limits. V8 isolates help; QuickJS less isolation vs process. |
| Twin-parity | **High *if*** engine fidelity is perfect **and** both backends run the same plugins | Risk: subtle divergence (timer, float, module cache) between Node and embedded engine → twin *not* equivalent. |
| Ops complexity | **Medium–High** | Larger Rust binary; possible need for clang/V8 build deps in builder stage; longer CI; no compose service added. |
| Effort | **6–12+ weeks** for V8-class fidelity; **4–8 weeks** for QuickJS “happy path” with known dialect limits | High uncertainty on edge cases. |
| YAGNI | **Fail** | Zero installed plugins need this. Pays max cost up front. |

**Verdict:** architecturally tempting for a future single-binary product; **wrong first move** for Razzoozle’s dual-backend phase and current plugin inventory.

---

### Option 2 — Node sidecar only for plugin hooks (IPC; Rust remains event broker)

Shape:

- Keep existing Node `plugin-runtime.ts` as the only executor of `server.js`.
- Rust socket server remains the broker for clients on `/_rust`.
- On load/install/remove, Rust asks sidecar to load/unload.
- Inbound `plugin:<id>:*` from Rust clients → forward to sidecar.
- Sidecar `broadcast` / lifecycle / `persistConfig` side-effects → IPC back → Rust `emit` to its sockets.

Transport: Unix domain socket or localhost TCP with a tiny framed protocol (JSON or msgpack). Not a second public WebSocket.

#### Format compatibility

**Excellent.** Same Node process, same dynamic import, same tests (`plugin-runtime.test.ts`). Existing ZIPs unchanged.

#### Security

Same as today: host privileges in the Node process that runs the sidecar. Isolation can later be “sidecar container with fewer mounts,” which is **process-level** isolation — better than in-process QuickJS with full host API, worse than a true capability sandbox.

Do **not** give sidecar the full manager socket; re-expose only the server host API surface.

#### Twin-parity

**Best practical path** if the sidecar is the **single** executor and **both** backends either:

- (A) always forward plugin server work to one shared sidecar, or  
- (B) run only one game-serving backend at a time while the other is standby.

With compose.rust’s dual live sockets (Node still on `/ws`, Rust on `/_rust`), parity requires:

1. Plugin install on either path updates shared disk **or** shared PG + hydrate (PG path partially exists).
2. **One** runtime registry (sidecar), not Node-in-app *and* separate sidecar both loading the same `server.js` (double handlers / double broadcasts).
3. Lifecycle emits: either generated in Rust game loop and also sent as S2C (no JS needed for pure lifecycle S2C — see Option 4 partial), **or** Rust notifies sidecar of game transitions and sidecar calls current `emitLifecycle` — but that only emits on *sidecar’s* io, so **broadcasts must be IPC’d back** to Rust’s sockets.

Complexity concentrates in the **forward path**, not in reimplementing JS.

#### Ops

- Compose: extra process. Prefer **reuse the existing Node socket container** as the sidecar (already present in `compose.rust.yml` `app` service) rather than a third image — e.g. a dedicated IPC port inside `app`, or a slim `node packages/socket` mode that only runs plugin runtime + IPC.
- Rust image stays slim (no V8).
- Failure modes: sidecar down ⇒ plugins degraded; need health + clear manager error.

#### Effort

**2–4 weeks** for a minimal IPC that covers `on`/`broadcast`/`persistConfig`/load/unload + install hooks; **+1–2 weeks** for lifecycle fan-out and dual-backend edge cases; **+1 week** tests.

#### Scoring

| Criterion | Score | Notes |
| --- | --- | --- |
| Format compatibility | **High** | Full Node ESM. |
| Security / sandboxing | **Low–Medium** | Same trust model as Node today; process split is optional hardening. |
| Twin-parity | **High** (designable) | Single executor + bidirectional event bridge. |
| Ops complexity | **Medium** | Extra IPC contract + health; can avoid new image by repurposing `app`. |
| Effort | **3–6 weeks** | |
| YAGNI | **Conditional pass** | Overkill until a real `SERVER_HANDLER` plugin exists; right *architecture* when one does. |

**Verdict:** best long-term option for “Rust is primary game backend but plugins stay Node ESM,” once demand exists.

---

### Option 3 — WASM plugin ABI

#### Format break?

**Yes, for server hooks.** Existing contract is ESM `server.js` with dynamic import (`plugin-runtime.ts:16–27`). WASM requires a new artifact (`plugin.wasm` or similar), new manifest field, and a different host ABI (WASI or custom imports).

#### Transpile / wrapper path

| Path | Realistic? |
| --- | --- |
| Auto-compile arbitrary `server.js` → WASM at install | **No** — not sound for general JS; huge toolchain in Docker |
| Author-time AssemblyScript / Rust → WASM | New authoring model; breaks ZIP examples |
| Thin WASM host that embeds QuickJS and loads JS bytes | Back to Option 1, worse |
| Keep `server.js` for Node; require `.wasm` only on Rust | Twin split brain; worst of both worlds |

#### Scoring

| Criterion | Score | Notes |
| --- | --- | --- |
| Format compatibility | **Fail** | Breaks existing server.js contract; no in-repo server plugins to migrate, but **public contract + tests** break. |
| Security / sandboxing | **High** (potential) | Strongest long-term sandbox story. |
| Twin-parity | **Low** unless Node also moves to WASM | Dual ABIs = dual bugs. |
| Ops complexity | **Medium** | Runtime crate; no Node sidecar; still need host API glue. |
| Effort | **8–16 weeks** for a credible ABI + Node dual-run | |
| YAGNI | **Fail** | Speculative marketplace-grade isolation with no consumers. |

**Verdict:** reject for this phase. Revisit only if product strategy becomes “untrusted third-party server plugins.”

---

### Option 4 — Status quo routing: plugin server stays on Node; Rust delegates / documents

#### What “routing” means in *this* codebase

There is **no per-event nginx router** for `plugin:*`. Backend choice is **which socket the client opens** (`/ws` vs `/_rust`, `nginx.conf:48–58` vs `131–149`).

So “plugin events stay on Node” only works if:

- clients that need server-hook plugins connect to **Node**, or  
- Rust **proxies** those events (which collapses into Option 2).

#### What is already coherent for UI-only plugins

For `config-editor` (the only installed plugin):

- Install/remove/config on Rust works without JS runtime.
- Client uses `api.socket.emit("manager:pluginSetConfig", …)` — works on whichever backend handles manager events.
- Static `ui.js` served via `/plugins/…` (proxied to Node in nginx `122–129`; Rust also has `handle_plugin_asset`).

**UI-only plugins do not need a JS runtime on Rust.**

#### What is missing for *correct* dual-backend coherence today

1. **No server-hook execution on Rust** — documented defer (`plugins.rs:15–19`, `321–323`).  
2. **No lifecycle S2C on Rust game path** — even though lifecycle does not need JS (only `io.emit` of known event names for loaded/eligible plugins).  
3. **Config volume not shared to rust service** (`compose.rust.yml`) — disk SoT can diverge; PG hydrate is a partial mitigator with empty-guard and “files missing only” semantics (`db/config.rs:102–113`).  
4. **No product rule** for managers: “server plugins require Node backend” is not enforced in UI.  
5. **Double install paths** — install on Node loads runtime; install on Rust does not; switching backends mid-session yields different handler presence.  
6. **Broadcast domain is process-local** — Node `io.emit` never reaches sockets on Rust’s socketioxide process. Twin-parity of plugin broadcasts is **impossible** without cross-process fan-out (Option 2) or single-process clients (all on Node).  
7. **Doc drift** — `PLUGINS.md` claims server.js not executed; Node executes it.

#### “Minimal correctness” patch set (no full runtime)

If product accepts **“SERVER_HANDLER plugins are Node-backend-only”**:

| Fix | Why |
| --- | --- |
| Document + UI badge / warning when `SERVER_HANDLER` present and backend is Rust | Prevent silent failure |
| Optionally refuse enable/install of `SERVER_HANDLER` on Rust with clear error | Fail loud |
| Implement Rust-side **lifecycle S2C** for enabled plugins that declare server hooks *or* lifecycleHooks — pure emit, no JS | Closes game-phase parity for *client* listeners without runtime |
| Mount shared `config` volume on rust **or** treat PG as sole SoT for plugin files | Disk/index coherence |
| Align `PLUGINS.md` with WP3 | Author trust |

That is **not** full server-hook parity; it is honest status quo.

#### Scoring

| Criterion | Score | Notes |
| --- | --- | --- |
| Format compatibility | **High** | ZIPs already install. |
| Security / sandboxing | **Same as Node** | No change. |
| Twin-parity | **Low** for server hooks; **High** for UI-only if manager handlers stay parity | Broadcasts cannot cross process without extra work. |
| Ops complexity | **Low** | Docs + small emits + compose mount. |
| Effort | **0.5–1.5 weeks** for honest status quo; **not** full runtime |
| YAGNI | **Pass (best)** | Matches actual inventory. |

**Verdict:** correct **default for now**. Promote to Option 2 when the first real `SERVER_HANDLER` plugin is product-required on the Rust path.

---

### Option 5 (added) — “Emit-only / no register” lifecycle parity on Rust

A thin slice often confused with “plugin runtime”:

- Rust game transitions emit `plugin:<id>:lifecycle:<hook>` for eligible plugins.
- No `register()`, no C2S `on`, no plugin-driven `broadcast`.

This is a **subset of Option 4**, not a full alternative. Call it out so implementers do not ship lifecycle emits and claim “plugin runtime done.”

Effort: **~2–4 days** once game transition hooks exist in Rust.

---

## 3. Comparison matrix (summary)

| Criterion | 1 Embedded JS | 2 Node sidecar | 3 WASM ABI | 4 Status quo (+ honesty) |
| --- | --- | --- | --- | --- |
| ZIP / server.js compatibility | Partial (dialect) | Full | Break | Full (install only on Rust) |
| Security upside | Medium (if sandboxed) | Low–Medium | High | None new |
| Twin broadcast parity | Hard (dual engines) | Achievable | Hard (dual ABI) | UI-only only |
| Ops / Docker | Heavier binary | Extra IPC; slim Rust stays | Medium | Minimal |
| Effort (weeks) | 6–12+ | 3–6 | 8–16 | 0.5–1.5 |
| YAGNI vs installed plugins | Fail | Premature until demand | Fail | **Pass** |

---

## 4. Single recommendation

### Recommendation: **Option 4 now (honest status quo + small parity fixes), with Option 2 as the approved upgrade path when a real server-hook plugin must run on Rust clients.**

#### Rationale

1. **YAGNI is decisive.** The only installed plugin is UI-only (`config/plugins/index.json`, `config-editor`). Server runtime demand is test/fixture-level only.  
2. **The hard problem is not “run JS.”** It is **cross-process broadcast parity** between Node’s socket.io and Rust’s socketioxide. Embedding QuickJS inside Rust does not help a client on `/ws` and a client on `/_rust` see the same plugin events.  
3. **Format preservation.** Sidecar reuses Node’s proven loader (`plugin-runtime.ts` + dynamic ESM import). Embedded engines invent a dialect; WASM invents a new format.  
4. **Ops match the twins.** `compose.rust.yml` already runs Node + Rust. Sidecar is a protocol between them, not a third GPU service. Rust Dockerfile can stay slim.  
5. **Security honesty.** Node’s model is already “manager-trusted host code” (`plugin-runtime.ts:5–7`). Paying for WASM isolation without untrusted plugins is premature.  
6. **Uncertainty to flag:** if product intent is “delete Node entirely within N months,” Option 1 becomes more attractive *later* — but still not before a concrete server-plugin consumer and a decision to drop Node ESM as the authoring target.

### Explicit non-goals of the recommended path

- Do not embed V8/QuickJS in the Rust binary in phase 0–1.  
- Do not introduce a WASM plugin ABI.  
- Do not claim twin-parity for `SERVER_HANDLER` without an IPC fan-out design (Option 2).  
- Do not expand server host API (`fs`, raw socket, DB).  

---

## 5. Phased implementation sketch (phases only, no code)

### Phase 0 — Truth & inventory (≤ 2 days)

- Fix author docs (`PLUGINS.md`) to state Node executes `server.js` when `SERVER_HANDLER` + `hooks.server` are present.  
- Add an internal capability matrix: UI-only vs server-hook vs lifecycle S2C.  
- Confirm product rule: **Rust path supports UI plugins; server hooks require Node connection *until* Phase 2.**

**Exit:** docs and team agreement; no runtime change required.

### Phase 1 — Coherent status quo on the twin (≈ 0.5–1.5 weeks)

1. **Compose:** mount the same `config` volume on the `rust` service at `CONFIG_PATH` (or document PG-as-SoT and make hydrate restore full index + files on every boot — today empty-guard can leave rust empty when PG empty).  
2. **Manager UX:** if an enabled plugin lists `SERVER_HANDLER` and the client’s backend is Rust, show a non-blocking warning (or hard-disable server features).  
3. **Lifecycle S2C on Rust (optional but small):** at the four game transitions, emit `plugin:<id>:lifecycle:<hook>` for plugins that would be considered loaded on Node (enabled + capability + server file present). No JS engine.  
4. **Parity tests:** install `config-editor` via Rust manager path; assert `manager:pluginConfig` and static `/plugins/config-editor/ui.js`; assert a fixture `SERVER_HANDLER` plugin does **not** receive C2S on Rust (expected fail loud / documented).  

**Exit:** UI plugins correct on both backends; server-hook limitations explicit; no silent wrong behavior.

### Phase 2 — Node plugin sidecar (trigger: first real `SERVER_HANDLER` plugin must work for Rust clients) (≈ 3–5 weeks)

1. **IPC contract** (versioned):  
   - Rust → sidecar: `Load { plugin }`, `Unload { id }`, `Inbound { id, event, payload, ackId? }`, `GameLifecycle { hook, payload }` (if lifecycle stays server-driven).  
   - Sidecar → Rust: `Broadcast { id, event, payload }`, `PluginConfigChanged`, `Ack { ackId, result }`, `Log`.  
2. **Single executor rule:** only the sidecar runs `loadPlugin` / `unloadPlugin`. Node’s public `/ws` path either shares that executor or is declared secondary.  
3. **Wire Rust install/remove** to Load/Unload (replace today’s honest defer comments with real calls).  
4. **Dynamic C2S:** Rust matches `plugin:<id>:*` (or maintains a set of registered events from sidecar) and forwards.  
5. **S2C fan-out:** sidecar never needs a public socket; Rust emits to its sockets.  
6. **Health:** rust starts without blocking on sidecar; plugin ops degrade with `manager:errorMessage`.  
7. **Tests:** port scenarios from `plugin-runtime.test.ts` across the IPC boundary (ping/ack, teardown detach, throwing register isolation).  

**Exit:** a fixture `SERVER_HANDLER` plugin works for a client connected only to `/_rust` with wire behavior matching Node for the namespaced host API.

### Phase 3 — Hardening (only if untrusted plugins become a goal) (≈ multi-sprint)

- Resource limits on sidecar (CPU/mem, timeouts per handler).  
- Optional separate container with read-only plugin dir.  
- Revisit sandbox field (`iframe` client-side remains separate).  
- Only then evaluate WASM or embedded isolates as a *replacement* for Node ESM — as a **format version bump**, not a silent dialect.

### Phase 4 — Node retirement contingency (uncertain; do not schedule now)

If Node is removed entirely: either keep a tiny `plugin-runtime` Node binary forever (cheapest), or reimplement against one engine with a **frozen** host API and a conformance suite. Do not start this without a kill-Node program decision.

---

## 6. Uncertainty register (honest)

| Item | Uncertainty | Impact |
| --- | --- | --- |
| Will any first-party `SERVER_HANDLER` plugin ship in 2026? | High | If never: stop after Phase 1. |
| Is dual-backend long-lived or a migration bridge? | Medium | Bridge → Option 4 enough; dual forever → Option 2 required for parity. |
| Is lifecycle intended as client S2C only or was server callback intended? | Medium (code says S2C) | Affects whether Phase 1 lifecycle emits are sufficient. |
| PG vs disk SoT under split mounts | Medium | Wrong mount story causes “plugin missing on rust” bugs unrelated to JS. |
| socketioxide dynamic event names / ack parity with socket.io | Low–Medium | Phase 2 integration risk; needs spike (≤ 2 days) before committing IPC design details. |

---

## 7. Acceptance criteria for “done” (by phase)

**Phase 1 done when:**

- A manager on Rust backend can install/use `config-editor` without errors.  
- Docs state server-hook limitation clearly.  
- No code path pretends Rust executed `server.js`.

**Phase 2 done when:**

- Fixture plugin with `SERVER_HANDLER` + `hostApi.on("ping")` + ack works on a Rust-only client.  
- `hostApi.broadcast` from that plugin is received by other Rust-connected clients.  
- Unload detaches handlers (no double-fire).  
- Throwing `register` does not crash Rust or sidecar.  
- Existing ZIPs without `server.js` remain unchanged.

---

## 8. Bottom line

Razzoozle’s plugin **server** contract is a small, well-namespaced host API on top of Node ESM — not a sandbox, not a marketplace ABI. Rust already mirrors **install/storage**. The missing piece is **execution + process-local broadcast domain**, not ZIP format.

**Ship honesty and UI-plugin coherence first (Option 4). When a real server hook must run for Rust clients, bridge to the existing Node runtime via IPC (Option 2). Do not embed a JS engine or invent WASM until product demand and trust-model changes force it.**
