use axum::{
    extract::{ConnectInfo, Path},
    http::StatusCode,
    Json,
};
use razzoozle_engine::eval::{evaluate_answer, AnswerInput};
use razzoozle_protocol::quizz::QuestionType;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::RwLock;

use crate::state::{GameRegistry, RateLimiter, safe_asset_id, SOLO_RESULTS_MAX_ENTRIES};
use crate::question_type_wire;
use super::AppState;

// ── Solo play types ─────────────────────────────────────────────────────────

/// Shuffles chunks using Fisher-Yates, retrying up to 10 times
/// to ensure the result differs from the input order.
fn shuffle_chunks_with_guard(chunks: Vec<String>) -> Vec<String> {
    use rand::seq::SliceRandom;
    use rand::thread_rng;

    let is_equal = |a: &[String], b: &[String]| -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).all(|(x, y)| x == y)
    };

    let mut rng = thread_rng();
    let mut shuffled = chunks.clone();
    let mut attempts = 0;

    while attempts < 10 && is_equal(&shuffled, &chunks) {
        shuffled.shuffle(&mut rng);
        attempts += 1;
    }

    shuffled
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decimals: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sentence: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub posSet: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disabledTokens: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shuffledChunks: Option<Vec<String>>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub poll: Option<bool>,
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
        .map(|q| {
            // Shuffle chunks for sentence-builder questions
            let shuffled_chunks = if q.r#type.as_ref().map(|t| question_type_wire(t)) == Some("sentence-builder") {
                q.chunks.as_ref().map(|chunks| shuffle_chunks_with_guard(chunks.clone()))
            } else {
                None
            };

            SoloQuestion {
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
                decimals: q.decimals,
                sentence: q.sentence.clone(),
                tokens: q.tokens.clone(),
                posSet: q.pos_set.clone(),
                disabledTokens: q.disabled_tokens.clone(),
                shuffledChunks: shuffled_chunks,
                time: q.time,
                cooldown: q.cooldown,
            }
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

    // Check if this is a poll question
    let is_poll = question.r#type.as_ref() == Some(&QuestionType::Poll);

    // Calculate points: base × 1000, rounded
    let points = (eval_result.base * 1000.0).round() as i32;

    let mut response = CheckAnswerResponse {
        correct: eval_result.correct,
        points: Some(points),
        accuracy: None,
        achievements: None,
        poll: if is_poll { Some(true) } else { None },
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

    // Count only non-poll questions for theoretical_max
    let non_poll_count = quiz.questions.iter()
        .filter(|q| q.r#type.as_ref() != Some(&QuestionType::Poll))
        .count() as i32;
    let theoretical_max = non_poll_count * 1000;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_solo_question_wortarten_fields() {
        let question = SoloQuestion {
            question: "Test question".to_string(),
            r#type: Some("wortarten".to_string()),
            media: None,
            answers: None,
            min: None,
            max: None,
            step: None,
            unit: None,
            decimals: None,
            sentence: Some("Das ist ein Test".to_string()),
            tokens: Some(vec!["Das".to_string(), "ist".to_string(), "ein".to_string(), "Test".to_string()]),
            posSet: Some(vec!["ART".to_string(), "V".to_string(), "ART".to_string(), "N".to_string()]),
            disabledTokens: None,
            shuffledChunks: None,
            time: 30,
            cooldown: 0,
        };

        let json = serde_json::to_string(&question).unwrap();
        assert!(json.contains("\"sentence\""));
        assert!(json.contains("\"tokens\""));
        assert!(json.contains("\"posSet\""));
        assert!(!json.contains("\"chunks\""));
    }

    #[test]
    fn test_solo_question_sentence_builder_shuffled() {
        let chunks = vec!["Das".to_string(), "ist".to_string(), "ein".to_string(), "Test".to_string()];
        let shuffled = shuffle_chunks_with_guard(chunks.clone());

        // Verify shuffled is different from original (with high probability after 10 attempts)
        // This may occasionally fail due to randomness, but with 4+ items it's extremely rare
        if chunks.len() > 3 {
            // Only assert if we have enough items to reliably shuffle
            assert_ne!(chunks, shuffled);
        }
    }

    #[test]
    fn test_check_answer_response_poll_flag() {
        let response = CheckAnswerResponse {
            correct: false,
            points: Some(0),
            accuracy: None,
            achievements: None,
            poll: Some(true),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("\"poll\":true"));
    }

    #[test]
    fn test_check_answer_response_no_poll_flag_when_none() {
        let response = CheckAnswerResponse {
            correct: true,
            points: Some(1000),
            accuracy: None,
            achievements: None,
            poll: None,
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(!json.contains("\"poll\""));
    }

    #[test]
    fn test_points_calculation_partial_credit() {
        // Simulate wortarten 2/3 correct = base 0.666...
        let base: f64 = 2.0 / 3.0;
        let points = (base * 1000.0).round() as i32;

        // Should be 667 (rounded from 666.666...)
        assert_eq!(points, 667);
        assert!(points > 0 && points < 1000);
    }

    #[test]
    fn test_points_calculation_full_credit() {
        let base: f64 = 1.0;
        let points = (base * 1000.0).round() as i32;
        assert_eq!(points, 1000);
    }

    #[test]
    fn test_points_calculation_no_credit() {
        let base: f64 = 0.0;
        let points = (base * 1000.0).round() as i32;
        assert_eq!(points, 0);
    }

    #[test]
    fn test_solo_question_mathematik_decimals() {
        let question = SoloQuestion {
            question: "What is 1.5 + 2.5?".to_string(),
            r#type: Some("mathematik".to_string()),
            media: None,
            answers: None,
            min: None,
            max: None,
            step: None,
            unit: Some("m".to_string()),
            decimals: Some(1),
            sentence: None,
            tokens: None,
            posSet: None,
            disabledTokens: None,
            shuffledChunks: None,
            time: 30,
            cooldown: 0,
        };

        let json = serde_json::to_string(&question).unwrap();
        assert!(json.contains("\"decimals\":1"));
    }
}
