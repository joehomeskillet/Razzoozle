import {
  computeClockOffset,
  type ClockSample,
} from "@razzia/common/utils/clock-sync"
import { EVENTS } from "@razzia/common/constants"
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import { useLowLatencyStore } from "@razzia/web/features/game/stores/lowLatency"
import { monoNow } from "@razzia/web/features/game/utils/monoNow"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { io, Socket } from "socket.io-client"
import { v7 as uuid } from "uuid"

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Handshake header the satellite (Raspberry Pi kiosk display) uses to
// authenticate as a manager-equivalent display without a typed password. Kept
// in sync with the constant exported by the /satellite/$gameId route.
const SATELLITE_TOKEN_HEADER = "X-Satellite-Token"
const SATELLITE_TOKEN_STORAGE_KEY = "satellite_token"

interface SatelliteAuth {
  /** Token to send in the handshake, or `undefined` for normal clients. */
  token?: string
  /** True when the current client booted with `?satellite=true`. */
  enabled: boolean
}

// Detect a satellite boot from the URL and resolve its token. The satellite
// endpoint loads this app with `?satellite=true` and an optional `?token=...`
// (baked into the Pi's kiosk URL); the token is then persisted to localStorage
// so reconnects and in-app navigation keep authenticating. Normal clients have
// no `satellite` flag and therefore no token — they keep using password auth.
const resolveSatelliteAuth = (): SatelliteAuth => {
  try {
    if (typeof window === "undefined") {
      return { enabled: false }
    }

    const params = new URLSearchParams(window.location.search)
    const enabled = params.get("satellite") === "true"

    if (!enabled) {
      return { enabled: false }
    }

    const urlToken = params.get("token") ?? undefined

    if (urlToken) {
      localStorage.setItem(SATELLITE_TOKEN_STORAGE_KEY, urlToken)
      // Strip the token from the URL immediately so it can't leak via history,
      // logs, or referrer headers.
      params.delete("token")
      const stripped = `${window.location.pathname}${
        params.toString() ? `?${params}` : ""
      }`
      window.history.replaceState({}, "", stripped)
    }

    const token =
      urlToken ??
      localStorage.getItem(SATELLITE_TOKEN_STORAGE_KEY) ??
      (import.meta.env.VITE_SATELLITE_TOKEN as string | undefined) ??
      ""

    // Treat an empty token as "no token" so we never send an empty header.
    return { enabled, token: token === "" ? undefined : token }
  } catch {
    return { enabled: false }
  }
}

const satelliteAuth = resolveSatelliteAuth()

interface SocketContextValue {
  socket: TypedSocket
  isConnected: boolean
  clientId: string
  connect: () => void
  disconnect: () => void
  reconnect: () => void
}

const CLIENT_ID_KEY = "client_id"

const readCookie = (name: string): string | null => {
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)

  return match?.[1] ? decodeURIComponent(match[1]) : null
}

const writeCookie = (name: string, value: string) => {
  // 1-year persistent cookie so the player's identity survives a localStorage
  // clear / private-tab quirks — they keep their points/place on rejoin.
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${
    60 * 60 * 24 * 365
  }; path=/; SameSite=Lax`
}

// Durable client identity: stored in BOTH localStorage and a long-lived cookie,
// recovering from whichever survives, so a reconnect always re-binds the same
// player session (the reconnect guarantee keys on this id).
const getClientId = (): string => {
  try {
    const id =
      localStorage.getItem(CLIENT_ID_KEY) ?? readCookie(CLIENT_ID_KEY) ?? uuid()
    localStorage.setItem(CLIENT_ID_KEY, id)
    writeCookie(CLIENT_ID_KEY, id)

    return id
  } catch {
    return uuid()
  }
}

const clientId = getClientId()

export const socketClient: TypedSocket = io("/", {
  path: "/ws",
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  // Cap the backoff + add jitter so a venue-wide blip doesn't thundering-herd
  // the server with synchronized reconnects, and clients retry promptly.
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  // For satellite kiosks, carry the token in the handshake `auth` payload so the
  // server can grant manager privileges without a password prompt. Normal
  // clients only send `clientId` and continue to authenticate via password.
  auth: satelliteAuth.token
    ? { clientId, satelliteToken: satelliteAuth.token }
    : { clientId },
  // Also expose the token as an HTTP handshake header (`X-Satellite-Token`) on
  // the initial polling request, so a server-side validator can read whichever
  // source it prefers. Only set when this client actually booted as a satellite.
  ...(satelliteAuth.token
    ? { extraHeaders: { [SATELLITE_TOKEN_HEADER]: satelliteAuth.token } }
    : {}),
})

const SocketContext = createContext<SocketContextValue>({
  socket: socketClient,
  isConnected: false,
  clientId,
  connect: () => {
    /* Empty */
  },
  disconnect: () => {
    /* Empty */
  },
  reconnect: () => {
    /* Empty */
  },
})

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    socketClient.on("connect", () => setIsConnected(true))
    socketClient.on("disconnect", () => setIsConnected(false))
    socketClient.on("connect_error", (err) => {
      console.error("Connection error:", err.message)
    })

    return () => {
      socketClient.disconnect()
    }
  }, [])

  const connect = useCallback(() => {
    if (!socketClient.connected) {
      socketClient.connect()
    }
  }, [])

  const disconnect = useCallback(() => {
    if (socketClient.connected) {
      socketClient.disconnect()
    }
  }, [])

  const reconnect = useCallback(() => {
    socketClient.disconnect()
    socketClient.connect()
  }, [])

  return (
    <SocketContext.Provider
      value={{
        socket: socketClient,
        isConnected,
        clientId,
        connect,
        disconnect,
        reconnect,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)

// Re-exported so the satellite route (and any server-coordination code) can
// reference the same header/storage keys instead of redefining the strings.
export { SATELLITE_TOKEN_HEADER, SATELLITE_TOKEN_STORAGE_KEY, satelliteAuth }

export const useEvent = <E extends keyof ServerToClientEvents>(
  event: E,
  callback: ServerToClientEvents[E],
) => {
  const { socket } = useSocket()

  useEffect(() => {
    // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
    socket.on(event, callback as any)

    return () => {
      // oxlint-disable-next-line no-explicit-any, no-unsafe-argument
      socket.off(event, callback as any)
    }
  }, [socket, event, callback])
}

// Number of ping/pong samples to collect per sync burst. Capped so a venue-wide
// reconnect storm on flaky wifi can't amplify into a ping flood — we sample 5
// then go idle until the next re-sync trigger.
const CLOCK_SYNC_SAMPLES = 5
// Spacing between pings in a burst, so the samples are spread across slightly
// different network conditions instead of all hitting one congested instant.
const CLOCK_SYNC_INTERVAL_MS = 250
// Hard ceiling on a single round-trip; a pong slower than this is dropped as an
// outlier rather than poisoning the offset estimate.
const CLOCK_SYNC_TIMEOUT_MS = 2000

// UseClockSync — UI-only clock synchronisation for low-latency mode.
//
// When low-latency mode is detected (server-timing anchors present), this runs a
// single burst of CLOCK_SYNC_SAMPLES clock:ping → clock:pong round-trips, derives
// a robust median offset (outliers discarded) and publishes it to the
// low-latency store for the countdown to consume. It is purely a UI aid: the
// offset is NEVER sent to the server and NEVER influences scoring (scoring is
// server-receive-authoritative). When low-latency mode is off, this is a no-op
// and not a single ping is sent — normal mode is byte-identical.
export const useClockSync = (): void => {
  const { socket, isConnected } = useSocket()
  const active = useLowLatencyStore((s) => s.active)
  const setOffset = useLowLatencyStore((s) => s.setOffset)
  // Guards against overlapping bursts (e.g. a re-render while one is in flight).
  const runningRef = useRef(false)

  useEffect(() => {
    if (!active || !isConnected) {
      return
    }

    if (runningRef.current) {
      return
    }

    runningRef.current = true

    const samples: ClockSample[] = []
    // Maps an in-flight ping's send timestamp by its clientSendMonoMs key so the
    // pong handler can pair them and compute the recv timestamp.
    const pending = new Map<number, number>()
    let cancelled = false
    let sent = 0
    let intervalId: ReturnType<typeof setInterval> | undefined

    const finish = () => {
      if (cancelled) {
        return
      }

      cancelled = true

      if (intervalId !== undefined) {
        clearInterval(intervalId)
      }

      socket.off(EVENTS.CLOCK.PONG, onPong)
      runningRef.current = false

      const result = computeClockOffset(samples)

      if (result) {
        setOffset(result.offsetMs, result.rttMs)

        // Observability: report the measured RTT + clock offset so the host's
        // "Low Latency Health" widget can show room-wide percentiles. These are
        // UI-derived measurements only; they never influence scoring. Guarded so
        // a malformed result can't throw, and only sent in low-latency mode
        // (this burst only runs when `active`).
        if (Number.isFinite(result.rttMs)) {
          socket.emit(EVENTS.METRICS.REPORT, {
            kind: "rtt",
            value: result.rttMs,
          })
        }

        if (Number.isFinite(result.offsetMs)) {
          socket.emit(EVENTS.METRICS.REPORT, {
            kind: "clockOffset",
            value: result.offsetMs,
          })
        }
      }
    }

    const onPong = (
      data: Parameters<ServerToClientEvents[typeof EVENTS.CLOCK.PONG]>[0],
    ) => {
      // Crash-guard every field: a malformed/legacy pong must never throw.
      const clientSendMonoMs = data?.clientSendMonoMs
      const serverNowMs = data?.serverNowMs

      if (
        typeof clientSendMonoMs !== "number" ||
        typeof serverNowMs !== "number"
      ) {
        return
      }

      const sendAt = pending.get(clientSendMonoMs)

      if (sendAt === undefined) {
        return
      }

      pending.delete(clientSendMonoMs)

      const clientRecvMonoMs = monoNow()

      // Drop a stale pong whose round-trip blew the timeout ceiling.
      if (clientRecvMonoMs - sendAt <= CLOCK_SYNC_TIMEOUT_MS) {
        samples.push({
          clientSendMonoMs: sendAt,
          clientRecvMonoMs,
          serverNowMs,
        })
      }

      // Finish as soon as we have a full set of answers (or have run dry).
      if (samples.length >= CLOCK_SYNC_SAMPLES) {
        finish()
      }
    }

    socket.on(EVENTS.CLOCK.PONG, onPong)

    const sendPing = () => {
      if (cancelled) {
        return
      }

      const clientSendMonoMs = monoNow()
      pending.set(clientSendMonoMs, clientSendMonoMs)
      socket.emit(EVENTS.CLOCK.PING, { clientSendMonoMs })
      sent += 1

      if (sent >= CLOCK_SYNC_SAMPLES && intervalId !== undefined) {
        clearInterval(intervalId)
        intervalId = undefined
      }
    }

    // Fire the first ping immediately, then space out the rest.
    sendPing()
    intervalId = setInterval(sendPing, CLOCK_SYNC_INTERVAL_MS)

    // Backstop: never leave the burst hanging if some pongs are lost.
    const guardTimer = setTimeout(
      finish,
      CLOCK_SYNC_INTERVAL_MS * CLOCK_SYNC_SAMPLES + CLOCK_SYNC_TIMEOUT_MS,
    )

    return () => {
      clearTimeout(guardTimer)
      finish()
    }
    // We deliberately re-run only when activation / connection state flips, not
    // on every render. setOffset/socket are stable.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [active, isConnected, socket, setOffset])
}
