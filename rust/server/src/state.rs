//! state.rs — In-memory game registry and state management.

use razzoozle_engine::state::GameState;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use lazy_static::lazy_static;
use regex::Regex;

// Resource caps (parity with Node)
pub const MAX_ACTIVE_GAMES: usize = 100;
pub const MAX_PLAYERS_PER_GAME: usize = 200;
pub const USERNAME_MIN_LEN: usize = 4;
pub const USERNAME_MAX_LEN: usize = 20;
pub const AVATAR_MAX_BYTES: usize = 4_000_000;
pub const AVATAR_SVG_MAX_CHARS: usize = 64 * 1024;

// Game eviction: TTL for finished/stale games (milliseconds)
pub const GAME_EVICTION_TTL_MS: u64 = 300_000; // 5 minutes

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

/// Rate limiter for solo API and auth attempts — per-IP (or per-client-ID for socket handlers)
pub struct RateLimiter {
    solo_by_key: Mutex<HashMap<String, RateState>>,
    auth_by_key: Mutex<HashMap<String, RateState>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            solo_by_key: Mutex::new(HashMap::new()),
            auth_by_key: Mutex::new(HashMap::new()),
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
    pub host_token: String,
    pub players: Vec<Player>,
    pub engine: GameState,
    // Last activity timestamp (ms since UNIX epoch)
    pub last_activity_ms: u64,
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
            host_token,
            players: Vec::new(),
            engine: GameState::new(quiz, Vec::new()),
            last_activity_ms: now,
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
    pub fn add_player(
        &mut self,
        socket_id: String,
        client_id: String,
        username: String,
        avatar: Option<String>,
    ) -> Player {
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
        player
    }
}

/// Registry managing all active games and available quizzes.
pub struct GameRegistry {
    games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    games_by_id: HashMap<String, Arc<Mutex<Game>>>,
    quizzes: HashMap<String, Quizz>,
    default_quiz: Quizz,
    logged_clients: HashSet<String>,
}

impl GameRegistry {
    /// Load all quizzes from the config/quizz directory or fall back to the fixture.
    fn load_quizzes() -> HashMap<String, Quizz> {
        let mut quizzes = HashMap::new();

        // Try to load from config/quizz directory
        let config_path = Self::get_config_path();
        if Path::new(&config_path).exists() {
            if let Ok(entries) = fs::read_dir(&config_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "json").unwrap_or(false) {
                        if let Ok(contents) = fs::read_to_string(&path) {
                            if let Ok(quiz) = serde_json::from_str::<Quizz>(&contents) {
                                if let Some(filename) = path.file_stem() {
                                    let id = filename.to_string_lossy().to_string();
                                    quizzes.insert(id, quiz);
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

    pub fn new(quiz_fixture: Quizz) -> Self {
        let quizzes = Self::load_quizzes();
        Self {
            games_by_code: HashMap::new(),
            games_by_id: HashMap::new(),
            quizzes,
            default_quiz: quiz_fixture,
            logged_clients: HashSet::new(),
        }
    }

    pub fn is_logged(&self, client_id: &str) -> bool {
        self.logged_clients.contains(client_id)
    }

    pub fn login_client(&mut self, client_id: String) {
        self.logged_clients.insert(client_id);
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

    /// Create a new game with the specified quiz ID, or use default if not found.
    /// Returns Err if active-game cap exceeded (C3).
    pub fn create_game(&mut self, manager_socket_id: String, quiz_id: Option<String>) -> Result<(String, String, String), &'static str> {
        // C3 — active-game cap: reject once N concurrent games exist
        if self.games_by_id.len() >= MAX_ACTIVE_GAMES {
            return Err("errors:game.serverBusy");
        }

        let game_id = Uuid::new_v4().to_string();
        let invite_code = Self::generate_invite_code();

        let quiz = if let Some(id) = quiz_id {
            self.quizzes.get(&id).cloned().unwrap_or_else(|| self.default_quiz.clone())
        } else {
            self.default_quiz.clone()
        };

        let game = Game::new(
            game_id.clone(),
            invite_code.clone(),
            manager_socket_id,
            quiz,
        );
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

    /// Get a quiz by ID.
    pub fn get_quiz_by_id(&self, quiz_id: &str) -> Option<Quizz> {
        self.quizzes.get(quiz_id).cloned()
    }

    /// List all available quiz IDs.
    pub fn list_quiz_ids(&self) -> Vec<String> {
        self.quizzes.keys().cloned().collect()
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

    /// C4 — Game eviction: remove stale/finished games and clear their player sessions.
    /// Call periodically to prevent memory leaks. Clears player entries to prevent
    /// "resume reconnect" from keeping sessions forever.
    pub fn evict_stale_games(&mut self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let stale_games: Vec<String> = self
            .games_by_id
            .values()
            .filter_map(|game_ref| {
                let game = game_ref.lock().unwrap();
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
                let game = game_ref.lock().unwrap();
                // Remove from games_by_id as well
                self.games_by_id.remove(&game.game_id);
            }
        }
    }

    pub fn remove_player_by_socket_id(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize)> {
        for game_ref in self.games_by_id.values() {
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

                return Some((
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                ));
            }
        }

        None
    }

    pub fn mark_player_disconnected(
        &mut self,
        socket_id: &str,
    ) -> Option<(String, String, String, usize, bool)> {
        for game_ref in self.games_by_id.values() {
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

                return Some((
                    game.game_id.clone(),
                    game.manager_socket_id.clone(),
                    removed_player_id,
                    game.players.len(),
                    removed,
                ));
            }
        }

        None
    }

    pub fn set_player_team(&self, socket_id: &str, team_id: String) {
        for game_ref in self.games_by_id.values() {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].team_id = Some(team_id.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].team_id = Some(team_id);
                }
                return;
            }
        }
    }

    pub fn set_player_avatar(&self, socket_id: &str, avatar: String) {
        for game_ref in self.games_by_id.values() {
            let mut game = game_ref.lock().unwrap();

            if let Some(pos) = game.players.iter().position(|p| p.id == socket_id) {
                game.players[pos].avatar = Some(avatar.clone());
                if pos < game.engine.players.len() && game.engine.players[pos].id == socket_id {
                    game.engine.players[pos].avatar = Some(avatar);
                }
                return;
            }
        }
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

    #[test]
    fn test_active_game_cap() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let mut registry = GameRegistry::new(empty_quiz);

        // Create MAX_ACTIVE_GAMES games
        for i in 0..MAX_ACTIVE_GAMES {
            let result = registry.create_game(format!("socket-{}", i), None);
            assert!(result.is_ok(), "Game {} creation failed", i);
        }

        // 101st game should fail (cap exceeded)
        let result = registry.create_game("socket-overflow".to_string(), None);
        assert!(result.is_err(), "101st game should fail");
        assert_eq!(result.unwrap_err(), "errors:game.serverBusy");
    }

    #[test]
    fn test_game_eviction_clears_players() {
        let empty_quiz = Quizz {
            subject: "Test".to_string(),
            questions: vec![],
            archived: None,
            theme_id: None,
        };
        let mut registry = GameRegistry::new(empty_quiz);

        // Create a game
        let (game_id, _, _) = registry.create_game("manager-1".to_string(), None).unwrap();

        // Add players to the game
        {
            let game_ref = registry.get_game_by_id(&game_id).unwrap();
            let mut game = game_ref.lock().unwrap();
            game.add_player("socket-1".to_string(), "client-1".to_string(), "Alice".to_string(), None);
            game.add_player("socket-2".to_string(), "client-2".to_string(), "Bob".to_string(), None);
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
