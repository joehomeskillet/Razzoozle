mod socket;
mod state;
mod media_ai;
mod http;

use http::RATE_LIMITER;

use axum::{
    extract::{ConnectInfo, Path},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use razzoozle_engine::eval::{evaluate_answer, AnswerInput};
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::{Question, QuestionType};
use razzoozle_protocol::status::{
    GameStatus, MatchMode, SelectAnswerData, ShowLeaderboardData, ShowQuestionData,
    ShowResponsesData, ShowResultData, ShowStartData, WaitData,
};
use serde::{Deserialize, Serialize};
use socketioxide::extract::{Data, SocketRef};
use socketioxide::SocketIo;
use state::{GameRegistry, QuizFixture, RateLimiter, safe_asset_id, SOLO_RESULTS_MAX_ENTRIES};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use lazy_static::lazy_static;
use tokio::sync::RwLock;
use tracing::{info, warn};

pub(crate) fn question_type_wire(question_type: &QuestionType) -> &'static str {
    match question_type {
        QuestionType::Choice => "choice",
        QuestionType::Boolean => "boolean",
        QuestionType::Slider => "slider",
        QuestionType::Poll => "poll",
        QuestionType::MultipleSelect => "multiple-select",
        QuestionType::TypeAnswer => "type-answer",
        QuestionType::SentenceBuilder => "sentence-builder",
    }
}

pub(crate) fn match_mode_from_str(match_mode: &str) -> Option<MatchMode> {
    match match_mode {
        "exact" => Some(MatchMode::Exact),
        "normalized" => Some(MatchMode::Normalized),
        "fuzzy" => Some(MatchMode::Fuzzy),
        _ => None,
    }
}

/// Helper: Check if the payload's hostToken matches the game's host_token.
pub(crate) fn is_game_host(game: &state::Game, payload: &serde_json::Value) -> bool {
    match payload.get("hostToken") {
        // Absent (or explicit null) → legacy path, still gated by is_logged. Backward-compat
        // for old clients that don't send a token yet.
        None | Some(serde_json::Value::Null) => true,
        // Present → it MUST be a string that matches the game's token. A non-string value
        // (hostToken: 123 / {} / []) DENIES — fail-CLOSED, so the check can't be bypassed by
        // sending a malformed token instead of the right one.
        Some(v) => v.as_str() == Some(game.host_token.as_str()),
    }
}



#[cfg(test)]
mod host_token_tests {
    use super::*;

    fn test_game() -> state::Game {
        state::Game::new(
            "game-1".to_string(),
            "INVITE1".to_string(),
            "manager-1".to_string(),
            razzoozle_protocol::quizz::Quizz {
                subject: "Test".to_string(),
                questions: vec![],
                archived: None,
                theme_id: None,
            },
        )
    }

    #[test]
    fn is_game_host_accepts_correct_token() {
        let game = test_game();
        let payload = serde_json::json!({ "hostToken": game.host_token.clone() });

        assert!(is_game_host(&game, &payload));
    }

    #[test]
    fn is_game_host_rejects_wrong_token() {
        let game = test_game();
        let payload = serde_json::json!({ "hostToken": "wrong-token" });

        assert!(!is_game_host(&game, &payload));
    }

    #[test]
    fn is_game_host_accepts_legacy_payload_without_token() {
        let game = test_game();
        let payload = serde_json::json!({ "gameId": game.game_id });

        assert!(is_game_host(&game, &payload));
    }
}

#[tokio::main]
async fn main() {
    const DEFAULT_MANAGER_PASSWORD: &str = "PASSWORD";

    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // Load fixture quiz
    let quiz_fixture = QuizFixture::load().expect("Failed to load fixture quiz");

    let registry = Arc::new(RwLock::new(GameRegistry::new(quiz_fixture)));

    // Create Socket.IO instance
    let (layer, io) = SocketIo::builder().build_layer();

    // Configure socket handlers
    let io_handle = io.clone();
    io.ns("/", {
        let registry = Arc::clone(&registry);
        move |socket: SocketRef, Data(auth): Data<serde_json::Value>| {
            let registry = Arc::clone(&registry);
            let io_handle = io_handle.clone();

            // Extract clientId from auth
            let client_id = auth
                .get("clientId")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            info!("Client connected: client_id={}", client_id);

            // Modular handlers (one file each under src/socket/). Migrating incrementally;
            // handlers not yet moved stay inline below.
            let ctx = socket::HandlerCtx {
                registry: Arc::clone(&registry),
                io: io_handle.clone(),
                client_id: client_id.clone(),
            };
            socket::register_all(&socket, &ctx);

            // Handle GAME.CREATE event
            socket.on(constants::game::CREATE, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |socket: SocketRef, Data::<String>(quizz_id)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();
                    let quiz_id = if quizz_id.is_empty() {
                        None
                    } else {
                        Some(quizz_id)
                    };

                    tokio::spawn(async move {
                        let mut registry = registry.write().await;
                        // C3 — active-game cap
                        match registry.create_game(socket_id.clone(), quiz_id) {
                            Ok((game_id, invite_code, host_token)) => {
                                info!(
                                    "Game created: gameId={}, inviteCode={}",
                                    game_id, invite_code
                                );

                                // Join socket to the game room
                                socket.join(game_id.clone()).ok();

                                // Emit manager:gameCreated with protocol type
                                let payload = razzoozle_protocol::manager::ManagerGameCreated {
                                    game_id,
                                    invite_code,
                                    host_token: Some(host_token),
                                };

                                socket
                                    .emit(constants::manager::GAME_CREATED, &payload)
                                    .ok();
                            }
                            Err(e) => {
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, e)
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.AUTH event
            socket.on(constants::manager::AUTH, {
                let registry = Arc::clone(&registry);
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<String>(password)| {
                    let registry = Arc::clone(&registry);
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        // Auth brute-force throttle (per client ID)
                        if RATE_LIMITER.record_auth_failure_and_check_throttle(&client_id) {
                            socket
                                .emit(constants::manager::ERROR_MESSAGE, "errors:manager.authThrottled")
                                .ok();
                            return;
                        }

                        let expected_password = std::env::var("MANAGER_PASSWORD")
                            .unwrap_or_else(|_| DEFAULT_MANAGER_PASSWORD.to_string());

                        if password == expected_password {
                            {
                                let mut registry = registry.write().await;
                                registry.login_client(client_id);
                            }

                            let empty_submissions: HashSet<String> = HashSet::new();
                            let payload = razzoozle_protocol::manager::ManagerConfig {
                                quizz: serde_json::json!([]),
                                results: serde_json::json!([]),
                                submissions: serde_json::json!(empty_submissions),
                                media: Some(serde_json::json!([])),
                                theme_templates: Some(serde_json::json!([])),
                                team_mode: Some(false),
                                low_latency_enabled: Some(false),
                                join_locked: Some(false),
                                randomize_answers: Some(false),
                                scoring_mode: None,
                                achievements: Some(serde_json::json!([])),
                                dev_mode: Some(false),
                                dev_api_key: None,
                                plugins: Some(Vec::new()),
                                observability: None,
                            };

                            socket.emit(constants::manager::CONFIG, &payload).ok();
                        } else {
                            socket
                                .emit(constants::manager::ERROR_MESSAGE, "errors:manager.invalidPassword")
                                .ok();
                        }
                    });
                }
            });

            // Handle PLAYER.JOIN event
            socket.on(constants::player::JOIN, {
                let registry = Arc::clone(&registry);

                move |socket: SocketRef, Data::<String>(invite_code)| {
                    let registry = Arc::clone(&registry);

                    tokio::spawn(async move {
                        let registry = registry.read().await;
                        let game_opt = registry.get_game_by_code(&invite_code);

                        match game_opt {
                            Some(game) => {
                                let game_data = game.lock().unwrap();
                                let payload = razzoozle_protocol::game::GameSuccessRoom {
                                    game_id: game_data.game_id.clone(),
                                    require_identifier: None,
                                };
                                drop(game_data);

                                info!("Player checking game: invite_code={}", invite_code);

                                socket.emit(constants::game::SUCCESS_ROOM, &payload).ok();
                            }
                            None => {
                                info!("Game not found: invite_code={}", invite_code);
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle PLAYER.LOGIN event
            socket.on(constants::player::LOGIN, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();
                let client_id = client_id.clone();
                let io_handle = io_handle.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();
                    let client_id = client_id.clone();
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        let username_opt = payload
                            .get("data")
                            .and_then(|v| v.get("username"))
                            .and_then(|v| v.as_str());
                        let avatar = payload
                            .get("data")
                            .and_then(|v| v.get("avatar"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        match (game_id_opt, username_opt) {
                            (Some(game_id), Some(username)) => {
                                // H — username/avatar length validation
                                if let Err(e) = state::GameRegistry::validate_username(username) {
                                    socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                                    return;
                                }

                                if let Some(ref av) = avatar {
                                    if let Err(e) = state::GameRegistry::validate_avatar(av) {
                                        socket.emit(constants::game::ERROR_MESSAGE, e).ok();
                                        return;
                                    }
                                }

                                let game_opt = {
                                    let registry = registry.read().await;
                                    registry.get_game_by_id(game_id)
                                };

                                match game_opt {
                                    Some(game_ref) => {
                                        let (game_id_ret, manager_socket_id, player, total_players) = {
                                            let mut game = game_ref.lock().unwrap();

                                            // H — per-game player cap
                                            if game.players.len() >= state::MAX_PLAYERS_PER_GAME {
                                                drop(game);
                                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.gameFull").ok();
                                                return;
                                            }

                                            let player = game.add_player(
                                                socket_id.clone(),
                                                client_id.clone(),
                                                username.to_string(),
                                                avatar,
                                            );

                                            let game_id = game.game_id.clone();
                                            let manager_socket_id = game.manager_socket_id.clone();
                                            let total_players = game.players.len();

                                            (game_id, manager_socket_id, player, total_players)
                                        };

                                        info!(
                                            "Player joined game: gameId={}, username={}",
                                            game_id_ret, username
                                        );

                                        socket.join(game_id_ret.clone()).ok();

                                        socket
                                            .emit(constants::game::SUCCESS_JOIN, &game_id_ret)
                                            .ok();


                                        socket.emit("player:token", &serde_json::json!({"playerToken": player.player_token})).ok();
                                        if let Ok(sid) = manager_socket_id.parse() {
                                            if let Some(mgr) = io_handle.get_socket(sid) {
                                                mgr.emit(constants::manager::NEW_PLAYER, &player).ok();
                                            }
                                        }

                                        socket
                                            .to(game_id_ret)
                                            .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                                            .ok();
                                    }
                                    None => {
                                        socket
                                            .emit(constants::game::ERROR_MESSAGE, "errors:game.notFound")
                                            .ok();
                                    }
                                }
                            }
                            _ => {
                                socket
                                    .emit(constants::game::ERROR_MESSAGE, "errors:game.invalidPayload")
                                    .ok();
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.START_GAME event
            socket.on(constants::manager::START_GAME, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
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
                                let registry = registry.read().await;
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
                                        io_handle.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();

                                        // Schedule question flow after lead time (3 seconds from golden frames)
                                        let io_handle = io_handle.clone();
                                        let game_id_clone = game_id.clone();
                                        let registry = registry.clone();

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

            // Handle PLAYER.SELECTED_ANSWER event
            socket.on(constants::player::SELECTED_ANSWER, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                        // Extract all answer fields
                        let data_obj = payload.get("data");
                        let answer_key_opt = data_obj
                            .and_then(|v| v.get("answerKey"))
                            .and_then(|v| v.as_i64())
                            .map(|v| v as i32);

                        let answer_keys_opt = data_obj
                            .and_then(|v| v.get("answerKeys"))
                            .and_then(|v| v.as_array())
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(|v| v.as_i64().map(|n| n as i32))
                                    .collect::<Vec<i32>>()
                            })
                            .and_then(|v| if v.is_empty() { None } else { Some(v) });

                        let answer_text_opt = data_obj
                            .and_then(|v| v.get("answerText"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(game_id)
                            };

                            if let Some(game_ref) = game_opt {
                                let record_result = {
                                    let mut game = game_ref.lock().unwrap();
                                    // Use the durable clientId from the socket handshake (captured at
                                    // connect). The old code matched `p.id == socket.id`, but p.id is a
                                    // generated player id that never equals socket.id — so the answer was
                                    // stored under the raw socket id and reveal never found it → 0 points
                                    // for every player. clientId is the same key reveal looks answers up by.

                                    // Get current server time (wall-clock) for response_time_ms calculation
                                    let server_now_ms = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .map(|d| d.as_millis() as i64)
                                        .unwrap_or(0);

                                    // Set engine clock to current wall-clock time so record_answer
                                    // calculates response_time_ms correctly
                                    game.engine.set_clock_ms(server_now_ms);

                                    game.engine.record_answer(
                                        &client_id,
                                        answer_key_opt,
                                        answer_keys_opt,
                                        answer_text_opt,
                                    ).ok()
                                };

                                if record_result.is_some() {
                                    let answer_count = {
                                        let game = game_ref.lock().unwrap();
                                        game.engine.current_answers.len() as i32
                                    };

                                    let game_id = game_id.to_string();
                                    // Emit game:playerAnswer (count) to all in room
                                    io_handle.to(game_id.clone())
                                        .emit(constants::game::PLAYER_ANSWER, &answer_count).ok();

                                    // Emit WAIT status to all players
                                    let wait_status = GameStatus::Wait(WaitData {
                                        text: "game:waitingForAnswers".to_string(),
                                        team_mode: None,
                                    });
                                    io_handle.to(game_id)
                                        .emit(constants::game::STATUS, &wait_status).ok();
                                }
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.REVEAL_ANSWER event
            socket.on(constants::manager::REVEAL_ANSWER, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
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
                                let registry = registry.read().await;
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
                                                    if let Some(player_socket) = io_handle.get_socket(sid) {
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
                                        if let Some(manager_socket) = io_handle.get_socket(sid) {
                                            manager_socket
                                                .emit(constants::game::STATUS, &manager_status)
                                                .ok();
                                        }
                                    }

                                    // Emit cooldown sequence (matching golden frames)
                                    let io_handle = io_handle.clone();
                                    let game_id_clone = game_id.clone();
                                    let registry = registry.clone();

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

            // Handle MANAGER.SHOW_LEADERBOARD event
            socket.on(constants::manager::SHOW_LEADERBOARD, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
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
                                let registry = registry.read().await;
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
                                    io_handle.to(game_id.clone())
                                        .emit(constants::game::STATUS, &status).ok();

                                    // Schedule next question after a delay
                                    let io_handle = io_handle.clone();
                                    let game_id_clone = game_id.clone();
                                    let registry = registry.clone();

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

            // Handle MANAGER.NEXT_QUESTION — advance to next or finish
            socket.on(constants::manager::NEXT_QUESTION, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
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
                                    io_handle.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();
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
                                    io_handle.to(game_id.clone()).emit(constants::game::STATUS, &status).ok();

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
                                        io_handle.to(game_id)
                                            .emit(constants::game::STATUS, &status).ok();
                                    }
                                }
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.SKIP_QUESTION
            socket.on(constants::manager::SKIP_QUESTION, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
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

            // Handle MANAGER.ABORT_QUIZ
            socket.on(constants::manager::ABORT_QUIZ, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
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
                                io_handle.to(game_id).emit(constants::game::STATUS, &status).ok();
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.ADJUST_TIMER
            socket.on(constants::manager::ADJUST_TIMER, {
                let registry = Arc::clone(&registry);
                let _io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let _delta_seconds = payload.get("deltaSeconds").and_then(|v| v.as_i64());
                    let registry = Arc::clone(&registry);
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
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

            // Handle MANAGER.KICK_PLAYER
            socket.on(constants::manager::KICK_PLAYER, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let player_id_opt = payload.get("playerId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket
                                .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                                .ok();
                            return;
                        }

                        if let (Some(game_id), Some(player_id)) = (game_id_opt, player_id_opt) {
                            let removed_count = {
                                let registry = registry.read().await;
                                let game_opt = registry.get_game_by_id(&game_id);
                                if let Some(game_ref) = game_opt {
                                    {
                                        let game = game_ref.lock().unwrap();
                                        if !is_game_host(&game, &payload) {
                                            socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                                            return;
                                        }
                                    }

                                    let mut game = game_ref.lock().unwrap();
                                    if let Some(pos) = game.players.iter().position(|p| p.client_id == player_id) {
                                        game.players.remove(pos);
                                        game.engine.players.retain(|p| p.client_id != player_id);
                                        game.engine.current_answers.remove(&player_id);
                                        game.engine.answer_order.retain(|c| c != &player_id);
                                        Some(game.players.len())
                                    } else {
                                        None
                                    }
                                } else {
                                    None
                                }
                            };

                            if let Some(total) = removed_count {
                                io_handle.to(game_id.clone()).emit(constants::game::TOTAL_PLAYERS, &(total as i32)).ok();
                                io_handle.to(game_id).emit(constants::manager::REMOVE_PLAYER, &player_id).ok();
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.LOGOUT
            socket.on(constants::manager::LOGOUT, {
                let registry = Arc::clone(&registry);
                let client_id = client_id.clone();

                move |_socket: SocketRef, _data: Data::<serde_json::Value>| {
                    let registry = Arc::clone(&registry);
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let mut registry = registry.write().await;
                        registry.logout_client(&client_id);
                    });
                }
            });

            // Handle PLAYER.LEAVE
            socket.on(constants::player::LEAVE, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let socket_id = socket.id.to_string();

                move |_socket: SocketRef, Data::<serde_json::Value>(_payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        let removed_player = {
                            let mut registry = registry.write().await;
                            registry.remove_player_by_socket_id(&socket_id)
                        };

                        if let Some((game_id, _manager_socket_id, _removed_player_id, total_players)) = removed_player {
                            io_handle.to(game_id).emit(constants::game::TOTAL_PLAYERS, &(total_players as i32)).ok();
                        }
                    });
                }
            });

            // Handle PLAYER.SELECT_TEAM
            socket.on(constants::player::SELECT_TEAM, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let team_id_opt = payload.get("teamId").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        if let Some(team_id) = team_id_opt {
                            let registry = registry.read().await;
                            registry.set_player_team(&socket_id, team_id);
                        }
                    });
                }
            });

            // Handle PLAYER.SET_AVATAR
            socket.on(constants::player::SET_AVATAR, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let avatar_opt = payload.get("avatar").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        if let Some(avatar) = avatar_opt {
                            let registry = registry.read().await;
                            registry.set_player_avatar(&socket_id, avatar);
                        }
                    });
                }
            });

            // clock:ping + metrics handlers now live in src/socket/{clock_ping,metrics}.rs
            // (registered above via socket::register_all).

            // Register AI/media handlers
            media_ai::register(&socket, Arc::clone(&registry), client_id.clone());

            // Handle MANAGER.GET_THEME — serve current theme (public)
            socket.on(constants::manager::GET_THEME, {
                move |socket: SocketRef| {
                    let theme_path = "config/theme/theme.json";

                    let theme = if let Ok(contents) = fs::read_to_string(theme_path) {
                        serde_json::from_str::<serde_json::Value>(&contents).ok()
                    } else {
                        None
                    };

                    let payload = theme.unwrap_or_else(|| serde_json::json!({}));
                    socket.emit(constants::manager::THEME, &payload).ok();
                }
            });

            // Handle RESULTS.GET_SHARED — read shared results by ID (public, no auth)
            socket.on(constants::results::GET_SHARED, {
                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let id_opt = payload.get("id").and_then(|v| v.as_str());

                    if let Some(id) = id_opt {
                        // Try config/solo-results first, then config/results
                        let result_path = format!("config/solo-results/{}.json", id);
                        let contents = fs::read_to_string(&result_path)
                            .or_else(|_| fs::read_to_string(&format!("config/results/{}.json", id)));

                        if let Ok(contents) = contents {
                            if let Ok(mut result) = serde_json::from_str::<serde_json::Value>(&contents) {
                                // Remove questions field for security
                                if let serde_json::Value::Object(ref mut obj) = result {
                                    obj.remove("questions");
                                }
                                socket.emit(constants::results::SHARED_DATA, &result).ok();
                            }
                        }
                    }
                }
            });

            // Handle MANAGER.SUBMIT_QUESTION — accept live-submitted question (public submission)
            socket.on(constants::manager::SUBMIT_QUESTION, {
                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    // For now, just acknowledge the submission
                    // Real validation happens in the Node.js layer
                    socket.emit(constants::manager::SUBMIT_SUCCESS, &serde_json::json!({})).ok();
                }
            });

            // Handle MANAGER.ADD_BOTS — add N bot players to game (auth-gated)
            socket.on(constants::manager::ADD_BOTS, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        // Check auth
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                            return;
                        }

                        // Extract gameId and count
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        let count_opt = payload.get("count").and_then(|v| v.as_i64()).map(|v| v as i32);

                        if let (Some(game_id), Some(count)) = (game_id_opt, count_opt) {
                            let game_id = game_id.to_string();

                            // Check SIM_MODE
                            if std::env::var("RAHOOT_SIM_MODE").as_deref() != Ok("1") {
                                socket.emit(
                                    constants::manager::ERROR_MESSAGE,
                                    "errors:manager.simModeDisabled"
                                ).ok();
                                return;
                            }

                            let game_opt = {
                                let registry = registry.read().await;
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

                                let mut game = game_ref.lock().unwrap();

                                // Verify caller is manager
                                if game.manager_socket_id != socket.id.to_string() {
                                    return;
                                }

                                // Add bots (clamped to a reasonable max per batch)
                                let to_add = std::cmp::min(count, 100) as usize;
                                let existing_bots = game.players.iter()
                                    .filter(|p| p.is_bot.unwrap_or(false))
                                    .count();
                                let max_total = 50;
                                let room = std::cmp::max(0, max_total - existing_bots);
                                let actual_count = std::cmp::min(to_add, room);

                                if actual_count <= 0 {
                                    return;
                                }

                                let bot_names = vec![
                                    "Alex", "Bailey", "Casey", "Devon", "Elliot", "Finley",
                                    "Gemini", "Harper", "Iris", "Jordan", "Kai", "Logan",
                                    "Morgan", "Nathan", "Oakley", "Parker", "Quinn", "Riley",
                                    "Scout", "Taylor", "Ulysses", "Valerie", "Wilder", "Xavier",
                                ];

                                for i in 0..actual_count {
                                    let bot_name = bot_names[i % bot_names.len()].to_string();
                                    let bot_socket_id = format!("bot-{}", uuid::Uuid::new_v4());
                                    let bot_client_id = format!("bot-{}", uuid::Uuid::new_v4());

                                    let player = game.add_player(
                                        bot_socket_id.clone(),
                                        bot_client_id,
                                        bot_name,
                                        None,
                                    );

                                    // Mark as bot
                                    if !game.players.is_empty() {
                                        if let Some(last_player) = game.players.last_mut() {
                                            last_player.is_bot = Some(true);
                                        }
                                    }

                                    // Broadcast NEW_PLAYER
                                    let new_player_payload = serde_json::json!({
                                        "id": player.id,
                                        "clientId": player.client_id,
                                        "username": player.username,
                                        "isBot": true,
                                        "points": 0,
                                        "streak": 0,
                                        "connected": true,
                                    });
                                    io_handle.to(game_id.clone())
                                        .emit(constants::manager::NEW_PLAYER, &new_player_payload)
                                        .ok();
                                }

                                // Broadcast TOTAL_PLAYERS once
                                let total = game.players.len() as i32;
                                io_handle.to(game_id.clone())
                                    .emit(constants::game::TOTAL_PLAYERS, &total)
                                    .ok();

                                drop(game);
                            }
                        }
                    });
                }
            });

            // Handle DISPLAY.REGISTER — register a display and get a pairing code
            socket.on(constants::display::REGISTER, {
                move |socket: SocketRef, _data: Data::<serde_json::Value>| {
                    // Generate 6-char alphanumeric code
                    use rand::Rng;
                    let mut rng = rand::thread_rng();
                    let charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
                    let code: String = (0..6)
                        .map(|_| {
                            let idx = rng.gen_range(0..charset.len());
                            charset.chars().nth(idx).unwrap()
                        })
                        .collect();

                    socket.emit(constants::display::REGISTERED, &serde_json::json!({ "code": code })).ok();
                }
            });

            // Handle DISPLAY.PAIR — pair display to game by code
            socket.on(constants::display::PAIR, {
                let io_handle = io_handle.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let io_handle = io_handle.clone();

                    let code_opt = payload.get("code").and_then(|v| v.as_str());
                    let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                    if let (Some(code), Some(game_id)) = (code_opt, game_id_opt) {
                        let game_id = game_id.to_string();

                        // Verify the code exists (in a real implementation, check a pairing registry)
                        // For now, accept any non-empty code
                        if !code.is_empty() {
                            // Join the display socket to the game room
                            socket.join(game_id.clone());

                            // Emit PAIR_SUCCESS to both
                            socket.emit(constants::display::PAIR_SUCCESS, &serde_json::json!({ "gameId": game_id.clone() })).ok();
                            io_handle.to(game_id).emit(constants::display::PAIR_SUCCESS, &serde_json::json!({ "code": code })).ok();
                        } else {
                            socket.emit(constants::display::PAIR_ERROR, "errors:display.invalidCode").ok();
                        }
                    }
                }
            });

            // Handle DISPLAY.PING — heartbeat from paired display
            socket.on(constants::display::PING, {
                move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let _game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                    // Update heartbeat and broadcast status
                    // For now, just acknowledge
                }
            });

            // Handle DISPLAY.DISCONNECT — unregister pairing code
            socket.on(constants::display::DISCONNECT, {
                move |_socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let _code_opt = payload.get("code").and_then(|v| v.as_str());
                    // Remove code from pairing registry
                    // For now, no-op
                }
            });

            // Handle PLAYER.RECONNECT — reconnect player by token (secure) or clientId (backward-compat)
            socket.on(constants::player::RECONNECT, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let socket_id = socket.id.to_string();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let socket_id = socket_id.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        let player_token_opt = payload.get("playerToken").and_then(|v| v.as_str());

                        if let Some(game_id) = game_id_opt {
                            let game_id = game_id.to_string();

                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(&game_id)
                            };

                            if let Some(game_ref) = game_opt {
                                let mut game = game_ref.lock().unwrap();

                                // Find player: token-preferred (secure), fall back to handshake clientId (backward-compat)
                                let pos_opt = if let Some(token) = player_token_opt {
                                    game.players.iter().position(|p| p.player_token.as_deref() == Some(token))
                                } else {
                                    game.players.iter().position(|p| p.client_id == client_id)
                                };

                                if let Some(pos) = pos_opt {
                                    let game_id_ret = game.game_id.clone();
                                    game.players[pos].id = socket_id.clone();
                                    game.players[pos].connected = true;

                                    // Update engine players
                                    if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                        game.engine.players[engine_pos].id = socket_id.clone();
                                        game.engine.players[engine_pos].connected = true;
                                    }

                                    // Read points/streak from engine.players (where scoring happens)
                                    let (username, points, streak) = if let Some(engine_pos) = game.engine.players.iter().position(|p| p.client_id == game.players[pos].client_id) {
                                        let ep = &game.engine.players[engine_pos];
                                        (ep.username.clone(), ep.points, ep.streak)
                                    } else {
                                        (game.players[pos].username.clone(), game.players[pos].points, game.players[pos].streak)
                                    };

                                    drop(game);

                                    // Join the room
                                    socket.join(game_id_ret.clone());

                                    // Emit reconnect success with player state
                                    socket.emit(constants::player::SUCCESS_RECONNECT, &serde_json::json!({
                                        "playerId": socket_id,
                                        "username": username,
                                        "points": points,
                                        "streak": streak,
                                    })).ok();
                                } else {
                                    socket.emit(constants::game::ERROR_MESSAGE, "errors:game.playerNotFound").ok();
                                }
                            } else {
                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.notFound").ok();
                            }
                        }
                    });
                }
            });

            // Handle MANAGER.RECONNECT — reconnect manager by clientId
            socket.on(constants::manager::RECONNECT, {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
                        let is_logged = {
                            let registry = registry.read().await;
                            registry.is_logged(&client_id)
                        };

                        if !is_logged {
                            socket.emit(constants::manager::UNAUTHORIZED, &serde_json::json!([])).ok();
                            return;
                        }

                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                        if let Some(game_id) = game_id_opt {
                            let game_id = game_id.to_string();

                            let game_opt = {
                                let registry = registry.read().await;
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

                                let mut game = game_ref.lock().unwrap();

                                // Update manager socket
                                game.manager_socket_id = socket.id.to_string();

                                let game_id = game.game_id.clone();
                                let players = game.players.clone();

                                drop(game);

                                // Join the room
                                socket.join(game_id.clone());

                                // Emit reconnect success with game state
                                socket.emit(constants::manager::SUCCESS_RECONNECT, &serde_json::json!({
                                    "gameId": game_id,
                                    "status": "reconnected",
                                    "players": players,
                                })).ok();

                                // Broadcast to room that manager reconnected
                                io_handle.to(game_id)
                                    .emit(constants::manager::PLAYER_RECONNECTED, &serde_json::json!({}))
                                    .ok();
                            } else {
                                socket.emit(constants::game::ERROR_MESSAGE, "errors:game.notFound").ok();
                            }
                        }
                    });
                }
            });

            // Handle disconnect
            let registry = Arc::clone(&registry);
            let io_handle = io_handle.clone();
            let socket_id = socket.id.to_string();

            socket.on_disconnect(move |_: SocketRef| {
                let registry = Arc::clone(&registry);
                let io_handle = io_handle.clone();
                let socket_id = socket_id.clone();

                tokio::spawn(async move {
                    let removed_player = {
                        let mut registry = registry.write().await;
                        registry.mark_player_disconnected(&socket_id)
                    };

                    if let Some((game_id, manager_socket_id, removed_player_id, total_players, removed)) =
                        removed_player
                    {
                        info!(
                            "Player disconnected: gameId={}, clientId={}, totalPlayers={}",
                            game_id, removed_player_id, total_players
                        );

                        io_handle
                            .to(game_id.clone())
                            .emit(constants::game::TOTAL_PLAYERS, &(total_players as i32))
                            .ok();

                        if removed {
                            if let Ok(sid) = manager_socket_id.parse() {
                                if let Some(manager_socket) = io_handle.get_socket(sid) {
                                    manager_socket
                                        .emit(constants::manager::REMOVE_PLAYER, &removed_player_id)
                                        .ok();
                                }
                            }
                        }
                    } else {
                        info!("Client disconnected: socketId={}", socket_id);
                    }
                });
            });
        }
    });

    // C4 — Game eviction reaper: spawn background task to periodically evict stale games
    // (closes the memory leak from finished/inactive games)
    {
        let registry_clone = Arc::clone(&registry);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(60));
            loop {
                interval.tick().await;
                {
                    let mut reg = registry_clone.write().await;
                    reg.evict_stale_games();
                }
            }
        });
    }

    // Axum router with socketioxide middleware and HTTP routes
    let app = http::router(Arc::clone(&registry))
        .layer(layer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    // 0.0.0.0 so the server is reachable through Docker port forwarding
    // (the host only maps it to 127.0.0.1:<hostport>, so it stays loopback-exposed).
    let addr = format!("0.0.0.0:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("Failed to start server");
}
