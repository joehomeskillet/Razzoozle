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
    SET_AVATAR: "player:setAvatar",
    SELECT_TEAM: "player:selectTeam",
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
    UPLOAD_SOUND: "manager:uploadSound",
    SOUND_UPLOADED: "manager:soundUploaded",
    THEME_ERROR: "manager:themeError",
    // Skeleton CSS/JS text edits (manager-auth-gated server-side). Writes the
    // file, toggles the matching *Enabled flag, bumps skeletonVersion, persists,
    // and broadcasts MANAGER.THEME; errors reuse THEME_ERROR.
    SET_SKELETON_ASSET: "manager:setSkeletonAsset",
    SET_SKELETON_ASSET_SUCCESS: "manager:setSkeletonAssetSuccess",
    // Reset the look to the bundled default (discards the active theme + custom
    // skeleton CSS/JS; snapshots the prior theme to the revision ring first).
    RESET_SKELETON: "manager:resetSkeleton",
    RESET_SKELETON_SUCCESS: "manager:resetSkeletonSuccess",
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
    // #23 media pipeline (public, hard-throttled — mirrors GENERATE_IMAGE)
    EDIT_IMAGE: "manager:editImage", // C2S {baseUrl, prompt} -> reuses IMAGE_GENERATED/IMAGE_ERROR
    SUBMIT_UPLOAD_IMAGE: "manager:submitUploadImage", // C2S {filename, dataUrl} (public upload)
    UPLOAD_IMAGE_SUCCESS: "manager:uploadImageSuccess", // S2C {url}
    ENHANCE_PROMPT: "manager:enhancePrompt", // C2S {prompt} (optional preview)
    PROMPT_ENHANCED: "manager:promptEnhanced", // S2C {prompt}
    PLAYER_RECONNECTED: "manager:playerReconnected",
    PAUSE_GAME: "manager:pauseGame",
    RESUME_GAME: "manager:resumeGame",
    SET_GAME_CONFIG: "manager:setGameConfig",
    // Achievements config patch (manager-auth-gated server-side)
    SET_ACHIEVEMENTS_CONFIG: "manager:setAchievementsConfig",
    // Host live-control (manager-auth-gated server-side). SKIP_QUESTION ends the
    // current question early; ADJUST_TIMER extends/shortens it (deltaSeconds, +/-);
    // REVEAL_ANSWER discloses the solution while the question is live.
    SKIP_QUESTION: "manager:skipQuestion",
    ADJUST_TIMER: "manager:adjustTimer",
    REVEAL_ANSWER: "manager:revealAnswer",
    // Running-games admin panel (manager-auth-gated server-side). LIST_GAMES
    // requests the list (no payload); GAMES_DATA returns GameSummary[]; END_GAME
    // ({ gameId }) kills a game the requester OWNS (ownership verified via
    // registry.getManagerGame, never getGameById).
    LIST_GAMES: "manager:listGames",
    GAMES_DATA: "manager:gamesData",
    END_GAME: "manager:endGame",
    // Manager plugin system. PLUGIN_CONFIG is the server->client broadcast of the
    // installed plugin list (InstalledPlugin[]); the other three are client->server
    // mutations, all manager-auth-gated server-side. INSTALL takes a base64 ZIP
    // (mirrors UPLOAD_BACKGROUND's data shape), REMOVE/SET_CONFIG key by plugin id.
    PLUGIN_CONFIG: "manager:pluginConfig",
    PLUGIN_INSTALL: "manager:pluginInstall",
    PLUGIN_REMOVE: "manager:pluginRemove",
    PLUGIN_SET_CONFIG: "manager:pluginSetConfig",
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
    // Archive toggle: hides a quizz from the play list without deleting it.
    // Payload { id, archived }. Server flips the flag + re-emits config.
    SET_ARCHIVED: "quizz:setArchived",
    ERROR: "quizz:error",
  },
  // Theme templates (named theme presets). DATA carries the full ThemeTemplate[]
  // so the design-tab picker can apply a template without a second fetch. All
  // events are auth-gated (manager only) on the server.
  THEME_TEMPLATE: {
    LIST: "themeTemplate:list",
    DATA: "themeTemplate:data",
    SAVE: "themeTemplate:save",
    SAVE_SUCCESS: "themeTemplate:saveSuccess",
    DELETE: "themeTemplate:delete",
    ERROR: "themeTemplate:error",
  },
  // Reusable question bank. Approved submissions, editor-saved questions and
  // manual entries land here; the editor inserts from it. All events are
  // auth-gated (manager only) on the server.
  CATALOG: {
    LIST: "catalog:list",
    DATA: "catalog:data",
    ADD: "catalog:add",
    ADD_SUCCESS: "catalog:addSuccess",
    UPDATE: "catalog:update",
    DELETE: "catalog:delete",
    ERROR: "catalog:error",
  },
  MEDIA: {
    LIST: "media:list",
    DATA: "media:data",
    UPLOAD: "media:upload",
    UPLOAD_SUCCESS: "media:uploadSuccess",
    DELETE: "media:delete",
    ERROR: "media:error",
  },
  // AI provider configuration + generation. ALL auth-gated (text gen can spend
  // money via a cloud key). API keys live server-side only (config/ai-secrets.json)
  // and are NEVER part of any emitted payload — the client only ever sees a
  // `keyConfigured` boolean per provider.
  AI: {
    GET_SETTINGS: "ai:getSettings",
    SETTINGS: "ai:settings",
    SET_SETTINGS: "ai:setSettings",
    SET_SETTINGS_SUCCESS: "ai:setSettingsSuccess",
    // Set/clear one provider's API key (server stores it; never echoed back).
    SET_KEY: "ai:setKey",
    // Connectivity probe for the active/selected provider.
    TEST_PROVIDER: "ai:testProvider",
    TEST_RESULT: "ai:testResult",
    // Generation (auth + per-socket throttle).
    GENERATE_QUESTION: "ai:generateQuestion",
    QUESTION_GENERATED: "ai:questionGenerated",
    GENERATE_DISTRACTORS: "ai:generateDistractors",
    DISTRACTORS_GENERATED: "ai:distractorsGenerated",
    GENERATE_QUIZ: "ai:generateQuiz",
    QUIZ_GENERATED: "ai:quizGenerated",
    ERROR: "ai:error",
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
    PING: "display:ping", // WP-15 C2S periodic heartbeat
    STATUS: "display:status", // WP-15 S2C manager-facing live status
  },
  // Theme revisions (#12 WP-18). Per-save revision ring; LIST/RESTORE are
  // auth-gated (manager only). DATA carries full ThemeRevision[] so the picker
  // restores without a 2nd fetch (mirrors THEME_TEMPLATE.DATA).
  THEME_REVISION: {
    LIST_REVISIONS: "themeRevision:list",
    DATA: "themeRevision:data",
    RESTORE_REVISION: "themeRevision:restore",
    RESTORE_SUCCESS: "themeRevision:restoreSuccess",
    ERROR: "themeRevision:error",
  },
} as const

// Insecure placeholder; password-based display pairing is refused while this is unchanged.
export const DEFAULT_MANAGER_PASSWORD = "PASSWORD"

// A satellite display ("Raspberry Pi" kiosk) registers a short pairing code,
// then a manager pairs that code (with the manager password) so the display
// joins the game room. Codes expire after this many minutes.
export const DISPLAY_PAIRING_TTL_MINUTES = 5

// WP-15 — display heartbeat. Client ping cadence (reuses the WS ping cadence) and
// the staleness window past which the manager card marks a display offline.
export const DISPLAY_HEARTBEAT_INTERVAL_MS = 10_000
export const DISPLAY_STALE_MS = 30_000
// Server-side hygiene clamp for the untrusted client-supplied display name.
export const DISPLAY_NAME_MAX_LEN = 40

// WP-18 — theme revision ring size N (server cap + client UI hint share this).
export const THEME_REVISIONS_MAX = 10

// Generic KI-generated avatar set (committed/seeded, persistent under config/media/avatars/generic/).
export const AVATARS_GENERIC = [
  "/media/avatars/generic/generic-1.webp",
  "/media/avatars/generic/generic-2.webp",
  "/media/avatars/generic/generic-3.webp",
  "/media/avatars/generic/generic-4.webp",
] as const

// Fixed team set for team mode (labels/colors are client-side).
export const TEAMS = ["red", "blue", "green", "yellow"] as const
export type Team = (typeof TEAMS)[number]

// Max decoded size for an uploaded ephemeral player avatar.
export const AVATAR_MAX_BYTES = 4_000_000

// Max length (in chars) for an inline SVG data-URI avatar (our DiceBear-generated
// avatars, "data:image/svg+xml,…"). These render safely in <img> with no script
// execution, so they are stored verbatim — no WebP transcode — and only need a
// length cap to bound the persisted/broadcast payload.
export const AVATAR_SVG_MAX_CHARS = 64 * 1024

// Max decoded size for a public /submit image upload (8 MB, matching the
// background cap). Enforced server-side before saveMediaFile; mirrored client-side
// as a pre-emit guard. saveMediaFile/mediaUploadValidator enforce NO size on their
// own, so this is the byte cap for the public upload path (#23).
export const MEDIA_UPLOAD_MAX_BYTES = 8_000_000

// Media-manager storage categories (subdirs under config/media/).
export const MEDIA_CATEGORIES = [
  "backgrounds",
  "questions",
  "generated",
  "avatars",
  "audio",
] as const

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number]

// WP-17 — public-submission topic categories. APPEND-ONLY (never rename/remove a
// shipped member — a persisted submission carrying it would fail read-validation).
export const SUBMISSION_CATEGORIES = [
  "general",
  "history",
  "science",
  "geography",
  "sports",
  "entertainment",
  "technology",
  "other",
] as const
export type SubmissionCategory = (typeof SUBMISSION_CATEGORIES)[number]

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

// ---- AI provider abstraction (standardized interface) ----------------------
// Two transport shapes cover every supported text backend:
//   - "openai-compatible": local Ollama/LM Studio, OpenAI, OpenRouter, ...
//     (POST {baseUrl}/chat/completions). baseUrl distinguishes the vendor.
//   - "anthropic": Claude (POST https://api.anthropic.com/v1/messages).
// Image generation stays a separate concern (local ComfyUI / Z-Image).
export const AI_PROVIDER_KINDS = ["openai-compatible", "anthropic"] as const

export type AIProviderKind = (typeof AI_PROVIDER_KINDS)[number]

// Seed providers offered in the KI tab. baseUrl is editable by the admin; these
// are sensible defaults. The local default targets the host via host-gateway
// (same mechanism as COMFYUI_URL) — overridable server-side by RAHOOT_AI_LOCAL_URL.
export const AI_TEXT_PROVIDER_PRESETS = [
  {
    id: "local",
    label: "Lokal (Ollama)",
    kind: "openai-compatible" as AIProviderKind,
    baseUrl: "http://host.docker.internal:11434/v1",
    model: "llama3.2:3b",
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    kind: "anthropic" as AIProviderKind,
    model: "claude-haiku-4-5-20251001",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai-compatible" as AIProviderKind,
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compatible" as AIProviderKind,
    baseUrl: "https://openrouter.ai/api/v1",
    model: "meta-llama/llama-3.3-70b-instruct",
  },
] as const

// "off" sentinel = no provider selected (generation disabled).
export const AI_PROVIDER_OFF = "off"

// Max length of an image-generation / prompt-enhance prompt. Single source of
// truth: the GENERATE_IMAGE / EDIT_IMAGE / ENHANCE_PROMPT handlers and the
// media validators (validators/media.ts) all key off this (#23 contract).
export const PROMPT_MAX_LEN = 300

// Generation guard-rails (shared by server throttle + client UI hints).
export const AI = {
  TOPIC_MAX_LEN: 200,
  TEXT_GEN_COOLDOWN_MS: 4_000,
  TEXT_GEN_MAX_PER_SOCKET: 20,
  QUIZ_MIN_QUESTIONS: 1,
  QUIZ_MAX_QUESTIONS: 15,
  // Anthropic API version pin (Messages API).
  ANTHROPIC_VERSION: "2023-06-01",
  ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1",
  // WP-10 — granular generation params (single source: server clamp + UI bounds)
  TEMP_MIN: 0,
  TEMP_MAX: 2,
  TEMP_DEFAULT: 0.7,
} as const

// WP-10 — square image resolutions for the ComfyUI EmptyLatentImage node.
// 1024 is the safe max for Z-Image-Turbo here (POLL_TIMEOUT_MS=180s).
export const IMAGE_RESOLUTIONS = [512, 768, 1024] as const
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number]
export const IMAGE_RESOLUTION_DEFAULT: ImageResolution = 1024

// Catalog entry provenance — purely informational (shown as a chip in the UI).
export const CATALOG_SOURCES = ["manual", "submission", "editor", "ai"] as const

export type CatalogSource = (typeof CATALOG_SOURCES)[number]

// Theme image slots. Backgrounds are the three screen slots; the full theme slot
// set additionally includes the brand "logo". The server accepts uploads for
// every THEME_SLOT (logo included), so socket/web should type slots from here.
export const BACKGROUND_SLOTS = ["auth", "managerGame", "playerGame"] as const

export const THEME_SLOTS = [...BACKGROUND_SLOTS, "logo"] as const

export type BackgroundSlot = (typeof BACKGROUND_SLOTS)[number]

export type ThemeSlot = (typeof THEME_SLOTS)[number]

// Theme sound slots. Each flat slot id maps to a bundled default mp3 under
// /sounds/ (SOUND_DEFAULTS); a theme may override a slot with a served asset
// ref (validators/theme.ts -> sounds). A null override ⇒ playback falls back to
// the bundled default, so an absent/old theme.json stays an audio no-op.
export const SOUND_SLOTS = [
  "answersMusic",
  "answersSound",
  "podiumThree",
  "podiumSecond",
  "podiumFirst",
  "podiumSnearRoll",
  "results",
  "show",
  "boump",
  "tierBronze",
  "tierSilver",
  "tierGold",
  "tierDiamant",
] as const

export type SoundSlot = (typeof SOUND_SLOTS)[number]

export const SOUND_DEFAULTS: Record<SoundSlot, string> = {
  answersMusic: "/sounds/answersMusic.mp3",
  answersSound: "/sounds/answersSound.mp3",
  podiumThree: "/sounds/three.mp3",
  podiumSecond: "/sounds/second.mp3",
  podiumFirst: "/sounds/first.mp3",
  podiumSnearRoll: "/sounds/snearRoll.mp3",
  results: "/sounds/results.mp3",
  show: "/sounds/show.mp3",
  boump: "/sounds/boump.mp3",
  tierBronze: "/sounds/bronze.mp3",
  tierSilver: "/sounds/silver.mp3",
  tierGold: "/sounds/gold.mp3",
  tierDiamant: "/sounds/diamant.mp3",
}

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

// Inbound WS frame ceiling. socket.io severs the connection (1009 Message Too
// Big) on any frame above this BEFORE the handler runs, so it must exceed the
// base64-encoded form of the largest upload payload (a data URL is ~4/3 the
// decoded bytes plus the "data:image/...;base64," envelope). Derive it from the
// public-upload cap (the biggest: 8 MB > AVATAR_MAX_BYTES 4 MB) so the byte cap
// in submitMedia.upload.ts is reachable and oversize uploads get a graceful
// errors:media.tooLarge instead of a hard disconnect.
export const WS_MAX_HTTP_BUFFER_BYTES =
  Math.ceil(MEDIA_UPLOAD_MAX_BYTES * (4 / 3)) + 256_000

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
