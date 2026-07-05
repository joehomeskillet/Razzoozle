//! MANAGER.REVEAL_ANSWER, SHOW_LEADERBOARD — game state query handlers

use super::super::HandlerCtx;
use super::super::reveal_helpers;
use crate::{is_game_host, question_type_wire, match_mode_from_str};
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::QuestionType;
use razzoozle_protocol::status::{GameStatus, SelectAnswerData, ShowQuestionData, ShowResponsesData};
use socketioxide::extract::{Data, SocketRef};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tracing::info;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_reveal_answer(socket, ctx.clone());
    register_show_leaderboard(socket, ctx.clone());
}

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
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }


                        reveal_helpers::perform_reveal_and_broadcast(
                            game_ref,
                            game_id.to_string(),
                            ctx.io.clone(),
                            ctx.registry.clone(),
                            false, // is_auto_advance
                        ).await;
                    }
                }
            });
        }
    });
}
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
                            if !is_game_host(&game, &payload) {
                                socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                return;
                            }
                        }

                        let leaderboard_data = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.leaderboard_view().ok()
                        };

                        if let Some(leaderboard_data) = leaderboard_data {
                            let game_id = game_id.to_string();
                            info!("Leaderboard shown: gameId={}", game_id);

                            // Emit SHOW_LEADERBOARD
                            let status = GameStatus::ShowLeaderboard(leaderboard_data);
                            ctx.io.to(game_id.clone())
                                .emit(constants::game::STATUS, &status).ok();

                            // Schedule next question after a delay
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
                                    let next_phase = {
                                        let mut game = game_ref.lock().unwrap();
                                        game.engine.next_or_finish()
                                    };

                                    if let Ok(GamePhase::Finished) = next_phase {
                                        info!("Game finished: gameId={}", game_id_clone);
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
                                        io_handle.to(game_id_clone)
                                            .emit(constants::game::STATUS, &status).ok();
                                    } else if let Ok(GamePhase::ShowQuestion) = next_phase {
                                        // Move to next question: call open_answers() and set engine clock
                                        let (question_data, select_data_tuple) = {
                                            let mut game = game_ref.lock().unwrap();
                                            let question = game.engine.current_question().clone();

                                            // Get current server time for response tracking
                                            let server_now_ms = SystemTime::now()
                                                .duration_since(UNIX_EPOCH)
                                                .map(|d| d.as_millis() as i64)
                                                .unwrap_or(0);

                                            // Set engine clock to wall-clock time
                                            game.engine.set_clock_ms(server_now_ms);

                                            // Transition to SelectAnswer phase
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

                                        // Emit SHOW_QUESTION
                                        let status = GameStatus::ShowQuestion(question_data);
                                        io_handle.to(game_id_clone.clone())
                                            .emit(constants::game::STATUS, &status).ok();

                                        // Then emit SELECT_ANSWER
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
                    }
                }
            });
        }
    });
}
