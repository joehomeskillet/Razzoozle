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
/// Separate file from Node's registry.json: both twins share the config mount;
/// a shared file would let each backend's 5s task clobber the other's crash-recovery state.
pub fn snapshot_file() -> PathBuf {
    snapshot_dir().join("registry-rust.json")
}

/// Serialize a single game to a JSON-compatible snapshot value.
/// Saves the stable state needed for crash recovery: gameId, inviteCode, manager_client_id, players, quiz, phase, etc.
///
/// WP-M Fix: Tokens are saved in a separate "playerTokens" map since player_token has serde(skip)
/// for wire safety. This ensures tokens survive round-trip for reconnect token-based lookups.
pub fn game_to_snapshot(game: &Game) -> serde_json::Value {
    // Extract player tokens into a separate map (only Some values).
    // This preserves tokens for crash recovery while keeping the Player wire-serialization clean.
    let player_tokens: std::collections::HashMap<String, String> = game.players
        .iter()
        .filter_map(|p| p.player_token.clone().map(|token| (p.id.clone(), token)))
        .collect();

    serde_json::json!({
        "gameId": game.game_id,
        "inviteCode": game.invite_code,
        "managerClientId": game.manager_client_id,
        "ownerUserId": game.owner_user_id,
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
        "quizId": game.quiz_id,
        "lowLatencyConfig": game.low_latency_config,
        "players": &game.players,
        "playerTokens": player_tokens,
        "autoMode": game.auto_mode,
        "currentQuestionIndex": game.engine.current_question_index,
        // Absolute wall-clock answer deadline (ms since epoch) of the in-flight
        // question, persisted so a mid-SELECT_ANSWER restore can reason about
        // remaining time. See resume_plan_from_snapshot / resume_game_lifecycle (#12).
        "answerDeadlineAtServerMs": game.deadline_ms,
        // Last recorded manager status for reconnect replay
        "lastManagerStatus": game.last_manager_status.as_ref().map(|(status, data)| {
            serde_json::json!({
                "name": status,
                "data": data,
            })
        }),
        "selectedModes": {
            "scoringMode": game.selected_modes.scoring_mode.clone(),
            "teamMode": game.selected_modes.team_mode,
            "klassen": game.selected_modes.klassen,
            "endScreen": game.selected_modes.end_screen,
        },
    })
}

/// Phase restoration: map saved phase strings back to GamePhase.
/// Resume semantics (mirroring Node's fromSnapshot behavior):
/// - WAIT/ShowRoom → ShowRoom (lobby, no-op on reconnect)
/// - FINISHED → Finished (game over, ready to show results)
/// - Any running state → ShowLeaderboard (safe fallback, preserves currentQuestionIndex for context)
fn restore_phase(phase_str: &str, started: bool) -> GamePhase {
    match phase_str {
        "WAIT" => GamePhase::ShowRoom,
        "SHOW_START" if started => GamePhase::ShowLeaderboard, // Resume at leaderboard
        "SHOW_QUESTION" if started => GamePhase::ShowLeaderboard,
        "SELECT_ANSWER" if started => GamePhase::ShowLeaderboard,
        "SHOW_RESULT" if started => GamePhase::ShowLeaderboard,
        "SHOW_ROUND_RECAP" if started => GamePhase::ShowLeaderboard,
        "SHOW_LEADERBOARD" => GamePhase::ShowLeaderboard,
        "FINISHED" => GamePhase::Finished,
        _ => {
            warn!("Unknown phase string '{}', defaulting to ShowRoom", phase_str);
            GamePhase::ShowRoom
        }
    }
}

/// Deserialize a game snapshot back into a Game instance.
/// Returns None if the snapshot is malformed; logs the error but never panics.
///
/// WP-M Fixes:
/// 1. Restores player_token from the separate "playerTokens" map (Cause 1)
/// 2. Restores engine.phase using safe resume semantics (Cause 2)
pub fn game_from_snapshot(snap: &serde_json::Value) -> Option<Game> {
    let game_id = snap.get("gameId")?.as_str()?.to_string();
    let invite_code = snap.get("inviteCode")?.as_str()?.to_string();
    let manager_client_id = snap.get("managerClientId").and_then(|v| v.as_str()).map(|s| s.to_string());
    let owner_user_id = snap.get("ownerUserId").and_then(|v| v.as_i64());
    let host_token = snap.get("hostToken")?.as_str()?.to_string();
    let auto_mode = snap.get("autoMode")?.as_bool()?;
    let mut players: Vec<razzoozle_protocol::player::Player> = serde_json::from_value(snap.get("players")?.clone()).ok()?;
    let quiz: razzoozle_protocol::quizz::Quizz = serde_json::from_value(snap.get("quizz")?.clone()).ok()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    // WP-M Fix 1: Restore player tokens from the separate "playerTokens" map
    let player_tokens: std::collections::HashMap<String, String> = snap
        .get("playerTokens")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    for player in &mut players {
        if let Some(token) = player_tokens.get(&player.id) {
            player.player_token = Some(token.clone());
        }
    }

    // Create the engine with the restored quiz and players
    let mut engine = razzoozle_engine::state::GameState::new(quiz, players.clone());

    // Restore the current question index if available
    if let Some(idx) = snap.get("currentQuestionIndex").and_then(|v| v.as_u64()) {
        engine.current_question_index = idx as usize;
    }

    // WP-M Fix 2: Restore engine.phase using safe resume semantics
    let started = snap.get("started").and_then(|v| v.as_bool()).unwrap_or(false);
    if let Some(phase_str) = snap.get("phase").and_then(|v| v.as_str()) {
        engine.phase = restore_phase(phase_str, started);
    }

    // W1-M2: Restore selected_modes from snapshot
    let selected_modes = snap.get("selectedModes").and_then(|v| {
        let scoring_mode = v.get("scoringMode").and_then(|s| s.as_str()).map(|s| s.to_string());
        let team_mode = v.get("teamMode").and_then(|b| b.as_bool());
        let klassen = v.get("klassen").and_then(|b| b.as_bool());
        let end_screen = v.get("endScreen").and_then(|e| e.as_str()).and_then(|es| {
            match es {
                "top3" => Some(razzoozle_protocol::game::EndScreen::Top3),
                "private" => Some(razzoozle_protocol::game::EndScreen::Private),
                "full" => Some(razzoozle_protocol::game::EndScreen::Full),
                _ => None,
            }
        });
        Some(razzoozle_protocol::game::SelectedModes {
            scoring_mode,
            team_mode,
            klassen,
            end_screen,
        })
    }).unwrap_or(razzoozle_protocol::game::SelectedModes {
        scoring_mode: None,
        team_mode: None,
        klassen: None,
        end_screen: None,
    });


    let mut game = Game {
        game_id,
        invite_code,
        manager_socket_id: String::new(), // Will be re-bound on reconnect
        owner_user_id,
        manager_client_id,
        host_token,
        players,
        engine,
        created_at_ms: snap.get("createdAtMs").and_then(|v| v.as_u64()).unwrap_or(now),
        last_activity_ms: now,
        low_latency: snap.get("lowLatency").and_then(|v| v.as_bool()).unwrap_or(false),
        quiz_id: snap.get("quizId").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
        low_latency_config: snap.get("lowLatencyConfig").cloned().unwrap_or_else(|| serde_json::json!({"enabled": false, "clockSync": true})),
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
        selected_modes,
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

/// How a snapshot-restored game should resume its per-game lifecycle task
/// (BLOCKER #12). Derived from the RAW snapshot — which still carries the true
/// running phase — even though `game_from_snapshot` collapses `engine.phase` to
/// a safe ShowLeaderboard baseline for reconnect. `None` for lobby/finished
/// snapshots (nothing to drive forward).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResumePlan {
    pub game_id: String,
    /// Question index the resumed lifecycle loop opens first.
    pub start_index: usize,
    /// The snapshot caught the game AFTER the last question was already scored
    /// (post-reveal on the final question) — drive straight to FINISHED instead
    /// of opening a non-existent next question.
    pub finish_now: bool,
}

/// Classify how a restored game must resume, from the raw snapshot's TRUE phase.
///
/// Pre-reveal phases (SHOW_START/SHOW_QUESTION/SELECT_ANSWER) replay the
/// in-flight question: its points were not applied yet (reveal applies them), so
/// re-opening it is correct and cannot double-count. Per-round answer state is
/// not persisted, so the answer window simply restarts fresh.
///
/// Post-reveal phases (SHOW_RESULT/SHOW_ROUND_RECAP/SHOW_LEADERBOARD) already
/// scored question `index` (points are persisted in the players), so we advance
/// PAST it to the next question — or finish, when it was the last one, to avoid
/// re-revealing and double-counting it.
///
/// Lobby (WAIT) / FINISHED / unknown → `None` (no lifecycle to resume).
pub fn resume_plan_from_snapshot(snap: &serde_json::Value) -> Option<ResumePlan> {
    let game_id = snap.get("gameId")?.as_str()?.to_string();
    let started = snap.get("started").and_then(|v| v.as_bool()).unwrap_or(false);
    if !started {
        return None;
    }
    let phase = snap.get("phase")?.as_str()?;
    let index = snap
        .get("currentQuestionIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let total = snap
        .get("quizz")
        .and_then(|q| q.get("questions"))
        .and_then(|q| q.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    match phase {
        "SHOW_START" | "SHOW_QUESTION" | "SELECT_ANSWER" => Some(ResumePlan {
            game_id,
            start_index: index,
            finish_now: false,
        }),
        "SHOW_RESULT" | "SHOW_ROUND_RECAP" | "SHOW_LEADERBOARD" => {
            if index + 1 >= total {
                Some(ResumePlan {
                    game_id,
                    start_index: index,
                    finish_now: true,
                })
            } else {
                Some(ResumePlan {
                    game_id,
                    start_index: index + 1,
                    finish_now: false,
                })
            }
        }
        _ => None,
    }
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

/// Load games from the snapshot file on boot. Returns each loaded game (detached,
/// no socket bindings) paired with its lifecycle `ResumePlan` (`None` unless the
/// game was restored mid-flight and needs its lifecycle task re-spawned).
/// Missing file => returns empty Vec (no-op).
/// Corrupt/wrong-version file => logs a warning and returns empty Vec (never throws).
pub async fn load_snapshot() -> Vec<(Game, Option<ResumePlan>)> {
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
                let plan = resume_plan_from_snapshot(snap);
                restored.push((game, plan));
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

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that player tokens are preserved through snapshot round-trip.
    /// WP-M Fix 1 validation: Tokens must survive serialization/deserialization.
    #[test]
    fn test_snapshot_roundtrip_player_tokens() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": "mgr-client",
            "hostToken": "host-token",
            "started": false,
            "phase": "WAIT",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                },
                {
                    "id": "p2",
                    "clientId": "c2",
                    "connected": true,
                    "username": "Bob",
                    "points": 50,
                    "streak": 1,
                },
            ],
            "playerTokens": {
                "p1": "token-alice-secret",
                "p2": "token-bob-secret",
            },
            "autoMode": false,
            "currentQuestionIndex": 0,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore game");

        let p1 = restored.players.iter().find(|p| p.id == "p1").expect("Player p1 not found");
        assert_eq!(p1.player_token, Some("token-alice-secret".to_string()), "p1 token mismatch");

        let p2 = restored.players.iter().find(|p| p.id == "p2").expect("Player p2 not found");
        assert_eq!(p2.player_token, Some("token-bob-secret".to_string()), "p2 token mismatch");
    }

    /// Test that Player wire serialization does NOT include playerToken (security regression guard).
    #[test]
    fn test_player_wire_no_token_leak() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": "mgr-client",
            "hostToken": "host-token",
            "started": false,
            "phase": "WAIT",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                }
            ],
            "playerTokens": {
                "p1": "token-alice"
            },
            "autoMode": false,
            "currentQuestionIndex": 0,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");
        let p1 = restored.players.iter().find(|p| p.id == "p1").expect("Player p1 not found");

        assert_eq!(p1.player_token, Some("token-alice".to_string()));

        let player_json = serde_json::to_value(&p1).unwrap();
        assert!(player_json.get("playerToken").is_none(), "Token leaked in wire serialization");
    }

    /// Test that engine.phase is restored correctly.
    /// WP-M Fix 2 validation: Phase must survive round-trip and follow resume semantics.
    #[test]
    fn test_snapshot_phase_restoration() {
        let test_cases = vec![
            ("WAIT", GamePhase::ShowRoom, false),
            ("FINISHED", GamePhase::Finished, true),
            ("SHOW_QUESTION", GamePhase::ShowLeaderboard, true),
            ("SELECT_ANSWER", GamePhase::ShowLeaderboard, true),
            ("SHOW_RESULT", GamePhase::ShowLeaderboard, true),
            ("SHOW_ROUND_RECAP", GamePhase::ShowLeaderboard, true),
            ("SHOW_LEADERBOARD", GamePhase::ShowLeaderboard, true),
        ];

        for (phase_str, expected_phase, started) in test_cases {
            let snap = serde_json::json!({
                "gameId": "game-1",
                "inviteCode": "invite-1",
                "managerClientId": null,
                "hostToken": "host-token",
                "started": started,
                "phase": phase_str,
                "quizz": {
                    "subject": "Test",
                    "questions": []
                },
                "quizId": "quiz-1",
                "lowLatencyConfig": {"enabled": false},
                "players": [],
                "playerTokens": {},
                "autoMode": false,
                "currentQuestionIndex": 0,
            });

            let restored = game_from_snapshot(&snap).expect(&format!("Failed to restore phase {}", phase_str));
            assert_eq!(restored.engine.phase, expected_phase, "Phase mismatch for '{}'", phase_str);
        }
    }

    /// Test that currentQuestionIndex is preserved through round-trip.
    #[test]
    fn test_snapshot_current_question_index() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-1",
            "managerClientId": null,
            "hostToken": "host-token",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [],
            "playerTokens": {},
            "autoMode": false,
            "currentQuestionIndex": 3,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");
        assert_eq!(restored.engine.current_question_index, 3, "currentQuestionIndex not preserved");
    }

    /// Integration test: Snapshot round-trip with multi-player state.
    #[test]
    fn test_snapshot_integration_multiplay() {
        let snap = serde_json::json!({
            "gameId": "game-1",
            "inviteCode": "invite-xyz",
            "managerClientId": "mgr-client",
            "hostToken": "host-secret",
            "started": true,
            "phase": "SELECT_ANSWER",
            "quizz": {
                "subject": "Test",
                "questions": []
            },
            "quizId": "quiz-1",
            "lowLatencyConfig": {"enabled": false},
            "players": [
                {
                    "id": "p1",
                    "clientId": "c1",
                    "connected": true,
                    "username": "Alice",
                    "points": 100,
                    "streak": 3,
                },
                {
                    "id": "p2",
                    "clientId": "c2",
                    "connected": true,
                    "username": "Bob",
                    "points": 50,
                    "streak": 1,
                },
            ],
            "playerTokens": {
                "p1": "token-alice-secret",
                "p2": "token-bob-secret",
            },
            "autoMode": false,
            "currentQuestionIndex": 3,
        });

        let restored = game_from_snapshot(&snap).expect("Failed to restore");

        assert_eq!(restored.players.len(), 2);
        let p1 = restored.players.iter().find(|p| p.id == "p1").unwrap();
        let p2 = restored.players.iter().find(|p| p.id == "p2").unwrap();

        assert_eq!(p1.player_token, Some("token-alice-secret".to_string()));
        assert_eq!(p2.player_token, Some("token-bob-secret".to_string()));
        assert_eq!(restored.engine.phase, GamePhase::ShowLeaderboard);
        assert_eq!(restored.engine.current_question_index, 3);
    }

    /// BLOCKER #12: the resume plan derived from the raw snapshot must classify
    /// pre-reveal phases as "replay the in-flight question" and post-reveal
    /// phases as "advance past it" (or finish, when it was the last).
    #[test]
    fn test_resume_plan_classification() {
        let snap = |phase: &str, idx: u64, num_q: usize, started: bool| {
            let questions: Vec<serde_json::Value> = (0..num_q)
                .map(|_| serde_json::json!({"question": "q", "answers": [], "time": 10}))
                .collect();
            serde_json::json!({
                "gameId": "game-1",
                "started": started,
                "phase": phase,
                "quizz": {"subject": "S", "questions": questions},
                "currentQuestionIndex": idx,
            })
        };

        // Lobby / finished / not-started → no resume.
        assert_eq!(resume_plan_from_snapshot(&snap("WAIT", 0, 3, false)), None);
        assert_eq!(resume_plan_from_snapshot(&snap("FINISHED", 2, 3, true)), None);

        // Pre-reveal → replay the current question (start_index == index).
        for phase in ["SHOW_START", "SHOW_QUESTION", "SELECT_ANSWER"] {
            assert_eq!(
                resume_plan_from_snapshot(&snap(phase, 1, 3, true)),
                Some(ResumePlan { game_id: "game-1".into(), start_index: 1, finish_now: false }),
                "pre-reveal phase {phase} must replay the in-flight question"
            );
        }

        // Post-reveal, not last → advance to the next question.
        for phase in ["SHOW_RESULT", "SHOW_ROUND_RECAP", "SHOW_LEADERBOARD"] {
            assert_eq!(
                resume_plan_from_snapshot(&snap(phase, 1, 3, true)),
                Some(ResumePlan { game_id: "game-1".into(), start_index: 2, finish_now: false }),
                "post-reveal phase {phase} must advance past the scored question"
            );
        }

        // Post-reveal on the LAST question → finish, never re-open/double-count.
        assert_eq!(
            resume_plan_from_snapshot(&snap("SHOW_RESULT", 2, 3, true)),
            Some(ResumePlan { game_id: "game-1".into(), start_index: 2, finish_now: true })
        );
    }
}
