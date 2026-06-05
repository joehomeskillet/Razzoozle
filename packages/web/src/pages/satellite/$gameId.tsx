import { EVENTS } from "@razzia/common/constants"
import GameWrapper from "@razzia/web/features/game/components/GameWrapper"
import {
  socketClient,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerGameSession } from "@razzia/web/features/game/hooks/useManagerGameSession"
import { createFileRoute, useParams, useSearch } from "@tanstack/react-router"
import { useEffect } from "react"
import { z } from "zod"

// The satellite is a display-only "kiosk" client: a Raspberry Pi wired to a
// beamer/TV renders this route fullscreen, while the real manager drives the
// game from their phone. Auth is NOT enforced at the route level (this route is
// intentionally outside the (auth) layout); instead the satellite authenticates
// over socket.io using a token carried in the handshake (the canonical
// `SATELLITE_TOKEN_HEADER`/storage-key live in socket-context).

const searchSchema = z.object({
  // `?satellite=true` signals that route-level auth is intentionally skipped;
  // the socket.io token is the only credential.
  satellite: z.coerce.boolean().optional(),
  // Token may be supplied via the URL (kiosk URL baked into the Pi image) or
  // fall back to a build-time env var.
  token: z.coerce.string().optional(),
})

const resolveSatelliteToken = (tokenParam?: string): string =>
  tokenParam ?? import.meta.env.VITE_SATELLITE_TOKEN ?? ""

const SatelliteManagerPage = () => {
  const { gameId: gameIdParam } = useParams({ from: "/satellite/$gameId" })
  const { token } = useSearch({ from: "/satellite/$gameId" })
  const { socket } = useSocket()

  const satelliteToken = resolveSatelliteToken(token)

  // Drive the TV into fullscreen on the Pi's kiosk browser. Best-effort: some
  // browsers require a user gesture, but Chromium kiosk mode (--kiosk) already
  // boots fullscreen, so a rejected promise here is harmless.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {
      /* Fullscreen not permitted without a gesture; kiosk flag covers this */
    })
  }, [])

  // Attach the satellite token to the socket handshake so the server can grant
  // manager privileges to this display without a typed password. We expose the
  // token both as a handshake `auth` field and as a transport header so the
  // server-side validator (separate WP) can read whichever it prefers.
  const { status, CurrentComponent } = useManagerGameSession(gameIdParam, {
    onConnect: () => {
      socket.auth = {
        ...(socket.auth as Record<string, unknown>),
        satelliteToken,
      }

      // Authenticate this socket as a manager-equivalent display using the token.
      socket.emit(EVENTS.MANAGER.AUTH, satelliteToken)
    },
  })

  // Render the manager presentation chrome (background + question counter +
  // rejoin QR) with `controls={false}`, so GameWrapper suppresses every manager
  // interactive control (auto-advance toggle, low-latency health, display
  // pairing panel, fullscreen button); we also pass NO onNext/onBack handlers,
  // so the skip/back buttons are absent too — the phone is the controller, the
  // satellite is a pure display.
  return (
    <GameWrapper statusName={status?.name} manager controls={false}>
      {status && CurrentComponent && (
        <CurrentComponent data={status.data as never} />
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
