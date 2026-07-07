use razzoozle_engine::state::GameState;
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use razzoozle_protocol::status::Status;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

use super::GAME_EVICTION_TTL_MS;

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
    // Pause state: when true, the game is paused; paused_state holds the pre-pause status to resume from
    pub paused: bool,
    // Snapshot of the status + data at the time of pause, for replay on resume
    pub paused_state: Option<(Status, serde_json::Value)>,
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
            paused: false,
            paused_state: None,
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
