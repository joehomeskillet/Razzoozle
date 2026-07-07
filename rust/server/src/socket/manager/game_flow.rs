//! MANAGER.START_GAME, SET_AUTO, NEXT_QUESTION, SKIP_QUESTION, ABORT_QUIZ, ADJUST_TIMER — game flow handlers
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
    register_set_auto(socket, ctx.clone());
    register_next_question(socket, ctx.clone());
    register_skip_question(socket, ctx.clone());
    register_abort_quiz(socket, ctx.clone());
    register_adjust_timer(socket, ctx.clone());
    register_pause_game(socket, ctx.clone());
    register_resume_game(socket, ctx.clone());
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
                                let db_pool = ctx.db_pool.clone();
                                let registry = ctx.registry.clone();

                                tokio::spawn(async move {
                                    tokio::time::sleep(Duration::from_secs(3)).await;
                                    lifecycle::run_game_lifecycle(io_handle, registry, game_id, db_pool).await;
                                });
                            }
                            Err(e) => {
                                let error_msg = match e {
                                    GameError::NoPlayers => "errors:game.noPlayersConnected".to_string(),
                                    _ => "errors:game.notFound".to_string(),
                                };
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, error_msg.as_str())
                                    .ok();
                            }
                        }
                    } else {
                        socket
                            .emit(
                                constants::game::ERROR_MESSAGE,
                                "errors:game.notFound",
                            )
                            .ok();
                    }
                } else {
                    socket
                        .emit(
                            constants::game::ERROR_MESSAGE,
                            "errors:game.notFound",
                        )
                        .ok();
                }
            });
        }
    });
}

/// Host-only: toggle auto-advance mode. Routed via withAuth + getManagerGame
/// (same ownership gate as START_GAME / PAUSE_GAME). A non-host emit is
/// silently ignored (no state change, no emit).
fn register_set_auto(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_AUTO, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Extract gameId from payload; silent no-op if missing or not a string
                let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            // Per-game ownership check: only the socket that created this game can set auto
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

                        // Set auto_mode based on payload; no state change or emit on success
                        let mut game = game_ref.lock().unwrap();
                        game.auto_mode = payload.get("auto").and_then(|v| v.as_bool()) == Some(true);
                        info!("auto_mode set to {} for game {}", game.auto_mode, game_id);
                    }
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

/// Host-only: pause the currently running game on static screens (SHOW_ROOM,
/// SHOW_START, SHOW_LEADERBOARD). Snapshots the current status + data for replay
/// on resume. Note: SHOW_PREPARED and WAIT lack corresponding GamePhase variants
/// in Rust and cannot be paused in Wave 1 (architectural limitation requiring
/// separate last-broadcast-status tracking in lifecycle.rs).
/// Already paused → early return (idempotent). Non-pausable phase → log + return.
fn register_pause_game(socket: &SocketRef, ctx: HandlerCtx) {
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
                        let is_pausable = matches!(
                            game.engine.phase,
                            GamePhase::ShowRoom
                                | GamePhase::ShowStart
                                | GamePhase::ShowLeaderboard
                        );

                        if !is_pausable {
                            info!(
                                "Pause rejected: current status is not pausable (phase={:?})",
                                game.engine.phase
                            );
                            return;
                        }

                        // Snapshot the current status from engine phase
                        let status_to_save = match game.engine.phase {
                            GamePhase::ShowRoom => {
                                use razzoozle_protocol::status::ShowRoomData;
                                let data = ShowRoomData {
                                    text: "game:inviteCode".to_string(),
                                    invite_code: Some(game.invite_code.clone()),
                                    team_mode: None,
                                };
                                (razzoozle_protocol::status::Status::ShowRoom, serde_json::to_value(data).unwrap_or(serde_json::json!({})))
                            }
                            GamePhase::ShowStart => {
                                use razzoozle_protocol::status::ShowStartData;
                                let data = ShowStartData {
                                    time: 5000,
                                    subject: game.engine.quiz.subject.clone(),
                                };
                                (razzoozle_protocol::status::Status::ShowStart, serde_json::to_value(data).unwrap_or(serde_json::json!({})))
                            }
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
fn register_resume_game(socket: &SocketRef, ctx: HandlerCtx) {
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
                                razzoozle_protocol::status::Status::ShowRoom => {
                                    if let Ok(room_data) = serde_json::from_value(data) {
                                        GameStatus::ShowRoom(room_data)
                                    } else {
                                        return;
                                    }
                                }
                                razzoozle_protocol::status::Status::ShowStart => {
                                    if let Ok(start_data) = serde_json::from_value(data) {
                                        GameStatus::ShowStart(start_data)
                                    } else {
                                        return;
                                    }
                                }
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
                            // paused_state is None — log and clear paused flag, no broadcast
                            tracing::warn!(
                                "Resume called but paused_state is None: gameId={}",
                                game_id
                            );
                            game.paused = false;
                        }
                    }
                }
            });
        }
    });
}
