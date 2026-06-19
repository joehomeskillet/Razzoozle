import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { usePlayerStore } from "@razzoozle/web/features/game/stores/player"

// The "answering" phases during which an auto-reload would disrupt a live quiz.
// A reload that lands here would yank the question/answer UI out from under the
// player (or the manager's running timer), so we always defer until the game
// leaves these states.
const ACTIVE_QUESTION_STATUSES = new Set(["SHOW_QUESTION", "SELECT_ANSWER"])

// Reentry / loop guards. `refreshing` blocks a second reload within this page
// life. `RELOAD_ONCE_KEY` (sessionStorage) survives the reload itself so a
// freshly-activated SW that *still* reports a controllerchange race can't put
// us in an infinite reload cycle within the same tab session.
let refreshing = false
const RELOAD_ONCE_KEY = "rzl_sw_reloaded"

const isActiveQuestion = (): boolean => {
  const playerStatus = usePlayerStore.getState().status
  const managerStatus = useManagerStore.getState().status
  return (
    (!!playerStatus && ACTIVE_QUESTION_STATUSES.has(playerStatus.name)) ||
    (!!managerStatus && ACTIVE_QUESTION_STATUSES.has(managerStatus.name))
  )
}

const doReload = (): void => {
  if (refreshing) {
    return
  }
  // sessionStorage once-flag: if we already reloaded for an update in this tab
  // session, never reload again — defends against a controllerchange that
  // re-fires immediately after the reload.
  try {
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === "1") {
      return
    }
    sessionStorage.setItem(RELOAD_ONCE_KEY, "1")
  } catch {
    // sessionStorage may be unavailable (private mode / blocked); fall through
    // and rely on the in-memory `refreshing` guard only.
  }
  refreshing = true
  window.location.reload()
}

// Triggered when a freshly-activated SW takes control. Reload immediately when
// safe; otherwise arm a one-shot store subscription that fires the reload the
// moment the game leaves an active-question phase.
const handleActivatedUpdate = (): void => {
  if (refreshing) {
    return
  }
  if (!isActiveQuestion()) {
    doReload()
    return
  }

  // Pending: defer until status leaves the active-question phase. Subscribe to
  // BOTH stores; whichever transitions first (the player or manager view that
  // this tab is actually driving) clears the guard and reloads.
  let done = false
  const tryReload = () => {
    if (done || refreshing) {
      return
    }
    if (!isActiveQuestion()) {
      done = true
      unsubPlayer()
      unsubManager()
      doReload()
    }
  }
  const unsubPlayer = usePlayerStore.subscribe(tryReload)
  const unsubManager = useManagerStore.subscribe(tryReload)
}

// Wire up the controllerchange listener for the auto-injected (registerType:
// "autoUpdate") service worker. A new deploy -> new SW installs, skipWaiting +
// clientsClaim activate it -> `controllerchange` fires -> guarded reload.
//
// Guard against the FIRST-EVER install: on a page with no prior controller, the
// initial SW activation also fires controllerchange, and reloading then is both
// pointless and surprising. Capturing the controller presence at module init
// lets us reload only on genuine UPDATES.
export const initSwAutoReload = (): void => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return
  }
  const hadControllerAtStartup = !!navigator.serviceWorker.controller

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadControllerAtStartup) {
      // First-ever SW taking control of this client — not an update.
      return
    }
    handleActivatedUpdate()
  })
}
