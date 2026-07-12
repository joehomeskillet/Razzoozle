use razzoozle_protocol::quizz::Quizz;
use sqlx::PgPool;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use super::{
    get_now_ms, Game, AVATAR_MAX_BYTES, AVATAR_SVG_MAX_CHARS, MAX_ACTIVE_GAMES, USERNAME_MAX_LEN, USERNAME_MIN_LEN,
};

/// A game whose manager has left but may reconnect within the grace window.
pub struct EmptyGame {
    pub game_id: String,
    pub marked_at_ms: u64,
}

/// Registry managing all active games and available quizzes.
pub struct GameRegistry {
    pub(super) games_by_code: HashMap<String, Arc<Mutex<Game>>>,
    pub(super) games_by_id: HashMap<String, Arc<Mutex<Game>>>,
    quizzes: HashMap<String, Quizz>,
    default_quiz: Quizz,
    // O(1) socket_id -> game_id lookup for the hot per-connection paths
    // (remove/mark-disconnected/set_player_team/set_player_avatar), which
    // used to scan every active game and lock its Mutex on every call.
    // Maintained at player join/reconnect/disconnect and game eviction; a
    // miss (e.g. an edge case that didn't update it) falls back to the old
    // full scan, so a stale/incomplete index degrades to the previous
    // behavior instead of losing correctness.
    pub(super) socket_to_game: HashMap<String, String>,
    pub(super) empty_games: Vec<EmptyGame>,
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
            socket_to_game: HashMap::new(),
            empty_games: Vec::new(),
        }
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

    /// Resolve a user by session token (thin wrapper over db::users::session_user).
    /// Returns None if token is invalid, expired, or if there's a DB error.
    pub async fn session_user(&self, token: &str, pool: &Option<PgPool>) -> Option<crate::db::users::AuthUser> {
        if let Some(ref p) = pool {
            crate::db::users::session_user(p, token).await.ok().flatten()
        } else {
            None
        }
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
        low_latency_config: serde_json::Value,
    ) -> Result<(String, String, String), &'static str> {
        let quiz_id_str = match quiz_id {
            Some(id) if !id.is_empty() => id,
            _ => return Err("errors:quizz.notFound"),
        };

        let quiz = match self.quizzes.get(&quiz_id_str) {
            Some(q) => q.clone(),
            None => return Err("errors:quizz.notFound"),
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
            quiz_id_str,
            quiz,
        );
        game.manager_client_id = Some(manager_client_id);
        game.low_latency = low_latency;
        game.low_latency_config = low_latency_config;
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

    /// Find a game by manager client ID (fallback resolution for manager handlers
    /// when gameId is missing; mirrors Node getManagerGame logic). Scans active
    /// games for a match on manager_client_id. Used as a fallback in SET_AUTO and
    /// other manager handlers when the payload gameId is absent/unknown.
    pub fn get_game_by_manager_client_id(&self, manager_client_id: &str) -> Option<Arc<Mutex<Game>>> {
        self.games_by_id
            .values()
            .find(|game_ref| {
                if let Ok(game) = game_ref.lock() {
                    game.manager_client_id.as_deref() == Some(manager_client_id)
                } else {
                    false
                }
            })
            .cloned()
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
    pub(super) fn lock_game_recover(game_ref: &Arc<Mutex<Game>>) -> std::sync::MutexGuard<'_, Game> {
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
    pub(super) fn socket_lookup_candidates(&self, socket_id: &str) -> Vec<Arc<Mutex<Game>>> {
        match self.socket_to_game.get(socket_id) {
            Some(game_id) => self.games_by_id.get(game_id).cloned().into_iter().collect(),
            None => self.games_by_id.values().cloned().collect(),
        }
    }

    /// Clean up avatar directories for games that no longer exist.
    /// Mirrors Node's cleanupStaleAvatars: deletes avatar dirs that are NOT in the active game set.
    /// Generic directory is always preserved.
    pub fn cleanup_stale_avatars(&self) {
        use std::fs;
        use std::path::Path;

        let active_game_ids: std::collections::HashSet<_> = self.games_by_id.keys().cloned().collect();
        let config_path = std::env::var("CONFIG_PATH").unwrap_or_else(|_| "config".to_string());
        let avatar_root = Path::new(&config_path).join("media/avatars");

        if !avatar_root.exists() {
            return;
        }

        let entries = match fs::read_dir(&avatar_root) {
            Ok(e) => e,
            Err(_) => return,
        };

        let mut removed = 0;

        for entry in entries.flatten() {
            let path = entry.path();
            let name = match entry.file_name().into_string() {
                Ok(n) => n,
                Err(_) => continue,
            };

            // Skip non-directories and the "generic" directory
            if !path.is_dir() || name == "generic" {
                continue;
            }

            // Delete if game ID is not active
            if !active_game_ids.contains(&name) {
                if let Err(e) = fs::remove_dir_all(&path) {
                    tracing::warn!("Failed to remove stale avatar directory {}: {}", name, e);
                } else {
                    removed += 1;
                }
            }
        }

        if removed > 0 {
            tracing::info!("Removed {} stale avatar director(ies)", removed);
        }
    }

    /// Restore games from the snapshot, marking them as empty (for reconnect grace window).
    /// Returns the `ResumePlan`s for games restored mid-flight so the caller can
    /// re-spawn their lifecycle tasks (BLOCKER #12).
    /// Crash-guarded: a snapshot load failure logs a warning but returns an empty Vec (never panics).
    pub async fn load_snapshot(&mut self) -> Vec<crate::state::snapshot::ResumePlan> {
        let games = crate::state::snapshot::load_snapshot().await;

        let mut plans = Vec::new();
        for (game, plan) in games {
            let game_id = game.game_id.clone();
            let invite_code = game.invite_code.clone();
            let game = Arc::new(Mutex::new(game));

            self.games_by_code
                .insert(invite_code, Arc::clone(&game));
            self.games_by_id.insert(game_id.clone(), game);

            // Mark as empty so it's cleaned up if nobody reconnects within the grace window
            self.empty_games.push(EmptyGame {
                game_id,
                marked_at_ms: crate::state::get_now_ms(),
            });

            if let Some(plan) = plan {
                plans.push(plan);
            }
        }
        plans
    }

    /// Save all in-flight games to disk. Crash-guarded: a write failure logs a warning but never throws.
    pub async fn save_snapshot(&self) {
        let games: Vec<_> = self.games_by_id.values().cloned().collect();

        if let Err(e) = crate::state::snapshot::save_snapshot(games).await {
            tracing::warn!("Failed to save snapshot: {}", e);
        }
    }
}
