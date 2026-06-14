// Game-master control over the LIVE socket server, as a manager-equivalent
// client. Mirrors the web client's handshake exactly (socket.io-client, path
// "/ws", `auth: { clientId }`) and drives the documented manager flow:
//
//   connect -> MANAGER.AUTH(password) -> [MANAGER.CONFIG]
//           -> GAME.CREATE(quizId)    -> [MANAGER.GAME_CREATED {gameId,inviteCode}]
//           -> START_GAME / NEXT_QUESTION / SHOW_LEADERBOARD / ABORT_QUIZ / ADD_BOTS
//
// All event names + payload shapes come from @razzia/common (EVENTS + the typed
// ClientToServer/ServerToClient maps) — nothing is hardcoded. A single
// long-lived connection per MCP process holds the manager session so the
// presenter/beamer (a socket client reflecting game state) stays paired to the
// game this controller created. The manager password is read from game.json and
// NEVER returned through a tool result or logged.
import { EVENTS } from "@razzia/common/constants"
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import type { Player } from "@razzia/common/types/game"
import type { Status, StatusDataMap } from "@razzia/common/types/game/status"
import { io, type Socket } from "socket.io-client"
import { v4 as uuidv4 } from "uuid"
import { getManagerPassword } from "./config-store.js"

type ManagerSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const SOCKET_URL = process.env.RAHOOT_SOCKET_URL ?? "http://127.0.0.1:3010"
const SOCKET_PATH = process.env.RAHOOT_SOCKET_PATH ?? "/ws"
// How long to wait for the auth -> CONFIG ack and the CREATE -> GAME_CREATED ack.
const OP_TIMEOUT_MS = Number(process.env.RAHOOT_OP_TIMEOUT_MS ?? 15_000)

export interface GameState {
  connected: boolean
  authenticated: boolean
  gameId: string | null
  pin: string | null // inviteCode the players type to join
  started: boolean
  // Latest manager-facing status (phase) + its data, from STATUS_UPDATE.
  status: Status | null
  statusData: StatusDataMap[Status] | null
  // Best-effort current/total question, from GAME.UPDATE_QUESTION.
  currentQuestion: number | null
  totalQuestions: number | null
  totalPlayers: number
  players: Player[]
  lastError: string | null
}

// A single manager session. One per MCP process; lazily connected on first use
// and kept open so the game it created stays live for the presenter/beamer.
class GameController {
  private socket: ManagerSocket | null = null
  // Stable per-process identity (the auth/reconnect guarantee keys on this).
  private readonly clientId = uuidv4()

  private state: GameState = {
    connected: false,
    authenticated: false,
    gameId: null,
    pin: null,
    started: false,
    status: null,
    statusData: null,
    currentQuestion: null,
    totalQuestions: null,
    totalPlayers: 0,
    players: [],
    lastError: null,
  }

  getState(): GameState {
    return {
      ...this.state,
      // Defensive copy so a caller can't mutate our roster.
      players: this.state.players.map((p) => ({ ...p })),
    }
  }

  private ensureSocket(): ManagerSocket {
    if (this.socket) {
      return this.socket
    }

    const socket: ManagerSocket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ["websocket", "polling"],
      auth: { clientId: this.clientId },
    })

    socket.on("connect", () => {
      this.state.connected = true
    })

    socket.on("disconnect", () => {
      this.state.connected = false
      this.state.authenticated = false
    })

    // ── Manager session signals ────────────────────────────────────────────
    socket.on(EVENTS.MANAGER.UNAUTHORIZED, () => {
      this.state.authenticated = false
      this.state.lastError = "manager:unauthorized"
    })

    socket.on(EVENTS.MANAGER.ERROR_MESSAGE, (message) => {
      this.state.lastError = message
    })

    socket.on(EVENTS.GAME.ERROR_MESSAGE, (message) => {
      this.state.lastError = message
    })

    socket.on(EVENTS.MANAGER.GAME_CREATED, ({ gameId, inviteCode }) => {
      this.state.gameId = gameId
      this.state.pin = inviteCode
      this.state.started = false
    })

    // ── Live game state ─────────────────────────────────────────────────────
    socket.on(EVENTS.MANAGER.STATUS_UPDATE, ({ status, data }) => {
      this.state.status = status
      this.state.statusData = data

      // SHOW_START / SHOW_QUESTION etc. all imply the round has begun.
      if (status !== "SHOW_ROOM" && status !== "WAIT") {
        this.state.started = true
      }
    })

    socket.on(EVENTS.GAME.STATUS, ({ name, data }) => {
      this.state.status = name
      this.state.statusData = data
    })

    socket.on(EVENTS.GAME.UPDATE_QUESTION, ({ current, total }) => {
      this.state.currentQuestion = current
      this.state.totalQuestions = total
    })

    socket.on(EVENTS.GAME.TOTAL_PLAYERS, (count) => {
      this.state.totalPlayers = count
    })

    socket.on(EVENTS.MANAGER.NEW_PLAYER, (player) => {
      const idx = this.state.players.findIndex((p) => p.id === player.id)

      if (idx === -1) {
        this.state.players.push(player)
      } else {
        this.state.players[idx] = player
      }

      this.state.totalPlayers = this.state.players.length
    })

    socket.on(EVENTS.MANAGER.REMOVE_PLAYER, (playerId) => {
      this.state.players = this.state.players.filter((p) => p.id !== playerId)
      this.state.totalPlayers = this.state.players.length
    })

    socket.on(EVENTS.MANAGER.PLAYER_KICKED, (playerId) => {
      this.state.players = this.state.players.filter((p) => p.id !== playerId)
      this.state.totalPlayers = this.state.players.length
    })

    // Reconnect recovery: the server replays the manager's full view.
    socket.on(
      EVENTS.MANAGER.SUCCESS_RECONNECT,
      ({ gameId, status, players }) => {
        this.state.gameId = gameId
        this.state.status = status.name
        this.state.statusData = status.data
        this.state.players = players
        this.state.totalPlayers = players.length
        this.state.authenticated = true
      },
    )

    socket.on(EVENTS.GAME.RESET, (message) => {
      this.state.lastError = message
      this.state.started = false
      this.state.gameId = null
      this.state.pin = null
      this.state.players = []
      this.state.totalPlayers = 0
    })

    this.socket = socket

    return socket
  }

  // Connect (idempotent) and authenticate as manager. The auth ack is
  // MANAGER.CONFIG (success) or MANAGER.ERROR_MESSAGE / UNAUTHORIZED (failure).
  // The password is read here and discarded; it never enters returned state.
  async connectAndAuth(): Promise<void> {
    const socket = this.ensureSocket()

    if (!socket.connected) {
      await new Promise<void>((resolvePromise, reject) => {
        const onErr = (err: Error) => {
          cleanup()
          reject(new Error(`socket connect failed: ${err.message}`))
        }
        const onConn = () => {
          cleanup()
          resolvePromise()
        }
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error(`socket connect timed out after ${OP_TIMEOUT_MS}ms`))
        }, OP_TIMEOUT_MS)
        const cleanup = () => {
          clearTimeout(timer)
          socket.off("connect", onConn)
          socket.off("connect_error", onErr)
        }
        socket.once("connect", onConn)
        socket.once("connect_error", onErr)
        socket.connect()
      })
    }

    if (this.state.authenticated) {
      return
    }

    const password = getManagerPassword()

    await new Promise<void>((resolvePromise, reject) => {
      const onConfig = () => {
        cleanup()
        this.state.authenticated = true
        this.state.lastError = null
        resolvePromise()
      }
      const onError = (message: string) => {
        cleanup()
        reject(new Error(message))
      }
      const onUnauthorized = () => {
        cleanup()
        reject(new Error("manager:unauthorized"))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`auth timed out after ${OP_TIMEOUT_MS}ms`))
      }, OP_TIMEOUT_MS)
      const cleanup = () => {
        clearTimeout(timer)
        socket.off(EVENTS.MANAGER.CONFIG, onConfig)
        socket.off(EVENTS.MANAGER.ERROR_MESSAGE, onError)
        socket.off(EVENTS.MANAGER.UNAUTHORIZED, onUnauthorized)
      }
      socket.once(EVENTS.MANAGER.CONFIG, onConfig)
      socket.once(EVENTS.MANAGER.ERROR_MESSAGE, onError)
      socket.once(EVENTS.MANAGER.UNAUTHORIZED, onUnauthorized)
      socket.emit(EVENTS.MANAGER.AUTH, password)
    })
  }

  // Create a game for `quizId` and wait for GAME_CREATED. Returns the pin
  // (inviteCode players type) + gameId. The presenter/beamer paired to this
  // game then reflects its state. Auth is ensured first.
  async startGame(quizId: string): Promise<{ gameId: string; pin: string }> {
    await this.connectAndAuth()

    const socket = this.socket

    if (!socket) {
      throw new Error("socket not initialised")
    }

    // Reset per-game state so a previous game's roster/pin doesn't leak.
    this.state.players = []
    this.state.totalPlayers = 0
    this.state.status = null
    this.state.statusData = null
    this.state.currentQuestion = null
    this.state.totalQuestions = null
    this.state.started = false
    this.state.gameId = null
    this.state.pin = null

    return new Promise<{ gameId: string; pin: string }>(
      (resolvePromise, reject) => {
        const onCreated = ({
          gameId,
          inviteCode,
        }: {
          gameId: string
          inviteCode: string
        }) => {
          cleanup()
          this.state.gameId = gameId
          this.state.pin = inviteCode
          resolvePromise({ gameId, pin: inviteCode })
        }
        const onError = (message: string) => {
          cleanup()
          reject(new Error(message))
        }
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error(`game create timed out after ${OP_TIMEOUT_MS}ms`))
        }, OP_TIMEOUT_MS)
        const cleanup = () => {
          clearTimeout(timer)
          socket.off(EVENTS.MANAGER.GAME_CREATED, onCreated)
          socket.off(EVENTS.GAME.ERROR_MESSAGE, onError)
        }
        socket.once(EVENTS.MANAGER.GAME_CREATED, onCreated)
        socket.once(EVENTS.GAME.ERROR_MESSAGE, onError)
        socket.emit(EVENTS.GAME.CREATE, quizId)
      },
    )
  }

  // Begin the first round (lobby -> question 1). Fire-and-forget: the server
  // drives the cooldown + first SELECT_ANSWER; the new phase arrives via
  // STATUS_UPDATE and is reflected in getState().
  begin(): void {
    this.requireGame().emit(EVENTS.MANAGER.START_GAME, {
      gameId: this.state.gameId!,
    })
    this.state.started = true
  }

  nextQuestion(): void {
    this.requireGame().emit(EVENTS.MANAGER.NEXT_QUESTION, {
      gameId: this.state.gameId!,
    })
  }

  showLeaderboard(): void {
    this.requireGame().emit(EVENTS.MANAGER.SHOW_LEADERBOARD, {
      gameId: this.state.gameId!,
    })
  }

  abort(): void {
    this.requireGame().emit(EVENTS.MANAGER.ABORT_QUIZ, {
      gameId: this.state.gameId!,
    })
  }

  // Sim mode only: the server REFUSES this unless RAHOOT_SIM_MODE === "1" (it
  // replies MANAGER.ERROR_MESSAGE "errors:manager.simModeDisabled"). We send the
  // flat {gameId,count} payload the server expects (NOT a {data} envelope).
  addBots(count: number): void {
    this.requireGame().emit(EVENTS.MANAGER.ADD_BOTS, {
      gameId: this.state.gameId!,
      count,
    })
  }

  setTheme(theme: unknown): void {
    // SET_THEME is auth-gated; this lets a game master live-update the theme on
    // every connected client. The file-side set_theme tool persists it too.
    this.requireAuth().emit(
      EVENTS.MANAGER.SET_THEME,
      theme as Parameters<
        ClientToServerEvents[typeof EVENTS.MANAGER.SET_THEME]
      >[0],
    )
  }

  disconnect(): void {
    if (this.socket?.connected) {
      // Leave the game cleanly first so the server arms its grace window rather
      // than seeing an abrupt drop.
      if (this.state.gameId) {
        this.socket.emit(EVENTS.MANAGER.LEAVE, { gameId: this.state.gameId })
      }

      this.socket.disconnect()
    }
  }

  private requireAuth(): ManagerSocket {
    if (!this.socket || !this.state.connected || !this.state.authenticated) {
      throw new Error(
        "not authenticated — call connectAndAuth / start_game first",
      )
    }

    return this.socket
  }

  private requireGame(): ManagerSocket {
    const socket = this.requireAuth()

    if (!this.state.gameId) {
      throw new Error("no active game — call start_game first")
    }

    return socket
  }
}

// One controller per MCP process (the stdio server is single-tenant).
export const gameController = new GameController()
