# Plugins — Manager Plugin Author Guide

Razzoozle manager plugins add a tab to the manager console. A plugin is a ZIP you
upload in the **Plugins** tab; the server validates it, extracts it under
`config/plugins/<id>/`, and injects its client entry into the manager. This guide
is the author-facing contract — a sibling to the skeleton contract in
[`docs/design/skeleton-system.md`](docs/design/skeleton-system.md).

A complete, working reference lives at
[`examples/plugins/config-editor/`](examples/plugins/config-editor/). Read it
alongside this doc.

> **Trust warning.** Plugins run with **full manager access**. A plugin's `ui.js`
> executes in the manager console with the manager's authenticated socket and a
> read-only view of the live config. Only install plugins you trust. `server.js`
> is **reserved and NOT executed** in v1 (it is stored but never required/run).

---

## 1. ZIP layout

A plugin ZIP is flat at the root:

```
plugin.json        (required) the manifest
ui.js              (required) client entry — runs in the manager
server.js          (optional) server hook — RESERVED, stored but NOT executed yet
assets/**          (optional) static assets served publicly
```

Install caps mirror the skeleton importer (entry count, total bytes, per-asset
bytes). Allowed extensions: the skeleton media set plus `js`, `mjs`, `cjs`,
`json`, `css`, `ttf`, `woff`, `gif`. `svg` is **not** allowed (XSS surface on the
public route). Paths with `..`, leading `/`, or NUL bytes are rejected.

---

## 2. Manifest (`plugin.json`)

Validated by `pluginManifestValidator` in `@razzoozle/common`. Fields:

| Field            | Type                         | Notes                                                                 |
| ---------------- | ---------------------------- | --------------------------------------------------------------------- |
| `formatVersion`  | number (default `1`)         | Manifest shape version.                                               |
| `id`             | safe-id string (required)    | `^[a-z0-9][a-z0-9-]{0,63}$`. Becomes the on-disk dir name.            |
| `version`        | string (required)            | Semver-ish; used to version-bust the injected `ui.js`.                |
| `name`           | string (required, ≤80)       | Human label.                                                          |
| `capabilities`   | string[] (default `[]`)      | Informational badges only — **never enforced** in v1.                 |
| `tab.nameKey`    | string (required)            | i18n key OR a literal label (plugins ship their own strings).         |
| `tab.icon`       | string (required)            | Lucide icon name, PascalCase (e.g. `"Settings"`).                     |
| `tab.gated`      | `"always"` \| `"devMode"`    | `"always"` shows for every manager; `"devMode"` only when RAZZOOLE_DEV.|
| `hooks.client`   | string (default `"ui.js"`)   | Client entry filename. The public route only ever serves `ui.js`.    |
| `hooks.server`   | string (optional)            | Server hook filename — RESERVED, not executed.                        |
| `config`         | object (default `{}`)        | Free-form default config bag, owned/validated by the plugin itself.   |
| `i18n`           | `{ lang: { key: string } }`  | Optional. Or just use literal labels — keep it simple.                |
| `sandbox`        | `"none"` \| `"iframe"`       | v1 only honors `"none"` (in-process). `"iframe"` is reserved.         |

Example (`examples/plugins/config-editor/plugin.json`):

```json
{
  "formatVersion": 1,
  "id": "config-editor",
  "version": "1.0.0",
  "name": "Config Editor",
  "capabilities": ["MANAGER_TAB", "CONFIG"],
  "tab": { "nameKey": "Config Editor", "icon": "Settings", "gated": "always" },
  "hooks": { "client": "ui.js" },
  "config": {},
  "sandbox": "none"
}
```

---

## 3. Client API — `window.razzoozle`

`ui.js` runs as a plain injected `<script>`: **no bundler, no imports, no
framework.** Reach everything through the host global `window.razzoozle`. Always
guard its existence — your script may load before the host bootstraps or outside
the manager.

### `window.razzoozle.registerTab(registration)`

Register a manager tab:

```js
window.razzoozle.registerTab({
  key: "plugin:config-editor", // MUST be "plugin:<id>" — collisions are ignored
  nameKey: "Config Editor",    // i18n key or literal label
  icon: "Settings",            // Lucide icon name
  gated: "always",             // "always" | "devMode"
  render(rootEl) {
    // imperatively populate rootEl (vanilla DOM, any framework you bundle in)
    // ...
    return function teardown() {
      // remove listeners + DOM you added; called on tab switch / unmount /
      // re-register. Must tolerate being called after a prior teardown.
    }
  },
})
```

`key` **must** be namespaced `plugin:<id>` and must not collide with a built-in
tab; a bad registration is logged and ignored (never thrown) so one plugin can't
break the host. `render` is handed the host-owned DOM element and may return a
teardown function (or `undefined`).

### `window.razzoozle.api`

A read-only / fire-and-forget surface (re-frozen on each access):

- `api.socket` — the manager's authenticated `TypedSocket`. Use `.emit(...)`.
- `api.config` — frozen snapshot of the live `ManagerConfig`, including
  `config.plugins: InstalledPlugin[]` (each has `id`, `name`, `version`,
  `enabled`, `capabilities`, optional `config`).
- `api.t` — the i18next translator bound to the active language.
- `api.toast` — the `react-hot-toast` instance (`.success(...)`, `.error(...)`).

Read your own saved config off the snapshot:

```js
var mine = window.razzoozle.api.config.plugins.find(function (p) {
  return p.id === "config-editor"
})
var welcome = (mine && mine.config && mine.config.welcomeMessage) || ""
```

---

## 4. Persisting config

Emit the `manager:pluginSetConfig` event (the wire string for
`EVENTS.MANAGER.PLUGIN_SET_CONFIG` — plugins can't import constants). The server
merges the bag into `config/plugins/index.json` and re-broadcasts the updated
plugin list via `manager:pluginConfig`, which refreshes `api.config.plugins`.

```js
window.razzoozle.api.socket.emit("manager:pluginSetConfig", {
  id: "config-editor",
  config: { welcomeMessage: value },
})
window.razzoozle.api.toast.success("Config saved")
```

---

## 5. Public-asset rule

The route `GET /plugins/:id/:path` is **unauthenticated** and serves **only**:

- `ui.js` (the hard-coded client entry — never read from the manifest), and
- anything under `assets/**`.

`plugin.json`, `server.js`, `plugin-revisions.json`, and any other root file are
denied (404). `svg` is not served (XSS). Symlinks are never served. Keep all
public files in `assets/` and your client entry in `ui.js`.

---

## 6. Install

1. ZIP the plugin's files at the root (e.g. `cd examples/plugins/config-editor && zip -r ../config-editor.zip .`).
2. Open the manager console → **Plugins** tab.
3. Upload the ZIP. The server validates the manifest, extracts to
   `config/plugins/<id>/`, registers it (enabled), and injects `ui.js`.
4. Your tab appears in the console. Toggle/remove it from the Plugins tab.

Installs reject duplicate ids and unsafe ids; a prior `index.json` is snapshotted
to a rolling revision ring before each mutation.

## AI provider base URL — server-side request within the manager-trust boundary

The manager-configurable AI provider base URL (set via the auth-gated
`MANAGER.SET_SETTINGS`) drives a **server-side** fetch to
`${baseUrl}/chat/completions` (`packages/socket/src/services/ai-provider.ts`),
and `MANAGER.TEST_PROVIDER` (`packages/socket/src/handlers/ai.ts`) issues the same
server-side request. This is a server-side-request (SSRF) capability, but it sits
entirely **within the manager-trust boundary**: only an authenticated manager can
set the base URL — the same trust level under which manager-uploaded addon JS
already runs. There is intentionally **no host allowlist** (it would break
legitimate self-hosted / proxy endpoints and adds no protection against a trusted
manager). Operators running Razzoozle in a semi-trusted, multi-manager setting
should be aware that a manager can point this fetch at internal hosts.
