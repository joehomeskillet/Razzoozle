import { EVENTS } from "@razzoozle/common/constants"
import type {
  SoundSlot,
  SubmissionCategory,
  ThemeSlot,
} from "@razzoozle/common/constants"
import type { AISettingsPublic, AITestResult } from "@razzoozle/common/types/ai"
import type { CatalogEntry } from "@razzoozle/common/types/catalog"
import type {
  EndGamePayload,
  GameResult,
  GamesDataPayload,
  GameUpdateQuestion,
  Player,
  Question,
  Quizz,
  QuizzWithId,
  SharedResult,
} from "@razzoozle/common/types/game"
import type { Status, StatusDataMap } from "@razzoozle/common/types/game/status"
import type { ManagerConfig } from "@razzoozle/common/types/manager"
import type { Submission } from "@razzoozle/common/types/submission"
import type {
  Theme,
  ThemeRevision,
  ThemeTemplate,
} from "@razzoozle/common/types/theme"
import type { MediaMeta } from "@razzoozle/common/types/media"
import type { InstalledPlugin } from "@razzoozle/common/validators/plugin"
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
  [EVENTS.GAME.SUCCESS_ROOM]: (_data: { gameId: string; requireIdentifier?: boolean }) => void
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
  [EVENTS.MANAGER.PLAYER_RECONNECTED]: (_data: {
    id: string
    username: string
  }) => void
  // Manager plugin system (server -> client). Broadcast of the installed plugin
  // list whenever it changes (install / remove / config patch).
  [EVENTS.MANAGER.PLUGIN_CONFIG]: (_plugins: InstalledPlugin[]) => void
  // Media-manager events (server -> client)
  [EVENTS.MEDIA.DATA]: (_media: MediaMeta[]) => void
  [EVENTS.MEDIA.UPLOAD_SUCCESS]: () => void
  [EVENTS.MEDIA.ERROR]: (_message: string) => void

  // Theme events
  [EVENTS.MANAGER.THEME]: (_theme: Theme) => void
  [EVENTS.MANAGER.SET_THEME_SUCCESS]: (_theme: Theme) => void
  // Skeleton CSS/JS text-edit success (mirrors SET_THEME_SUCCESS).
  [EVENTS.MANAGER.SET_SKELETON_ASSET_SUCCESS]: (_data: {
    kind: "css" | "js"
  }) => void
  // Reset-to-default acknowledgement (the new default theme rides the THEME broadcast).
  [EVENTS.MANAGER.RESET_SKELETON_SUCCESS]: () => void
  [EVENTS.MANAGER.BACKGROUND_UPLOADED]: (_data: {
    slot: ThemeSlot
    path: string
  }) => void
  // Per-slot sound upload ack (mirrors BACKGROUND_UPLOADED). `assetRef` is the
  // served path the client writes into draft.sounds[slot].
  [EVENTS.MANAGER.SOUND_UPLOADED]: (_data: {
    slot: SoundSlot
    assetRef: string
  }) => void
  [EVENTS.MANAGER.THEME_ERROR]: (_message: string) => void

  // Theme-template events (server -> client). DATA carries the full
  // ThemeTemplate[] so the picker can apply a template without a second fetch.
  [EVENTS.THEME_TEMPLATE.DATA]: (_t: ThemeTemplate[]) => void
  [EVENTS.THEME_TEMPLATE.SAVE_SUCCESS]: () => void
  [EVENTS.THEME_TEMPLATE.ERROR]: (_m: string) => void

  // Running-games admin panel (server -> client): the full GameSummary[] list.
  [EVENTS.MANAGER.GAMES_DATA]: (_games: GamesDataPayload) => void

  // Question-submission events (feature #5)
  [EVENTS.MANAGER.SUBMISSIONS_DATA]: (_submissions: Submission[]) => void
  [EVENTS.MANAGER.SUBMISSION_ERROR]: (_message: string) => void
  [EVENTS.MANAGER.SUBMIT_SUCCESS]: () => void
  [EVENTS.MANAGER.IMAGE_GENERATED]: (_data: { url: string }) => void
  [EVENTS.MANAGER.IMAGE_ERROR]: (_message: string) => void
  // #23 media pipeline (server -> client). EDIT_IMAGE + SUBMIT_UPLOAD_IMAGE
  // success reuse IMAGE_GENERATED {url}; errors reuse IMAGE_ERROR (string).
  [EVENTS.MANAGER.UPLOAD_IMAGE_SUCCESS]: (_data: { url: string }) => void
  [EVENTS.MANAGER.PROMPT_ENHANCED]: (_data: { prompt: string }) => void

  // Quizz events
  [EVENTS.QUIZZ.SAVE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.UPDATE_SUCCESS]: (_data: { id: string }) => void
  [EVENTS.QUIZZ.ERROR]: (_message: string) => void

  // Catalog (question bank) — server → client
  [EVENTS.CATALOG.DATA]: (_entries: CatalogEntry[]) => void
  [EVENTS.CATALOG.ADD_SUCCESS]: () => void
  [EVENTS.CATALOG.ERROR]: (_message: string) => void

  // AI provider config + generation — server → client. Settings carry only a
  // `keyConfigured` flag per provider (AISettingsPublic), never a secret.
  [EVENTS.AI.SETTINGS]: (_settings: AISettingsPublic) => void
  [EVENTS.AI.SET_SETTINGS_SUCCESS]: () => void
  [EVENTS.AI.TEST_RESULT]: (_result: AITestResult) => void
  [EVENTS.AI.QUESTION_GENERATED]: (_data: { question: Question }) => void
  [EVENTS.AI.DISTRACTORS_GENERATED]: (_data: { distractors: string[] }) => void
  [EVENTS.AI.QUIZ_GENERATED]: (_data: { quizz: Quizz }) => void
  [EVENTS.AI.ERROR]: (_message: string) => void

  // Results events
  [EVENTS.RESULTS.DATA]: (_result: GameResult) => void
  [EVENTS.RESULTS.SHARED_DATA]: (_result: SharedResult) => void

  // Display (satellite) events
  [EVENTS.DISPLAY.REGISTERED]: (_data: { code: string }) => void
  [EVENTS.DISPLAY.PAIR_SUCCESS]: (_data: { gameId: string }) => void
  [EVENTS.DISPLAY.PAIR_ERROR]: (_message: string) => void

  // WP-15 — display live status (manager-facing). lastPingAt is epoch seconds
  // (dayjs().unix()), matching DisplayPairing.createdAt; manager renders relative.
  [EVENTS.DISPLAY.STATUS]: (_data: {
    displays: { socketId: string; name: string; lastPingAt: number }[]
  }) => void

  // WP-18 — theme revisions. DATA carries full revisions; RESTORE_SUCCESS carries
  // the restored Theme so the UI can preview() it immediately (mirrors SET_THEME_SUCCESS).
  [EVENTS.THEME_REVISION.DATA]: (_r: ThemeRevision[]) => void
  [EVENTS.THEME_REVISION.RESTORE_SUCCESS]: (_theme: Theme) => void
  [EVENTS.THEME_REVISION.ERROR]: (_m: string) => void

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
  // Sim mode: host adds N scripted bot opponents. Flat payload (matches
  // SET_AUTO), NOT a {data} envelope. Refused server-side unless RAHOOT_SIM_MODE.
  [EVENTS.MANAGER.ADD_BOTS]: (_message: {
    gameId?: string
    count: number
  }) => void
  [EVENTS.MANAGER.ABORT_QUIZ]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.NEXT_QUESTION]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.SHOW_LEADERBOARD]: (_message: MessageGameId) => void
  // Host live-control (manager-auth-gated server-side). SKIP ends the question
  // early; ADJUST_TIMER shifts the remaining time by deltaSeconds (+ extend /
  // - shorten); REVEAL discloses the solution while the question is live.
  [EVENTS.MANAGER.SKIP_QUESTION]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.ADJUST_TIMER]: (_message: {
    gameId?: string
    deltaSeconds: number
  }) => void
  [EVENTS.MANAGER.REVEAL_ANSWER]: (_message: MessageGameId) => void
  [EVENTS.MANAGER.GET_CONFIG]: () => void
  [EVENTS.MANAGER.LOGOUT]: () => void

  // Manager plugin system (client -> server, all manager-auth-gated server-side).
  // INSTALL ships a base64 ZIP (mirrors UPLOAD_BACKGROUND's data-carrying shape);
  // REMOVE / SET_CONFIG key by the manifest plugin id.
  [EVENTS.MANAGER.PLUGIN_INSTALL]: (_payload: { zipBase64: string }) => void
  [EVENTS.MANAGER.PLUGIN_REMOVE]: (_payload: { id: string }) => void
  [EVENTS.MANAGER.PLUGIN_SET_CONFIG]: (_payload: {
    id: string
    config: Record<string, unknown>
  }) => void

  // Question-submission actions (feature #5)
  [EVENTS.MANAGER.SUBMIT_QUESTION]: (_payload: unknown) => void
  [EVENTS.MANAGER.GENERATE_IMAGE]: (_payload: { prompt: string }) => void
  // #23 media pipeline (client -> server, public).
  [EVENTS.MANAGER.EDIT_IMAGE]: (_payload: {
    baseUrl: string
    prompt: string
  }) => void
  [EVENTS.MANAGER.SUBMIT_UPLOAD_IMAGE]: (_payload: {
    filename: string
    dataUrl: string
  }) => void
  [EVENTS.MANAGER.ENHANCE_PROMPT]: (_payload: { prompt: string }) => void
  [EVENTS.MANAGER.LIST_SUBMISSIONS]: () => void
  // Running-games admin panel (client -> server, auth-gated). LIST_GAMES has no
  // payload; END_GAME ends a game the requester OWNS.
  [EVENTS.MANAGER.LIST_GAMES]: () => void
  [EVENTS.MANAGER.END_GAME]: (_payload: EndGamePayload) => void
  [EVENTS.MANAGER.EDIT_SUBMISSION]: (_payload: unknown) => void
  // Approve a submission either into a quiz (quizzId) OR into the catalog
  // (toCatalog). Exactly one path is taken server-side.
  [EVENTS.MANAGER.APPROVE_SUBMISSION]: (_payload: {
    id: string
    quizzId?: string
    toCatalog?: boolean
  }) => void
  // WP-17 — widen REJECT_SUBMISSION (was { id: string })
  [EVENTS.MANAGER.REJECT_SUBMISSION]: (_payload: {
    id: string
    reason?: string
    category?: SubmissionCategory
  }) => void

  // Display (satellite) actions
  // WP-15 — let the display supply a label up-front (was () => void)
  [EVENTS.DISPLAY.REGISTER]: (_data?: { name?: string }) => void
  [EVENTS.DISPLAY.PAIR]: (_data: {
    code: string
    managerPassword: string
    gameId: string
  }) => void
  [EVENTS.DISPLAY.DISCONNECT]: (_data: { code: string }) => void
  // WP-15 — display heartbeat (C2S). name optional; clamped server-side.
  [EVENTS.DISPLAY.PING]: (_data: { gameId: string; name?: string }) => void

  // WP-18 — theme revision actions (auth-gated server-side)
  [EVENTS.THEME_REVISION.LIST_REVISIONS]: () => void
  [EVENTS.THEME_REVISION.RESTORE_REVISION]: (_p: { id: string }) => void

  // Theme actions
  [EVENTS.MANAGER.GET_THEME]: () => void
  [EVENTS.MANAGER.SET_THEME]: (_theme: Theme) => void
  // Skeleton CSS/JS text edit (manager-auth-gated server-side). Writes the
  // file, toggles the matching *Enabled flag, bumps version, broadcasts THEME.
  [EVENTS.MANAGER.SET_SKELETON_ASSET]: (_payload: {
    kind: "css" | "js"
    content: string
  }) => void
  [EVENTS.MANAGER.RESET_SKELETON]: () => void
  [EVENTS.MANAGER.UPLOAD_BACKGROUND]: (_data: {
    slot: ThemeSlot
    dataUrl: string
  }) => void
  // Per-slot sound upload (mirrors UPLOAD_BACKGROUND). dataUrl is the audio file
  // as a data URL; the server transcodes/persists and acks via SOUND_UPLOADED.
  [EVENTS.MANAGER.UPLOAD_SOUND]: (_data: {
    slot: SoundSlot
    dataUrl: string
  }) => void

  // Theme-template actions (client -> server, auth-gated server-side)
  [EVENTS.THEME_TEMPLATE.LIST]: () => void
  [EVENTS.THEME_TEMPLATE.SAVE]: (_p: unknown) => void
  [EVENTS.THEME_TEMPLATE.DELETE]: (_p: { id: string }) => void

  // Quizz actions
  [EVENTS.QUIZZ.GET]: (_id: string) => void
  [EVENTS.QUIZZ.SAVE]: (_quizz: unknown) => void
  [EVENTS.QUIZZ.UPDATE]: (_data: QuizzWithId) => void
  [EVENTS.QUIZZ.DELETE]: (_id: string) => void
  [EVENTS.QUIZZ.DUPLICATE]: (_id: string) => void
  [EVENTS.QUIZZ.SET_ARCHIVED]: (_payload: {
    id: string
    archived: boolean
  }) => void

  // Catalog actions — client → server
  [EVENTS.CATALOG.LIST]: () => void
  [EVENTS.CATALOG.ADD]: (_payload: unknown) => void
  [EVENTS.CATALOG.UPDATE]: (_payload: unknown) => void
  [EVENTS.CATALOG.DELETE]: (_payload: { id: string }) => void

  // AI actions — client → server (all auth-gated server-side)
  [EVENTS.AI.GET_SETTINGS]: () => void
  [EVENTS.AI.SET_SETTINGS]: (_payload: unknown) => void
  [EVENTS.AI.SET_KEY]: (_payload: unknown) => void
  [EVENTS.AI.TEST_PROVIDER]: (_payload: unknown) => void
  [EVENTS.AI.GENERATE_QUESTION]: (_payload: unknown) => void
  [EVENTS.AI.GENERATE_DISTRACTORS]: (_payload: unknown) => void
  [EVENTS.AI.GENERATE_QUIZ]: (_payload: unknown) => void

  // Player actions
  [EVENTS.PLAYER.JOIN]: (_inviteCode: string) => void
  [EVENTS.PLAYER.LOGIN]: (
    _message: MessageWithoutStatus<{
      username: string
      avatar?: string
      // I2 — Privacy-first pseudonymous identifier (opt-in, guest-default).
      // Client supplies raw identifier string; server computes salted SHA-256 hash
      // IF the game config requireIdentifier is true. OPTIONAL — absent for guest play.
      identifier?: string
    }>,
  ) => void
  // Player avatar selection/upload (generic id or data URL)
  [EVENTS.PLAYER.SET_AVATAR]: (_payload: unknown) => void
  [EVENTS.PLAYER.SELECT_TEAM]: (_payload: { teamId: string }) => void
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
      // Multiple-select: the set of selected option indices (answerKey is a sentinel).
      answerKeys?: number[]
      // Type-answer: the submitted free-text (answerKey is a sentinel).
      answerText?: string
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
  [EVENTS.RESULTS.GET_SHARED]: (_id: string) => void

  // Pause/resume (manager-owned, between-questions only — enforced server-side)
  [EVENTS.MANAGER.PAUSE_GAME]: (_message: { gameId?: string }) => void
  [EVENTS.MANAGER.RESUME_GAME]: (_message: { gameId?: string }) => void
  // Partial game-config patch (manager-auth-gated server-side)
  [EVENTS.MANAGER.SET_GAME_CONFIG]: (_payload: { teamMode?: boolean; lowLatencyEnabled?: boolean; joinLocked?: boolean; randomizeAnswers?: boolean; scoringMode?: "speed" | "accuracy" }) => void
  // Achievements config patch (manager-auth-gated server-side)
  [EVENTS.MANAGER.SET_ACHIEVEMENTS_CONFIG]: (_payload: {
    config: Record<
      string,
      {
        enabled?: boolean
        name?: string
        description?: string
        threshold?: number
      }
    >
  }) => void
  // Media-manager actions (client -> server, all auth-gated server-side)
  [EVENTS.MEDIA.LIST]: () => void
  [EVENTS.MEDIA.UPLOAD]: (_payload: unknown) => void
  [EVENTS.MEDIA.DELETE]: (_payload: { id: string }) => void

  // Common
  disconnect: () => void
}
