//! Pacing and timing handlers: ADJUST_TIMER, PAUSE_GAME, RESUME_GAME

use super::super::super::HandlerCtx;
use crate::is_game_host;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{GameStatus, ShowLeaderboardData, ShowRoundRecapData, Status};
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

                game.deadline_ms = (game.deadline_ms + delta_clamped * 1000).max(0);
                let new_remaining_ms = (game.deadline_ms - now_ms()).max(0);
                let new_remaining_secs = (new_remaining_ms / 1000) as i32;
                drop(game);

                ctx.io
                    .to(game_id.clone())
                    .emit(constants::game::COOLDOWN, &new_remaining_secs)
                    .ok();
            });
        }
    });
}

/// Pause on static dwell screens (SHOW_RESULT, SHOW_ROUND_RECAP, SHOW_LEADERBOARD).
/// Lifecycle dwell loops honour `paused` via `pause_resume` on resume.
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

                let is_pausable = matches!(
                    game.engine.phase,
                    GamePhase::ShowResult | GamePhase::ShowRoundRecap | GamePhase::ShowLeaderboard
                );

                if !is_pausable {
                    info!(
                        "Pause rejected: current status is not pausable (phase={:?})",
                        game.engine.phase
                    );
                    return;
                }

                let status_to_save = match game.engine.phase {
                    GamePhase::ShowResult => {
                        (Status::ShowResult, serde_json::json!({}))
                    }
                    GamePhase::ShowRoundRecap => {
                        let recap_data = game.temp_round_recap.clone().unwrap_or_default();
                        (
                            Status::ShowRoundRecap,
                            serde_json::to_value(&ShowRoundRecapData {
                                round_recap: recap_data,
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
                        info!(
                            "Resume with empty paused_state: gameId={} — clearing pause flag",
                            game_id
                        );
                        return;
                    };

                    game.paused = false;
                    game.pause_resume.notify_waiters();

                    info!("Game resumed: gameId={}", game_id);

                    (Some((status, data)), game.manager_socket_id.clone())
                };

                let Some((status, data)) = saved_status else {
                    return;
                };

                match status {
                    Status::ShowResult => {
                        let payloads = {
                            let game = game_ref.lock().unwrap();
                            game.last_show_result_data.clone()
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