export const EVENTS = {
  GAME: {
    STATUS: "game:status",
    SUCCESS_ROOM: "game:successRoom",
    SUCCESS_JOIN: "game:successJoin",
    TOTAL_PLAYERS: "game:totalPlayers",
    ERROR_MESSAGE: "game:errorMessage",
    START_COOLDOWN: "game:startCooldown",
    COOLDOWN: "game:cooldown",
    RESET: "game:reset",
    UPDATE_QUESTION: "game:updateQuestion",
    PLAYER_ANSWER: "game:playerAnswer",
    CREATE: "game:create",
  },
  PLAYER: {
    SUCCESS_RECONNECT: "player:successReconnect",
    UPDATE_LEADERBOARD: "player:updateLeaderboard",
    JOIN: "player:join",
    LOGIN: "player:login",
    RECONNECT: "player:reconnect",
    LEAVE: "player:leave",
    SELECTED_ANSWER: "player:selectedAnswer",
    // Low-latency mode: optional server ack for a submitted answer.
    ANSWER_ACK: "player:answerAck",
  },
  // Low-latency mode: UI-only clock sync (never a scoring input).
  CLOCK: {
    PING: "clock:ping",
    PONG: "clock:pong",
  },
  // Low-latency mode observability. All three are additive and only ever used
  // while lowLatencyMode is enabled; in normal mode no client subscribes and the
  // server never emits, so this group is inert.
  METRICS: {
    // Client → server: report a client-measured sample (RTT / clock-offset /
    // answer-ack latency). The server folds it into per-room rolling buffers.
    REPORT: "metrics:report",
    // Host → server: start receiving health snapshots for the host's own game.
    SUBSCRIBE: "metrics:subscribe",
    // Server → host: a compact p50/p95 health snapshot (throttled).
    HEALTH: "metrics:health",
  },
  MANAGER: {
    SUCCESS_RECONNECT: "manager:successReconnect",
    CONFIG: "manager:config",
    GAME_CREATED: "manager:gameCreated",
    STATUS_UPDATE: "manager:statusUpdate",
    NEW_PLAYER: "manager:newPlayer",
    REMOVE_PLAYER: "manager:removePlayer",
    ERROR_MESSAGE: "manager:errorMessage",
    PLAYER_KICKED: "manager:playerKicked",
    AUTH: "manager:auth",
    RECONNECT: "manager:reconnect",
    LEAVE: "manager:leave",
    KICK_PLAYER: "manager:kickPlayer",
    START_GAME: "manager:startGame",
    SET_AUTO: "manager:setAuto",
    ADD_BOTS: "manager:addBots",
    ABORT_QUIZ: "manager:abortQuiz",
    NEXT_QUESTION: "manager:nextQuestion",
    SHOW_LEADERBOARD: "manager:showLeaderboard",
    GET_CONFIG: "manager:getConfig",
    LOGOUT: "manager:logout",
    UNAUTHORIZED: "manager:unauthorized",
    GET_THEME: "manager:getTheme",
    THEME: "manager:theme",
    SET_THEME: "manager:setTheme",
    SET_THEME_SUCCESS: "manager:setThemeSuccess",
    UPLOAD_BACKGROUND: "manager:uploadBackground",
    BACKGROUND_UPLOADED: "manager:backgroundUploaded",
    THEME_ERROR: "manager:themeError",
    // Public question submission (client -> server, no auth)
    SUBMIT_QUESTION: "manager:submitQuestion",
    // Admin submission moderation (client -> server, auth-gated)
    LIST_SUBMISSIONS: "manager:listSubmissions",
    APPROVE_SUBMISSION: "manager:approveSubmission",
    REJECT_SUBMISSION: "manager:rejectSubmission",
    EDIT_SUBMISSION: "manager:editSubmission",
    // Server -> client
    SUBMISSIONS_DATA: "manager:submissionsData",
    SUBMISSION_ERROR: "manager:submissionError",
    SUBMIT_SUCCESS: "manager:submitSuccess",
    // AI image generation (public, hard-throttled)
    GENERATE_IMAGE: "manager:generateImage",
    IMAGE_GENERATED: "manager:imageGenerated",
    IMAGE_ERROR: "manager:imageError",
  },
  QUIZZ: {
    GET: "quizz:get",
    DATA: "quizz:data",
    SAVE: "quizz:save",
    SAVE_SUCCESS: "quizz:saveSuccess",
    UPDATE: "quizz:update",
    UPDATE_SUCCESS: "quizz:updateSuccess",
    DELETE: "quizz:delete",
    // Server-side copy: reads a quizz by id and saves it under a new id with a
    // "(Kopie)"-suffixed subject, then re-emits config so the list refreshes.
    DUPLICATE: "quizz:duplicate",
    ERROR: "quizz:error",
  },
  RESULTS: {
    GET: "results:get",
    DATA: "results:data",
    DELETE: "results:delete",
    // Public (no-auth) shareable result: client requests a result by id and the
    // server replies with a SharedResult that STRIPS `questions`.
    GET_SHARED: "results:getShared",
    SHARED_DATA: "results:sharedData",
  },
  DISPLAY: {
    REGISTER: "display:register",
    REGISTERED: "display:registered",
    PAIR: "display:pair",
    PAIR_SUCCESS: "display:pairSuccess",
    PAIR_ERROR: "display:pairError",
    DISCONNECT: "display:disconnect",
  },
} as const

// Insecure placeholder; password-based display pairing is refused while this is unchanged.
export const DEFAULT_MANAGER_PASSWORD = "PASSWORD"

// A satellite display ("Raspberry Pi" kiosk) registers a short pairing code,
// then a manager pairs that code (with the manager password) so the display
// joins the game room. Codes expire after this many minutes.
export const DISPLAY_PAIRING_TTL_MINUTES = 5

export const MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
} as const

// Question kinds. Single source of truth: the zod question validator reuses this
// (mirror of MEDIA_TYPES) and types/game derives `QuestionType` from it.
export const QUESTION_TYPES = [
  "choice",
  "boolean",
  "slider",
  "poll",
  "multiple-select",
  "type-answer",
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

// Theme image slots. Backgrounds are the three screen slots; the full theme slot
// set additionally includes the brand "logo". The server accepts uploads for
// every THEME_SLOT (logo included), so socket/web should type slots from here.
export const BACKGROUND_SLOTS = ["auth", "managerGame", "playerGame"] as const

export const THEME_SLOTS = [...BACKGROUND_SLOTS, "logo"] as const

export type BackgroundSlot = (typeof BACKGROUND_SLOTS)[number]

export type ThemeSlot = (typeof THEME_SLOTS)[number]

// ---- Scoring / timing tuning (server imports these in a later phase) -------
export const FIRST_CORRECT_BONUS = 100

export const STREAK_STEP = 0.1

export const STREAK_CAP = 5

export const SLIDER_TOLERANCE_FRACTION = 0.05

// ---- Sim-mode bot tuning (server-side scripted opponents) ------------------
// Read by the BotManager (delay scheduling, correctness) and the addBots
// validator/ceiling. Bots are a DEV/test aid, gated by RAHOOT_SIM_MODE at
// runtime; these constants tune their behaviour, not their availability.
export const BOT = {
  MAX_PER_REQUEST: 50, // addBots count cap (validator)
  MAX_TOTAL: 200, // cumulative ceiling per game (repeated clicks stack)
  CORRECT_RATE: 0.6, // default P(answer correct)
  MIN_DELAY_MS: 1200, // floor so a fast human can still claim first-correct
  MAX_DELAY_MS: 8000, // cap; also clamped to question.time*1000*0.85
} as const

export const MAX_POINTS = 1000

export const MAX_LATENCY_COMPENSATION_MS = 2000

// ---- WebSocket / server tuning ---------------------------------------------
export const WS_DEFAULT_PORT = 3001

export const WS_PING_INTERVAL_MS = 10000

export const WS_PING_TIMEOUT_MS = 8000

export const WS_MAX_HTTP_BUFFER_BYTES = 1_000_000

export const WS_DEFLATE_THRESHOLD_BYTES = 1024

export const EXAMPLE_QUIZZ = {
  subject: "Example Quizz",
  questions: [
    {
      question: "What is good answer ?",
      answers: ["No", "Good answer", "No", "No"],
      solutions: [1],
      cooldown: 5,
      time: 15,
    },
    {
      question: "What is good answer with image ?",
      answers: ["No", "No", "No", "Good answer"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: "https://placehold.co/600x400.png",
      },
      solutions: [3],
      cooldown: 5,
      time: 20,
    },
    {
      question: "What is good answer with two answers ?",
      answers: ["Good answer", "No"],
      media: {
        type: MEDIA_TYPES.IMAGE,
        url: "https://placehold.co/600x400.png",
      },
      solutions: [0],
      cooldown: 5,
      time: 20,
    },
    {
      question: "Which of these are primary colors ?",
      answers: ["Red", "Green", "Blue", "Yellow"],
      solutions: [0, 2, 3],
      cooldown: 5,
      time: 20,
    },
  ],
} as const
