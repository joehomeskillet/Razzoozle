//! Pacing and timing handlers: ADJUST_TIMER, PAUSE_GAME, RESUME_GAME

use super::super::super::HandlerCtx;
use crate::is_game_host;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::GameStatus;
use socketioxide::extract::{Data, SocketRef};
use tracing::info;

pub fn register_adjust_timer(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::ADJUST_TIMER, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let _delta_seconds = payload.get("deltaSeconds").and_then(|v| v.as_i64());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check
                            if game.manager_socket_id != socket.id.to_string() {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                            // Legacy hostToken check
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                        }
                    }
                }

                // TODO(parity): adjustTimer needs lifecycle deadline-shift design — separate WP
            });
        }
    });
}

/// Wave 1: pause only SHOW_LEADERBOARD. ShowRoom/ShowStart snapshots are not
/// broadcast as STATUS events (synthetic replay glitches client state machines);
/// ShowStart is a 3s transient whose lifecycle ignores pause. SHOW_PREPARED/WAIT
/// lack GamePhase variants. Already paused → early return (idempotent).
pub fn register_pause_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PAUSE_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check
                            if game.manager_socket_id != socket.id.to_string() {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                            // Legacy hostToken check
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Already paused — idempotent no-op
                        if game.paused {
                            return;
                        }

                        // Check if current phase is pausable
                        let is_pausable = matches!(game.engine.phase, GamePhase::ShowLeaderboard);

                        if !is_pausable {
                            info!(
                                "Pause rejected: current status is not pausable (phase={:?})",
                                game.engine.phase
                            );
                            return;
                        }

                        // Snapshot the current status from engine phase
                        let status_to_save = match game.engine.phase {
                            GamePhase::ShowLeaderboard => {
                                // Build leaderboard status using the same logic as lifecycle.rs
                                if let Ok(leaderboard_data) = game.engine.leaderboard_view() {
                                    (razzoozle_protocol::status::Status::ShowLeaderboard, serde_json::to_value(&leaderboard_data).unwrap_or(serde_json::json!({})))
                                } else {
                                    info!("Pause rejected: leaderboard_view failed: gameId={}", game_id);
                                    return;
                                }
                            }
                            _ => return,
                        };

                        game.paused = true;
                        game.paused_state = Some(status_to_save);

                        info!("Game paused: gameId={}", game_id);

                        // Broadcast PAUSED status to room
                        let paused_data = razzoozle_protocol::status::PausedData {
                            reason: Some("paused".to_string()),
                        };
                        let paused_status = GameStatus::Paused(paused_data);
                        ctx.io
                            .to(game_id.clone())
                            .emit(constants::game::STATUS, &paused_status)
                            .ok();
                    }
                }
            });
        }
    });
}

/// Host-only: resume a paused game. Broadcasts the pre-pause status.
/// Not paused or paused_state is None → early return (idempotent).
pub fn register_resume_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RESUME_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check
                            if game.manager_socket_id != socket.id.to_string() {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                            // Legacy hostToken check
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                        }

                        let mut game = game_ref.lock().unwrap();

                        // Not paused — idempotent no-op
                        if !game.paused {
                            return;
                        }

                        // Get the saved state
                        if let Some((status, data)) = game.paused_state.take() {
                            game.paused = false;

                            info!("Game resumed: gameId={}", game_id);

                            // Reconstruct and broadcast the saved status
                            let status_to_broadcast = match status {
                                razzoozle_protocol::status::Status::ShowLeaderboard => {
                                    if let Ok(leaderboard_data) = serde_json::from_value(data) {
                                        GameStatus::ShowLeaderboard(leaderboard_data)
                                    } else {
                                        return;
                                    }
                                }
                                _ => return,
                            };

                            ctx.io
                                .to(game_id.clone())
                                .emit(constants::game::STATUS, &status_to_broadcast)
                                .ok();
                        } else {
                            game.paused = false;
                            info!("Resume with empty paused_state: gameId={} — clearing pause flag", game_id);
                            return;
                        }
                    }
                }
            });
        }
    });
}
