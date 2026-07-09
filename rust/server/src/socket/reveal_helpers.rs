//! Helper functions for the reveal/auto-advance flow — factored to eliminate duplication
//! between manager:REVEAL_ANSWER handler and player auto-advance on all-answered

use crate::state::Game;
use crate::{match_mode_from_str, question_type_wire};
use razzoozle_engine::round_recap::{compute_round_recap, RoundRecapRow};
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::QuestionType;
use razzoozle_protocol::status::{GameStatus, ShowResponsesData};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tracing::info;

/// Build the manager-only SHOW_RESPONSES payload from current engine state.
pub fn build_manager_show_responses(game: &Game) -> GameStatus {
    let question = game.engine.current_question();
    let is_slider = matches!(question.r#type.as_ref(), Some(QuestionType::Slider));
    let is_type_answer = matches!(question.r#type.as_ref(), Some(QuestionType::TypeAnswer));
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

    let results_map: HashMap<String, &_> = game
        .engine
        .last_round_results
        .iter()
        .map(|r| (r.client_id.clone(), r))
        .collect();
    let mut rank_map_for_manager = HashMap::new();
    let sorted_players_for_manager: Vec<_> = game
        .engine
        .players
        .iter()
        .map(|p| (p.client_id.clone(), p.points))
        .collect();
    let mut sorted_by_points_for_manager = sorted_players_for_manager.clone();
    sorted_by_points_for_manager.sort_by(|a, b| b.1.cmp(&a.1));
    for (idx, (client_id, _)) in sorted_by_points_for_manager.iter().enumerate() {
        rank_map_for_manager.insert(client_id.clone(), (idx + 1) as i32);
    }

    let recap_rows_for_manager: Vec<RoundRecapRow> = game
        .engine
        .players
        .iter()
        .filter_map(|player| {
            let result = results_map.get(&player.client_id)?;
            Some(RoundRecapRow {
                client_id: player.client_id.clone(),
                username: player.username.clone(),
                avatar: player.avatar.clone(),
                is_bot: player.is_bot.unwrap_or(false),
                correct: result.correct,
                response_time_ms: if result.answered {
                    Some(result.response_time_ms)
                } else {
                    None
                },
                streak_after: result.streak,
                last_points: result.points,
                answered: result.answered,
            })
        })
        .collect();

    let first_correct_id_for_manager = game
        .engine
        .last_round_results
        .iter()
        .find(|r| r.first_correct)
        .map(|r| r.client_id.as_str());

    let has_prior_round_for_manager = game.engine.current_question_index > 0;

    let round_recap_for_manager = compute_round_recap(
        &recap_rows_for_manager,
        &rank_map_for_manager,
        &game.engine.last_round_rank_before,
        first_correct_id_for_manager,
        has_prior_round_for_manager,
    );
    let round_recap_opt_for_manager = if round_recap_for_manager.is_empty() {
        None
    } else {
        Some(round_recap_for_manager)
    };

    GameStatus::ShowResponses(ShowResponsesData {
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
        round_recap: round_recap_opt_for_manager,
    })
}

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
            let mut game = game_ref.lock().unwrap();
            let total_players = game.engine.players.len() as i32;

            // STEP 1: One-time extraction of constant fields (same across all players)
            let question = game.engine.current_question().clone();
            let is_poll = matches!(question.r#type.as_ref(), Some(QuestionType::Poll));
            let bonus_flag = question.bonus.unwrap_or(false);
            let is_practice = question.practice == Some(true);
            let correct_answer: Option<String> = if is_poll {
                None
            } else {
                match question.r#type.as_ref() {
                    Some(QuestionType::Slider) => {
                        question.correct.map(|c| match &question.unit {
                            Some(u) => format!("{} {}", c, u),
                            None => format!("{}", c),
                        })
                    }
                    Some(QuestionType::TypeAnswer) => {
                        question.accepted_answers.as_ref().and_then(|a| a.first().cloned())
                    }
                    _ => {
                        // choice / boolean / multiple-select: map solution indices to answer texts
                        let texts: Vec<String> = question
                            .solutions
                            .as_deref()
                            .unwrap_or(&[])
                            .iter()
                            .filter_map(|&i| {
                                question.answers.as_ref().and_then(|a| {
                                    a.get(i as usize).cloned()
                                })
                            })
                            .collect();
                        if texts.is_empty() { None } else { Some(texts.join(", ")) }
                    }
                }
            };

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

            // Build results map for O(1) lookup instead of O(n) result_for call per player
            let results_map: HashMap<String, razzoozle_engine::state::RoundResult> = game
                .engine
                .last_round_results
                .iter()
                .map(|r| (r.client_id.clone(), r.clone()))
                .collect();

            // STEP 2: Build RoundRecapRow for all players (for round recap awards)
            let recap_rows: Vec<RoundRecapRow> = game.engine.players
                .iter()
                .filter_map(|player| {
                    let result = results_map.get(&player.client_id)?;
                    Some(RoundRecapRow {
                        client_id: player.client_id.clone(),
                        username: player.username.clone(),
                        avatar: player.avatar.clone(),
                        is_bot: player.is_bot.unwrap_or(false),
                        correct: result.correct,
                        response_time_ms: if result.answered {
                            Some(result.response_time_ms)
                        } else {
                            None
                        },
                        streak_after: result.streak,
                        last_points: result.points,
                        answered: result.answered,
                    })
                })
                .collect();

            // Find first_correct player
            let first_correct_id = game.engine.last_round_results
                .iter()
                .find(|r| r.first_correct)
                .map(|r| r.client_id.as_str());

            // Check if there's a prior round (current_question_index > 0)
            let has_prior_round = game.engine.current_question_index > 0;

            // Compute round recap awards (game-wide, same for all players)
            let round_recap = compute_round_recap(
                &recap_rows,
                &rank_map,
                &game.engine.last_round_rank_before,
                first_correct_id,
                has_prior_round,
            );
            let round_recap_opt = if round_recap.is_empty() { None } else { Some(round_recap.clone()) };

            game.last_show_result_data.clear();

            let players: Vec<_> = game.engine.players.clone();

            // Send SHOW_RESULT to each player
            for player in &players {
                if let Some(result) = results_map.get(&player.client_id) {
                    let rank = rank_map.get(&player.client_id).copied().unwrap_or(1);
                    let mut show_result_data = result.to_show_result_data(&player, total_players);
                    show_result_data.rank = rank;

                    // STEP 1 parity fields
                    show_result_data.correct_answer = correct_answer.clone();
                    show_result_data.poll = Some(is_poll);
                    show_result_data.bonus = Some(bonus_flag && result.correct && !is_practice);
                    show_result_data.scoring_mode = None; // parity: Node omits it
                    show_result_data.message = (if is_poll {
                        "game:pollThanks"
                    } else if result.correct {
                        "game:correct"
                    } else {
                        "game:wrong"
                    }).to_string();

                    // ahead_of_me: rank-1 player from sorted_by_points
                    show_result_data.ahead_of_me = if rank > 1 {
                        sorted_by_points.get((rank as usize) - 2).map(|(cid, _)| {
                            game.engine
                                .players
                                .iter()
                                .find(|p| p.client_id == *cid)
                                .map(|p| p.username.clone())
                        }).flatten()
                    } else {
                        None
                    };

                    // STEP 2: Set round recap (game-wide, same for all players)
                    show_result_data.round_recap = round_recap_opt.clone();

                    game.last_show_result_data
                        .insert(player.id.clone(), show_result_data.clone());

                    let status = GameStatus::ShowResult(show_result_data);

                    // Send to this player's socket
                    if let Ok(sid) = player.id.parse() {
                        if let Some(player_socket) = io_handle.get_socket(sid) {
                            player_socket.emit(constants::game::STATUS, &status).ok();
                        }
                    }
                }
            }
            // Stash the round recap for the lifecycle loop to emit via SHOW_ROUND_RECAP phase
            game.temp_round_recap = round_recap_opt.clone();
        }

        let manager_responses = {
            let game = game_ref.lock().unwrap();
            (game.manager_socket_id.clone(), build_manager_show_responses(&game))
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
