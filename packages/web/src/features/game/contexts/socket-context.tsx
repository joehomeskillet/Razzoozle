import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)"),
  )
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
    const id = localStorage.getItem(CLIENT_ID_KEY) ?? readCookie(CLIENT_ID_KEY) ?? uuid()
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
export {
  SATELLITE_TOKEN_HEADER,
  SATELLITE_TOKEN_STORAGE_KEY,
  satelliteAuth,
}

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
