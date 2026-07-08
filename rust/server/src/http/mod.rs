mod achievements;
mod assignments;
pub mod logs;
mod observability;
mod skeleton;

use axum::{
    extract::{ConnectInfo, Path},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use lazy_static::lazy_static;
use razzoozle_engine::eval::{evaluate_answer, AnswerInput};
use razzoozle_protocol::quizz::QuestionType;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::{GameRegistry, RateLimiter, safe_asset_id, SOLO_RESULTS_MAX_ENTRIES};
use crate::question_type_wire;
use crate::socket::manager::plugins_zip::PLUGIN_ASSET_EXT;

// ── Shared HTTP state ────────────────────────────────────────────────────────
//
// AppState bundles everything the HTTP layer needs WITHOUT stuffing it into
// GameRegistry: the registry itself (games/quizzes/auth), an optional PgPool
// for DB-backed routes (/api/achievements), and the SocketIo handle so future
// routes (skeleton import, Wave gamma) can broadcast directly via state.io.
// DB queries never take the registry lock.

#[derive(Clone)]
pub struct AppState {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub db_pool: Option<sqlx::PgPool>,
    pub io: socketioxide::SocketIo,
}

// Bridge so handlers still extracting State<Arc<RwLock<GameRegistry>>>
// (assignments.rs) keep working unchanged against the AppState router.
impl axum::extract::FromRef<AppState> for Arc<RwLock<GameRegistry>> {
    fn from_ref(state: &AppState) -> Self {
        Arc::clone(&state.registry)
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

#[derive(Debug, Serialize, Deserialize, Clone)]
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

#[derive(Debug, Serialize)]
struct HealthResponse {
    status: String,
    ts: String,
}

// ── HTTP helpers (auth, error formatting, dev-gating) ──────────────────────

pub(crate) fn json_error_response(
    status: StatusCode,
    msg: impl Into<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(json!({"error": msg.into()})))
}

pub(crate) fn is_dev_mode() -> bool {
    std::env::var("RAZZOOLE_DEV").ok() == Some("1".to_string())
}

pub(crate) fn dev_api_key() -> Option<String> {
    std::env::var("DEV_API_KEY").ok()
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

lazy_static! {
    pub static ref RATE_LIMITER: RateLimiter = RateLimiter::new();
}

pub async fn handle_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        ts: chrono::Utc::now().to_rfc3339(),
    })
}

pub async fn handle_healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

pub async fn handle_get_quizzes(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Json<Vec<String>> {
    let registry = state.registry.read().await;
    let ids = registry.list_quiz_ids();
    Json(ids)
}

pub async fn handle_get_quiz_solo(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(quiz_id): Path<String>,
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<SoloResponse>, (StatusCode, String)> {
    // Path-traversal protection
    safe_asset_id(&quiz_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // Rate limiting (per client IP)
    let client_ip = addr.ip().to_string();
    if !RATE_LIMITER.check_solo_rate(&client_ip) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded".to_string()));
    }

    let registry = state.registry.read().await;
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

pub async fn handle_check_answer(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(quiz_id): Path<String>,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(payload): Json<CheckAnswerRequest>,
) -> Result<Json<CheckAnswerResponse>, (StatusCode, String)> {
    // Path-traversal protection
    safe_asset_id(&quiz_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // Rate limiting (per client IP)
    let client_ip = addr.ip().to_string();
    if !RATE_LIMITER.check_solo_rate(&client_ip) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded".to_string()));
    }

    let registry = state.registry.read().await;
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

pub fn get_solo_results_path(quiz_id: &str) -> String {
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

pub async fn handle_solo_score(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(quiz_id): Path<String>,
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(payload): Json<SoloScoreRequest>,
) -> Result<Json<SoloScoreResponse>, (StatusCode, String)> {
    // Path-traversal protection
    safe_asset_id(&quiz_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // Rate limiting (per client IP)
    let client_ip = addr.ip().to_string();
    if !RATE_LIMITER.check_solo_rate(&client_ip) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded".to_string()));
    }

    let registry = state.registry.read().await;

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

    // Persist to file (blocking I/O off-thread)
    let file_path = get_solo_results_path(&quiz_id);

    let (leaderboard, write_err) = tokio::task::spawn_blocking({
        let file_path = file_path.clone();
        let result_entry = result_entry.clone();
        move || {
            let dir_path = std::path::Path::new(&file_path).parent();

            if let Some(dir) = dir_path {
                if !dir.exists() {
                    if let Err(e) = fs::create_dir_all(dir) {
                        return (
                            Vec::new(),
                            Some((
                                StatusCode::INTERNAL_SERVER_ERROR,
                                format!("Failed to create directory: {}", e),
                            )),
                        );
                    }
                }
            }

            let mut leaderboard: Vec<SoloResultEntry> = if std::path::Path::new(&file_path).exists()
            {
                match fs::read_to_string(&file_path) {
                    Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
                    Err(e) => {
                        return (
                            Vec::new(),
                            Some((
                                StatusCode::INTERNAL_SERVER_ERROR,
                                format!("Failed to read results file: {}", e),
                            )),
                        );
                    }
                }
            } else {
                Vec::new()
            };

            leaderboard.push(result_entry);
            leaderboard.sort_by(|a, b| b.score.cmp(&a.score));

            // Cap leaderboard to prevent unbounded growth — keep top N by score
            if leaderboard.len() > SOLO_RESULTS_MAX_ENTRIES {
                leaderboard.truncate(SOLO_RESULTS_MAX_ENTRIES);
            }

            let json_str = match serde_json::to_string_pretty(&leaderboard) {
                Ok(s) => s,
                Err(e) => {
                    return (
                        Vec::new(),
                        Some((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("JSON serialization error: {}", e),
                        )),
                    );
                }
            };

            if let Err(e) = fs::write(&file_path, json_str) {
                return (
                    Vec::new(),
                    Some((
                        StatusCode::INTERNAL_SERVER_ERROR,
                        format!("Failed to write results file: {}", e),
                    )),
                );
            }

            (leaderboard, None)
        }
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?;

    if let Some(err) = write_err {
        return Err(err);
    }

    Ok(Json(SoloScoreResponse { leaderboard }))
}

// ── Static file helpers ─────────────────────────────────────────────────────

pub fn get_config_path() -> String {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        config_path
    } else {
        let cwd = std::env::current_dir().unwrap();
        cwd.parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("config")
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| "config".to_string())
    }
}

/// Validate a file path component to prevent traversal attacks.
/// Rejects "..", "~", absolute paths, and null bytes.
fn safe_path_component(component: &str) -> Result<(), String> {
    if component.is_empty() || component == "." || component == ".." {
        return Err("Invalid path component".to_string());
    }
    if component.starts_with('/') || component.starts_with('~') {
        return Err("Absolute or home-relative paths not allowed".to_string());
    }
    if component.contains('\0') {
        return Err("Null bytes not allowed".to_string());
    }
    if component.contains('\\') {
        return Err("Backslashes not allowed".to_string());
    }
    Ok(())
}

/// Determine MIME type from file extension
fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "css" => "text/css",
        "js" => "application/javascript",
        "mjs" => "application/javascript",
        "json" => "application/json",
        "html" => "text/html",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" => "text/plain",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

/// Serve a static file with path-traversal protection
async fn serve_static_file(base_dir: &str, rel_path: &str) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Validate the relative path components
    for component in rel_path.split('/') {
        safe_path_component(component)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let file_path = std::path::Path::new(base_dir)
        .join(rel_path);

    // Move blocking FS operations off-thread
    let (canonical, base_canonical) = tokio::task::spawn_blocking({
        let base_dir = base_dir.to_string();
        move || {
            let canonical = file_path.canonicalize();
            let base_canonical = std::path::Path::new(&base_dir).canonicalize();
            (canonical, base_canonical)
        }
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?;

    let canonical = canonical
        .map_err(|_| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

    let base_canonical = base_canonical
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Invalid base directory".to_string()))?;

    if !canonical.starts_with(&base_canonical) {
        return Err((StatusCode::FORBIDDEN, "Path traversal detected".to_string()));
    }

    let body = tokio::task::spawn_blocking({
        let canonical = canonical.clone();
        move || fs::read(&canonical)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?
    .map_err(|_| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

    let ext = canonical
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let content_type = mime_type_for_ext(ext);

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        content_type.parse().unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert(
        axum::http::header::CONTENT_LENGTH,
        body.len().to_string().parse().unwrap(),
    );

    Ok((StatusCode::OK, headers, body))
}

pub async fn handle_theme_asset(
    Path(rel_path): Path<String>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    let base_dir = format!("{}/theme", get_config_path());
    serve_static_file(&base_dir, &rel_path).await
}

pub async fn handle_plugin_asset(
    Path((plugin_id, rel_path)): Path<(String, String)>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Validate plugin ID
    safe_asset_id(&plugin_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // Public unauth surface: mirror Node resolvePluginAsset — only ui.js or assets/**, allowlisted ext, no svg.
    if rel_path != "ui.js" && !rel_path.starts_with("assets/") {
        return Err((StatusCode::NOT_FOUND, "not found".to_string()));
    }
    let ext = rel_path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !PLUGIN_ASSET_EXT.contains(&ext.as_str()) {
        return Err((StatusCode::NOT_FOUND, "not found".to_string()));
    }

    let base_dir = format!("{}/plugins/{}", get_config_path(), plugin_id);
    serve_static_file(&base_dir, &rel_path).await
}

pub async fn handle_sounds_asset(
    Path(rel_path): Path<String>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Try CONFIG_PATH/sounds first, then fallback to web/public/sounds
    let config_base = format!("{}/sounds", get_config_path());

    match serve_static_file(&config_base, &rel_path).await {
        Ok(result) => Ok(result),
        Err((StatusCode::NOT_FOUND, _)) => {
            // Fallback to web/public/sounds
            let cwd = std::env::current_dir()
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Cannot access cwd".to_string()))?;
            let web_base = cwd
                .parent()
                .and_then(|p| p.parent())
                .map(|p| {
                    p.join("packages/web/public/sounds")
                        .to_string_lossy()
                        .to_string()
                })
                .unwrap_or_else(|| "packages/web/public/sounds".to_string());

            serve_static_file(&web_base, &rel_path).await
        }
        Err(e) => Err(e),
    }
}

/// Build and return the HTTP router for solo play and health check endpoints
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/healthz", get(handle_healthz))
        .route("/api/v1/health", get(handle_health))
        .route("/api/achievements", get(achievements::handle_achievements))
        .route("/api/quizzes", get(handle_get_quizzes))
        .route("/api/quizz/:id/solo", get(handle_get_quiz_solo))
        .route("/api/quizz/:id/check-answer", post(handle_check_answer))
        .route("/api/quizz/:id/solo-score", post(handle_solo_score))
        .route("/api/assignment", post(assignments::handle_create_assignment))
        .route("/api/assignment/:id", get(assignments::handle_get_assignment))
        .route("/api/assignment/:id/results", get(assignments::handle_get_assignment_results))
        .route("/api/skeleton/export", get(skeleton::handle_skeleton_export))
        .route(
            "/api/skeleton/import",
            post(skeleton::handle_skeleton_import)
                .layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route("/api/v1/observability/events", get(observability::handle_observability_events))
        .route("/api/v1/observability/schema", get(observability::handle_observability_schema))
        .route("/api/v1/observability/logs/server", get(logs::handle_logs_server))
        .route("/api/v1/observability/logs/client", get(logs::handle_logs_client))
        .route("/theme/*path", get(handle_theme_asset))
        .route("/plugins/:id/*path", get(handle_plugin_asset))
        .route("/sounds/*path", get(handle_sounds_asset))
        .with_state(state)
}
