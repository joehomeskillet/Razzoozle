# Design — Manager Plugin/Addon System

- **Date:** 2026-06-17
- **Branch:** `feat/plugin-system` (to be cut after the avatar/sound/animation waves merge)
- **Status:** Approved design → implementation (gated on Wave C commit)
- **Source:** 6-agent read-only design recon (3 maps → 2 proposals → judge synthesis) + user decisions

## Summary

A plugin/addon system for the manager so the tool can be extended with new
features later. **A plugin IS a skeleton-shaped ZIP** that registers a manager
tab (and, per the user decision, optional **server-side** behaviour). It
recycles the already-hardened skeleton pipeline almost verbatim.

### User decisions (2026-06-17)
| Decision | Choice |
|---|---|
| **Menu placement** | **Own always-visible "Plugins/Addons" manager tab** (new `BUILTIN_TABS` entry, not folded into Dev) |
| **v1 scope** | **Server-capable** — plugins may register socket handlers + HTTP routes + run `server.js` in the Node process (the larger build) |
| **Proof plugin** | **Config-editor plugin** — a tab with a form that persists free-form config via `PLUGIN_SET_CONFIG` |
| **Concurrency** | **Multiple plugins active simultaneously**, each its own tab |
| **Trust** | Plugins **may later come from untrusted sources** → reserve a `sandbox` manifest field now; v1 still executes in-process (operator-trusted), sandbox tier is v2 |

> Note: the design recon *recommended* UI-only for v1 (server-capable is "the
> single biggest cost lever" — mutable registries + Node blast radius). The user
> chose server-capable deliberately. We honor it but isolate the server-execution
> work into its own WPs, keep the prominent trust warning, and reserve the
> sandbox seam so the future untrusted-source tier is cheap to add.

## Architecture

A plugin is a ZIP (structural sibling of the skeleton ZIP):

```
plugin.json     (required) — manifest, zod-validated
ui.js           (required) — client entry; injected <script>, calls window.razzoozle.registerTab()
server.js       (optional, EXECUTED in v1) — Node entry; registers handlers/routes via a host API
assets/**       (optional) — /media-style path rules
PLUGIN.md       (generated author doc, sibling of SKELETON.md)
```

Installed plugins live at `config/plugins/<id>/` (guarded by `assertSafeId`),
tracked in `config/plugins/index.json` (`{id,version,enabled,capabilities[]}`),
with a `plugin-revisions.json` rollback ring (clone of theme-revisions).
`ManagerConfig` gains optional `plugins?: InstalledPlugin[]`, pushed via a new
`MANAGER.PLUGIN_CONFIG` broadcast. Install/remove/set-config via
`MANAGER.PLUGIN_INSTALL / PLUGIN_REMOVE / PLUGIN_SET_CONFIG`. All behind
`authorizeManagerRequest` / `manager.withAuth`.

### Plugin manifest (`plugin.json`)
Validated by `pluginManifestValidator` (zod, mirrors `themeValidator` with
`.default()`s):
- `formatVersion: number` (guarded by `PLUGIN_FORMAT_VERSION`)
- `id: string` (`assertSafeId`-safe; namespaces the `plugin:<id>` tab key + storage dir)
- `version: string`, `name: string`
- `capabilities: string[]` — declared capability badges, e.g. `['MANAGER_TAB','SERVER_HANDLER','HTTP_ROUTE']`. v1: used for honest UI labeling + to decide which host APIs to expose; **not a hard sandbox boundary**.
- `tab: { nameKey: string, icon: string (lucide name → resolveIcon), gated?: 'always'|'devMode' }`
- `hooks: { client: string (e.g. 'ui.js', required), server?: string (e.g. 'server.js') }`
- `config?: Record<string,unknown>` — free-form, merged into `ManagerConfig.plugins[].config`, round-tripped via `PLUGIN_SET_CONFIG` (**this is what the proof config-editor plugin uses**)
- `i18n?: Record<locale, Record<string,string>>` — namespaced under `id`; core keys win on merge
- `sandbox?: 'none' | 'iframe'` — **RESERVED**. v1 honors only `'none'` (in-process). The `'iframe'` tier is the v2 seam for untrusted plugins; manifest field reserved now so no format bump is needed later.

### Client host
- `apply.ts` gains `window.razzoozle.registerTab({key,nameKey,icon,render(rootEl)})`
  and `window.razzoozle.api = { socket, config (read-only), t, toast }` (~30 lines extending the existing global).
- New `PluginTabHost` component: a **stable-key empty mount div React never
  reconciles**; calls `render(rootEl)` on mount, the returned teardown on unmount,
  `replaceChildren()` to nuke leftover DOM, version-hash effect dep for
  re-injection. (This is the #1 risk — getting React/imperative-DOM coexistence right.)
- `Map`-based `pluginRegistry` deduped by key (idempotent on script re-exec).
- `configurations/index.tsx`: `tabs` → `BUILTIN_TABS.concat(pluginTabs)`; the
  line-186 gate generalizes to `isTabAllowed(tab, config)`. Plugin tab keys are
  `plugin:<id>` namespaced; a manifest whose id collides with a builtin key is rejected.
- **Own "Plugins" builtin tab** (always-visible to an authenticated manager):
  ZIP drag-drop install, installed-plugin list with capability badges +
  enable/disable/uninstall toggles, and a prominent red trust warning
  ("läuft mit vollem Zugriff — nur vertrauenswürdiger Code"). `resolveIcon(name)`
  maps a lucide string → component with fallback.

### Server execution (the server-capable v1 delta)
This is the net-new infra beyond the recon's UI-only baseline:
- **Mutable handler registry:** the static `socketHandlers` array
  (`packages/socket/src/index.ts:148`) becomes a registry that can (a) attach a
  plugin's handlers to newly-connected sockets and (b) hot-bind onto
  already-connected manager sockets on install/enable. A plugin's `server.js`
  receives a host API: `{ on(event, handler), broadcast(event, payload),
  persistConfig(id, cfg), readConfig(id), assertSafeId, log }` — a **namespaced,
  capability-checked** surface, not raw `io`.
- **Mutable HTTP route table:** the static `Route[]` (`http-routes.ts:540`)
  becomes appendable so a plugin can register `/api/plugins/<id>/*` routes (all
  behind `authorizeManagerRequest`).
- **Plugin server lifecycle:** on enable, `server.js` is `import()`-ed in-process
  and its `register(hostApi)` runs; on disable/uninstall, its registered handlers/
  routes are removed and a teardown hook fires. (In-process = full trust; the
  `sandbox:'iframe'`/worker isolation is the reserved v2 path for untrusted code.)
- **Events emitted to plugins** can include game-lifecycle hooks in a later
  iteration; v1 exposes the manager socket + config persistence.

## Recycled from skeleton (verbatim or near)
ZIP build/import (`buildSkeletonZip`/`importSkeletonZip` → `buildPluginZip`/
`importPluginZip`, same caps + `assertSafeId`); zod-validator-as-schema with
`.default()`; version-busted `<script>` injection (`ensureScript`/`ensureLink`);
`window.razzoozle` global; manager auth (`authorizeManagerRequest`/X-Manager-Token
/`manager.withAuth`); the skeleton import/export HTTP route entries → plugin ones;
revision-ring rollback; broadcast-on-change; `config/` sidecar + `ensureDir`;
`ManagerConfig` optional-field back-compat; `TabDef`/`ConsoleShell`/`ConfigProvider`/
lucide/`react-hot-toast`/`rahoot_manager_tab` localStorage fallback; the
`renderSkeletonJs` scaffold pattern → `renderPluginScaffold()`.

## Build plan (WP-DAG; warm-tree edit-only, orchestrator commits)

- **WP1 — Common contract** (disjoint, no behavior): `common/src/validators/plugin.ts`
  (`pluginManifestValidator` + `PluginManifest`/`InstalledPlugin` types +
  `PLUGIN_FORMAT_VERSION`, incl. reserved `sandbox` field); `ManagerConfig.plugins?`;
  `EVENTS.MANAGER.PLUGIN_CONFIG/INSTALL/REMOVE/SET_CONFIG`. Gate: workspace typecheck.
- **WP2 — Server storage + ZIP + routes** (UI-independent): `ensureDir(config/plugins)`;
  `read/writePlugins()` + `index.json` + revision ring; `buildPluginZip`/`importPluginZip`;
  two static routes (`/api/plugins/import`, `/api/plugins/:id/export`) + versioned
  static serve of `ui.js`; `PLUGIN_*` socket handlers (withAuth); broadcast
  `PLUGIN_CONFIG`; merge `plugins[]` into config emit. Gate: curl-install a fixture ZIP.
- **WP3 — Server execution registry** (the server-capable delta): make
  `socketHandlers` + `Route[]` mutable/appendable + hot-bind; plugin `server.js`
  in-process loader with `register(hostApi)` + teardown; capability-gated host API.
  Gate: a fixture plugin `server.js` registers an event handler that round-trips.
- **WP4 — Client host + tab registry**: `apply.ts` `registerTab()` + `api`;
  `PluginTabHost`; `resolveIcon` + `isTabAllowed`; `BUILTIN_TABS.concat(pluginTabs)`;
  per-id `ui.js` injection. Gate: a fixture `ui.js` renders a tab, survives
  tab-switch + version bump (no double-register, clean teardown).
- **WP5 — "Plugins" manager tab (own menu item) + install UI + scaffold/doc**:
  new always-visible builtin tab; ZIP drag-drop install, list, enable/disable,
  uninstall, capability badges, red trust warning; `renderPluginScaffold()` + `PLUGINS.md`.
- **WP6 — Proof plugin: config-editor**: a first-party plugin ZIP whose tab is a
  form that reads/writes free-form config and persists via `PLUGIN_SET_CONFIG`,
  installed end-to-end through the UI as the acceptance test for the whole contract.

## Risks
- **React vs imperative DOM** (highest): stable-key mount div + teardown +
  `replaceChildren()` + version-hash dep (cross-model-confirmed sound).
- **In-process server execution / stored-XSS+RCE trust model**: `server.js` runs
  with full Node access in v1. MUST stay behind manager auth + `assertSafeId` +
  the prominent red warning. The `capabilities[]` badges are intent labels, NOT an
  enforced boundary in v1 — label them as such. The `sandbox` field is the reserved
  path for the future untrusted-source tier; until built, treat ALL installs as fully trusted.
- **Mutable registries hot-binding onto live sockets**: enable/disable must
  attach/detach handlers idempotently; teardown must fully remove routes/handlers.
- **Double-register on re-injection**: `registerTab` idempotent Map upsert; Strict-Mode-safe render/teardown.
- **Tab-key / i18n-key collisions**: enforce `plugin:<id>` prefix, reject builtin-id collisions, namespace + non-destructive i18n merge (core wins).

## Non-goals (v1)
Sandbox/iframe isolation (reserved field only); a plugin marketplace/registry
fetch; game-lifecycle server hooks beyond the manager socket; per-plugin
fine-grained permission enforcement (capabilities are labels in v1).
