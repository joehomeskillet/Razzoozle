mod state;

use axum::{
    extract::Path,
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
use state::{GameRegistry, QuizFixture};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{info, warn};

fn question_type_wire(question_type: &QuestionType) -> &'static str {
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

fn match_mode_from_str(match_mode: &str) -> Option<MatchMode> {
    match match_mode {
        "exact" => Some(MatchMode::Exact),
        "normalized" => Some(MatchMode::Normalized),
        "fuzzy" => Some(MatchMode::Fuzzy),
        _ => None,
    }
}

// ── Solo play types ─────────────────────────────────────────────────────────
#[derive(Debug, Serialize, Deserialize)]
pub struct SoloQuestion {
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub r#type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    pub time: i32,
    pub cooldown: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SoloResponse {
    pub subject: String,
    pub questions: Vec<SoloQuestion>,
}

#[derive(Debug, Deserialize)]
pub struct CheckAnswerRequest {
    #[serde(rename = "questionIndex")]
    pub question_index: usize,
    #[serde(rename = "answerId")]
    pub answer_id: Option<i32>,
    #[serde(rename = "answerIds")]
    pub answer_ids: Option<Vec<i32>>,
    #[serde(rename = "answerText")]
    pub answer_text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CheckAnswerResponse {
    pub correct: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accuracy: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub achievements: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct SoloScoreSubmitAnswer {
    #[serde(rename = "questionIndex")]
    pub question_index: i32,
    pub correct: bool,
}

#[derive(Debug, Deserialize)]
pub struct SoloScoreRequest {
    #[serde(rename = "playerName")]
    pub player_name: String,
    pub score: i32,
    pub answers: Option<Vec<SoloScoreSubmitAnswer>>,
    #[serde(rename = "assignmentId")]
    pub assignment_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SoloResultEntry {
    #[serde(rename = "playerName")]
    pub player_name: String,
    pub score: i32,
    #[serde(rename = "answeredAt")]
    pub answered_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "assignmentId")]
    pub assignment_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SoloScoreResponse {
    pub leaderboard: Vec<SoloResultEntry>,
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

async fn handle_health() -> &'static str {
    "OK"
}

async fn handle_get_quizzes(
    axum::extract::State(registry): axum::extract::State<Arc<RwLock<GameRegistry>>>,
) -> Json<Vec<String>> {
    let registry = registry.read().await;
    let ids = registry.list_quiz_ids();
    Json(ids)
}

async fn handle_get_quiz_solo(
    Path(quiz_id): Path<String>,
    axum::extract::State(registry): axum::extract::State<Arc<RwLock<GameRegistry>>>,
) -> Result<Json<SoloResponse>, (StatusCode, String)> {
    let registry = registry.read().await;
    let quiz = registry
        .get_quiz_by_id(&quiz_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Quiz not found".to_string()))?;

    let questions = quiz
        .questions
        .iter()
        .map(|q| SoloQuestion {
            question: q.question.clone(),
            r#type: q.r#type.as_ref().map(|t| question_type_wire(t).to_string()),
            media: q.media.as_ref().map(|m| {
                serde_json::json!({
                    "type": m.r#type,
                    "url": m.url
                })
            }),
            answers: q.answers.clone(),
            min: q.min,
            max: q.max,
            step: q.step,
            unit: q.unit.clone(),
            time: q.time,
            cooldown: q.cooldown,
        })
        .collect();

    Ok(Json(SoloResponse {
        subject: quiz.subject,
        questions,
    }))
}

async fn handle_check_answer(
    Path(quiz_id): Path<String>,
    axum::extract::State(registry): axum::extract::State<Arc<RwLock<GameRegistry>>>,
    Json(payload): Json<CheckAnswerRequest>,
) -> Result<Json<CheckAnswerResponse>, (StatusCode, String)> {
    let registry = registry.read().await;
    let quiz = registry
        .get_quiz_by_id(&quiz_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, "Quiz not found".to_string()))?;

    if payload.question_index >= quiz.questions.len() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid question index".to_string(),
        ));
    }

    let question = &quiz.questions[payload.question_index];

    let answer_input = AnswerInput {
        answer_key: payload.answer_id,
        answer_keys: payload.answer_ids,
        answer_text: payload.answer_text,
    };

    let eval_result = evaluate_answer(question, &answer_input);
    let points = if eval_result.correct { 1000 } else { 0 };

    let mut response = CheckAnswerResponse {
        correct: eval_result.correct,
        points: Some(points),
        accuracy: None,
        achievements: None,
    };

    // For slider questions, include accuracy
    if question.r#type.as_ref() == Some(&QuestionType::Slider) {
        response.accuracy = Some(eval_result.base);

        // Check for sharpshooter achievement (95%+ accuracy on slider)
        if eval_result.correct && eval_result.base * 100.0 >= 95.0 {
            response.achievements = Some(vec!["sharpshooter".to_string()]);
        }
    }

    Ok(Json(response))
}

fn get_solo_results_path(quiz_id: &str) -> String {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        format!("{}/solo-results/{}.json", config_path, quiz_id)
    } else {
        let cwd = std::env::current_dir().unwrap();
        cwd.parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join(format!("config/solo-results/{}.json", quiz_id))
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| format!("config/solo-results/{}.json", quiz_id))
    }
}

async fn handle_solo_score(
    Path(quiz_id): Path<String>,
    axum::extract::State(registry): axum::extract::State<Arc<RwLock<GameRegistry>>>,
    Json(payload): Json<SoloScoreRequest>,
) -> Result<Json<SoloScoreResponse>, (StatusCode, String)> {
    let registry = registry.read().await;

    // Load quiz to verify it exists and calculate theoretical max
    let quiz = registry
        .get_quiz_by_id(&quiz_id)
        .ok_or_else(|| (StatusCode::NOT_FOUND, format!("Quizz \"{}\" not found", quiz_id)))?;
    drop(registry);

    let theoretical_max = quiz.questions.len() as i32 * 1000;

    // Recompute score from answers if provided
    let mut verified_score = payload.score;
    if let Some(answers) = &payload.answers {
        if !answers.is_empty() {
            verified_score = 0;
            for answer in answers {
                if answer.question_index >= 0
                    && (answer.question_index as usize) < quiz.questions.len()
                    && answer.correct
                {
                    verified_score += 1000;
                }
            }
        }
    }

    // Cap at theoretical maximum
    let final_score = std::cmp::min(verified_score, theoretical_max);

    let now = chrono::Utc::now().to_rfc3339();

    let result_entry = SoloResultEntry {
        player_name: payload.player_name,
        score: final_score,
        answered_at: now,
        assignment_id: payload.assignment_id,
    };

    // Persist to file
    let file_path = get_solo_results_path(&quiz_id);
    let dir_path = std::path::Path::new(&file_path).parent();

    if let Some(dir) = dir_path {
        if !dir.exists() {
            fs::create_dir_all(dir).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to create directory: {}", e),
                )
            })?;
        }
    }

    let mut leaderboard: Vec<SoloResultEntry> =
        if std::path::Path::new(&file_path).exists() {
            let contents = fs::read_to_string(&file_path).map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to read results file: {}", e),
                )
            })?;
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            Vec::new()
        };

    leaderboard.push(result_entry);
    leaderboard.sort_by(|a, b| b.score.cmp(&a.score));

    let json_str = serde_json::to_string_pretty(&leaderboard)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("JSON serialization error: {}", e)))?;

    fs::write(&file_path, json_str).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to write results file: {}", e),
        )
    })?;

    Ok(Json(SoloScoreResponse { leaderboard }))
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
                        let (game_id, invite_code) = registry.create_game(socket_id.clone(), quiz_id);

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

            // Handle MANAGER.AUTH event
            socket.on(constants::manager::AUTH, {
                let registry = Arc::clone(&registry);
                let client_id = client_id.clone();

                move |socket: SocketRef, Data::<String>(password)| {
                    let registry = Arc::clone(&registry);
                    let client_id = client_id.clone();

                    tokio::spawn(async move {
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

                move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
                    let registry = Arc::clone(&registry);
                    let io_handle = io_handle.clone();

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
                        registry.remove_player_by_socket_id(&socket_id)
                    };

                    if let Some((game_id, manager_socket_id, removed_player_id, total_players)) =
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

                        if let Ok(sid) = manager_socket_id.parse() {
                            if let Some(manager_socket) = io_handle.get_socket(sid) {
                                manager_socket
                                    .emit(constants::manager::REMOVE_PLAYER, &removed_player_id)
                                    .ok();
                            }
                        }
                    } else {
                        info!("Client disconnected: socketId={}", socket_id);
                    }
                });
            });
        }
    });

    // Axum router with socketioxide middleware and HTTP routes
    let app = Router::new()
        .route("/health", get(handle_health))
        .route("/api/quizzes", get(handle_get_quizzes))
        .route("/api/quizz/:id/solo", get(handle_get_quiz_solo))
        .route("/api/quizz/:id/check-answer", post(handle_check_answer))
        .route("/api/quizz/:id/solo-score", post(handle_solo_score))
        .with_state(Arc::clone(&registry))
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
