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

/// Result-screen auto-advance countdown (mirrors Node AUTO_RESULT_MS).
const AUTO_RESULT_MS: i32 = 6000;

mod pacing;
pub use pacing::{register_adjust_timer, register_pause_game, register_resume_game};

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

                        let mut game = game_ref.lock().unwrap();
                        let was_auto = game.auto_mode;
                        game.auto_mode = payload.get("auto").and_then(|v| v.as_bool()) == Some(true);
                        info!("auto_mode set to {} for game {}", game.auto_mode, game_id);

                        if !was_auto && game.auto_mode {
                            let current_phase = game.engine.phase;

                            match current_phase {
                                GamePhase::ShowResult => {
                                    // Re-send cached SHOW_RESULT with autoAdvanceMs so clients
                                    // already on the result screen get a countdown (FIX 9).
                                    let payloads = game.last_show_result_data.clone();
                                    drop(game);

                                    for (socket_id, mut show_result_data) in payloads {
                                        show_result_data.auto_advance_ms = Some(AUTO_RESULT_MS);
                                        let status = GameStatus::ShowResult(show_result_data);
                                        if let Ok(sid) = socket_id.parse() {
                                            if let Some(sock) = ctx.io.get_socket(sid) {
                                                sock.emit(constants::game::STATUS, &status).ok();
                                            }
                                        }
                                    }
                                }
                                GamePhase::ShowLeaderboard => {
                                    drop(game);
                                    lifecycle::request_abort(&game_ref, current_phase);
                                }
                                _ => {}
                            }
                        }
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

                        if game_ref.lock().unwrap().paused {
                            return;
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
            quiz.clone(),
        );
        game.engine.phase = phase;
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
                scoring_mode: None,
                auto_advance_ms: None,
                round_recap: None,
            },
        );
        Arc::new(Mutex::new(game))
    }

    #[test]
    fn set_auto_on_show_result_should_reemit() {
        let game_ref = test_game(GamePhase::ShowResult);
        let should_reemit = matches!(
            game_ref.lock().unwrap().engine.phase,
            GamePhase::ShowResult
        );
        assert!(should_reemit);
    }

    #[test]
    fn set_auto_on_show_round_recap_should_not_reemit() {
        let game_ref = test_game(GamePhase::ShowRoundRecap);
        let should_reemit = matches!(
            game_ref.lock().unwrap().engine.phase,
            GamePhase::ShowResult
        );
        assert!(!should_reemit);
        assert!(!game_ref.lock().unwrap().last_show_result_data.is_empty());
    }

    #[test]
    fn next_question_while_paused_is_noop() {
        let game_ref = test_game(GamePhase::ShowLeaderboard);
        game_ref.lock().unwrap().paused = true;

        let fired = if game_ref.lock().unwrap().paused {
            false
        } else {
            lifecycle::request_abort(&game_ref, GamePhase::ShowLeaderboard)
        };

        assert!(!fired);
    }
}
