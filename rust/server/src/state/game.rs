use crate::bot::BotManager;
use razzoozle_engine::state::{GamePhase, GameState};
use razzoozle_protocol::player::Player;
use razzoozle_protocol::quizz::Quizz;
use razzoozle_protocol::status::{GameStatus, RoundRecapAward, ShowResultData, Status};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::task::JoinHandle;
use uuid::Uuid;
use rand::Rng;
use tracing::warn;

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
    // Full low-latency config JSON object (enabled, clockSync, preloadNextQuestion, etc.).
    // Read ONCE at game creation (Node parity: Game.lowLatency is a read-once snapshot;
    // config changes only affect games created afterwards). Used by clock_ping — no DB query on the hot path.
    pub low_latency_config: serde_json::Value,
    // Monotonic per-game server sequence counter for SELECT_ANSWER emissions.
    // Incremented once per opened question when low_latency is true.
    pub server_seq: i32,
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
    // Last status broadcast to the manager room (mirrors Node's lastBroadcastStatus),
    // replayed on manager:reconnect so status.data is not an empty object.
    pub last_manager_status: Option<(Status, serde_json::Value)>,
    // Absolute server deadline (ms since UNIX epoch, wall-clock `SystemTime`)
    // for the current question's answer window. This is CLIENT-facing only —
    // it feeds `answer_deadline_at_server_ms` in the SELECT_ANSWER payload, so
    // clients can compare it against their own `Date.now()`. Set when a
    // question opens; adjustTimer shifts it in lockstep with `deadline_instant`.
    pub deadline_ms: i64,
    // Internal server-side countdown deadline, expressed on tokio's clock
    // (`tokio::time::Instant`) instead of wall-clock `SystemTime`. The
    // lifecycle's per-question tick loop (`run_cooldown_with_deadline`) computes
    // its remaining-seconds display from THIS field, not `deadline_ms` — under
    // `tokio::time::pause()` (as the test suite drives time), `SystemTime` never
    // moves while `tokio::time::Instant` advances with the virtual clock, so a
    // wall-clock deadline would desync from the tick loop and hang forever.
    // `None` while no question is live; set alongside `deadline_ms` when a
    // question opens, shifted alongside it by adjustTimer.
    pub deadline_instant: Option<tokio::time::Instant>,
    // Wall-clock moment (ms since UNIX epoch) the CURRENT question's answer
    // window opened. Immutable for the life of the question — unlike
    // `deadline_ms`, adjustTimer does NOT shift this — so a resync payload
    // (adjustTimer re-emitting SELECT_ANSWER) can report the true original
    // start alongside the shifted deadline instead of resetting it to "now".
    pub question_start_at_server_ms: i64,
    // Wakes lifecycle dwell pause-loops on resume (separate from cooldown_abort).
    pub pause_resume: Arc<tokio::sync::Notify>,
    // Per-player SHOW_RESULT payloads cached at reveal time — used by setAuto to
    // re-emit with autoAdvanceMs when auto-mode is toggled mid-result-screen.
    pub last_show_result_data: HashMap<String, ShowResultData>,
    // Low-latency playerAnswer coalesce flag: prevents multiple PLAYER_ANSWER
    // emits within the throttle window (100ms). Leading-edge sets true, trailing
    // Per-round recap awards to be emitted via SHOW_ROUND_RECAP phase
    pub temp_round_recap: Option<Vec<RoundRecapAward>>,
    // Per-question shuffled chunks (sentence-builder only)
    pub shuffled_chunks: Option<Vec<String>>,
    // task resets to false after emitting.
    pub answer_count_push_pending: bool,
    // Sim-mode bot answer scheduler (None until first bot is added).
    pub bot_manager: Option<Arc<BotManager>>,
    // Pending auto-advance task spawned when setAuto(true) is called during
    // SHOW_RESULT. The task sleeps for AUTO_RESULT_MS then calls request_abort
    // to wake the lifecycle loop. None while no auto-advance is armed (mirrors
    // Node's autoTimer). Cancelled on setAuto(false) or when phase changes.
    pub auto_advance_task: Option<JoinHandle<()>>,
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
            low_latency_config: serde_json::json!({
                "enabled": false,
                "clockSync": true,
                "preloadNextQuestion": true,
                "answerAck": true,
                "scoreboardBroadcastThrottleMs": 100,
                "maxLatencyCompensationMs": 150,
            }),
            server_seq: 0,
            auto_mode: false,
            temp_round_recap: None,
            shuffled_chunks: None,
            cooldown_abort: None,
            paused: false,
            paused_state: None,
            last_manager_status: None,
            deadline_ms: 0,
            deadline_instant: None,
            question_start_at_server_ms: 0,
            pause_resume: Arc::new(tokio::sync::Notify::new()),
            last_show_result_data: HashMap::new(),
            answer_count_push_pending: false,
            bot_manager: None,
            auto_advance_task: None,
        }
    }

    /// Record the last status payload broadcast to the manager room.
    pub fn record_last_manager_status(&mut self, status: &GameStatus) {
        let Ok(val) = serde_json::to_value(status) else {
            warn!("record_last_manager_status: failed to serialize status, reconnect replay will be stale");
            return;
        };

        let (Some(name_val), Some(data)) = (val.get("name"), val.get("data")) else {
            warn!("record_last_manager_status: missing 'name' or 'data' field, reconnect replay will be stale");
            return;
        };

        match serde_json::from_value::<Status>(name_val.clone()) {
            Ok(s) => {
                self.last_manager_status = Some((s, data.clone()));
            }
            Err(_) => {
                warn!("record_last_manager_status: unserializable status name, reconnect replay will be stale");
            }
        }
    }

    /// Wire-format status name (e.g. `"SHOW_QUESTION"`) for reconnect payloads.
    pub fn status_wire_name(status: &Status) -> String {
        serde_json::to_value(status)
            .ok()
            .and_then(|v| v.as_str().map(str::to_string))
            .unwrap_or_else(|| "WAIT".to_string())
    }

    /// Wire-format status name from the live engine phase (manager reconnect).
    pub fn phase_wire_name(phase: GamePhase) -> String {
        match phase {
            GamePhase::ShowRoom => "WAIT".to_string(),
            GamePhase::ShowStart => "SHOW_START".to_string(),
            GamePhase::ShowQuestion => "SHOW_QUESTION".to_string(),
            GamePhase::SelectAnswer => "SELECT_ANSWER".to_string(),
            GamePhase::ShowResult => "SHOW_RESULT".to_string(),
            GamePhase::ShowRoundRecap => "SHOW_ROUND_RECAP".to_string(),
            GamePhase::ShowLeaderboard => "SHOW_LEADERBOARD".to_string(),
            GamePhase::Finished => "FINISHED".to_string(),
        }
    }

    /// Status block for manager:successReconnect — last recorded manager status
    /// when available; otherwise phase wire-name + waitingForPlayers fallback.
    pub fn manager_reconnect_status(&self) -> (String, serde_json::Value) {
        if let Some((s, data)) = &self.last_manager_status {
            return (Self::status_wire_name(s), data.clone());
        }
        (
            Self::phase_wire_name(self.engine.phase),
            serde_json::json!({ "text": "game:waitingForPlayers" }),
        )
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

    /// Milliseconds remaining until `deadline_instant` on tokio's clock — 0 if
    /// no question is currently live or the deadline has already passed. This
    /// is what the lifecycle's per-question tick loop polls once a second to
    /// decide whether to keep counting down or resolve (see the field doc on
    /// `deadline_instant` for why tokio's clock, not wall-clock `SystemTime`).
    pub fn remaining_answer_ms(&self) -> i64 {
        match self.deadline_instant {
            Some(deadline) => deadline
                .saturating_duration_since(tokio::time::Instant::now())
                .as_millis() as i64,
            None => 0,
        }
    }

    /// `manager:adjustTimer`: shifts BOTH clock representations of the current
    /// question's answer-window deadline by `delta_seconds` (may be negative).
    /// `deadline_ms` (wall-clock, client-facing) and `deadline_instant`
    /// (tokio-clock, drives the actual server tick loop via
    /// `remaining_answer_ms`) MUST move together, or the moment the reveal
    /// really fires and what clients are told about it desync. No-op on
    /// `deadline_instant` when no question is currently live.
    pub fn shift_deadline(&mut self, delta_seconds: i64) {
        self.deadline_ms = self.deadline_ms.saturating_add(delta_seconds * 1000).max(0);

        if let Some(instant) = self.deadline_instant {
            let shifted = if delta_seconds >= 0 {
                instant.checked_add(Duration::from_secs(delta_seconds as u64))
            } else {
                instant.checked_sub(Duration::from_secs((-delta_seconds) as u64))
            };
            // A negative shift landing before "now" is valid (reveals on the very
            // next tick); `checked_sub` only returns `None` if it would underflow
            // tokio's `Instant` representation entirely, for which `now()` is a
            // safe fallback (equivalent to "reveal immediately").
            self.deadline_instant = Some(shifted.unwrap_or_else(tokio::time::Instant::now));
        }
    }

    /// Check if this game has exceeded its TTL (for eviction)
    pub fn is_stale(&self, now_ms: u64) -> bool {
        now_ms.saturating_sub(self.last_activity_ms) > GAME_EVICTION_TTL_MS
    }

    /// Cancel any pending auto-advance task (mirrors Node's clearAuto).
    pub fn clear_auto_advance(&mut self) {
        if let Some(task) = self.auto_advance_task.take() {
            task.abort();
        }
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

        let mut rng = rand::thread_rng();
        const URLSAFE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let player_token_str: String = (0..43).map(|_| URLSAFE[rng.gen_range(0..URLSAFE.len())] as char).collect();

        let player = Player {
            id: socket_id,
            client_id: client_id.clone(),
            username,
            connected: true,
            points: 0,
            streak: 0,
            is_bot: None,
            player_token: Some(player_token_str),
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
