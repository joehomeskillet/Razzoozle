//! MANAGER.START_GAME, NEXT_QUESTION, SKIP_QUESTION, ABORT_QUIZ, ADJUST_TIMER — game flow handlers
//!
//! START_GAME is the only handler that DRIVES the game forward — it spawns the
//! single long-lived `socket::lifecycle::run_game_lifecycle` task that owns
//! every subsequent phase transition (question cooldown, reveal, leaderboard,
//! advance, finish). NEXT_QUESTION / SKIP_QUESTION never build or emit a
//! status themselves anymore — they just interrupt whatever abortable wait the
//! lifecycle task is currently in (see `socket::lifecycle::request_abort`),
//! exactly like node's `skipQuestion()`/`nextQuestion()` only ever nudge the
//! round-manager's state machine, never duplicate its transitions.

use super::super::HandlerCtx;
use crate::is_game_host;
use crate::socket::lifecycle;
use razzoozle_engine::state::{GameError, GamePhase};
use razzoozle_protocol::constants;
use razzoozle_protocol::status::GameStatus;
use socketioxide::extract::{Data, SocketRef};
use std::time::Duration;
use tracing::info;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_start_game(socket, ctx.clone());
    register_next_question(socket, ctx.clone());
    register_skip_question(socket, ctx.clone());
    register_abort_quiz(socket, ctx.clone());
    register_adjust_timer(socket, ctx.clone());
}

fn register_start_game(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::START_GAME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                info!("manager:startGame received: gameId={:?}", game_id_opt);

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check: only the socket that created this game can start it
                            if game.manager_socket_id != socket.id.to_string() {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                            // Legacy hostToken check (is_game_host verifies clientId + optional hostToken)
                            if !is_game_host(&game, &payload, &ctx.client_id) {
                                socket
                                    .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                    .ok();
                                return;
                            }
                        }

                        let start_result = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.start()
                        };

                        match start_result {
                            Ok(start_data) => {
                                let game_id = game_id.to_string();
                                info!("Game started: gameId={}", game_id);

                                // Emit SHOW_START to room
                                let status = GameStatus::ShowStart(start_data);
                                ctx.io.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();

                                // After the SHOW_START lead-time, hand off to the single
                                // game-lifecycle task (3-2-1 intro -> Q1 -> ... -> FINISHED).
                                let io_handle = ctx.io.clone();
                                let registry = ctx.registry.clone();

                                tokio::spawn(async move {
                                    tokio::time::sleep(Duration::from_secs(3)).await;
                                    lifecycle::run_game_lifecycle(io_handle, registry, game_id).await;
                                });
                            }
                            Err(e) => {
                                let error_msg = match e {
                                    GameError::NoPlayers => "errors:game.noPlayersConnected".to_string(),
                                    _ => "errors:game.notFound".to_string(),
                                };
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, &serde_json::json!([error_msg]))
                                    .ok();
                            }
                        }
                    } else {
                        socket
                            .emit(
                                constants::game::ERROR_MESSAGE,
                                &serde_json::json!(["errors:game.notFound"]),
                            )
                            .ok();
                    }
                } else {
                    socket
                        .emit(
                            constants::game::ERROR_MESSAGE,
                            &serde_json::json!(["errors:game.notFound"]),
                        )
                        .ok();
                }
            });
        }
    });
}

/// Host live-control: while the game-lifecycle task is dwelling on
/// SHOW_LEADERBOARD, cut that wait short so the next question opens now
/// instead of after the full dwell. No-op while any other phase is showing
/// (mirrors node's nextQuestion() only being meaningful from the leaderboard).
fn register_next_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::NEXT_QUESTION, {
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

                        lifecycle::request_abort(&game_ref, GamePhase::ShowLeaderboard);
                    }
                }
            });
        }
    });
}

/// Host live-control: end the live SELECT_ANSWER window NOW — the
/// game-lifecycle task's per-question cooldown wakes immediately and reveals,
/// exactly as if the timer had elapsed (node: skipQuestion() ends the answer
/// window early, letting the awaited cooldown fall through to showResults()).
/// No-op when no question is currently live (matches node's
/// `if (!answerWindowOpen) return`) — this is the fix for the reported
/// "Skip = No-Op" bug (skip used to call next_or_finish() directly, which
/// always failed because the engine was still in SelectAnswer, never
/// ShowLeaderboard).
fn register_skip_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SKIP_QUESTION, {
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

                        lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                    }
                }
            });
        }
    });
}

fn register_abort_quiz(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::ABORT_QUIZ, {
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

                        // Abort the current question (end the answer window and move to results),
                        // exactly like skipQuestion. Node's abortQuiz (round.abortQuestion) just
                        // closes the live answer window and lets normal flow continue — it does NOT
                        // end the game.
                        lifecycle::request_abort(&game_ref, GamePhase::SelectAnswer);
                    }
                }
            });
        }
    });
}

fn register_adjust_timer(socket: &SocketRef, ctx: HandlerCtx) {
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
