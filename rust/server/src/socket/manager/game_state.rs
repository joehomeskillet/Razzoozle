//! MANAGER.REVEAL_ANSWER, SHOW_LEADERBOARD — host live-controls
//!
//! Both handlers below only ever INTERRUPT whatever abortable wait the single
//! game-lifecycle task (`socket::lifecycle::run_game_lifecycle`) is currently
//! in — they never build/emit a status themselves. This mirrors node's
//! `revealAnswer() { this.skipQuestion(socket) }` (reveal delegates straight to
//! skip) and keeps every phase transition in exactly one place (see
//! `socket::lifecycle` for the rationale).

use super::super::HandlerCtx;
use crate::is_game_host;
use crate::socket::lifecycle;
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_reveal_answer(socket, ctx.clone());
    register_show_leaderboard(socket, ctx.clone());
}

/// Manager force-reveals the live question NOW (ends the SELECT_ANSWER window
/// early). Same effect as manager:skipQuestion (node: `revealAnswer()` is
/// literally `skipQuestion()` under a different name).
fn register_reveal_answer(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::REVEAL_ANSWER, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                    }
                }
            });
        }
    });
}

/// Manager cuts the post-reveal (SHOW_RESULT/SHOW_RESPONSES) dwell short so
/// the leaderboard shows now instead of after the full dwell.
fn register_show_leaderboard(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SHOW_LEADERBOARD, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        // Abort whichever dwelling phase is currently active (ShowResult or ShowRoundRecap)
                        if !lifecycle::request_abort(&game_ref, GamePhase::ShowResult) {
                            lifecycle::request_abort(&game_ref, GamePhase::ShowRoundRecap);
                        }
                    }
                }
            });
        }
    });
}
