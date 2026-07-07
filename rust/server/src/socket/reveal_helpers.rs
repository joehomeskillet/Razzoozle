//! Helper functions for the reveal/auto-advance flow — factored to eliminate duplication
//! between manager:REVEAL_ANSWER handler and player auto-advance on all-answered

use crate::state::Game;
use crate::{match_mode_from_str, question_type_wire};
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::QuestionType;
use razzoozle_protocol::status::{GameStatus, ShowResponsesData};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing::info;

/// Perform the reveal-only flow: call engine.reveal, broadcast SHOW_RESULT to
/// each player, and SHOW_RESPONSES to the manager. Phase-guarded via
/// `engine.reveal()` — safe to call from multiple racing triggers (cooldown
/// timeout, manager:skipQuestion/revealAnswer, all-answered): only the first
/// caller whose reveal succeeds actually broadcasts anything.
///
/// What happens AFTER the reveal (result dwell -> leaderboard -> next
/// question or FINISHED) is owned by `socket::lifecycle::run_game_lifecycle`
/// — this function does not schedule anything further.
pub async fn perform_reveal_and_broadcast(
    game_ref: Arc<Mutex<Game>>,
    game_id: String,
    io_handle: SocketIo,
    is_auto_advance: bool,
) {
    // Call reveal on engine
    let reveal_result = {
        let mut game = game_ref.lock().unwrap();
        game.engine.reveal(razzoozle_protocol::status::ScoringMode::Speed).ok()
    };

    if let Some(_results) = reveal_result {
        if is_auto_advance {
            info!("Answer revealed (auto-advance): gameId={}", game_id);
        } else {
            info!("Answer revealed: gameId={}", game_id);
        }

        // Send SHOW_RESULT to each player with their personalized data
        {
            let game = game_ref.lock().unwrap();
            let total_players = game.engine.players.len() as i32;

            // Get sorted leaderboard for ranking
            let sorted_players: Vec<(String, i32)> = game
                .engine
                .players
                .iter()
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
                        if let Some(player_socket) = io_handle.get_socket(sid) {
                            player_socket.emit(constants::game::STATUS, &status).ok();
                        }
                    }
                }
            }
        }

        // Prepare manager responses (ShowResponses status)
        let manager_responses = {
            let game = game_ref.lock().unwrap();
            let question = game.engine.current_question();
            let is_slider = matches!(question.r#type.as_ref(), Some(QuestionType::Slider));
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
                    *responses.entry(answer_key.to_string()).or_insert(0) += 1;

                    if is_slider {
                        slider_values.push(answer_key);
                    }
                }

                if let Some(answer_keys) = &answer.answer_input.answer_keys {
                    for answer_key in answer_keys {
                        *responses.entry(answer_key.to_string()).or_insert(0) += 1;
                    }
                }

                if collects_text {
                    if let Some(answer_text) = &answer.answer_input.answer_text {
                        let answer_text = answer_text.trim();

                        if !answer_text.is_empty() {
                            *text_responses.entry(answer_text.to_string()).or_insert(0) += 1;
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
            if let Some(manager_socket) = io_handle.get_socket(sid) {
                manager_socket
                    .emit(constants::game::STATUS, &manager_status)
                    .ok();
            }
        }
    }
}
