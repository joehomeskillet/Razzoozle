//! Pacing and timing handlers: ADJUST_TIMER, PAUSE_GAME, RESUME_GAME

use super::super::super::HandlerCtx;
use crate::is_game_host;
use crate::socket::lifecycle::build_select_answer_data;
use crate::socket::reveal_helpers::build_manager_show_responses;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{
    GameStatus, ShowLeaderboardData, ShowRoundRecapData, ShowStartData, Status, WaitData,
};
use socketioxide::extract::{Data, SocketRef};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::info;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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
                let Some(game_id) = game_id_opt else {
                    return;
                };

                let game_opt = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id) {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let delta_clamped = delta_seconds.clamp(-60, 60);

                let mut game = game_ref.lock().unwrap();
                if game.paused || game.engine.phase != GamePhase::SelectAnswer {
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
                let select_data = build_select_answer_data(
                    &game.engine.current_question().clone(),
                    game.players.len() as i32,
                    now_ms(),
                    game.question_start_at_server_ms,
                    game.deadline_ms,
                    if game.low_latency { Some(game.server_seq) } else { None },
                );
                drop(game);

                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::COOLDOWN, &new_remaining_secs)
                    .ok();
                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::STATUS, &GameStatus::SelectAnswer(select_data))
                    .ok();
            });
        }
    });
}

/// Pause on static pre-game / dwell screens (Node isPausableStatus parity).
/// Lifecycle dwell loops honour `paused` via `pause_resume` on resume.
/// Note: ShowPrepared/Wait have no GamePhase equivalent in the Rust engine.
pub fn register_pause_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PAUSE_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let Some(game_id) = game_id_opt else {
                    return;
                };

                let game_opt = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id) {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let mut game = game_ref.lock().unwrap();

                if game.paused {
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
                        "Pause rejected: current status is not pausable (phase={:?})",
                        game.engine.phase
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

                info!("Game paused: gameId={}", game_id);

                let paused_status = GameStatus::Paused(razzoozle_protocol::status::PausedData {
                    reason: Some("paused".to_string()),
                });
                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::STATUS, &paused_status)
                    .ok();
            });
        }
    });
}

/// Host-only: resume a paused game. Wakes dwell pause-loops, then broadcasts the pre-pause status.
pub fn register_resume_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RESUME_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let Some(game_id) = game_id_opt else {
                    return;
                };

                let game_opt = {
                    let registry = ctx.registry.read().await;
                    registry.get_game_by_id(&game_id)
                };

                let Some(game_ref) = game_opt else {
                    return;
                };

                {
                    let game = game_ref.lock().unwrap();
                    if game.manager_socket_id != socket.id.to_string() {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                    if !is_game_host(&game, &payload, &ctx.client_id) {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                }

                let (saved_status, manager_socket_id) = {
                    let mut game = game_ref.lock().unwrap();

                    if !game.paused {
                        return;
                    }

                    let Some((status, data)) = game.paused_state.take() else {
                        game.paused = false;
                        game.pause_resume.notify_one();
                        info!(
                            "Resume with empty paused_state: gameId={} — clearing pause flag",
                            game_id
                        );
                        return;
                    };

                    game.paused = false;
                    game.pause_resume.notify_one();

                    info!("Game resumed: gameId={}", game_id);

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
                                sock.emit(constants::game::STATUS, &manager_status).ok();
                            }
                        }
                    }
                    Status::ShowStart => {
                        if let Ok(start_data) = serde_json::from_value::<ShowStartData>(data) {
                            ctx.io
                                .to(game_id.clone())
                                .emit(
                                    constants::game::STATUS,
                                    &GameStatus::ShowStart(start_data),
                                )
                                .ok();
                        }
                    }
                    Status::Wait => {
                        if let Ok(wait_data) = serde_json::from_value::<WaitData>(data) {
                            ctx.io
                                .to(game_id.clone())
                                .emit(constants::game::STATUS, &GameStatus::Wait(wait_data))
                                .ok();
                        }
                    }
                    Status::ShowRoundRecap => {
                        if let Ok(recap_data) = serde_json::from_value::<ShowRoundRecapData>(data) {
                            if let Ok(sid) = manager_socket_id.parse() {
                                if let Some(sock) = ctx.io.get_socket(sid) {
                                    sock.emit(
                                        constants::game::STATUS,
                                        &GameStatus::ShowRoundRecap(recap_data),
                                    )
                                    .ok();
                                }
                            }
                        }
                    }
                    Status::ShowLeaderboard => {
                        if let Ok(leaderboard_data) = serde_json::from_value(data) {
                            ctx.io
                                .to(game_id.clone())
                                .emit(
                                    constants::game::STATUS,
                                    &GameStatus::ShowLeaderboard(leaderboard_data),
                                )
                                .ok();
                        }
                    }
                    _ => {}
                }
            });
        }
    });
}