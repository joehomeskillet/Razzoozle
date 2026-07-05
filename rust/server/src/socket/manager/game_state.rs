//! MANAGER.REVEAL_ANSWER, SHOW_LEADERBOARD — game state query handlers

use super::super::HandlerCtx;
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

                        let reveal_result = {
                            let mut game = game_ref.lock().unwrap();
                            game.engine.reveal(razzoozle_protocol::status::ScoringMode::Speed).ok()
                        };

                        if let Some(_results) = reveal_result {
                            let game_id = game_id.to_string();
                            info!("Answer revealed: gameId={}", game_id);

                            // Send SHOW_RESULT to each player with their personalized data
                            {
                                let game = game_ref.lock().unwrap();
                                let total_players = game.engine.players.len() as i32;

                                // Get sorted leaderboard for ranking
                                let sorted_players: Vec<(String, i32)> = game.engine.players.iter()
                                    .map(|p| (p.client_id.clone(), p.points))
                                    .collect();
                                let mut sorted_by_points = sorted_players.clone();
                                sorted_by_points.sort_by(|a, b| b.1.cmp(&a.1));

                                // Create rank map: client_id -> rank (1-based)
                                let mut rank_map = HashMap::new();
                                for (idx, (client_id, _)) in sorted_by_points.iter().enumerate() {
                                    rank_map.insert(client_id.clone(), (idx + 1) as i32);
                                }

                                // Send SHOW_RESULT to each player
                                for player in &game.engine.players {
                                    if let Some(result) = game.engine.result_for(&player.client_id) {
                                        let rank = rank_map.get(&player.client_id).copied().unwrap_or(1);
                                        let mut show_result_data = result.to_show_result_data(&player, total_players);
                                        show_result_data.rank = rank;

                                        let status = GameStatus::ShowResult(show_result_data);

                                        // Send to this player's socket
                                        if let Ok(sid) = player.id.parse() {
                                            if let Some(player_socket) = ctx.io.get_socket(sid) {
                                                player_socket.emit(constants::game::STATUS, &status).ok();
                                            }
                                        }
                                    }
                                }
                            }

                            let manager_responses = {
                                let game = game_ref.lock().unwrap();
                                let question = game.engine.current_question();
                                let is_slider = matches!(
                                    question.r#type.as_ref(),
                                    Some(QuestionType::Slider)
                                );
                                let is_type_answer = matches!(
                                    question.r#type.as_ref(),
                                    Some(QuestionType::TypeAnswer)
                                );
                                let is_sentence_builder = matches!(
                                    question.r#type.as_ref(),
                                    Some(QuestionType::SentenceBuilder)
                                );
                                let collects_text = is_type_answer || is_sentence_builder;
                                let mut responses = HashMap::new();
                                let mut slider_values = Vec::new();
                                let mut text_responses = HashMap::new();

                                for answer in game.engine.current_answers.values() {
                                    if let Some(answer_key) = answer.answer_input.answer_key {
                                        *responses
                                            .entry(answer_key.to_string())
                                            .or_insert(0) += 1;

                                        if is_slider {
                                            slider_values.push(answer_key);
                                        }
                                    }

                                    if let Some(answer_keys) = &answer.answer_input.answer_keys {
                                        for answer_key in answer_keys {
                                            *responses
                                                .entry(answer_key.to_string())
                                                .or_insert(0) += 1;
                                        }
                                    }

                                    if collects_text {
                                        if let Some(answer_text) = &answer.answer_input.answer_text {
                                            let answer_text = answer_text.trim();

                                            if !answer_text.is_empty() {
                                                *text_responses
                                                    .entry(answer_text.to_string())
                                                    .or_insert(0) += 1;
                                            }
                                        }
                                    }
                                }

                                let average_guess = if is_slider && !slider_values.is_empty() {
                                    let sum: i32 = slider_values.iter().sum();
                                    Some((sum as f64 / slider_values.len() as f64).round())
                                } else {
                                    None
                                };

                                let status = GameStatus::ShowResponses(ShowResponsesData {
                                    question: question.question.clone(),
                                    responses,
                                    solutions: question.solutions.clone().unwrap_or_default(),
                                    answers: question.answers.clone().unwrap_or_default(),
                                    media: question.media.clone(),
                                    question_type: question
                                        .r#type
                                        .as_ref()
                                        .map(|t| question_type_wire(t).to_string()),
                                    correct: question.correct.map(|v| v as i32),
                                    unit: question.unit.clone(),
                                    average_guess,
                                    text_responses: if text_responses.is_empty() {
                                        None
                                    } else {
                                        Some(text_responses)
                                    },
                                    accepted_answers: if is_type_answer {
                                        question.accepted_answers.clone()
                                    } else {
                                        None
                                    },
                                    match_mode: if is_type_answer {
                                        question
                                            .match_mode
                                            .as_deref()
                                            .and_then(match_mode_from_str)
                                    } else {
                                        None
                                    },
                                    correct_chunks: if is_sentence_builder {
                                        question.chunks.clone()
                                    } else {
                                        None
                                    },
                                    round_recap: None,
                                });

                                (game.manager_socket_id.clone(), status)
                            };

                            let (manager_socket_id, manager_status) = manager_responses;

                            if let Ok(sid) = manager_socket_id.parse() {
                                if let Some(manager_socket) = ctx.io.get_socket(sid) {
                                    manager_socket
                                        .emit(constants::game::STATUS, &manager_status)
                                        .ok();
                                }
                            }

                            // Emit cooldown sequence (matching golden frames)
                            let io_handle = ctx.io.clone();
                            let game_id_clone = game_id.clone();
                            let registry = ctx.registry.clone();

                            // Get cooldown duration before spawning task
                            let cooldown_secs = {
                                let game = game_ref.lock().unwrap();
                                game.engine.current_question().cooldown
                            };

                            // Spawn cooldown timer task using tokio interval
                            tokio::spawn(async move {
                                // Emit game:startCooldown event
                                io_handle.to(game_id_clone.clone())
                                    .emit(constants::game::START_COOLDOWN, &serde_json::json!([]))
                                    .ok();

                                // Run countdown using tokio interval for consistent 1-second ticks
                                let mut interval = tokio::time::interval(Duration::from_secs(1));
                                let mut count = cooldown_secs;

                                while count > 0 {
                                    interval.tick().await;
                                    io_handle.to(game_id_clone.clone())
                                        .emit(constants::game::COOLDOWN, &count)
                                        .ok();
                                    count -= 1;
                                }

                                // After cooldown completes, emit SHOW_PREPARED
                                let game_opt = {
                                    let registry = registry.read().await;
                                    registry.get_game_by_id(&game_id_clone)
                                };

                                if let Some(game_ref) = game_opt {
                                    let (current_q, total_q) = {
                                        let game = game_ref.lock().unwrap();
                                        (
                                            game.engine.current_question_index as i32 + 1,
                                            game.engine.quiz.questions.len() as i32,
                                        )
                                    };

                                    let update_q = razzoozle_protocol::player::GameUpdateQuestion {
                                        current: current_q,
                                        total: total_q,
                                    };

                                    io_handle.to(game_id_clone.clone())
                                        .emit(constants::game::UPDATE_QUESTION, &update_q).ok();

                                    let prepared = razzoozle_protocol::status::ShowPreparedData {
                                        total_answers: 4,
                                        question_number: current_q,
                                    };

                                    let status = GameStatus::ShowPrepared(prepared);
                                    io_handle.to(game_id_clone)
                                        .emit(constants::game::STATUS, &status).ok();
                                }
                            });
                        }
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
