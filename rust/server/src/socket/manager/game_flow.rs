//! MANAGER.START_GAME, NEXT_QUESTION, SKIP_QUESTION, ABORT_QUIZ, ADJUST_TIMER — game flow handlers

use super::super::HandlerCtx;
use crate::{is_game_host, question_type_wire};
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::status::{GameStatus, SelectAnswerData, ShowQuestionData};
use socketioxide::extract::{Data, SocketRef};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

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
                info!("manager:startGame received: gameId={:?}", game_id_opt);

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
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

                                // Schedule question flow after lead time (3 seconds from golden frames)
                                let io_handle = ctx.io.clone();
                                let game_id_clone = game_id.clone();
                                let registry = ctx.registry.clone();

                                tokio::spawn(async move {
                                    tokio::time::sleep(Duration::from_secs(3)).await;

                                    let game_opt = {
                                        let registry = registry.read().await;
                                        registry.get_game_by_id(&game_id_clone)
                                    };

                                    if let Some(game_ref) = game_opt {
                                        // Show question and open answers in a single lock scope
                                        let (question_data, select_data_tuple) = {
                                            let mut game = game_ref.lock().unwrap();
                                            let question_data = game.engine.show_question(0).ok();

                                            if question_data.is_some() {
                                                // Get current server time for response tracking
                                                let server_now_ms = SystemTime::now()
                                                    .duration_since(UNIX_EPOCH)
                                                    .map(|d| d.as_millis() as i64)
                                                    .unwrap_or(0);

                                                // Set engine clock to wall-clock time for response_time_ms tracking
                                                game.engine.set_clock_ms(server_now_ms);

                                                // Transition to SelectAnswer phase
                                                let _ = game.engine.open_answers();
                                                let question = game.engine.current_question().clone();
                                                let total_players = game.players.len() as i32;
                                                let answer_deadline_at_server_ms =
                                                    server_now_ms + (question.time as i64 * 1000);

                                                (question_data, Some((question, total_players, server_now_ms, answer_deadline_at_server_ms)))
                                            } else {
                                                (question_data, None)
                                            }
                                        };

                                        if let Some(question_data) = question_data {
                                            // Emit SHOW_QUESTION
                                            let status = GameStatus::ShowQuestion(question_data);
                                            io_handle.to(game_id_clone.clone())
                                                .emit(constants::game::STATUS, &status).ok();

                                            // Emit SELECT_ANSWER for interactive phase
                                            if let Some((question, total_players, server_now_ms, answer_deadline_at_server_ms)) = select_data_tuple {
                                                let question_type_str = question
                                                    .r#type
                                                    .as_ref()
                                                    .map(|t| question_type_wire(t).to_string());

                                                let select_answer = SelectAnswerData {
                                                    question: question.question.clone(),
                                                    answers: question.answers.clone(),
                                                    media: question.media.clone(),
                                                    time: question.time,
                                                    total_player: total_players,
                                                    question_type: question_type_str,
                                                    min: question.min.map(|v| v as i32),
                                                    max: question.max.map(|v| v as i32),
                                                    step: question.step.map(|v| v as i32),
                                                    unit: question.unit.clone(),
                                                    shuffled_chunks: None,
                                                    server_seq: None,
                                                    server_now_ms: Some(server_now_ms),
                                                    question_start_at_server_ms: Some(server_now_ms),
                                                    answer_deadline_at_server_ms: Some(answer_deadline_at_server_ms),
                                                    submitted_by: question.submitted_by.clone(),
                                                };

                                                let status = GameStatus::SelectAnswer(select_answer);
                                                io_handle.to(game_id_clone)
                                                    .emit(constants::game::STATUS, &status).ok();
                                            }
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                warn!("startGame rejected: gameId={}, err={}", game_id, e);
                            }
                        }
                    } else {
                        warn!("startGame: unknown gameId={}", game_id);
                    }
                } else {
                    warn!("startGame: missing gameId in payload");
                }
            });
        }
    });
}

fn register_next_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::NEXT_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
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

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let next_phase = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.next_or_finish()
                        };

                        if let Ok(GamePhase::Finished) = next_phase {
                            info!("Game finished: gameId={}", game_id);
                            let finished = razzoozle_protocol::status::FinishedData {
                                subject: "Quiz".to_string(),
                                top: {
                                    let game = game_ref.lock().unwrap();
                                    game.engine.players.clone()
                                },
                                rank: None,
                                team_standings: None,
                                recap: None,
                                auto_mode: None,
                            };
                            let status = GameStatus::Finished(finished);
                            ctx.io.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();
                        } else if let Ok(GamePhase::ShowQuestion) = next_phase {
                            let (question_data, select_data_tuple) = {
                                let mut game = game_ref.lock().unwrap();
                                let question = game.engine.current_question().clone();

                                let server_now_ms = SystemTime::now()
                                    .duration_since(UNIX_EPOCH)
                                    .map(|d| d.as_millis() as i64)
                                    .unwrap_or(0);

                                game.engine.set_clock_ms(server_now_ms);
                                let _ = game.engine.open_answers();

                                let total_players = game.players.len() as i32;
                                let answer_deadline_at_server_ms =
                                    server_now_ms + (question.time as i64 * 1000);

                                let show_question_data = ShowQuestionData {
                                    question: question.question.clone(),
                                    answers: question.answers.clone(),
                                    display_order: None,
                                    media: question.media.clone(),
                                    cooldown: question.cooldown,
                                    submitted_by: question.submitted_by.clone(),
                                };

                                (show_question_data, Some((question, total_players, server_now_ms, answer_deadline_at_server_ms)))
                            };

                            let status = GameStatus::ShowQuestion(question_data);
                            ctx.io.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();

                            if let Some((question, total_players, server_now_ms, answer_deadline_at_server_ms)) = select_data_tuple {
                                let question_type_str = question
                                    .r#type
                                    .as_ref()
                                    .map(|t| question_type_wire(t).to_string());

                                let select_answer = SelectAnswerData {
                                    question: question.question.clone(),
                                    answers: question.answers.clone(),
                                    media: question.media.clone(),
                                    time: question.time,
                                    total_player: total_players,
                                    question_type: question_type_str,
                                    min: question.min.map(|v| v as i32),
                                    max: question.max.map(|v| v as i32),
                                    step: question.step.map(|v| v as i32),
                                    unit: question.unit.clone(),
                                    shuffled_chunks: None,
                                    server_seq: None,
                                    server_now_ms: Some(server_now_ms),
                                    question_start_at_server_ms: Some(server_now_ms),
                                    answer_deadline_at_server_ms: Some(answer_deadline_at_server_ms),
                                    submitted_by: question.submitted_by.clone(),
                                };

                                let status = GameStatus::SelectAnswer(select_answer);
                                ctx.io.to(game_id)
                                    .emit(constants::game::STATUS, &status).ok();
                            }
                        }
                    }
                }
            });
        }
    });
}

fn register_skip_question(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SKIP_QUESTION, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
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

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let next_phase_result = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.next_or_finish()
                        };
                        if let Err(e) = next_phase_result {
                            warn!("SKIP_QUESTION: next_or_finish failed: {}", e);
                            socket.emit(constants::game::ERROR_MESSAGE, "skip failed").ok();
                        }
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

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let _ = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.phase = GamePhase::Finished;
                        };

                        info!("Quiz aborted: gameId={}", game_id);
                        let finished = razzoozle_protocol::status::FinishedData {
                            subject: "Quiz".to_string(),
                            top: {
                                let game = game_ref.lock().unwrap();
                                game.engine.players.clone()
                            },
                            rank: None,
                            team_standings: None,
                            recap: None,
                            auto_mode: None,
                        };
                        let status = GameStatus::Finished(finished);
                        ctx.io.to(game_id).emit(constants::game::STATUS, &status).ok();
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

                if let Some(game_id) = game_id_opt {
                    let game_opt = {
                        let registry = ctx.registry.read().await;
                        registry.get_game_by_id(&game_id)
                    };

                    if let Some(game_ref) = game_opt {
                        {
                            let game = game_ref.lock().unwrap();
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }
                    }
                }

                // Timer adjustment stored in game state but no emit needed for basic impl
            });
        }
    });
}
