mod state;

use axum::{
    http::StatusCode,
    routing::get,
    Router,
};
use razzoozle_engine::state::GamePhase;
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::QuestionType;
use razzoozle_protocol::status::{GameStatus, ShowStartData, ShowQuestionData, SelectAnswerData, ShowLeaderboardData, WaitData, ShowResultData};
use socketioxide::extract::{Data, SocketRef};
use socketioxide::SocketIo;
use state::{GameRegistry, QuizFixture};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{info, warn};

#[tokio::main]
async fn main() {
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

            // Handle GAME.CREATE event
            socket.on(constants::game::CREATE, {
                let registry = Arc::clone(&registry);
                let socket_id = socket.id.to_string();

                move |socket: SocketRef, Data::<String>(_quizz_id)| {
                    let registry = Arc::clone(&registry);
                    let socket_id = socket_id.clone();

                    tokio::spawn(async move {
                        let mut registry = registry.write().await;
                        let (game_id, invite_code) = registry.create_game(socket_id.clone());

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
                        };

                        socket
                            .emit(constants::manager::GAME_CREATED, &payload)
                            .ok();
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
                                let game_opt = {
                                    let registry = registry.read().await;
                                    registry.get_game_by_id(game_id)
                                };

                                match game_opt {
                                    Some(game_ref) => {
                                        let (game_id_ret, manager_socket_id, player, total_players) = {
                                            let mut game = game_ref.lock().unwrap();
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

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        info!("manager:startGame received: gameId={:?}", game_id_opt);

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(game_id)
                            };

                            if let Some(game_ref) = game_opt {
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
                                                        let question_type_str = question.r#type.as_ref().map(|t| {
                                                            match t {
                                                                QuestionType::Choice => "choice",
                                                                QuestionType::Boolean => "boolean",
                                                                QuestionType::Slider => "slider",
                                                                QuestionType::Poll => "poll",
                                                                QuestionType::MultipleSelect => "multiple-select",
                                                                QuestionType::TypeAnswer => "type-answer",
                                                                QuestionType::SentenceBuilder => "sentence-builder",
                                                            }.to_string()
                                                        });

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

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());
                        let answer_key_opt = payload
                            .get("data")
                            .and_then(|v| v.get("answerKey"))
                            .and_then(|v| v.as_i64());

                        if let (Some(game_id), Some(answer_key)) = (game_id_opt, answer_key_opt) {
                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(game_id)
                            };

                            if let Some(game_ref) = game_opt {
                                let record_result = {
                                    let mut game = game_ref.lock().unwrap();
                                    let socket_id = socket.id.to_string();
                                    let client_id = game.players
                                        .iter()
                                        .find(|p| p.id == socket_id)
                                        .map(|p| p.client_id.clone())
                                        .unwrap_or_else(|| socket_id);

                                    // Get current server time (wall-clock) for response_time_ms calculation
                                    let server_now_ms = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .map(|d| d.as_millis() as i64)
                                        .unwrap_or(0);

                                    // Set engine clock to current wall-clock time so record_answer
                                    // calculates response_time_ms correctly
                                    game.engine.set_clock_ms(server_now_ms);

                                    game.engine.record_answer(&client_id, answer_key as i32).ok()
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

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(game_id)
                            };

                            if let Some(game_ref) = game_opt {
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
                                        let mut rank_map = std::collections::HashMap::new();
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

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();

                    tokio::spawn(async move {
                        let game_id_opt = payload.get("gameId").and_then(|v| v.as_str());

                        if let Some(game_id) = game_id_opt {
                            let game_opt = {
                                let registry = registry.read().await;
                                registry.get_game_by_id(game_id)
                            };

                            if let Some(game_ref) = game_opt {
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
                                                game.engine.next_or_finish().ok()
                                            };

                                            if let Some(GamePhase::Finished) = next_phase {
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
                                            } else if let Some(GamePhase::ShowQuestion) = next_phase {
                                                // Move to next question
                                                let question_data = {
                                                    let game = game_ref.lock().unwrap();
                                                    game.engine.current_question().clone()
                                                };

                                                let status = GameStatus::ShowQuestion(ShowQuestionData {
                                                    question: question_data.question.clone(),
                                                    answers: question_data.answers.clone(),
                                                    display_order: None,
                                                    media: question_data.media.clone(),
                                                    cooldown: question_data.cooldown,
                                                    submitted_by: question_data.submitted_by.clone(),
                                                });
                                                io_handle.to(game_id_clone.clone())
                                                    .emit(constants::game::STATUS, &status).ok();

                                                // Then SelectAnswer
                                                let select_data = {
                                                    let game = game_ref.lock().unwrap();
                                                    game.engine.current_question().clone()
                                                };

                                                let total_players = {
                                                    let game = game_ref.lock().unwrap();
                                                    game.players.len() as i32
                                                };

                                                let question_type_str = select_data.r#type.as_ref().map(|t| {
                                                    match t {
                                                        QuestionType::Choice => "choice",
                                                        QuestionType::Boolean => "boolean",
                                                        QuestionType::Slider => "slider",
                                                        QuestionType::Poll => "poll",
                                                        QuestionType::MultipleSelect => "multiple-select",
                                                        QuestionType::TypeAnswer => "type-answer",
                                                        QuestionType::SentenceBuilder => "sentence-builder",
                                                    }.to_string()
                                                });

                                                let select_answer = SelectAnswerData {
                                                    question: select_data.question.clone(),
                                                    answers: select_data.answers.clone(),
                                                    media: select_data.media.clone(),
                                                    time: select_data.time,
                                                    total_player: total_players,
                                                    question_type: question_type_str,
                                                    min: select_data.min.map(|v| v as i32),
                                                    max: select_data.max.map(|v| v as i32),
                                                    step: select_data.step.map(|v| v as i32),
                                                    unit: select_data.unit.clone(),
                                                    shuffled_chunks: None,
                                                    server_seq: None,
                                                    server_now_ms: None,
                                                    question_start_at_server_ms: None,
                                                    answer_deadline_at_server_ms: None,
                                                    submitted_by: select_data.submitted_by.clone(),
                                                };

                                                let status = GameStatus::SelectAnswer(select_answer);
                                                io_handle.to(game_id_clone)
                                                    .emit(constants::game::STATUS, &status).ok();
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    });
                }
            });

            // Handle disconnect
            socket.on_disconnect(move |_: SocketRef| {
                info!("Client disconnected");
            });
        }
    });

    // Axum router with socketioxide middleware
    let app = Router::new()
        .route("/health", get(|| async { StatusCode::OK }))
        .layer(layer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3020".into());
    // 0.0.0.0 so the server is reachable through Docker port forwarding
    // (the host only maps it to 127.0.0.1:<hostport>, so it stays loopback-exposed).
    let addr = format!("0.0.0.0:{port}").parse::<SocketAddr>().unwrap();
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();

    info!("Server listening on http://{}", addr);

    axum::serve(listener, app)
        .await
        .expect("Failed to start server");
}
