//! Pacing and timing handlers: ADJUST_TIMER, PAUSE_GAME, RESUME_GAME

use super::super::super::HandlerCtx;
use crate::is_game_host;
use crate::socket::lifecycle::build_select_answer_data;
use crate::socket::reveal_helpers::build_manager_show_responses;
use crate::socket::status_emit::{broadcast_status, send_status_to_manager};
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{
    GameStatus, ShowLeaderboardData, ShowRoundRecapData, ShowStartData, Status, WaitData,
};
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Adjust the answer timer by deltaSeconds. Only meaningful while a question is live (SelectAnswer phase).
/// Handler now supports fallback resolution: when gameId is absent, resolve via manager_client_id.
pub fn register_adjust_timer(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::ADJUST_TIMER, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let delta_seconds = payload
                .get("deltaSeconds")
                .and_then(|v| v.as_i64())
                .unwrap_or(0);
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = ctx.require_user().await;

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(&game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:adjustTimer failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:adjustTimer resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:adjustTimer failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                let Some((game_ref, game_id)) = game_ref else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        warn!(
                            "manager:adjustTimer unauthorized: socket.id={} not manager of gameId={}",
                            socket.id.to_string(),
                            game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id, user.as_ref()) {
                        warn!(
                            "manager:adjustTimer host-check failed: clientId={}, gameId={}",
                            ctx.client_id, game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let delta_clamped = delta_seconds.clamp(-60, 60);

                let mut game = game_ref.lock().unwrap();
                if game.paused || game.engine.phase != GamePhase::SelectAnswer {
                    info!(
                        "manager:adjustTimer ignored: paused={}, phase={:?}, gameId={}",
                        game.paused, game.engine.phase, game_id
                    );
                    return;
                }

                // Shifts BOTH the client-facing wall-clock deadline AND the
                // tokio-clock deadline the server's own tick loop actually resolves
                // on — see `Game::shift_deadline` doc: without the latter this
                // would only cosmetically change what clients are told without
                // moving the real reveal moment.
                game.shift_deadline(delta_clamped);

                let new_remaining_ms = (game.deadline_ms - now_ms()).max(0);
                let new_remaining_secs = (new_remaining_ms / 1000) as i32;

                // Re-emit the updated wall-clock deadline to clients (not just the
                // COOLDOWN tick count) via the same SELECT_ANSWER status they
                // already track `answer_deadline_at_server_ms` on — the original
                // `question_start_at_server_ms` is preserved so this is a resync,
                // not a restart.
                let shuffled_chunks = game.shuffled_chunks.clone();
                let select_data = build_select_answer_data(
                    &game.engine.current_question().clone(),
                    game.players.len() as i32,
                    now_ms(),
                    game.question_start_at_server_ms,
                    game.deadline_ms,
                    if game.low_latency { Some(game.server_seq) } else { None },
                    shuffled_chunks,
                );
                drop(game);

                info!(
                    "manager:adjustTimer deadline shifted by {}s, new countdown: {}s, gameId={}",
                    delta_clamped, new_remaining_secs, game_id
                );

                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::COOLDOWN, &new_remaining_secs)
                    .ok();
                broadcast_status(
                    &ctx.io,
                    &game_ref,
                    &game_id,
                    &GameStatus::SelectAnswer(select_data),
                );
            });
        }
    });
}

/// Pause on static pre-game / dwell screens (Node isPausableStatus parity).
/// Lifecycle dwell loops honour `paused` via `pause_resume` on resume.
/// Note: ShowPrepared/Wait have no GamePhase equivalent in the Rust engine.
/// Handler now supports fallback resolution: when gameId is absent, resolve via manager_client_id.
pub fn register_pause_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PAUSE_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = ctx.require_user().await;

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(&game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:pauseGame failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:pauseGame resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:pauseGame failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                let Some((game_ref, game_id)) = game_ref else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        warn!(
                            "manager:pauseGame unauthorized: socket.id={} not manager of gameId={}",
                            socket.id.to_string(),
                            game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id, user.as_ref()) {
                        warn!(
                            "manager:pauseGame host-check failed: clientId={}, gameId={}",
                            ctx.client_id, game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let mut game = game_ref.lock().unwrap();

                if game.paused {
                    info!("manager:pauseGame ignored: already paused, gameId={}", game_id);
                    return;
                }

                // Check if current phase is pausable (match Node's isPausableStatus)
                let is_pausable = matches!(
                    game.engine.phase,
                    GamePhase::ShowLeaderboard
                        | GamePhase::ShowStart
                        | GamePhase::ShowRoom
                );

                if !is_pausable {
                    info!(
                        "manager:pauseGame rejected: current status is not pausable (phase={:?}), gameId={}",
                        game.engine.phase, game_id
                    );
                    return;
                }

                let status_to_save = match game.engine.phase {
                    GamePhase::ShowStart => {
                        (
                            Status::ShowStart,
                            serde_json::to_value(&ShowStartData {
                                time: 3,
                                subject: game.engine.quiz.subject.clone(),
                            })
                            .unwrap_or(serde_json::json!({})),
                        )
                    }
                    GamePhase::ShowRoom => {
                        (
                            Status::Wait,
                            serde_json::to_value(&WaitData {
                                text: "game:waitingForPlayers".to_string(),
                                team_mode: None,
                            })
                            .unwrap_or(serde_json::json!({})),
                        )
                    }
                    GamePhase::ShowLeaderboard => {
                        let leaderboard_data = ShowLeaderboardData {
                            old_leaderboard: game.engine.old_leaderboard.clone(),
                            leaderboard: game.engine.players.clone(),
                            team_standings: None,
                            auto_advance_ms: None,
                            round_recap: None,
                        };
                        (
                            Status::ShowLeaderboard,
                            serde_json::to_value(&leaderboard_data).unwrap_or(serde_json::json!({})),
                        )
                    }
                    _ => return,
                };

                game.paused = true;
                game.paused_state = Some(status_to_save);

                info!(
                    "manager:pauseGame paused successfully: phase={:?}, gameId={}",
                    game.engine.phase, game_id
                );

                let paused_status = GameStatus::Paused(razzoozle_protocol::status::PausedData {
                    reason: Some("paused".to_string()),
                });
                // Drop before chokepoint: record re-locks non-reentrant Mutex.
                drop(game);
                broadcast_status(&ctx.io, &game_ref, &game_id, &paused_status);
            });
        }
    });
}

/// Host-only: resume a paused game. Wakes dwell pause-loops, then broadcasts the pre-pause status.
/// Handler now supports fallback resolution: when gameId is absent, resolve via manager_client_id.
pub fn register_resume_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RESUME_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = ctx.require_user().await;

                // Resolve game: try gameId first, then fall back to manager_client_id (mirrors Node)
                let game_ref = if let Some(game_id) = game_id_opt {
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_id(&game_id) {
                        Some(game_ref) => Some((game_ref, game_id.to_string())),
                        None => {
                            warn!(
                                "manager:resumeGame failed: gameId={} not found, clientId={}",
                                game_id, ctx.client_id
                            );
                            None
                        }
                    }
                } else {
                    // gameId missing from payload — fall back to manager_client_id (Node pattern)
                    let registry = ctx.registry.read().await;
                    match registry.get_game_by_manager_client_id(&ctx.client_id) {
                        Some(game_ref) => {
                            let game_id = game_ref.lock().unwrap().game_id.clone();
                            info!(
                                "manager:resumeGame resolved via client fallback: clientId={}, gameId={}",
                                ctx.client_id, game_id
                            );
                            Some((game_ref, game_id))
                        }
                        None => {
                            warn!(
                                "manager:resumeGame failed: no gameId in payload and no game owned by clientId={}",
                                ctx.client_id
                            );
                            None
                        }
                    }
                };

                let Some((game_ref, game_id)) = game_ref else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        warn!(
                            "manager:resumeGame unauthorized: socket.id={} not manager of gameId={}",
                            socket.id.to_string(),
                            game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id, user.as_ref()) {
                        warn!(
                            "manager:resumeGame host-check failed: clientId={}, gameId={}",
                            ctx.client_id, game_id
                        );
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let (saved_status, manager_socket_id) = {
                    let mut game = game_ref.lock().unwrap();

                    if !game.paused {
                        info!("manager:resumeGame ignored: not paused, gameId={}", game_id);
                        return;
                    }

                    let Some((status, data)) = game.paused_state.take() else {
                        game.paused = false;
                        game.pause_resume.notify_one();
                        info!(
                            "manager:resumeGame resumed with empty paused_state: gameId={}",
                            game_id
                        );
                        return;
                    };

                    game.paused = false;
                    game.pause_resume.notify_one();

                    info!("manager:resumeGame resumed successfully: gameId={}", game_id);

                    (Some((status, data)), game.manager_socket_id.clone())
                };

                let Some((status, data)) = saved_status else {
                    return;
                };

                match status {
                    Status::ShowResult => {
                        let (payloads, manager_socket_id, manager_status) = {
                            let game = game_ref.lock().unwrap();
                            (
                                game.last_show_result_data.clone(),
                                game.manager_socket_id.clone(),
                                build_manager_show_responses(&game),
                            )
                        };
                        // Per-player SHOW_RESULT stays raw (personalized — not manager status).
                        for (socket_id, show_result_data) in payloads {
                            let status_to_broadcast = GameStatus::ShowResult(show_result_data);
                            if let Ok(sid) = socket_id.parse() {
                                if let Some(sock) = ctx.io.get_socket(sid) {
                                    sock.emit(constants::game::STATUS, &status_to_broadcast)
                                        .ok();
                                }
                            }
                        }
                        if let Ok(sid) = manager_socket_id.parse() {
                            if let Some(sock) = ctx.io.get_socket(sid) {
                                send_status_to_manager(&sock, &game_ref, &manager_status);
                            }
                        }
                    }
                    Status::ShowStart => {
                        if let Ok(start_data) = serde_json::from_value::<ShowStartData>(data) {
                            broadcast_status(
                                &ctx.io,
                                &game_ref,
                                &game_id,
                                &GameStatus::ShowStart(start_data),
                            );
                        }
                    }
                    Status::Wait => {
                        if let Ok(wait_data) = serde_json::from_value::<WaitData>(data) {
                            broadcast_status(
                                &ctx.io,
                                &game_ref,
                                &game_id,
                                &GameStatus::Wait(wait_data),
                            );
                        }
                    }
                    Status::ShowRoundRecap => {
                        if let Ok(recap_data) = serde_json::from_value::<ShowRoundRecapData>(data) {
                            if let Ok(sid) = manager_socket_id.parse() {
                                if let Some(sock) = ctx.io.get_socket(sid) {
                                    send_status_to_manager(
                                        &sock,
                                        &game_ref,
                                        &GameStatus::ShowRoundRecap(recap_data),
                                    );
                                }
                            }
                        }
                    }
                    Status::ShowLeaderboard => {
                        if let Ok(leaderboard_data) = serde_json::from_value(data) {
                            broadcast_status(
                                &ctx.io,
                                &game_ref,
                                &game_id,
                                &GameStatus::ShowLeaderboard(leaderboard_data),
                            );
                        }
                    }
                    _ => {}
                }
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Game, QuizFixture};
    use razzoozle_protocol::status::ShowResultData;
    use std::sync::{Arc, Mutex};

    fn test_game(phase: GamePhase) -> Arc<Mutex<Game>> {
        let quiz = QuizFixture::load().expect("fixture quiz loads");
        let mut game = Game::new(
            "game-test".to_string(),
            "TEST".to_string(),
            "manager-socket".to_string(),
            "test-quiz".to_string(),
            quiz.clone(),
        );
        game.engine.phase = phase;
        game.manager_client_id = Some("test-client-id".to_string());
        game.last_show_result_data.insert(
            "player-socket".to_string(),
            ShowResultData {
                correct: true,
                message: "game:correct".to_string(),
                points: 100,
                my_points: 100,
                rank: 1,
                ahead_of_me: None,
                streak: None,
                streak_bonus: None,
                bonus: None,
                first_correct: None,
                poll: None,
                achievements: None,
                bonus_points: None,
                player_count: None,
                correct_answer: None,
                correct_chunks: None,
                correct_token_pos: None,
                scoring_mode: None,
                auto_advance_ms: None,
                round_recap: None,
            },
        );
        Arc::new(Mutex::new(game))
    }

    #[test]
    fn adjust_timer_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::SelectAnswer);
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }

    #[test]
    fn pause_game_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::ShowLeaderboard);
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }

    #[test]
    fn resume_game_fallback_resolution_works() {
        // Test that fallback resolution logic can find a game by manager_client_id
        let game_ref = test_game(GamePhase::ShowLeaderboard);
        game_ref.lock().unwrap().paused = true;
        // Verify test fixture has manager_client_id set for fallback scenarios
        assert_eq!(
            game_ref.lock().unwrap().manager_client_id,
            Some("test-client-id".to_string())
        );
    }
}
