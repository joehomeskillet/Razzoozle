// Host-local mirror of the low-latency-mode master switch.
//
// The authoritative flag lives server-side (config/game.json →
// lowLatencyMode.enabled, set via the manager's SET_GAME_CONFIG toggle) and
// drives the actual transport timing. This tiny localStorage mirror exists only
// so the in-game manager chrome (GameWrapper) — which renders OUTSIDE the
// manager ConfigProvider and therefore cannot read useConfig() — can decide
// whether to mount the LowLatencyHealth diagnostic widget. It is a UI-only
// visibility hint, never a scoring or transport input.
//
// Mirrors the localStorage pattern already used for the manager's active-tab
// preference (configurations/index.tsx). Same-device host: the config screen
// and the live game run in the same browser, so this stays in sync.

const STORAGE_KEY = "razzoozle_low_latency_enabled"

export const setLowLatencyPref = (enabled: boolean): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0")
  } catch {
    // Private mode / disabled storage — visibility just falls back to off.
  }
}

export const getLowLatencyPref = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}
