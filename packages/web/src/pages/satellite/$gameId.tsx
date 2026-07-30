import { EVENTS } from "@razzoozle/common/constants"
import { ExperienceDisplay } from "@razzoozle/web/features/game/components/display/ExperienceDisplay"
import GameWrapper from "@razzoozle/web/features/game/components/GameWrapper"
import {
  socketClient,
} from "@razzoozle/web/features/game/contexts/socket-context"
import { useManagerGameSession } from "@razzoozle/web/features/game/hooks/useManagerGameSession"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

// The satellite is a display-only "kiosk" client: a Raspberry Pi wired to a
// beamer/TV renders this route fullscreen, while the real manager drives the
// game from their phone. Auth is NOT enforced at the route level (this route is
// intentionally outside the (auth) layout); instead the satellite authenticates
// over socket.io using a token carried in the handshake (the canonical
// `SATELLITE_TOKEN_HEADER`/storage-key live in socket-context).
//
// WP #959 — satellite auth now works via two paths:
// 1. If the manager is logged in on a different tab, the sessionToken is shared
//    via localStorage and automatically included in the socket handshake by
//    socket-context.tsx. The satellite then authenticates as a manager and joins
//    display:{gameId} to receive the experience envelope.
// 2. If a satelliteToken is configured (Prod kiosk), it is also passed in the
//    handshake and provides a fallback authentication path.

const searchSchema = z.object({
  // `?satellite=true` signals that route-level auth is intentionally skipped;
  // the socket.io token is the only credential.
  satellite: z.coerce.boolean().optional(),
  // Bleibt im Schema: dokumentiert den Kiosk-URL-Contract (?token=...) und
  // verhindert, dass der Router den Param strippt — GELESEN wird der Token
  // modulglobal in socket-context.tsx (resolveSatelliteAuth), nicht hier.
  token: z.coerce.string().optional(),
})

const SatelliteManagerPage = () => {
  const { gameId: gameIdParam } = useParams({ from: "/satellite/$gameId" })

  // Drive the TV into fullscreen on the Pi's kiosk browser. Best-effort: some
  // browsers require a user gesture, but Chromium kiosk mode (--kiosk) already
  // boots fullscreen, so a rejected promise here is harmless.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* Fullscreen not permitted without a gesture; kiosk flag covers this */
    })
  }, [])

  // WP #959 — fire MANAGER.RECONNECT on SPA mount when the socket is already
  // connected (manager→satellite nav never re-fires `connect`, so without this
  // the 939B envelope resend never runs and the garden stays empty). Server joins
  // display:{gameId} + resends experience. Auth is now handled by the global
  // socket-context.tsx handshake (sessionToken via localStorage for cross-tab
  // scenarios, plus optional satelliteToken fallback).
  const { status, CurrentComponent, experienceTransition } =
    useManagerGameSession(gameIdParam, {
    reconnectIfConnected: true,
  })

  // Render the manager presentation chrome (background + question counter +
  // rejoin QR) with `controls={false}`, so GameWrapper suppresses every manager
  // interactive control (auto-advance toggle, low-latency health, display
  // pairing panel, fullscreen button); we also pass NO onNext/onBack handlers,
  // so the skip/back buttons are absent too — the phone is the controller, the
  // satellite is a pure display.
  return (
    <GameWrapper statusName={status?.name} manager controls={false}>
      {experienceTransition ? (
        <ExperienceDisplay data={experienceTransition} />
      ) : (
        status &&
        CurrentComponent && <CurrentComponent data={status.data as never} />
      )}
    </GameWrapper>
  )
}

export const Route = createFileRoute("/satellite/$gameId")({
  component: SatelliteManagerPage,
  validateSearch: searchSchema,
  onLeave: ({ params: { gameId } }) => {
    socketClient.emit(EVENTS.MANAGER.LEAVE, { gameId })
  },
})
