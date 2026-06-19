# Addon Skeleton — build a Razzoozle manager addon

A copy-paste starting point for a **manager addon** (plugin). It mirrors the
theme skeleton: a small, self-describing template a human — or an LLM reading
this file — can fill in. The fuller reference addon is
`examples/plugins/config-editor/`; the complete runtime contract is `PLUGINS.md`
at the repo root.

## Layout

    starter/
      plugin.json         manifest (fields below)
      ui.js               client entry — plain browser JS, no bundler/imports
      assets/             optional static files, served at /plugins/<id>/assets/
      ADDON-SKELETON.md   this file (you can omit it from your ZIP)

## plugin.json (manifest)

| field | meaning |
|---|---|
| `formatVersion` | manifest format version (currently `1`). |
| `id` | lowercase alnum + dashes, 1–64 chars, starts alnum. Becomes the on-disk dir `config/plugins/<id>/`, so it must be unique. |
| `version` | your addon's semver string. |
| `name` | display name (max 80 chars). |
| `capabilities` | badge list. `MANAGER_TAB` registers a manager tab; `SERVER_HANDLER` loads an optional server hook (v1 capability-gated). Other badges are display-only. |
| `tab.nameKey` | tab label (a literal string or an i18n key). |
| `tab.icon` | a lucide-react icon name, e.g. `Puzzle`, `Settings`. |
| `tab.gated` | `always` (visible to every manager) or `devMode` (only when RAZZOOLE_DEV). |
| `hooks.client` | the browser entry file (default `ui.js`). |
| `hooks.server` | optional server hook module (v1). |
| `config` | free-form config bag your addon owns and validates. |
| `i18n` | RESERVED (v2) — validated but inert in v1. |
| `sandbox` | `none` (in-process) — the only value honoured in v1. |

## Runtime API — `window.razzoozle`

`ui.js` runs as a `<script>` in the manager console; reach everything through the
host global (no imports):

- `razzoozle.registerTab({ id, render })` — register your tab. `render(rootEl)`
  fills the tab body and may **return a teardown function** (called before
  re-render / unmount). Always guard `rootEl`.
- `razzoozle.api.config` — the live, frozen `ManagerConfig` snapshot. Your own
  config lives at `api.config.plugins.find(p => p.id === <id>).config`.
- `razzoozle.socket.emit("manager:pluginSetConfig", { id, config })` — persist a
  config patch; the server merges and re-broadcasts `ManagerConfig`.

Be defensive: if `window.razzoozle` is missing, no-op (never throw) — one bad
addon must not break the console.

## Package & install

1. Edit `plugin.json` (`id`, `name`) and `ui.js`.
2. ZIP the folder **contents** (so `plugin.json` is at the ZIP root):

       cd starter && zip -r ../my-addon.zip plugin.json ui.js assets

3. In the manager **Plugins** tab, import `my-addon.zip`, then enable it.

## Security / trust

Addon JS runs in the manager console with manager privileges — a trusted,
authenticated context. Treat an uploaded addon like any code you'd run yourself.
The import path validates the manifest and rejects unsafe ZIP entries (path
traversal, disallowed extensions, oversize), but the JS itself is **not**
sandboxed in v1 (`sandbox: "none"`). Only install addons you trust.
