import { EVENTS } from "@razzia/common/constants"
import type { ThemeSlot } from "@razzia/common/constants"
import type {
  GameResult,
  GameUpdateQuestion,
  Player,
  QuizzWithId,
} from "@razzia/common/types/game"
import type { Status, StatusDataMap } from "@razzia/common/types/game/status"
import type { ManagerConfig } from "@razzia/common/types/manager"
import type { Theme } from "@razzia/common/types/theme"
import { Server as ServerIO, Socket as SocketIO } from "socket.io"

export type Server = ServerIO<ClientToServerEvents, ServerToClientEvents>

export type Socket = SocketIO<ClientToServerEvents, ServerToClientEvents>

export interface MessageWithoutStatus<T = unknown> {
  gameId?: string
  data: T
}

export interface MessageGameId {
  gameId?: string
}

// ---- Low-latency mode contracts (all OPTIONAL / additive) ----------------

// Why a server may accept or reject a submitted answer. Server-authoritative;
// the client only displays it. `ok` = counted, everything else = not counted.
export type AnswerAckReason =
  | "ok"
  | "duplicate"
  | "too_late"
  | "invalid_question"
  | "invalid_answer"

// Optional ack the server emits after receiving an answer (low-latency mode).
export interface AnswerAck {
  accepted: boolean
  reason: AnswerAckReason
  // Server receive timestamp (Date.now()). Authoritative scoring clock.
  serverReceivedAtMs: number
  // Echoes the per-tap id so the client can match ack ↔ submit (idempotency).
  clientMessageId?: string
}

// ---- Observability (low-latency health) ----------------------------------

// Kinds of client-measured sample the client can report to the server. RTT and
// clock-offset come from the clock-sync burst; ack latency is the time from a
// player tapping an answer to receiving its server ack. These are measured on
// the CLIENT (a one-way server ping has no observable round-trip), so the
// client reports them and the server aggregates per room for the host widget.
export type MetricKind = "rtt" | "clockOffset" | "answerAck"

// Client → server sample report. `value` is milliseconds. OPTIONAL/additive —
// only sent while low-latency mode is active; ignored by the server otherwise.
export interface MetricsReport {
  kind: MetricKind
  value: number
}

// One percentile bucket of a rolling sample buffer. Nulls mean "no samples yet"
// (the widget renders those as "—"). `count` is the live buffer size.
export interface MetricPercentiles {
  p50: number | null
  p95: number | null
  count: number
}

// Server → host compact health snapshot. Structural mirror of the server's
// metrics.snapshot() return — kept here as the wire contract so the common
// layer (and the web widget) can type it without importing from packages/socket.
export interface MetricsHealthSnapshot {
  rtt: MetricPercentiles
  clockOffset: MetricPercentiles
  answerAck: MetricPercentiles
  reconnectCount: number
  // Rejected-answer counts grouped by AnswerAckReason (only non-zero reasons).
  rejected: Record<string, number>
}

export interface ServerToClientEvents {
  connect: () => void

  // Game events
  [EVENTS.GAME.STATUS]: (_data: {
    name: Status
    data: StatusDataMap[Status]
  }) => void
  [EVENTS.GAME.SUCCESS_ROOM]: (_data: string) => void
  [EVENTS.GAME.SUCCESS_JOIN]: (_gameId: string) => void
  [EVENTS.GAME.TOTAL_PLAYERS]: (_count: number) => void
  [EVENTS.GAME.ERROR_MESSAGE]: (_message: string) => void
  [EVENTS.GAME.START_COOLDOWN]: () => void
  [EVENTS.GAME.COOLDOWN]: (_count: number) => void
  [EVENTS.GAME.RESET]: (_message: string) => void
  [EVENTS.GAME.UPDATE_QUESTION]: (_data: {
    current: number
    total: number
  }) => void
  [EVENTS.GAME.PLAYER_ANSWER]: (_count: number) => void

  // Player events
  [EVENTS.PLAYER.SUCCESS_RECONNECT]: (_data: {
    gameId: string
    status: { name: Status; data: StatusDataMap[Status] }
    player: { username: string; points: number }
    currentQuestion: GameUpdateQuestion
    // Low-latency mode: true if this player already answered the current
    // question (resume shows "answered" instead of re-enabling buttons).
    // OPTIONAL — absent in normal mode; client must default to false.
    alreadyAnswered?: boolean
  }) => void
  [EVENTS.PLAYER.UPDATE_LEADERBOARD]: (_data: { leaderboard: Player[] }) => void
  // Low-latency mode: optional ack for a submitted answer.
  [EVENTS.PLAYER.ANSWER_ACK]: (_ack: AnswerAck) => void

  // Manager events
  [EVENTS.MANAGER.SUCCESS_RECONNECT]: (_data: {
    gameId: string
    status: { name: Status; data: StatusDataMap[Status] }
    players: Player[]
    currentQuestion: GameUpdateQuestion
  }) => void
  [EVENTS.MANAGER.CONFIG]: (_config: ManagerConfig) => void
  [EVENTS.QUIZZ.DATA]: (_quizz: QuizzWithId) => void
  [EVENTS.MANAGER.GAME_CREATED]: (_data: {
    gameId: string
    inviteCode: string
  }) => void
  [EVENTS.MANAGER.STATUS_UPDATE]: (_data: {
    status: Status
    data: StatusDataMap[Status]
  }) => void
  [EVENTS.MANAGER.NEW_PLAYER]: (_player: Player) => void
  [EVENTS.MANAGER.REMOVE_PLAYER]: (_playerId: string) => void
  [EVENTS.MANAGER.ERROR_MESSAGE]: (_message: string) => void
  [EVENTS.MANAGER.PLAYER_KICKED]: (_playerId: string) => void
  [EVENTS.MANAGER.UNAUTHORIZED]: () => void

  // Theme events
  [EVENTS.MANAGER.THEME]: (_theme: Theme) => void
  [EVENTS.MANAGER.SET_THEME_SUCCESS]: (_theme: Theme) => void
  [EVENTS.MANAGER.BACKGROUND_UPLOADED]: (_data: {
    slot: ThemeSlot
    path: string
  }) => void
  [EVENTS.MANAGER.THEME_ERROR]: (_message: string) => void

  // Quizz events
  [EVENTS.QUIZZ.SAVE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.UPDATE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.ERROR]: (_message: string) => void

  // Results events
  [EVENTS.RESULTS.DATA]: (_result: GameResult) => void

  // Display (satellite) events
  [EVENTS.DISPLAY.REGISTERED]: (_data: { code: string }) => void
  [EVENTS.DISPLAY.PAIR_SUCCESS]: (_data: { gameId: string }) => void
  [EVENTS.DISPLAY.PAIR_ERROR]: (_message: string) => void

  // Low-latency mode: UI-only clock sync. Server echoes the client's monotonic
  // send timestamp and adds its own wall clock so the client can derive offset.
  [EVENTS.CLOCK.PONG]: (_data: {
    clientSendMonoMs: number
    serverNowMs: number
  }) => void

  // Low-latency observability: compact health snapshot for the host widget.
  // Only emitted to a subscribed manager while low-latency mode is enabled.
  [EVENTS.METRICS.HEALTH]: (_snapshot: MetricsHealthSnapshot) => void
}

export interface ClientToServerEvents {
  // Manager actions
  [EVENTS.GAME.CREATE]: (_quizzId: string) => void
  [EVENTS.MANAGER.AUTH]: (_password: string) => void
  [EVENTS.MANAGER.RECONNECT]: (_message: { gameId: string }) => void
  [EVENTS.MANAGER.LEAVE]: (_message: { gameId: string }) => void
  [EVENTS.MANAGER.KICK_PLAYER]: (_message: {
    gameId: string
    playerId: string
  }) => void
  [EVENTS.MANAGER.START_GAME]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.SET_AUTO]: (_message: {
    gameId?: string
    auto: boolean
  }) => void
  [EVENTS.MANAGER.ABORT_QUIZ]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.NEXT_QUESTION]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.SHOW_LEADERBOARD]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.GET_CONFIG]: () => void
  [EVENTS.MANAGER.LOGOUT]: () => void

  // Display (satellite) actions
  [EVENTS.DISPLAY.REGISTER]: () => void
  [EVENTS.DISPLAY.PAIR]: (_data: {
    code: string
    managerPassword: string
    gameId: string
  }) => void
  [EVENTS.DISPLAY.DISCONNECT]: (_data: { code: string }) => void

  // Theme actions
  [EVENTS.MANAGER.GET_THEME]: () => void
  [EVENTS.MANAGER.SET_THEME]: (_theme: Theme) => void
  [EVENTS.MANAGER.UPLOAD_BACKGROUND]: (_data: {
    slot: ThemeSlot
    dataUrl: string
  }) => void

  // Quizz actions
  [EVENTS.QUIZZ.GET]: (_id: string) => void
  [EVENTS.QUIZZ.SAVE]: (_quizz: unknown) => void
  [EVENTS.QUIZZ.UPDATE]: (_data: QuizzWithId) => void
  [EVENTS.QUIZZ.DELETE]: (_id: string) => void

  // Player actions
  [EVENTS.PLAYER.JOIN]: (_inviteCode: string) => void
  [EVENTS.PLAYER.LOGIN]: (
    _message: MessageWithoutStatus<{ username: string }>,
  ) => void
  [EVENTS.PLAYER.RECONNECT]: (_message: {
    gameId: string
    // Low-latency mode: last server sequence the client saw, so resume can
    // detect a stale view. OPTIONAL — omitted by old/normal-mode clients.
    lastServerSeq?: number
  }) => void
  [EVENTS.PLAYER.LEAVE]: (_message: { gameId: string }) => void
  [EVENTS.PLAYER.SELECTED_ANSWER]: (
    _message: MessageWithoutStatus<{
      answerKey: number
      // Low-latency mode: per-tap dedup id. OPTIONAL — server treats a missing
      // id as today (dedup by player+question only).
      clientMessageId?: string
    }>,
  ) => void

  // Low-latency mode: UI-only clock sync ping (client monotonic clock).
  [EVENTS.CLOCK.PING]: (_data: { clientSendMonoMs: number }) => void

  // Low-latency observability: client reports a measured sample (RTT / offset /
  // ack latency). Folded into the reporter's own game room. OPTIONAL/additive.
  [EVENTS.METRICS.REPORT]: (_report: MetricsReport) => void
  // Low-latency observability: a manager opts in to health snapshots for its
  // own game. The server replies with periodic, throttled HEALTH snapshots.
  [EVENTS.METRICS.SUBSCRIBE]: (_message: MessageGameId) => void

  // Results actions
  [EVENTS.RESULTS.GET]: (_id: string) => void
  [EVENTS.RESULTS.DELETE]: (_id: string) => void

  // Common
  disconnect: () => void
}
