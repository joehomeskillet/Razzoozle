use axum::{
    extract::{ConnectInfo, Path},
    http::StatusCode,
    Json,
};
use razzoozle_engine::eval::{evaluate_answer, AnswerInput};
use razzoozle_protocol::quizz::QuestionType;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::{GameRegistry, RateLimiter, safe_asset_id, SOLO_RESULTS_MAX_ENTRIES};
use crate::question_type_wire;
use super::AppState;

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

// ── Solo HTTP handlers ───────────────────────────────────────────────────────

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
    if !super::RATE_LIMITER.check_solo_rate(&client_ip) {
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
    if !super::RATE_LIMITER.check_solo_rate(&client_ip) {
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
    if !super::RATE_LIMITER.check_solo_rate(&client_ip) {
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

    // Use current time for answered_at
    let now = chrono::Utc::now();

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err((StatusCode::INTERNAL_SERVER_ERROR, "database not configured".to_string())),
    };

    // Generate unique ID: format!("{}-{}", quiz_id, uuid12)
    let uuid12 = uuid::Uuid::new_v4().to_string().replace("-", "")[0..12].to_string();
    let result_id = format!("{}-{}", quiz_id, uuid12);

    // INSERT into solo_results
    sqlx::query(
        "INSERT INTO solo_results (id, quiz_id, player_name, score, answered_at, assignment_id) \
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&result_id)
    .bind(&quiz_id)
    .bind(&payload.player_name)
    .bind(final_score)
    .bind(now)
    .bind(&payload.assignment_id)
    .execute(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to insert result: {}", e)))?;

    // SELECT leaderboard: ORDER BY score DESC LIMIT 1000
    let leaderboard: Vec<(String, i32, chrono::DateTime<chrono::Utc>, Option<String>)> = sqlx::query_as(
        "SELECT player_name, score, answered_at, assignment_id FROM solo_results WHERE quiz_id = $1 ORDER BY score DESC LIMIT 1000"
    )
    .bind(&quiz_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to fetch leaderboard: {}", e)))?;

    let leaderboard = leaderboard
        .into_iter()
        .map(|(player_name, score, answered_at, assignment_id)| {
            SoloResultEntry {
                player_name,
                score,
                answered_at: answered_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                assignment_id,
            }
        })
        .collect();

    Ok(Json(SoloScoreResponse { leaderboard }))
}
