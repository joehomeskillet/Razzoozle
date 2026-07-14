//! constants.rs — OWNS: Event name string constants (GAME.*, PLAYER.*, etc.)

pub mod game {
    pub const STATUS: &str = "game:status";
    pub const SUCCESS_ROOM: &str = "game:successRoom";
    pub const SUCCESS_JOIN: &str = "game:successJoin";
    pub const TOTAL_PLAYERS: &str = "game:totalPlayers";
    pub const ERROR_MESSAGE: &str = "game:errorMessage";
    pub const START_COOLDOWN: &str = "game:startCooldown";
    pub const COOLDOWN: &str = "game:cooldown";
    pub const RESET: &str = "game:reset";
    pub const UPDATE_QUESTION: &str = "game:updateQuestion";
    pub const PLAYER_ANSWER: &str = "game:playerAnswer";
    pub const CREATE: &str = "game:create";
}

pub mod player {
    pub const SUCCESS_RECONNECT: &str = "player:successReconnect";
    pub const UPDATE_LEADERBOARD: &str = "player:updateLeaderboard";
    pub const JOIN: &str = "player:join";
    pub const LOGIN: &str = "player:login";
    pub const RECONNECT: &str = "player:reconnect";
    pub const LEAVE: &str = "player:leave";
    pub const SELECTED_ANSWER: &str = "player:selectedAnswer";
    pub const ANSWER_ACK: &str = "player:answerAck";
    pub const SET_AVATAR: &str = "player:setAvatar";
    pub const SELECT_TEAM: &str = "player:selectTeam";
}

pub mod clock {
    pub const PING: &str = "clock:ping";
    pub const PONG: &str = "clock:pong";
}

pub mod metrics {
    pub const REPORT: &str = "metrics:report";
    pub const SUBSCRIBE: &str = "metrics:subscribe";
    pub const HEALTH: &str = "metrics:health";
}

pub mod manager {
    pub const SUCCESS_RECONNECT: &str = "manager:successReconnect";
    pub const CONFIG: &str = "manager:config";
    pub const GAME_CREATED: &str = "manager:gameCreated";
    pub const STATUS_UPDATE: &str = "manager:statusUpdate";
    pub const NEW_PLAYER: &str = "manager:newPlayer";
    pub const REMOVE_PLAYER: &str = "manager:removePlayer";
    pub const ERROR_MESSAGE: &str = "manager:errorMessage";
    pub const PLAYER_KICKED: &str = "manager:playerKicked";
    pub const AUTH: &str = "manager:auth";
    pub const RECONNECT: &str = "manager:reconnect";
    pub const LEAVE: &str = "manager:leave";
    pub const KICK_PLAYER: &str = "manager:kickPlayer";
    pub const START_GAME: &str = "manager:startGame";
    pub const SET_AUTO: &str = "manager:setAuto";
    pub const ADD_BOTS: &str = "manager:addBots";
    pub const ABORT_QUIZ: &str = "manager:abortQuiz";
    pub const NEXT_QUESTION: &str = "manager:nextQuestion";
    pub const SHOW_LEADERBOARD: &str = "manager:showLeaderboard";
    pub const GET_CONFIG: &str = "manager:getConfig";
    pub const LOGOUT: &str = "manager:logout";
    pub const UNAUTHORIZED: &str = "manager:unauthorized";
    pub const GET_THEME: &str = "manager:getTheme";
    pub const THEME: &str = "manager:theme";
    pub const SET_THEME: &str = "manager:setTheme";
    pub const SET_THEME_SUCCESS: &str = "manager:setThemeSuccess";
    pub const UPLOAD_BACKGROUND: &str = "manager:uploadBackground";
    pub const BACKGROUND_UPLOADED: &str = "manager:backgroundUploaded";
    pub const UPLOAD_SOUND: &str = "manager:uploadSound";
    pub const SOUND_UPLOADED: &str = "manager:soundUploaded";
    pub const THEME_ERROR: &str = "manager:themeError";
    pub const SET_SKELETON_ASSET: &str = "manager:setSkeletonAsset";
    pub const SET_SKELETON_ASSET_SUCCESS: &str = "manager:setSkeletonAssetSuccess";
    pub const RESET_SKELETON: &str = "manager:resetSkeleton";
    pub const RESET_SKELETON_SUCCESS: &str = "manager:resetSkeletonSuccess";
    pub const SUBMIT_QUESTION: &str = "manager:submitQuestion";
    pub const LIST_SUBMISSIONS: &str = "manager:listSubmissions";
    pub const APPROVE_SUBMISSION: &str = "manager:approveSubmission";
    pub const REJECT_SUBMISSION: &str = "manager:rejectSubmission";
    pub const EDIT_SUBMISSION: &str = "manager:editSubmission";
    pub const SUBMISSIONS_DATA: &str = "manager:submissionsData";
    pub const SUBMISSION_ERROR: &str = "manager:submissionError";
    pub const SUBMIT_SUCCESS: &str = "manager:submitSuccess";
    pub const GENERATE_IMAGE: &str = "manager:generateImage";
    pub const IMAGE_GENERATED: &str = "manager:imageGenerated";
    pub const IMAGE_ERROR: &str = "manager:imageError";
    pub const EDIT_IMAGE: &str = "manager:editImage";
    pub const SUBMIT_UPLOAD_IMAGE: &str = "manager:submitUploadImage";
    pub const UPLOAD_IMAGE_SUCCESS: &str = "manager:uploadImageSuccess";
    pub const ENHANCE_PROMPT: &str = "manager:enhancePrompt";
    pub const PROMPT_ENHANCED: &str = "manager:promptEnhanced";
    pub const PLAYER_RECONNECTED: &str = "manager:playerReconnected";
    pub const PAUSE_GAME: &str = "manager:pauseGame";
    pub const RESUME_GAME: &str = "manager:resumeGame";
    pub const SET_GAME_CONFIG: &str = "manager:setGameConfig";
    pub const SET_ACHIEVEMENTS_CONFIG: &str = "manager:setAchievementsConfig";
    pub const SKIP_QUESTION: &str = "manager:skipQuestion";
    pub const ADJUST_TIMER: &str = "manager:adjustTimer";
    pub const REVEAL_ANSWER: &str = "manager:revealAnswer";
    pub const LIST_GAMES: &str = "manager:listGames";
    pub const GAMES_DATA: &str = "manager:gamesData";
    pub const END_GAME: &str = "manager:endGame";
    pub const PLUGIN_CONFIG: &str = "manager:pluginConfig";
    pub const PLUGIN_INSTALL: &str = "manager:pluginInstall";
    pub const PLUGIN_REMOVE: &str = "manager:pluginRemove";
    pub const PLUGIN_SET_CONFIG: &str = "manager:pluginSetConfig";
}

pub mod quizz {
    pub const GET: &str = "quizz:get";
    pub const DATA: &str = "quizz:data";
    pub const SAVE: &str = "quizz:save";
    pub const SAVE_SUCCESS: &str = "quizz:saveSuccess";
    pub const UPDATE: &str = "quizz:update";
    pub const UPDATE_SUCCESS: &str = "quizz:updateSuccess";
    pub const DELETE: &str = "quizz:delete";
    pub const DUPLICATE: &str = "quizz:duplicate";
    pub const SET_ARCHIVED: &str = "quizz:setArchived";
    pub const ERROR: &str = "quizz:error";
}

pub mod theme_template {
    pub const LIST: &str = "themeTemplate:list";
    pub const DATA: &str = "themeTemplate:data";
    pub const SAVE: &str = "themeTemplate:save";
    pub const SAVE_SUCCESS: &str = "themeTemplate:saveSuccess";
    pub const DELETE: &str = "themeTemplate:delete";
    pub const ERROR: &str = "themeTemplate:error";
}

pub mod catalog {
    pub const LIST: &str = "catalog:list";
    pub const DATA: &str = "catalog:data";
    pub const ADD: &str = "catalog:add";
    pub const ADD_SUCCESS: &str = "catalog:addSuccess";
    pub const UPDATE: &str = "catalog:update";
    pub const DELETE: &str = "catalog:delete";
    pub const ERROR: &str = "catalog:error";
}

pub mod media {
    pub const LIST: &str = "media:list";
    pub const DATA: &str = "media:data";
    pub const UPLOAD: &str = "media:upload";
    pub const UPLOAD_SUCCESS: &str = "media:uploadSuccess";
    pub const DELETE: &str = "media:delete";
    pub const ERROR: &str = "media:error";
}

pub mod ai {
    pub const GET_SETTINGS: &str = "ai:getSettings";
    pub const SETTINGS: &str = "ai:settings";
    pub const SET_SETTINGS: &str = "ai:setSettings";
    pub const SET_SETTINGS_SUCCESS: &str = "ai:setSettingsSuccess";
    pub const SET_KEY: &str = "ai:setKey";
    pub const TEST_PROVIDER: &str = "ai:testProvider";
    pub const TEST_RESULT: &str = "ai:testResult";
    pub const GENERATE_QUESTION: &str = "ai:generateQuestion";
    pub const QUESTION_GENERATED: &str = "ai:questionGenerated";
    pub const GENERATE_DISTRACTORS: &str = "ai:generateDistractors";
    pub const DISTRACTORS_GENERATED: &str = "ai:distractorsGenerated";
    pub const GENERATE_QUIZ: &str = "ai:generateQuiz";
    pub const QUIZ_GENERATED: &str = "ai:quizGenerated";
    pub const ERROR: &str = "ai:error";
}

pub mod results {
    pub const GET: &str = "results:get";
    pub const DATA: &str = "results:data";
    pub const DELETE: &str = "results:delete";
    pub const GET_SHARED: &str = "results:getShared";
    pub const SHARED_DATA: &str = "results:sharedData";
}

pub mod display {
    pub const REGISTER: &str = "display:register";
    pub const REGISTERED: &str = "display:registered";
    pub const PAIR: &str = "display:pair";
    pub const PAIR_SUCCESS: &str = "display:pairSuccess";
    pub const PAIR_ERROR: &str = "display:pairError";
    pub const DISCONNECT: &str = "display:disconnect";
    pub const PING: &str = "display:ping";
    pub const STATUS: &str = "display:status";
}

pub mod theme_revision {
    pub const LIST_REVISIONS: &str = "themeRevision:list";
    pub const DATA: &str = "themeRevision:data";
    pub const RESTORE_REVISION: &str = "themeRevision:restore";
    pub const RESTORE_SUCCESS: &str = "themeRevision:restoreSuccess";
    pub const ERROR: &str = "themeRevision:error";
}

pub mod class {
    pub const LIST: &str = "class:list";
    pub const DATA: &str = "class:data";
    pub const CREATE: &str = "class:create";
    pub const CREATE_SUCCESS: &str = "class:createSuccess";
    pub const UPDATE: &str = "class:update";
    pub const UPDATE_SUCCESS: &str = "class:updateSuccess";
    pub const DELETE: &str = "class:delete";
    pub const DELETE_SUCCESS: &str = "class:deleteSuccess";
    pub const ADD_STUDENT: &str = "class:addStudent";
    pub const STUDENT_ADDED: &str = "class:studentAdded";
    pub const REMOVE_STUDENT: &str = "class:removeStudent";
    pub const STUDENT_REMOVED: &str = "class:studentRemoved";
    // Payload: {id, displayName?, firstName?, lastName?, classIds?, birthdate?}
    pub const UPDATE_STUDENT: &str = "class:updateStudent";
    // Payload: {id, displayName, firstName?, lastName?}
    pub const STUDENT_UPDATED: &str = "class:studentUpdated";
    pub const GET_STUDENTS: &str = "class:getStudents";
    pub const STUDENTS_DATA: &str = "class:studentsData";
    pub const ERROR: &str = "class:error";
    /// `class:moveStudent` req `{ studentId: number, classId: number }` → success `class:studentMoved` `{ studentId, classId, joinedAt }` (adds student to an ADDITIONAL class; idempotent).
    pub const MOVE_STUDENT: &str = "class:moveStudent";
    pub const STUDENT_MOVED: &str = "class:studentMoved";
    /// `class:removeFromClass` req `{ studentId, classId }` → success `class:removedFromClass` `{ studentId, classId, studentDeleted: boolean }` (studentDeleted=true when it was their last class — server orphan-deletes).
    pub const REMOVE_FROM_CLASS: &str = "class:removeFromClass";
    pub const REMOVED_FROM_CLASS: &str = "class:removedFromClass";
    /// `class:studentClasses` req `{ studentId }` → `class:studentClassesData` `{ studentId, classes: [{ id, name, joinedAt }] }`.
    pub const STUDENT_CLASSES: &str = "class:studentClasses";
    pub const STUDENT_CLASSES_DATA: &str = "class:studentClassesData";
    /// `class:listAllStudents` req: NO payload — server handler MUST use the bare `|socket: SocketRef|` signature (socketioxide silently drops payloadless events if a Data extractor is present). → `class:allStudentsData` `{ students: [{ id, displayName, firstName?, lastName?, classes: [{ id, name }], birthdate: string | null }] }`.
    pub const LIST_ALL_STUDENTS: &str = "class:listAllStudents";
    pub const ALL_STUDENTS_DATA: &str = "class:allStudentsData";
    /// `class:createStudent` req `{ firstName: string, lastName: string, classIds?: number[], birthdate?: "YYYY-MM-DD" }` — creates a student owned by the caller, optionally enrolling into the given (caller-owned) classes; server auto-generates the 4-emoji PIN (manager-authed via require_user).
    pub const CREATE_STUDENT: &str = "class:createStudent";
    /// `class:studentCreated` → `{ id: number, displayName: string, firstName: string, lastName?: string | null, pin: string, labels: string[], symbols: string[], classes: Array<{ id: number, name: string }>, birthdate: string | null }` — pin is the joined 4-emoji string, labels the 4 German words, symbols the 4 emoji strings (manager-authed via require_user).
    pub const STUDENT_CREATED: &str = "class:studentCreated";
    /// `class:studentPin` req `{ studentId: number }` — returns the student's PIN, lazily generating one if the student has none yet (pre-015 students) (manager-authed via require_user).
    pub const STUDENT_PIN: &str = "class:studentPin";
    /// `class:studentPinData` → `{ studentId: number, pin: string, labels: string[], symbols: string[] }` (manager-authed via require_user).
    pub const STUDENT_PIN_DATA: &str = "class:studentPinData";
    /// `class:regenPin` req `{ studentId: number }` — replaces the student's PIN with a fresh one (manager-authed via require_user).
    pub const REGEN_PIN: &str = "class:regenPin";
    /// `class:pinRegenerated` → `{ studentId: number, pin: string, labels: string[], symbols: string[] }` (manager-authed via require_user).
    pub const PIN_REGENERATED: &str = "class:pinRegenerated";
}

// Sim-mode bot tuning (server-side scripted opponents). Bots are a dev/test aid,
// gated by RAHOOT_SIM_MODE at runtime; these constants tune behaviour, not availability.
pub struct Bot;

impl Bot {
    pub const MAX_PER_REQUEST: i32 = 50;
    pub const MAX_TOTAL: i32 = 200;
    pub const CORRECT_RATE: f64 = 0.6;
    pub const MIN_DELAY_MS: u64 = 1200;
    pub const MAX_DELAY_MS: u64 = 8000;
}

// AI generation parameters (rate limiter & model tuning)
pub struct AI;

impl AI {
    pub const TEXT_GEN_COOLDOWN_MS: u64 = 4_000;
    pub const TEXT_GEN_MAX_PER_SOCKET: u64 = 20;
    pub const TOPIC_MAX_LEN: usize = 200;
    pub const QUIZ_MIN_QUESTIONS: usize = 1;
    pub const QUIZ_MAX_QUESTIONS: usize = 15;
    pub const ANTHROPIC_VERSION: &'static str = "2023-06-01";
    pub const ANTHROPIC_BASE_URL: Option<&'static str> = Some("https://api.anthropic.com/v1");
    pub const TEMP_MIN: f64 = 0.0;
    pub const TEMP_MAX: f64 = 2.0;
    pub const TEMP_DEFAULT: f64 = 0.7;
}

pub mod user {
    pub const SET_AI_KEY: &str = "user:setAiKey";
    pub const GET_AI_KEY_STATUS: &str = "user:getAiKeyStatus";
    pub const AI_KEY_STATUS: &str = "user:aiKeyStatus";
    pub const DELETE_AI_KEY: &str = "user:deleteAiKey";
    pub const LIST_EXTERNAL_PROVIDERS: &str = "user:listExternalProviders";
    pub const EXTERNAL_PROVIDERS: &str = "user:externalProviders";
}

pub mod label {
    /// `label:list` req: NO payload — server handler MUST use the bare `|socket: SocketRef|` signature (socketioxide silently drops payloadless events if a Data extractor is present). → `label:data` `{ labels: [{ id: number, name: string, color: string }] }`.
    pub const LIST: &str = "label:list";
    /// `label:data` → `{ labels: [{ id: number, name: string, color: string }] }` (server response after list or crud).
    pub const DATA: &str = "label:data";
    /// `label:create` req `{ name: string, color?: string }` (admin-only) → `label:data` (re-emit full list).
    pub const CREATE: &str = "label:create";
    /// `label:update` req `{ id: number, name?: string, color?: string }` (admin-only) → `label:data` (re-emit full list).
    pub const UPDATE: &str = "label:update";
    /// `label:delete` req `{ id: number }` (admin-only, CASCADE removes all assignments) → `label:data` (re-emit full list).
    pub const DELETE: &str = "label:delete";

    /// `label:assign` req `{ entityType: "quizz"|"media"|"catalog"|"class", entityId: string, labelIds: number[] }` (replace-set semantics; require_user + entity visibility + klassenEnabled gate) → `label:assigned` on success. (Note: for entityType "class", entityId = String(classId) since classes.id is BIGSERIAL)
    pub const ASSIGN: &str = "label:assign";
    /// `label:assigned` → `{ entityType: "quizz"|"media"|"catalog"|"class", entityId: string, labelIds: number[] }` (ack; consumers refetch their lists). (Note: for entityType "class", entityId = String(classId) since classes.id is BIGSERIAL)
    pub const ASSIGNED: &str = "label:assigned";
    /// `label:error` → `{ message: string }` (error response).
    pub const ERROR: &str = "label:error";
}
