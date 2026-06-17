// Config Editor — first-party example manager plugin (client entry).
//
// This file is served PUBLICLY at /plugins/config-editor/ui.js and injected as a
// <script> in the manager console. It runs as plain browser JS: NO bundler, NO
// imports, NO framework. Everything it needs is reached through the host global
// `window.razzoozle` (see PLUGINS.md for the full contract).
//
// What it demonstrates:
//   - registering a manager tab via window.razzoozle.registerTab(...)
//   - reading the plugin's own saved config off window.razzoozle.api.config
//   - persisting config by emitting the "manager:pluginSetConfig" socket event
//   - returning a teardown that removes everything the render added.
//
// It is dependency-free and defensive: if the host global is missing (loaded
// outside the manager, or before the host bootstrapped) it no-ops instead of
// throwing, so one plugin can never break the console.

(function () {
  var razzoozle = window.razzoozle
  if (!razzoozle || typeof razzoozle.registerTab !== "function") {
    // Host not present — nothing to attach to. Stay silent and inert.
    return
  }

  var PLUGIN_ID = "config-editor"
  // The socket event name the server listens on to persist plugin config. This
  // is the wire-string equivalent of EVENTS.MANAGER.PLUGIN_SET_CONFIG; plugins
  // can't import constants, so the literal is the contract.
  var SET_CONFIG_EVENT = "manager:pluginSetConfig"

  // Read the currently saved welcomeMessage off the live (frozen) ManagerConfig
  // snapshot. Every lookup is guarded so a missing api/config/plugins shape just
  // yields the empty-string default rather than throwing.
  function readSavedMessage() {
    try {
      var api = razzoozle.api
      var plugins = api && api.config && api.config.plugins
      if (!plugins || typeof plugins.find !== "function") {
        return ""
      }
      var mine = plugins.find(function (p) {
        return p && p.id === PLUGIN_ID
      })
      var value = mine && mine.config && mine.config.welcomeMessage
      return typeof value === "string" ? value : ""
    } catch (err) {
      return ""
    }
  }

  razzoozle.registerTab({
    key: "plugin:" + PLUGIN_ID,
    nameKey: "Config Editor",
    icon: "Settings",
    gated: "always",
    render: function (rootEl) {
      // Defensive: a bad rootEl shouldn't crash the host.
      if (!rootEl || typeof rootEl.appendChild !== "function") {
        return undefined
      }

      var container = document.createElement("div")
      container.style.maxWidth = "640px"
      container.style.margin = "0 auto"
      container.style.padding = "24px"
      container.style.display = "flex"
      container.style.flexDirection = "column"
      container.style.gap = "12px"

      var heading = document.createElement("h2")
      heading.textContent = "Config Editor"
      heading.style.fontSize = "20px"
      heading.style.fontWeight = "700"
      container.appendChild(heading)

      var hint = document.createElement("p")
      hint.textContent =
        "Persisted to config/plugins/index.json via manager:pluginSetConfig."
      hint.style.fontSize = "13px"
      hint.style.opacity = "0.7"
      container.appendChild(hint)

      var label = document.createElement("label")
      label.textContent = "Welcome message"
      label.style.fontSize = "14px"
      label.style.fontWeight = "600"
      container.appendChild(label)

      var input = document.createElement("textarea")
      input.value = readSavedMessage()
      input.rows = 3
      input.placeholder = "Willkommen beim Quiz!"
      input.style.width = "100%"
      input.style.padding = "8px"
      input.style.borderRadius = "8px"
      input.style.border = "1px solid rgba(0,0,0,0.2)"
      input.style.font = "inherit"
      container.appendChild(input)

      var button = document.createElement("button")
      button.type = "button"
      button.textContent = "Save"
      button.style.alignSelf = "flex-start"
      button.style.padding = "8px 18px"
      button.style.borderRadius = "8px"
      button.style.border = "none"
      button.style.cursor = "pointer"
      button.style.fontWeight = "600"

      function onSave() {
        try {
          var api = razzoozle.api
          if (api && api.socket && typeof api.socket.emit === "function") {
            api.socket.emit(SET_CONFIG_EVENT, {
              id: PLUGIN_ID,
              config: { welcomeMessage: input.value },
            })
          }
          if (api && api.toast && typeof api.toast.success === "function") {
            api.toast.success("Config saved")
          }
        } catch (err) {
          var api2 = razzoozle.api
          if (api2 && api2.toast && typeof api2.toast.error === "function") {
            api2.toast.error("Failed to save config")
          }
        }
      }

      button.addEventListener("click", onSave)
      container.appendChild(button)

      rootEl.appendChild(container)

      // Teardown: drop the click listener and remove our DOM so a tab switch /
      // unmount / re-render leaves nothing behind.
      return function teardown() {
        button.removeEventListener("click", onSave)
        if (container.parentNode === rootEl) {
          rootEl.removeChild(container)
        }
      }
    },
  })
})()
