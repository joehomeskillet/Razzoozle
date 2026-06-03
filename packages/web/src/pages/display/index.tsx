import { EVENTS } from "@razzia/common/constants"
import Loader from "@razzia/web/components/Loader"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { QRCodeSVG } from "qrcode.react"
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
//
// The DISPLAY.* socket events live in the shared `common`/`socket` packages
// (sibling work-package). To keep this UI work additive and decoupled from the
// exact shape of that typed surface, we reference the event names defensively
// (with string fallbacks) and emit through a loosely-typed socket handle — the
// same pattern AddSatellite.tsx already uses for `manager:pairSatellite`.

// Resolve the DISPLAY.* event names whether or not `EVENTS.DISPLAY` has shipped
// yet. The string literals match the agreed wire contract
// ("display:register" / "display:pairSuccess" / "display:registered").
type DisplayEventName = string
const DISPLAY_EVENTS = (
  EVENTS as unknown as {
    DISPLAY?: {
      REGISTER?: DisplayEventName
      PAIR_SUCCESS?: DisplayEventName
      REGISTERED?: DisplayEventName
    }
  }
).DISPLAY

const DISPLAY_REGISTER: DisplayEventName =
  DISPLAY_EVENTS?.REGISTER ?? "display:register"
const DISPLAY_PAIR_SUCCESS: DisplayEventName =
  DISPLAY_EVENTS?.PAIR_SUCCESS ?? "display:pairSuccess"
const DISPLAY_REGISTERED: DisplayEventName =
  DISPLAY_EVENTS?.REGISTERED ?? "display:registered"

// Payload the server returns once the display socket has a pairing code, and the
// payload it pushes when the manager successfully pairs us to a game.
interface RegisteredPayload {
  pairingCode?: string
}
interface PairSuccessPayload {
  gameId?: string
}

const DisplayRegisterPage = () => {
  const navigate = useNavigate()
  const { socket, isConnected } = useSocket()
  const { t } = useTranslation()
  const [pairingCode, setPairingCode] = useState<string | null>(null)

  // Best-effort fullscreen. Chromium `--kiosk` already boots fullscreen, so a
  // rejected promise here (no user gesture) is harmless.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* fullscreen needs a gesture in non-kiosk browsers; ignore */
    })
  }, [])

  // Register as a display as soon as the socket is connected. The server replies
  // with a pairing code. Re-runs on reconnect so a flaky network re-registers.
  useEffect(() => {
    if (!isConnected) {
      return
    }
    // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
    ;(socket as any).emit(DISPLAY_REGISTER)
  }, [socket, isConnected])

  // Some server builds hand the pairing code back synchronously in the ack of
  // the very first connect rather than waiting for `isConnected` to flip, so we
  // also (re)register on the raw connect event.
  useEvent("connect", () => {
    // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
    ;(socket as any).emit(DISPLAY_REGISTER)
  })

  // The server assigns this display a short pairing code to show on the beamer.
  useEvent(
    DISPLAY_REGISTERED as never,
    ((payload: RegisteredPayload) => {
      if (payload?.pairingCode) {
        setPairingCode(payload.pairingCode)
      }
    }) as never,
  )

  // Manager paired us to a game from their phone → render the game fullscreen.
  useEvent(
    DISPLAY_PAIR_SUCCESS as never,
    ((payload: PairSuccessPayload) => {
      if (!payload?.gameId) {
        return
      }

      navigate({
        to: "/display/play",
        search: { gameId: payload.gameId },
      })
    }) as never,
  )

  const joinUrl = `${window.location.origin}/manager`

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[3vh] px-[5vw] text-center">
      <h1 className="text-[6vh] leading-tight font-extrabold tracking-tight">
        Rahoot
      </h1>

      {pairingCode ? (
        <>
          <p className="text-[2.6vh] font-medium text-white/70">
            {t("display:enterCode", {
              defaultValue: "Enter this code in the Rahoot admin on your phone",
            })}
          </p>

          <div className="rounded-3xl bg-white px-[6vw] py-[4vh] shadow-2xl">
            <span className="font-mono text-[14vh] leading-none font-black tracking-[0.15em] text-black tabular-nums">
              {pairingCode}
            </span>
          </div>

          <div className="mt-[1vh] flex flex-col items-center gap-[1.5vh]">
            <div className="rounded-2xl bg-white p-[1.4vh]">
              <QRCodeSVG className="h-[16vh] w-[16vh]" value={joinUrl} />
            </div>
            <p className="text-[1.8vh] font-semibold break-all text-white/60">
              {joinUrl}
            </p>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-[3vh]">
          <Loader className="h-[12vh]" />
          <p className="text-[3vh] font-bold text-white/80">
            {isConnected
              ? t("display:registering", {
                  defaultValue: "Preparing display…",
                })
              : t("common:connecting")}
          </p>
        </div>
      )}

      <p className="mt-[2vh] flex items-center gap-[1.2vh] text-[2vh] font-semibold text-white/60">
        <span className="relative flex h-[1.6vh] w-[1.6vh]">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
          <span className="relative inline-flex h-[1.6vh] w-[1.6vh] rounded-full bg-white/80" />
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
