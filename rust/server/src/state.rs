//! state.rs — In-memory game registry and state management.

use razzoozle_engine::state::GameState;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use lazy_static::lazy_static;
use regex::Regex;
use sqlx::PgPool;

// Resource caps (parity with Node)
pub const MAX_ACTIVE_GAMES: usize = 100;
pub const MAX_PLAYERS_PER_GAME: usize = 200;
pub const USERNAME_MIN_LEN: usize = 4;
pub const USERNAME_MAX_LEN: usize = 20;
pub const AVATAR_MAX_BYTES: usize = 4_000_000;
pub const AVATAR_SVG_MAX_CHARS: usize = 64 * 1024;

// Valid team identifiers for team-mode games (parity with Node's TEAMS enum,
// packages/common/src/constants.ts).
pub const TEAMS: [&str; 4] = ["red", "blue", "green", "yellow"];

// Game eviction: TTL for finished/stale games (milliseconds)
pub const GAME_EVICTION_TTL_MS: u64 = 300_000; // 5 minutes

// logged_clients cap + staleness TTL (same idiom as the RateLimiter maps
// below: bound unbounded growth from distinct client IDs, pruning only once
// the cap is exceeded). TTL is deliberately generous — far longer than any
// realistic manager session — since pruning here (unlike the rate limiter)
// would wrongly log out a still-active manager, not just reset a counter.
pub const LOGGED_CLIENTS_MAX_ENTRIES: usize = 10_000;
pub const LOGGED_CLIENT_STALE_MS: u64 = 6 * 60 * 60 * 1000; // 6 hours

// ── Path-traversal protection ─────────────────────────────────────────────────
// Validate asset IDs (quiz/result file names) to prevent path-traversal attacks
lazy_static! {
    static ref SAFE_ID_REGEX: Regex = Regex::new("^[A-Za-z0-9_-]+$").unwrap();
}

const RESERVED_IDS: &[&str] = &["__proto__", "constructor", "prototype"];

/// Validate that an asset ID (quiz id, result id, etc.) is safe for use in file paths.
/// Rejects path-traversal attempts like "../../etc/passwd" and reserved prototype-pollution keys.
pub fn safe_asset_id(id: &str) -> Result<(), String> {
    if !SAFE_ID_REGEX.is_match(id) {
        return Err("Invalid asset id: contains forbidden characters".to_string());
    }

    if RESERVED_IDS.contains(&id) {
        return Err("Invalid asset id: reserved keyword".to_string());
    }

    Ok(())
}

// ── Solo results rate limiting and caps ────────────────────────────────────────
pub const SOLO_RATE_MAX_PER_CLIENT: i32 = 120; // max 120 solo calls/min per client IP
pub const AUTH_RATE_MAX_PER_CLIENT: i32 = 10; // max 10 auth failures/min per client IP
pub const SOLO_RATE_WINDOW_MS: u64 = 60_000; // 60 seconds
pub const SOLO_RESULTS_MAX_ENTRIES: usize = 1000; // cap solo leaderboard growth

// ── Public question submission rate limiting (durable per-client + global cap) ──
pub const SUBMISSION_RATE_MAX_PER_CLIENT: i32 = 3; // max 3 submissions/60s per durable client
pub const SUBMISSION_RATE_WINDOW_MS: u64 = 60_000; // 60 seconds
pub const SUBMISSION_GLOBAL_MAX: i32 = 60; // max 60 submissions/min server-wide
pub const SUBMISSION_GLOBAL_WINDOW_MS: u64 = 60_000; // 60 seconds

#[derive(Debug, Clone)]
pub struct RateState {
    pub count: i32,
    pub window_start_ms: u64,
}

impl RateState {
    pub fn new() -> Self {
        Self {
            count: 0,
            window_start_ms: get_now_ms(),
        }
    }

    /// Reset the window if it has expired
    pub fn maybe_reset(&mut self, now_ms: u64) {
        if now_ms.saturating_sub(self.window_start_ms) > SOLO_RATE_WINDOW_MS {
            self.count = 0;
            self.window_start_ms = now_ms;
        }
    }
}

pub fn get_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Rate limiter for solo API, auth attempts, and public question submissions
/// per-IP (or per-client-ID for socket handlers)
pub struct RateLimiter {
    solo_by_key: Mutex<HashMap<String, RateState>>,
    auth_by_key: Mutex<HashMap<String, RateState>>,
    submission_by_key: Mutex<HashMap<String, RateState>>,
    submission_global: Mutex<RateState>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            solo_by_key: Mutex::new(HashMap::new()),
            auth_by_key: Mutex::new(HashMap::new()),
            submission_by_key: Mutex::new(HashMap::new()),
            submission_global: Mutex::new(RateState::new()),
        }
    }

    /// Check if a solo call is allowed for the given key (IP address or client ID).
    /// Returns true if allowed, false if rate-limited.
    pub fn check_solo_rate(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.solo_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);

            let is_limited = entry.count >= SOLO_RATE_MAX_PER_CLIENT;
            if !is_limited {
                entry.count += 1;
            }

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SOLO_RATE_WINDOW_MS);
            }

            !is_limited
        } else {
            true // lock failed, allow in fail-open mode
        }
    }


    /// Record a failed auth attempt and return true if throttled (for the given key).
    /// Returns true if throttled, false if allowed.
    pub fn record_auth_failure_and_check_throttle(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.auth_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);
            entry.count += 1;

            let is_throttled = entry.count > AUTH_RATE_MAX_PER_CLIENT;

            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SOLO_RATE_WINDOW_MS);
            }

            is_throttled
        } else {
            false // lock failed, allow in fail-open mode
        }
    }

    /// Deprecated: for backwards compatibility, delegate to per-key version with empty key
    pub fn check_global_solo_rate(&self) -> bool {
        self.check_solo_rate("global")
    }

    /// Deprecated: for backwards compatibility, delegate to per-key version with empty key
    pub fn record_auth_failure_and_check_throttle_global(&self) -> bool {
        self.record_auth_failure_and_check_throttle("global")
    }

    // ── APPENDED for rust-auth-parity (manager:auth throttle fix) ────────────
    // Node's submissionRateLimit.ts keeps isAuthThrottled() (pure read) and
    // recordAuthFailure() (increments ONLY on an actual failed compare) as two
    // separate primitives against a single global window, so a throttled
    // window rejects even a would-be-correct password without ever counting
    // that rejection as a new failure. The existing
    // record_auth_failure_and_check_throttle() above conflates "record" and
    // "check" into one call, which can't reproduce that pre-compare peek
    // without also incrementing on success. These two thin wrappers restore
    // that split, reusing the same "global" key + window/threshold as the
    // existing method above (append-only — no existing method touched).

    /// Peek whether the global auth-failure window has already crossed the
    /// throttle threshold, WITHOUT recording a new failure. Mirrors Node's
    /// isAuthThrottled().
    pub fn is_auth_throttled_global(&self) -> bool {
        let now = get_now_ms();
        if let Ok(map) = self.auth_by_key.lock() {
            if let Some(entry) = map.get("global") {
                return now.saturating_sub(entry.window_start_ms) <= SOLO_RATE_WINDOW_MS
                    && entry.count >= AUTH_RATE_MAX_PER_CLIENT;
            }
        }
        false
    }

    /// Record a failed manager:auth attempt against the global window WITHOUT
    /// checking throttle. Mirrors Node's recordAuthFailure() — call ONLY after
    /// an actual failed password compare, never on success.
    pub fn record_auth_failure_global(&self) {
        let now = get_now_ms();
        if let Ok(mut map) = self.auth_by_key.lock() {
            let entry = map.entry("global".to_string()).or_insert_with(RateState::new);
            entry.maybe_reset(now);
            entry.count += 1;
        }
    }

    /// Check if a submission is allowed for the given durable client ID (per-client throttle).
    /// Returns true if allowed, false if rate-limited.
    /// Mirrors Node's checkRateLimit(): MAX_COUNT=3 per WINDOW_MS=60s per durable client.
    pub fn check_submission_rate(&self, key: &str) -> bool {
        let now = get_now_ms();
        if let Ok(mut map) = self.submission_by_key.lock() {
            let entry = map.entry(key.to_string()).or_insert_with(RateState::new);
            
            // Reset if window expired
            if now.saturating_sub(entry.window_start_ms) > SUBMISSION_RATE_WINDOW_MS {
                entry.count = 0;
                entry.window_start_ms = now;
            }
            
            let is_limited = entry.count >= SUBMISSION_RATE_MAX_PER_CLIENT;
            if !is_limited {
                entry.count += 1;
            }
            
            // Evict stale keys to prevent unbounded growth
            if map.len() > 10000 {
                let now = get_now_ms();
                map.retain(|_, state| now.saturating_sub(state.window_start_ms) <= SUBMISSION_RATE_WINDOW_MS);
            }
            
            !is_limited
        } else {
            true // lock failed, allow in fail-open mode
        }
    }

    /// Check if a submission is allowed against the global server-wide ceiling.
    /// Returns true if allowed, false if rate-limited.
    /// Mirrors Node's checkGlobalSubmissionRate(): MAX_COUNT=60 per GLOBAL_WINDOW_MS=60s.
    pub fn check_global_submission_rate(&self) -> bool {
        let now = get_now_ms();
        if let Ok(mut global) = self.submission_global.lock() {
            if now.saturating_sub(global.window_start_ms) > SUBMISSION_GLOBAL_WINDOW_MS {
                global.window_start_ms = now;
                global.count = 1;
                return true;
            }
            
            if global.count >= SUBMISSION_GLOBAL_MAX {
                return false;
            }
            
            global.count += 1;
            true
        } else {
            true // lock failed, allow in fail-open mode
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuizFixture {
    pub subject: String,
    pub questions: Vec<serde_json::Value>,
}

impl QuizFixture {
    /// Load fixture quiz (embedded at compile time so the server runs from any
    /// cwd — a runtime relative path panicked unless launched from rust/server/).
    pub fn load() -> Result<Quizz, Box<dyn std::error::Error>> {
        let contents = include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/fixture-quiz.json"));
        let quiz: Quizz = serde_json::from_str(contents)?;
        Ok(quiz)
    }
}

/// In-memory game state, wrapping the engine's GameState.
#[derive(Debug)]
pub struct Game {
    pub game_id: String,
    pub invite_code: String,
    pub manager_socket_id: String,
    // The clientId (socket handshake auth, NOT the volatile socket_id) of the
    // manager who created this game — real ownership proof, refreshed on a
    // verified manager:reconnect. `None` only ever for a Game built directly
    // via `Game::new()` in a test that doesn't set it.
    pub manager_client_id: Option<String>,
    pub host_token: String,
    pub players: Vec<Player>,
    pub engine: GameState,
    // Creation timestamp (ms since UNIX epoch) — distinct from last_activity_ms,
    // which advances as the game is used. games_list.rs's admin panel wants the
    // actual creation time, not "how recently touched".
    pub created_at_ms: u64,
    // Last activity timestamp (ms since UNIX epoch)
    pub last_activity_ms: u64,
    // In-memory cache of the (server-global) low-latency config, snapshotted at
    // create time and refreshed on every manager:setGameConfig write. Lets a
    // future per-ping gate check this synchronously instead of an async DB
    // round-trip on every clock:ping.
    pub low_latency: bool,
    // Auto-advance gate: when false (Node default), the game waits for explicit host
    // signals (manager:nextQuestion / manager:showLeaderboard) instead of auto-advancing
    // on RESULT_DWELL_SECS / LEADERBOARD_DWELL_SECS timeout. Toggleable via MANAGER.SET_AUTO.
    pub auto_mode: bool,
    // Question-lifecycle abort signal (R3/R5): whichever abortable wait the
    // game-lifecycle task (socket::lifecycle::run_game_lifecycle) is currently
    // in — the per-question SELECT_ANSWER cooldown, the post-reveal dwell, or
    // the post-leaderboard dwell — is interrupted by notifying this handle.
    // Re-armed (replaced with a fresh Notify) each time a new abortable wait
    // starts; `None` while no abortable wait is live.
    pub cooldown_abort: Option<Arc<tokio::sync::Notify>>,
}

impl Game {
    pub fn new(
        game_id: String,
        invite_code: String,
        manager_socket_id: String,
        quiz: Quizz,
    ) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        // P2a — generate random host_token using uuid v4 (CSPRNG)
        let host_token = Uuid::new_v4().to_string();

        Self {
            game_id,
            invite_code,
            manager_socket_id,
            manager_client_id: None,
            host_token,
            players: Vec::new(),
            engine: GameState::new(quiz, Vec::new()),
            created_at_ms: now,
            last_activity_ms: now,
            low_latency: false,
            auto_mode: false,
            cooldown_abort: None,
        }
    }

    /// Arm a fresh abort signal for a new abortable wait, returning the handle
    /// the waiting task should select on. Replaces any prior (stale) handle.
    pub fn arm_abort(&mut self) -> Arc<tokio::sync::Notify> {
        let notify = Arc::new(tokio::sync::Notify::new());
        self.cooldown_abort = Some(notify.clone());
        notify
    }

    /// Wake whatever abortable wait is currently live (skip / reveal-now /
    /// all-answered / a manager live-control). No-op if nothing is waiting.
    pub fn signal_abort(&self) {
        if let Some(notify) = &self.cooldown_abort {
            notify.notify_one();
        }
    }

    /// Update last activity timestamp to now
    pub fn touch_activity(&mut self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.last_activity_ms = now;
    }

    /// Check if this game has exceeded its TTL (for eviction)
    pub fn is_stale(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.last_activity_ms) > GAME_EVICTION_TTL_MS
    }

    /// Add a player to the game and return their player data.
    /// Rejects a clientId that's already connected (parity with Node's
    /// player-manager.ts join(): `findByClientId` dup-guard —
    /// "errors:game.playerAlreadyConnected") instead of pushing a second
    /// player record for the same client.
    pub fn add_player(
        &mut self,
        socket_id: String,
        client_id: String,
        username: String,
        avatar: Option<String>,
    ) -> Result<Player, &'static str> {
        if self.players.iter().any(|p| p.client_id == client_id) {
            return Err("errors:game.playerAlreadyConnected");
        }

        let player = Player {
            id: socket_id,
            client_id: client_id.clone(),
            username,
            connected: true,
            points: 0,
            streak: 0,
            is_bot: None,
            player_token: Some(Uuid::new_v4().to_string()),
            avatar,
            achievements: None,
            team_id: None,
            identifier_hash: None,
        };
        self.players.push(player.clone());
        // Also add to engine's players list
        self.engine.players.push(player.clone());
        Ok(player)
    }
}

/// Registry managing all active games and available quizzes.
pub struct GameRegistry {
    games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    games_by_id: HashMap<String, Arc<Mutex<Game>>>,
    quizzes: HashMap<String, Quizz>,
    default_quiz: Quizz,
    // client_id -> last-touched ms (login/reconnect). Capped + stale-pruned
    // like the RateLimiter maps above — see LOGGED_CLIENT_STALE_MS.
    logged_clients: HashMap<String, u64>,
    // O(1) socket_id -> game_id lookup for the hot per-connection paths
    // (remove/mark-disconnected/set_player_team/set_player_avatar), which
    // used to scan every active game and lock its Mutex on every call.
    // Maintained at player join/reconnect/disconnect and game eviction; a
    // miss (e.g. an edge case that didn't update it) falls back to the old
    // full scan, so a stale/incomplete index degrades to the previous
    // behavior instead of losing correctness.
    socket_to_game: HashMap<String, String>,
}

impl GameRegistry {
    /// Load all quizzes from the database (if pool provided) or config/quizz directory or fall back to fixture.
    /// Prefers DB quizzes when available, then merges with file-based quizzes.
    async fn load_quizzes(pool: &Option<PgPool>) -> HashMap<String, Quizz> {
        let mut quizzes = HashMap::new();

        // First, try to load from database if pool available
        if pool.is_some() {
            quizzes = crate::db::get_quizzes(pool).await;
        }

        // Fall back to config/quizz files ONLY if the DB gave us nothing (no pool,
        // or an empty/failed read). When the shared DB is present it is authoritative
        // — do NOT supplement it with local disk quizzes (that would break parity).
        let config_path = Self::get_config_path();
        if quizzes.is_empty() && Path::new(&config_path).exists() {
            if let Ok(entries) = fs::read_dir(&config_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "json").unwrap_or(false) {
                        if let Ok(contents) = fs::read_to_string(&path) {
                            if let Ok(quiz) = serde_json::from_str::<Quizz>(&contents) {
                                if let Some(filename) = path.file_stem() {
                                    let id = filename.to_string_lossy().to_string();
                                    // Insert if not already from DB (file-based acts as fallback/supplement)
                                    quizzes.entry(id).or_insert(quiz);
                                }
                            }
                        }
                    }
                }
            }
        }

        quizzes
    }

    /// Get the config path (resolves to config/quizz directory).
    fn get_config_path() -> String {
        if let Ok(config_path) = std::env::var("CONFIG_PATH") {
            format!("{}/quizz", config_path)
        } else {
            // Fallback: assume running from rust/server, config is at ../../config
            let cwd = std::env::current_dir().unwrap();
            cwd.parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("config/quizz").to_string_lossy().to_string())
                .unwrap_or_else(|| "config/quizz".to_string())
        }
    }

    pub async fn new(pool: &Option<PgPool>, quiz_fixture: Quizz) -> Self {
        let quizzes = Self::load_quizzes(pool).await;
        Self {
            games_by_code: HashMap::new(),
            games_by_id: HashMap::new(),
            quizzes,
            default_quiz: quiz_fixture,
            logged_clients: HashMap::new(),
            socket_to_game: HashMap::new(),
        }
    }

    pub fn is_logged(&self, client_id: &str) -> bool {
        self.logged_clients.contains_key(client_id)
    }

    pub fn login_client(&mut self, client_id: String) {
        let now = get_now_ms();
        self.logged_clients.insert(client_id, now);

        // Cap unbounded growth from distinct client IDs (same idiom as
        // RateLimiter's solo_by_key/auth_by_key above): prune stale entries
        // only once the registry grows past the cap.
        if self.logged_clients.len() > LOGGED_CLIENTS_MAX_ENTRIES {
            self.logged_clients
                .retain(|_, last_seen| now.saturating_sub(*last_seen) <= LOGGED_CLIENT_STALE_MS);
        }
    }

    pub fn logout_client(&mut self, client_id: &str) {
        self.logged_clients.remove(client_id);
    }

    /// Generate a 6-digit PIN code for the invite (matching Node.js validation).
    fn generate_invite_code() -> String {
        let mut rng = rand::thread_rng();
        let pin: u32 = rand::Rng::gen_range(&mut rng, 100000..1000000);
        pin.to_string()
    }

    /// Validate username (parity with Node)
    pub fn validate_username(username: &str) -> Result<(), &'static str> {
        if username.len() < USERNAME_MIN_LEN {
            Err("errors:auth.usernameTooShort")
        } else if username.len() > USERNAME_MAX_LEN {
            Err("errors:auth.usernameTooLong")
        } else {
            Ok(())
        }
    }

    /// Validate avatar (parity with Node)
    pub fn validate_avatar(avatar: &str) -> Result<(), &'static str> {
        if avatar.is_empty() {
            return Ok(()); // Avatar is optional
        }

        // SVG data-URIs have their own max length
        if avatar.starts_with("data:image/svg+xml") {
            if avatar.len() > AVATAR_SVG_MAX_CHARS {
                return Err("errors:avatar.tooLarge");
            }
            return Ok(());
        }

        // Other data-URIs and regular avatars use byte-based cap
        if avatar.len() > (AVATAR_MAX_BYTES as f64 * 1.4) as usize {
            return Err("errors:avatar.tooLarge");
        }

        Ok(())
    }

    /// Create a new game with the specified quiz ID. Mirrors Node's
    /// game:create (packages/socket/src/handlers/game.ts:118-143): the
    /// quizzId MUST resolve to a real, known quiz — a missing, empty, or
    /// unknown id is rejected with "errors:quizz.notFound" and creates NO
    /// game, never silently falling back to a default quiz.
    /// Returns Err if active-game cap exceeded (C3) or the quiz lookup fails.
    pub fn create_game(
        &mut self,
        manager_socket_id: String,
        quiz_id: Option<String>,
        manager_client_id: String,
        low_latency: bool,
    ) -> Result<(String, String, String), &'static str> {
        let quiz = match quiz_id {
            Some(id) if !id.is_empty() => match self.quizzes.get(&id) {
                Some(q) => q.clone(),
                None => return Err("errors:quizz.notFound"),
            },
            _ => return Err("errors:quizz.notFound"),
        };

        // C3 — active-game cap: reject once N concurrent games exist
        if self.games_by_id.len() >= MAX_ACTIVE_GAMES {
            return Err("errors:game.serverBusy");
        }

        let game_id = Uuid::new_v4().to_string();
        let invite_code = Self::generate_invite_code();

        let mut game = Game::new(
            game_id.clone(),
            invite_code.clone(),
            manager_socket_id,
            quiz,
        );
        game.manager_client_id = Some(manager_client_id);
        game.low_latency = low_latency;
        let host_token = game.host_token.clone();
        let game = Arc::new(Mutex::new(game));

        self.games_by_code.insert(invite_code.clone(), Arc::clone(&game));
        self.games_by_id.insert(game_id.clone(), game);

        Ok((game_id, invite_code, host_token))
    }

    /// Find a game by invite code.
    pub fn get_game_by_code(&self, invite_code: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_code.get(invite_code).cloned()
    }

    /// Find a game by game ID.
    pub fn get_game_by_id(&self, game_id: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_id.get(game_id).cloned()
    }


    /// Resolve a game by socket ID (clock_ping gate): uses the O(1) socket_to_game
    /// index, with fallback to a full scan if the index misses (graceful degradation).
    pub fn get_game_by_socket_id(&self, socket_id: &str) -> Option<Arc<Mutex<Game>>> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let is_member = {
                let game = match game_ref.lock() {
                    Ok(g) => g,
                    Err(_) => continue,
                };
                game.manager_socket_id == socket_id
                    || game.players.iter().any(|p| p.id == socket_id)
            };
            if is_member {
                return Some(game_ref);
            }
        }
        None
    }
    /// Get a quiz by ID.
    pub fn get_quiz_by_id(&self, quiz_id: &str) -> Option<Quizz> {
        self.quizzes.get(quiz_id).cloned()
    }

    /// List all available quiz IDs.
    pub fn list_quiz_ids(&self) -> Vec<String> {
        self.quizzes.keys().cloned().collect()
    }

    /// Reload quizzes from a HashMap. Used after DB operations to keep the registry in sync.
    pub fn reload_quizzes(&mut self, quizzes: std::collections::HashMap<String, razzoozle_protocol::quizz::Quizz>) {
        self.quizzes = quizzes;
    }

    /// Find the manager socket ID for a game.
    pub fn get_manager_socket_id(&self, game_id: &str) -> Option<String> {
        self.games_by_id
            .get(game_id)
            .and_then(|game| {
                let g = game.lock().unwrap();
                Some(g.manager_socket_id.clone())
            })
    }

    /// Get the number of active games
    pub fn game_count(&self) -> usize {
        self.games_by_id.len()
    }
    /// Get references to all active games (for iteration over Arc<Mutex<Game>>).
    pub fn get_all_games(&self) -> Vec<Arc<Mutex<Game>>> {
        self.games_by_id.values().cloned().collect()
    }

    /// Lock a game, recovering from mutex poisoning (a prior panic while some
    /// other task held this same lock) instead of propagating a second panic.
    /// A poisoned Game is still structurally usable data — Rust only poisons
    /// out of caution — so recovering it here keeps the eviction reaper (a
    /// single unsupervised background loop, see main.rs) alive instead of it
    /// dying forever on the first panic anywhere that touches a Game lock.
    fn lock_game_recover(game_ref: &Arc<Mutex<Game>>) -> std::sync::MutexGuard<'_, Game> {
        game_ref.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Record (or update) which game a socket_id currently belongs to. Call
    /// whenever a socket starts representing a player in a game (join,
    /// reconnect-with-new-socket-id).
    pub fn index_player_socket(&mut self, socket_id: String, game_id: String) {
        self.socket_to_game.insert(socket_id, game_id);
    }

    /// Drop a socket_id from the index once it's dead/superseded (leave,
    /// disconnect-remove, mark-disconnected, or reconnect assigning a new id
    /// to the same player).
    pub fn deindex_player_socket(&mut self, socket_id: &str) {
        self.socket_to_game.remove(socket_id);
    }

    /// Candidate games to scan for a given socket_id: the O(1) index hit if
    /// we have one, else every active game (self-healing fallback if the
    /// index is ever incomplete/stale).
    fn socket_lookup_candidates(&self, socket_id: &str) -> Vec<Arc<Mutex<Game>>> {
        match self.socket_to_game.get(socket_id) {
            Some(game_id) => self.games_by_id.get(game_id).cloned().into_iter().collect(),
            None => self.games_by_id.values().cloned().collect(),
        }
    }

    /// C4 — Game eviction: remove stale/finished games and clear their player sessions.
    /// Call periodically to prevent memory leaks. Clears player entries to prevent
    /// "resume reconnect" from keeping sessions forever.
    pub fn evict_stale_games(&mut self) {
        let now = get_now_ms();

        let stale_games: Vec<String> = self
            .games_by_id
            .values()
            .filter_map(|game_ref| {
                let game = Self::lock_game_recover(game_ref);
                if game.is_stale(now) {
                    Some(game.invite_code.clone())
                } else {
                    None
                }
            })
            .collect();

        for invite_code in stale_games {
            // Remove by invite code (which removes from games_by_code)
            if let Some(game_ref) = self.games_by_code.remove(&invite_code) {
                let game = Self::lock_game_recover(&game_ref);
                // Remove from games_by_id as well
                self.games_by_id.remove(&game.game_id);
                // Drop this evicted game's players from the socket_id index —
                // otherwise those entries would linger forever pointing at a
                // game_id that no longer exists.
                for player in &game.players {
                    self.socket_to_game.remove(&player.id);
                }
            }
        }
    }
    /// Remove a game from the registry by game_id. Returns true if the game was found and removed,
    /// false otherwise (silent no-op pattern per Node parity).
    pub fn remove_game(&mut self, game_id: &str) -> bool {
        // Try to find the game by id and remove it
        if let Some(game_ref) = self.games_by_id.remove(game_id) {
            let game = Self::lock_game_recover(&game_ref);
            // Also remove from games_by_code lookup
            self.games_by_code.remove(&game.invite_code);
            // Remove all players from the socket_to_game index
            for player in &game.players {
                self.socket_to_game.remove(&player.id);
            }
            // Also remove the manager socket (defensive; may not be indexed)
            self.socket_to_game.remove(&game.manager_socket_id);
            return true;
        }
        false
    }


    pub fn remove_player_by_socket_id(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(player_index) = game
                .players
                .iter()
                .position(|player| player.id == socket_id)
            {
                let removed_player_id = game.players[player_index].client_id.clone();
                game.players.remove(player_index);
                game.engine.players.retain(|player| player.id != socket_id);
                game.engine.current_answers.remove(&removed_player_id);
                game.engine
                    .answer_order
                    .retain(|client_id| client_id != &removed_player_id);

                let result = (
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                );
                drop(game);
                self.socket_to_game.remove(socket_id);
                return Some(result);
            }
        }

        None
    }

    pub fn mark_player_disconnected(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize, bool)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(player_index) = game
                .players
                .iter()
                .position(|player| player.id == socket_id)
            {
                let removed_player_id = game.players[player_index].client_id.clone();

                // Phase-aware keep-on-disconnect:
                // If lobby (ShowRoom), remove; if started, mark disconnected only
                let removed = if game.engine.phase == razzoozle_engine::state::GamePhase::ShowRoom {
                    // Lobby: hard remove
                    game.players.remove(player_index);
                    game.engine.players.retain(|player| player.id != socket_id);
                    game.engine.current_answers.remove(&removed_player_id);
                    game.engine
                        .answer_order
                        .retain(|client_id| client_id != &removed_player_id);
                    true
                } else {
                    // Mid-game: keep slot, just mark disconnected
                    game.players[player_index].connected = false;
                    if let Some(eng_pos) = game.engine.players.iter().position(|p| p.id == socket_id) {
                        game.engine.players[eng_pos].connected = false;
                    }
                    false
                };

                let result = (
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                    removed,
                );
                drop(game);
                // Either way this socket_id is dead: hard-removed, or kept as
                // a disconnected slot that will get a BRAND NEW socket_id on
                // reconnect (this one is never looked up again).
                self.socket_to_game.remove(socket_id);
                return Some(result);
            }
        }

        None
    }

    /// Updates the player's team and returns their updated snapshot plus the
    /// game_id/manager_socket_id a caller needs to broadcast MANAGER.NEW_PLAYER
    /// / PLAYER.UPDATE_LEADERBOARD (the Game is locked here anyway, so reading
    /// them out costs nothing extra). No broadcast happens here.
    pub fn set_player_team(&self, socket_id: &str, team_id: String) -> Option<(Player, String, String)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].team_id = Some(team_id.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].team_id = Some(team_id);
                }
                return Some((
                    game.players[pos].clone(),
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                ));
            }
        }
        None
    }

    /// Updates the player's avatar and returns their updated snapshot plus the
    /// game_id/manager_socket_id (see set_player_team above). No broadcast
    /// happens here.
    pub fn set_player_avatar(&self, socket_id: &str, avatar: String) -> Option<(Player, String, String)> {
        for game_ref in self.socket_lookup_candidates(socket_id) {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].avatar = Some(avatar.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].avatar = Some(avatar);
                }
                return Some((
                    game.players[pos].clone(),
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                ));
            }
        }
        None
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_username() {
        // Valid usernames
        assert!(GameRegistry::validate_username("alice").is_ok());
        assert!(GameRegistry::validate_username("1234").is_ok());
        assert!(GameRegistry::validate_username("verylongusername123").is_ok());

        // Too short
        assert!(GameRegistry::validate_username("abc").is_err());

        // Too long
        assert!(GameRegistry::validate_username("verylongusernamethatexceedsmax").is_err());
    }

    #[test]
    fn test_validate_avatar() {
        // Valid avatars
        assert!(GameRegistry::validate_avatar("").is_ok());
        assert!(GameRegistry::validate_avatar("data:image/svg+xml;utf8,<svg></svg>").is_ok());
        assert!(GameRegistry::validate_avatar("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==").is_ok());

        // SVG too large (exceeds 64KB max)
        let large_svg = format!("data:image/svg+xml;{}", "x".repeat(66000));
        assert!(GameRegistry::validate_avatar(&large_svg).is_err(), "Large SVG should be rejected");
    }

    #[test]
    fn test_safe_asset_id() {
        // Valid IDs
        assert!(safe_asset_id("quiz-abc123").is_ok());
        assert!(safe_asset_id("result_001").is_ok());
        assert!(safe_asset_id("test-123_abc").is_ok());

        // Invalid: path traversal
        assert!(safe_asset_id("../../etc/passwd").is_err());
        assert!(safe_asset_id("../../../secret").is_err());
        assert!(safe_asset_id("test/../etc/shadow").is_err());

        // Invalid: special characters
        assert!(safe_asset_id("test/file").is_err());
        assert!(safe_asset_id("test\\file").is_err());
        assert!(safe_asset_id("test;file").is_err());
        assert!(safe_asset_id("test file").is_err());

        // Reserved keywords
        assert!(safe_asset_id("__proto__").is_err());
        assert!(safe_asset_id("constructor").is_err());
        assert!(safe_asset_id("prototype").is_err());
    }

    /// Registers `quiz` under `id` (via reload_quizzes) so create_game's
    /// quizzId-must-resolve validation has something real to find — the tests
    /// below care about cap/eviction/player behavior, not quiz lookup itself.
    fn seed_quiz(registry: &mut GameRegistry, id: &str, quiz: Quizz) {
        let mut quizzes = HashMap::new();
        quizzes.insert(id.to_string(), quiz);
        registry.reload_quizzes(quizzes);
    }

    #[test]
    fn test_active_game_cap() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
        seed_quiz(&mut registry, "test-quiz", empty_quiz);

        // Create MAX_ACTIVE_GAMES games
        for i in 0..MAX_ACTIVE_GAMES {
            let result = registry.create_game(
                format!("socket-{}", i),
                Some("test-quiz".to_string()),
                format!("client-{}", i),
                false,
            );
            assert!(result.is_ok(), "Game {} creation failed", i);
        }

        // 101st game should fail (cap exceeded)
        let result = registry.create_game(
            "socket-overflow".to_string(),
            Some("test-quiz".to_string()),
            "client-overflow".to_string(),
            false,
        );
        assert!(result.is_err(), "101st game should fail");
        assert_eq!(result.unwrap_err(), "errors:game.serverBusy");
    }

    #[test]
    fn test_create_game_rejects_missing_or_unknown_quiz_id() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz));

        // Missing quizzId
        let result = registry.create_game("socket-1".to_string(), None, "client-1".to_string(), false);
        assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

        // Empty-string quizzId
        let result = registry.create_game(
            "socket-2".to_string(),
            Some(String::new()),
            "client-2".to_string(),
            false,
        );
        assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

        // Unknown quizzId (not registered)
        let result = registry.create_game(
            "socket-3".to_string(),
            Some("does-not-exist".to_string()),
            "client-3".to_string(),
            false,
        );
        assert_eq!(result.unwrap_err(), "errors:quizz.notFound");

        // None of the above should have created a game (parity with Node:
        // an unresolved quizzId creates NO game, never a default fallback).
        assert_eq!(registry.game_count(), 0);
    }

    #[test]
    fn test_add_player_rejects_duplicate_client_id() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let mut game = Game::new(
            "game-1".to_string(),
            "INV1".to_string(),
            "manager-1".to_string(),
            empty_quiz,
        );

        assert!(game
            .add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None)
            .is_ok());

        let result = game.add_player(
            "socket-2".to_string(),
            "client-1".to_string(),
            "AliceAgain".to_string(),
            None,
        );
        assert_eq!(result.unwrap_err(), "errors:game.playerAlreadyConnected");
        assert_eq!(game.players.len(), 1, "duplicate join must not create a second player record");
    }

    #[test]
    fn test_logged_clients_prunes_stale_entries_past_cap() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz));

        // Seed one entry as if logged in long before the staleness TTL.
        registry.logged_clients.insert("ancient-client".to_string(), 0);
        assert!(registry.is_logged("ancient-client"));

        // Push the map past the cap with fresh logins — triggers a prune pass.
        for i in 0..=LOGGED_CLIENTS_MAX_ENTRIES {
            registry.login_client(format!("client-{}", i));
        }

        assert!(!registry.is_logged("ancient-client"), "stale entry should have been pruned");
        assert!(
            registry.is_logged(&format!("client-{}", LOGGED_CLIENTS_MAX_ENTRIES)),
            "fresh entries must survive pruning"
        );
    }

    #[test]
    fn test_evict_stale_games_recovers_poisoned_mutex() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
        seed_quiz(&mut registry, "test-quiz", empty_quiz);

        let (game_id, _, _) = registry
            .create_game(
                "manager-1".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                false,
            )
            .unwrap();
        let game_ref = registry.get_game_by_id(&game_id).unwrap();

        // Poison the mutex the standard way: panic on another thread while
        // holding the lock (mirrors a real handler bug mid-lock).
        let poison_ref = Arc::clone(&game_ref);
        let _ = std::thread::spawn(move || {
            let _guard = poison_ref.lock().unwrap();
            panic!("simulated handler panic while holding the Game lock");
        })
        .join();
        assert!(game_ref.is_poisoned(), "setup: mutex should be poisoned");

        // Mark it stale (via the same poison-recovering access evict_stale_games
        // itself uses) so eviction actually targets it.
        {
            let mut game = GameRegistry::lock_game_recover(&game_ref);
            game.last_activity_ms = 0;
        }

        // Must NOT panic — that's the whole point of the fix.
        registry.evict_stale_games();

        assert!(
            registry.get_game_by_id(&game_id).is_none(),
            "poisoned-but-stale game should still be evicted, not leaked forever"
        );
    }

    #[test]
    fn test_game_eviction_clears_players() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut registry = rt.block_on(GameRegistry::new(&None, empty_quiz.clone()));
        seed_quiz(&mut registry, "test-quiz", empty_quiz);

        // Create a game
        let (game_id, _, _) = registry
            .create_game(
                "manager-1".to_string(),
                Some("test-quiz".to_string()),
                "manager-client-1".to_string(),
                false,
            )
            .unwrap();

        // Add players to the game
        {
            let game_ref = registry.get_game_by_id(&game_id).unwrap();
            let mut game = game_ref.lock().unwrap();
            game.add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None).unwrap();
            game.add_player("socket-2".to_string(), "client-2".to_string(), "Bob".to_string(), None).unwrap();
        }

        // Verify 2 players are in the game
        {
            let game_ref = registry.get_game_by_id(&game_id).unwrap();
            let game = game_ref.lock().unwrap();
            assert_eq!(game.players.len(), 2, "Should have 2 players");
        }

        // Mark game as stale by setting old activity timestamp
        {
            let game_ref = registry.get_game_by_id(&game_id).unwrap();
            let mut game = game_ref.lock().unwrap();
            game.last_activity_ms = 0; // Very old timestamp
        }

        // Evict stale games (should remove the game and its players)
        registry.evict_stale_games();

        // Verify game is gone
        assert!(registry.get_game_by_id(&game_id).is_none(), "Game should be evicted");
        assert_eq!(registry.game_count(), 0, "No games should remain");
    }

    #[test]
    fn test_per_ip_solo_rate_limit() {
        let rate_limiter = RateLimiter::new();

        // IP 1 should be allowed up to SOLO_RATE_MAX_PER_CLIENT calls
        for _ in 0..SOLO_RATE_MAX_PER_CLIENT {
            assert!(rate_limiter.check_solo_rate("192.168.1.1"), "IP1 should be allowed");
        }
        assert!(!rate_limiter.check_solo_rate("192.168.1.1"), "IP1 should be throttled");

        // IP 2 should have independent limit
        assert!(rate_limiter.check_solo_rate("192.168.1.2"), "IP2 should be allowed");
        assert!(rate_limiter.check_solo_rate("192.168.1.2"), "IP2 should be allowed");
    }

    #[test]
    fn test_per_ip_auth_throttle() {
        let rate_limiter = RateLimiter::new();

        // IP 1: 10 failures should trigger throttle on 11th attempt
        for _ in 0..AUTH_RATE_MAX_PER_CLIENT {
            assert!(!rate_limiter.record_auth_failure_and_check_throttle("192.168.1.1"), "Should not be throttled yet");
        }
        assert!(rate_limiter.record_auth_failure_and_check_throttle("192.168.1.1"), "Should be throttled now");

        // IP 2 should have independent limit
        assert!(!rate_limiter.record_auth_failure_and_check_throttle("192.168.1.2"), "IP2 should not be throttled");
    }
}
