import {
  computeClockOffset,
  type ClockSample,
} from "@razzoozle/common/utils/clock-sync"
import { EVENTS } from "@razzoozle/common/constants"
import type {
  SocketAuthPayload,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzoozle/common/types/game/socket"
import { useLowLatencyStore } from "@razzoozle/web/features/game/stores/lowLatency"
import { useManagerStore } from "@razzoozle/web/features/game/stores/manager"
import { monoNow } from "@razzoozle/web/features/game/utils/monoNow"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
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
export const getClientId = (): string => {
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

// Read the game backend preference from hostname pin, localStorage, env, or default to Rust.
// A `rust.*` / `node.*` hostname hard-pins the backend for the twin-test domains and
// overrides localStorage. Exported so the dev panel can query the current backend choice.
export function getGameBackend(): "rust" | "node" {
  try {
    if (typeof window === "undefined") {
      return "rust"
    }
    // Hostname pin overrides localStorage: the twin-test domains (rust.razzoozle.xyz
    // now, node.* prepared) must deterministically keep their backend, otherwise the
    // Node-vs-Rust A/B comparisons are not trustworthy.
    const host = window.location.hostname
    if (host.startsWith("rust.")) return "rust"
    if (host.startsWith("node.")) return "node"
    const stored = localStorage.getItem("gameBackend")
    if (stored === "node" || stored === "rust") {
      return stored
    }
  } catch {
    // Fail silently
  }
  const envDefault = (import.meta.env.VITE_DEFAULT_BACKEND as string | undefined) ?? "rust"
  return envDefault === "node" ? "node" : "rust"
}

// Compute the socket.io path based on the chosen backend. Caddy routes:
// - Node backend: "/" → :3011, socket.io served at "/ws" (Node's configured path)
// - Rust backend: "/_rust/*" → :3012 (prefix stripped), socket.io at "/socket.io/",
//   so the browser hits "/_rust/socket.io/". (Verified: Node=/ws, Rust=/_rust/socket.io/.)
const chosenBackend = getGameBackend()
const socketPath = chosenBackend === "rust" ? "/_rust/socket.io/" : "/ws"

export const socketClient: TypedSocket = io("/", {
  path: socketPath,
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
  // Also include sessionToken if the manager has authenticated via HTTP /api/login.
  // socket.io-client v4 `auth` function form is CALLBACK-based: it receives a
  // callback and MUST invoke it with the payload. A return-based `() => payload`
  // silently never fires the callback, so the client never sends the socket.io
  // CONNECT (`40`) packet — engine.io connects (ws/poll opens, pings flow) but the
  // namespace never connects, `isConnected` never flips, and the login splash hangs
  // forever in every real browser. (Node/object-form auth is unaffected, which is
  // why backend/curl smokes passed.) Regression from dd33e187 (W0-A6 login).
  auth: (cb) => {
    const store = useManagerStore.getState()
    const payload: SocketAuthPayload = { clientId }

    if (satelliteAuth.token) {
      payload.satelliteToken = satelliteAuth.token
    }

    if (store.token) {
      payload.sessionToken = store.token
    }

    cb(payload)
  },
  // Also expose the token as an HTTP handshake header (`X-Satellite-Token`) on
  // the initial polling request, so a server-side validator can read whichever
  // source it prefers. Only set when this client actually booted as a satellite.
  ...(satelliteAuth.token
    ? { extraHeaders: { [SATELLITE_TOKEN_HEADER]: satelliteAuth.token } }
    : {}),
})

// Number of consecutive failed connect/reconnect attempts before we surface the
// "connection lost" notice. A single dropped frame on flaky wifi recovers within
// one retry, so we wait for a few in a row to avoid flashing the banner on every
// transient blip. The socket keeps retrying forever regardless (reconnection:
// Infinity) — this only governs when the user-facing notice appears.
const CONNECTION_NOTICE_THRESHOLD = 3

// Stable toast id so repeated failures update the SAME loading toast instead of
// stacking, and the reconnect handler can dismiss exactly this one.
const CONNECTION_TOAST_ID = "connection-status"

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
  const { t } = useTranslation()
  // Counts consecutive failed connect/reconnect attempts; reset to 0 on any
  // successful (re)connect. Tracked in a ref so the socket event handlers (bound
  // once) read the live value without re-subscribing on every change.
  const failedAttemptsRef = useRef(0)
  // True once the "connection lost" notice has been shown, so we only emit the
  // "restored" toast if we actually warned the user (no false "back online" pop
  // after a clean first connect).
  const noticeShownRef = useRef(false)

  // Keep the latest translator in a ref so the once-bound socket handlers always
  // format with the current language without re-binding listeners.
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    const showLostNotice = () => {
      failedAttemptsRef.current += 1

      if (
        failedAttemptsRef.current < CONNECTION_NOTICE_THRESHOLD ||
        noticeShownRef.current
      ) {
        return
      }

      noticeShownRef.current = true
      // A persistent loading toast (spinner, no auto-dismiss) — non-blocking:
      // the UI underneath stays interactive and the socket keeps retrying.
      toast.loading(
        tRef.current("errors:connection.lost", {
          defaultValue: "Verbindung verloren — versuche neu zu verbinden",
        }),
        { id: CONNECTION_TOAST_ID },
      )
    }

    const onConnect = () => {
      setIsConnected(true)

      // Only celebrate recovery if we had actually flagged a loss; a normal
      // first connect should be silent.
      if (noticeShownRef.current) {
        toast.success(
          tRef.current("errors:connection.restored", {
            defaultValue: "Verbindung wiederhergestellt",
          }),
          { id: CONNECTION_TOAST_ID, duration: 3000 },
        )
      }

      failedAttemptsRef.current = 0
      noticeShownRef.current = false
    }

    const onDisconnect = () => {
      setIsConnected(false)
      // A clean server-initiated close still leaves reconnection running; treat
      // the drop itself as the first failed "attempt" so a sustained outage
      // crosses the threshold and surfaces the notice.
      showLostNotice()
    }

    const onConnectError = (err: Error) => {
      console.error("Connection error:", err.message)
      showLostNotice()
    }

    socketClient.on("connect", onConnect)
    socketClient.on("disconnect", onDisconnect)
    socketClient.on("connect_error", onConnectError)
    // The socket.io Manager's own reconnection attempts also count toward the
    // threshold so a slow-to-recover link surfaces the notice even if the very
    // first connect_error was swallowed.
    socketClient.io.on("reconnect_attempt", showLostNotice)

    // #77: iOS/Android freeze on lock keeps the WS falsely "open" — socket.io
    // then never re-fires `connect`, so the token re-emit in $gameId.tsx never
    // runs. Force a hard reconnect on resume when we were hidden long enough
    // that the server (ping_timeout ~8s) may already have dropped us.
    let hiddenAtMs = 0
    const STALE_AFTER_MS = 10000 // > ping_interval (10s)
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtMs = Date.now()
        return
      }
      const wasHiddenMs = hiddenAtMs === 0 ? 0 : Date.now() - hiddenAtMs
      hiddenAtMs = 0
      if (!socketClient.connected) {
        socketClient.connect()
      } else if (wasHiddenMs > STALE_AFTER_MS) {
        socketClient.disconnect()
        socketClient.connect()
      }
    }
    const onOnline = () => {
      if (!socketClient.connected) socketClient.connect()
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && socketClient.connected) {
        socketClient.disconnect()
        socketClient.connect()
      } else if (!socketClient.connected) {
        socketClient.connect()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", onOnline)
    window.addEventListener("pageshow", onPageShow)

    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("pageshow", onPageShow)
      socketClient.off("connect", onConnect)
      socketClient.off("disconnect", onDisconnect)
      socketClient.off("connect_error", onConnectError)
      socketClient.io.off("reconnect_attempt", showLostNotice)
      // Dismiss any lingering notice so it doesn't outlive this provider.
      toast.dismiss(CONNECTION_TOAST_ID)
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

export const useEvent = <E extends keyof ServerToClientEvents>(
  event: E,
  callback: ServerToClientEvents[E],
) => {
  const { socket } = useSocket()

  useEffect(() => {
    // Bind on/off through a signature generic over the event map so the event
    // and its callback stay tied to the same `E`. socket.io's per-key overloads
    // can't be resolved against a still-generic `E`, so we narrow the methods
    // (not the callback to `any`) — the typed-socket contract is preserved.
    type Listen = (_event: E, _callback: ServerToClientEvents[E]) => void
    const on = socket.on.bind(socket) as Listen
    const off = socket.off.bind(socket) as Listen

    on(event, callback)

    return () => {
      off(event, callback)
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
