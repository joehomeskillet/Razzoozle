import { EVENTS } from "@razzoozle/common/constants"
import Loader from "@razzoozle/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useThemeStore } from "@razzoozle/web/features/theme/store"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Maximize } from "lucide-react"
import QRCode from "@razzoozle/web/components/QRCode"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

// Display registration ("pairing") page.
//
// A Raspberry Pi kiosk boots straight to `/display`. This page registers the
// display over socket.io, shows a short pairing code on the big screen, and
// waits for the manager (driving from their phone) to enter that code in the
// admin. When the server pairs the display to a live game it pushes
// DISPLAY.PAIR_SUCCESS with the gameId; we then hand off to `/display/play`,
// which renders the game fullscreen.

const DisplayRegisterPage = () => {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()
  const appTitle = useThemeStore((s) => s.theme.appTitle)
  const [pairingCode, setPairingCode] = useState<string | null>(null)

  // Manual fullscreen for the beamer: the auto-request below is blocked without
  // a user gesture in a normal browser, so the operator needs a button to click.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {
        /* ignore */
      })
    }
  }

  // Best-effort fullscreen. Chromium `--kiosk` already boots fullscreen, so a
  // rejected promise here (no user gesture) is harmless.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* Fullscreen needs a gesture in non-kiosk browsers; ignore */
    })
  }, [])

  // WP-15 — label this display for the manager status card. The app title is a
  // friendly default ("Razzoozle"); the server clamps/sanitises it anyway.
  const displayName =
    appTitle?.trim() ||
    t("display:defaultName", { defaultValue: "Beamer" })

  // Register as a display as soon as the socket is connected. The server replies
  // with a pairing code. Re-runs on reconnect so a flaky network re-registers.
  useEffect(() => {
    if (!isConnected) {
      return
    }

    socket.emit(EVENTS.DISPLAY.REGISTER, { name: displayName })
  }, [socket, isConnected, displayName])

  // Some server builds hand the pairing code back synchronously in the ack of
  // the very first connect rather than waiting for `isConnected` to flip, so we
  // also (re)register on the raw connect event.
  useEvent("connect", () => {
    socket.emit(EVENTS.DISPLAY.REGISTER, { name: displayName })
  })

  // The server assigns this display a short pairing code to show on the beamer.
  useEvent(EVENTS.DISPLAY.REGISTERED, ({ code }) => {
    if (code) {
      setPairingCode(code)
    }
  })

  // Manager paired us to a game from their phone → render the game fullscreen.
  useEvent(EVENTS.DISPLAY.PAIR_SUCCESS, ({ gameId }) => {
    if (!gameId) {
      return
    }

    navigate({
      to: "/display/play",
      search: { gameId },
    })
  })

  const joinUrl = `${window.location.origin}/manager`

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[3vh] px-[5vw] text-center">
      <button
        type="button"
        onClick={toggleFullscreen}
        title={t("display:fullscreen", { defaultValue: "Vollbild" })}
        aria-label={t("display:fullscreen", { defaultValue: "Vollbild" })}
        className="fixed top-[2vh] right-[2vh] z-50 rounded-md bg-white/10 p-[1.4vh] text-white/60 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Maximize className="h-[3vh] w-[3vh]" />
      </button>

      <h1 className="text-[6vh] leading-tight font-extrabold tracking-tight">
        {appTitle?.trim() ?? "Razzoozle"}
      </h1>

      {pairingCode ? (
        <>
          <p className="text-[2.6vh] font-medium text-[color:var(--color-field-ink)]/70">
            {t("display:enterCode", {
              defaultValue: "Enter this code in the Razzoozle admin on your phone",
            })}
          </p>

          <div className="rounded-3xl bg-white px-[6vw] py-[4vh] shadow-2xl">
            <span className="font-mono text-[14vh] leading-none font-black tracking-[0.15em] text-black tabular-nums">
              {pairingCode}
            </span>
          </div>

          <div className="mt-[1vh] flex flex-col items-center gap-[1.5vh]">
            <div className="rounded-2xl bg-white p-[1.4vh]">
              <QRCode className="h-[16vh] w-[16vh]" size={320} value={joinUrl} />
            </div>
            <p className="text-[1.8vh] font-semibold break-all text-[color:var(--color-field-ink)]/60">
              {joinUrl}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-[3vh]">
          <Loader className="h-[12vh]" />
          <p className="text-[3vh] font-bold text-[color:var(--color-field-ink)]/80">
            {isConnected
              ? t("display:registering", {
                  defaultValue: "Preparing display…",
                })
              : t("common:connecting")}
          </p>
        </div>
      )}

      <p className="mt-[2vh] flex items-center gap-[1.2vh] text-[2vh] font-semibold text-[color:var(--color-field-ink)]/60">
        <span className="relative flex h-[1.6vh] w-[1.6vh]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-field-ink)]/40" />
          <span className="relative inline-flex h-[1.6vh] w-[1.6vh] rounded-full bg-[color:var(--color-field-ink)]/40" />
        </span>
        {t("display:waitingForManager", {
          defaultValue: "Waiting for manager to pair…",
        })}
      </p>
    </div>
  )
}

export const Route = createFileRoute("/display/")({
  component: DisplayRegisterPage,
})
