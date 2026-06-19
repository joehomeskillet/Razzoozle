// Starter Addon — minimal manager addon template (client entry).
//
// Copy this folder, rename `id` in plugin.json, edit this file, ZIP the folder
// contents (see ADDON-SKELETON.md), then import it in the manager Plugins tab.
// This file is served publicly at /plugins/<id>/ui.js and injected as a <script>
// in the manager console. It runs as PLAIN browser JS — no bundler, no imports,
// no framework. Everything is reached through the host global `window.razzoozle`
// (full contract: PLUGINS.md at the repo root).
//
// It is defensive: if the host global is missing (loaded outside the manager, or
// before the host bootstrapped) it no-ops instead of throwing, so one broken
// addon can never take down the console.
(function () {
  var razzoozle = window.razzoozle
  if (!razzoozle || typeof razzoozle.registerTab !== "function") {
    return
  }

  var PLUGIN_ID = "starter"
  // Wire-string the server listens on to persist this addon's config — the
  // literal equivalent of EVENTS.MANAGER.PLUGIN_SET_CONFIG (addons can't import
  // constants, so the string IS the contract).
  var SET_CONFIG_EVENT = "manager:pluginSetConfig"

  // Read this addon's saved config off the live (frozen) ManagerConfig snapshot.
  // Every lookup is guarded so a missing shape yields {} rather than throwing.
  function readConfig() {
    try {
      var api = razzoozle.api
      var plugins = api && api.config && api.config.plugins
      if (!plugins || typeof plugins.find !== "function") {
        return {}
      }
      var self = plugins.find(function (p) {
        return p && p.id === PLUGIN_ID
      })
      return (self && self.config) || {}
    } catch (e) {
      return {}
    }
  }

  // Persist a config patch; the server merges it and re-broadcasts ManagerConfig.
  function saveConfig(patch) {
    try {
      if (razzoozle.socket && typeof razzoozle.socket.emit === "function") {
        razzoozle.socket.emit(SET_CONFIG_EVENT, { id: PLUGIN_ID, config: patch })
      }
    } catch (e) {
      // Swallow: a failed save must not break the console.
    }
  }

  // Register a manager tab. render(rootEl) fills the tab body and may RETURN a
  // teardown that removes everything it added (called before re-render/unmount).
  // Keep render idempotent and teardown total.
  razzoozle.registerTab({
    id: PLUGIN_ID,
    render: function (rootEl) {
      if (!rootEl || typeof rootEl.appendChild !== "function") {
        return undefined
      }

      var cfg = readConfig()
      var wrap = document.createElement("div")
      wrap.style.padding = "16px"

      var heading = document.createElement("h2")
      heading.textContent = "Starter Addon"
      wrap.appendChild(heading)

      var hint = document.createElement("p")
      hint.textContent =
        "Edit ui.js to build your addon. Saved note: " + (cfg.note || "(none)")
      wrap.appendChild(hint)

      var input = document.createElement("input")
      input.type = "text"
      input.value = cfg.note || ""
      input.placeholder = "Type a note, then click away to save"
      input.addEventListener("change", function () {
        saveConfig({ note: input.value })
      })
      wrap.appendChild(input)

      rootEl.appendChild(wrap)

      // Teardown: remove exactly what this render added.
      return function () {
        if (wrap.parentNode) {
          wrap.parentNode.removeChild(wrap)
        }
      }
    },
  })
})()
