use crate::state::Game;
use razzoozle_engine::state::GamePhase;
use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

/// Snapshot format version — bump when changing the structure.
const SNAPSHOT_VERSION: u32 = 1;

/// Get the snapshot directory path. Uses CONFIG_PATH env var or falls back to relative path.
pub fn snapshot_dir() -> PathBuf {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(&config_path).join("state")
    } else {
        // Fallback: assume running from rust/server, config is at ../../config
        let cwd = std::env::current_dir().unwrap_or_default();
        cwd.parent()
            .and_then(|p| p.parent())
            .map(|p| p.join("config/state"))
            .unwrap_or_else(|| PathBuf::from("config/state"))
    }
}

/// Get the snapshot file path.
pub fn snapshot_file() -> PathBuf {
    snapshot_dir().join("registry.json")
}

/// Serialize a single game to a JSON-compatible snapshot value.
/// Saves the stable state needed for crash recovery: gameId, inviteCode, manager_client_id, players, quiz, phase, etc.
pub fn game_to_snapshot(game: &Game) -> serde_json::Value {
    serde_json::json!({
        "gameId": game.game_id,
        "inviteCode": game.invite_code,
        "managerClientId": game.manager_client_id,
        "hostToken": game.host_token,
        "started": game.engine.phase != GamePhase::ShowRoom,
        "phase": match game.engine.phase {
            GamePhase::ShowRoom => "WAIT",
            GamePhase::ShowStart => "SHOW_START",
            GamePhase::ShowQuestion => "SHOW_QUESTION",
            GamePhase::SelectAnswer => "SELECT_ANSWER",
            GamePhase::ShowResult => "SHOW_RESULT",
            GamePhase::ShowRoundRecap => "SHOW_ROUND_RECAP",
            GamePhase::ShowLeaderboard => "SHOW_LEADERBOARD",
            GamePhase::Finished => "FINISHED",
        },
        "quizz": &game.engine.quiz,
        "players": &game.players,
        "autoMode": game.auto_mode,
        "currentQuestionIndex": game.engine.current_question_index,
        // Last recorded manager status for reconnect replay
        "lastManagerStatus": game.last_manager_status.as_ref().map(|(status, data)| {
            serde_json::json!({
                "name": status,
                "data": data,
            })
        }),
    })
}

/// Deserialize a game snapshot back into a Game instance.
/// Returns None if the snapshot is malformed; logs the error but never panics.
pub fn game_from_snapshot(snap: &serde_json::Value) -> Option<Game> {
    let game_id = snap.get("gameId")?.as_str()?.to_string();
    let invite_code = snap.get("inviteCode")?.as_str()?.to_string();
    let manager_client_id = snap.get("managerClientId").and_then(|v| v.as_str()).map(|s| s.to_string());
    let host_token = snap.get("hostToken")?.as_str()?.to_string();
    let auto_mode = snap.get("autoMode")?.as_bool()?;
    let players: Vec<razzoozle_protocol::player::Player> = serde_json::from_value(snap.get("players")?.clone()).ok()?;
    let quiz: razzoozle_protocol::quizz::Quizz = serde_json::from_value(snap.get("quizz")?.clone()).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // Create the engine with the restored quiz and players
    let mut engine = razzoozle_engine::state::GameState::new(quiz, players.clone());

    // Restore the current question index if available
    if let Some(idx) = snap.get("currentQuestionIndex").and_then(|v| v.as_u64()) {
        engine.current_question_index = idx as usize;
    }

    let mut game = Game {
        game_id,
        invite_code,
        manager_socket_id: String::new(), // Will be re-bound on reconnect
        manager_client_id,
        host_token,
        players,
        engine,
        created_at_ms: snap.get("createdAtMs").and_then(|v| v.as_u64()).unwrap_or(now),
        last_activity_ms: now,
        low_latency: snap.get("lowLatency").and_then(|v| v.as_bool()).unwrap_or(false),
        server_seq: 0,
        auto_mode,
        cooldown_abort: None,
        paused: false,
        paused_state: None,
        last_manager_status: None,
        deadline_ms: 0,
        deadline_instant: None,
        question_start_at_server_ms: 0,
        pause_resume: std::sync::Arc::new(tokio::sync::Notify::new()),
        last_show_result_data: std::collections::HashMap::new(),
        answer_count_push_pending: false,
        bot_manager: None,
        auto_advance_task: None,
        temp_round_recap: None,
        shuffled_chunks: None,
    };

    // Restore last manager status if present
    if let Some(status_obj) = snap.get("lastManagerStatus") {
        if let (Some(name_val), Some(data)) = (status_obj.get("name"), status_obj.get("data")) {
            if let Ok(status) = serde_json::from_value(name_val.clone()) {
                game.last_manager_status = Some((status, data.clone()));
            }
        }
    }

    Some(game)
}

/// Save all in-flight games to disk. Filters out trivially-empty games (no players, not started).
/// Atomic write via temp file + rename to prevent corruption on crash mid-write.
/// Crash-guarded: a write failure logs a warning but never throws.
pub async fn save_snapshot(games: Vec<std::sync::Arc<std::sync::Mutex<Game>>>) -> Result<(), String> {
    // Filter: only save games with players or that have started
    let mut snapshots = Vec::new();
    for game_ref in games {
        if let Ok(game) = game_ref.lock() {
            if game.engine.phase != GamePhase::ShowRoom || !game.players.is_empty() {
                snapshots.push(game_to_snapshot(&*game));
            }
        }
    }

    if snapshots.is_empty() {
        // No games to save; if a snapshot exists, leave it alone (could be stale but valid).
        return Ok(());
    }

    let payload = serde_json::json!({
        "version": SNAPSHOT_VERSION,
        "savedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        "games": snapshots,
    });

    let dir = snapshot_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create snapshot directory: {}", e))?;

    let file = snapshot_file();
    let tmp = file.with_extension("json.tmp");

    tokio::fs::write(&tmp, serde_json::to_string(&payload).map_err(|e| e.to_string())?)
        .await
        .map_err(|e| format!("Failed to write snapshot temp file: {}", e))?;

    tokio::fs::rename(&tmp, &file)
        .await
        .map_err(|e| format!("Failed to rename snapshot temp file: {}", e))?;

    Ok(())
}

/// Load games from the snapshot file on boot. Returns the loaded games (detached, no socket bindings).
/// Missing file => returns empty Vec (no-op).
/// Corrupt/wrong-version file => logs a warning and returns empty Vec (never throws).
pub async fn load_snapshot() -> Vec<Game> {
    let file = snapshot_file();

    if !file.exists() {
        return Vec::new();
    }

    let raw = match tokio::fs::read_to_string(&file).await {
        Ok(content) => content,
        Err(e) => {
            warn!("Failed to read snapshot file: {}", e);
            return Vec::new();
        }
    };

    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            warn!("Corrupt snapshot file (JSON parse failed), ignoring: {}", e);
            return Vec::new();
        }
    };

    if parsed.get("version").and_then(|v| v.as_u64()) != Some(SNAPSHOT_VERSION as u64) {
        warn!("Unrecognized snapshot version, ignoring");
        return Vec::new();
    }

    let games_array = match parsed.get("games") {
        Some(serde_json::Value::Array(arr)) => arr,
        _ => {
            warn!("Snapshot has no 'games' array, ignoring");
            return Vec::new();
        }
    };

    let mut restored = Vec::new();

    for snap in games_array {
        match game_from_snapshot(snap) {
            Some(game) => {
                restored.push(game);
            }
            None => {
                warn!("Failed to restore a game from snapshot, continuing");
            }
        }
    }

    if !restored.is_empty() {
        info!("Restored {} game(s) from snapshot", restored.len());
    }

    restored
}
