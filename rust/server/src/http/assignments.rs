use axum::{
    extract::{Path, State},
    http::{StatusCode, HeaderMap},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::{safe_asset_id, GameRegistry};
use super::{json_error_response, is_dev_mode, dev_api_key, AppState};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Assignment {
    pub id: String,
    #[serde(rename = "quizzId")]
    pub quizz_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deadline: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "maxAttempts")]
    pub max_attempts: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "requireIdentifier")]
    pub require_identifier: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "showCorrectAnswers")]
    pub show_correct_answers: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAssignmentRequest {
    #[serde(rename = "quizzId")]
    pub quizz_id: String,
    pub deadline: Option<i64>,
    #[serde(rename = "maxAttempts")]
    pub max_attempts: Option<i32>,
    #[serde(rename = "requireIdentifier")]
    pub require_identifier: Option<bool>,
    #[serde(rename = "showCorrectAnswers")]
    pub show_correct_answers: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CreateAssignmentResponse {
    pub id: String,
}

#[derive(Debug, Serialize)]
pub struct GetAssignmentResultsResponse {
    pub results: Vec<serde_json::Value>,
}

async fn authorize_manager_request(
    headers: &HeaderMap,
    registry: &Arc<RwLock<GameRegistry>>,
    db_pool: &Option<sqlx::PgPool>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let header_token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if header_token.is_empty() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }

    // Check if token is valid session token
    if let Some(ref pool) = db_pool {
        if crate::db::users::session_user(pool, header_token).await.ok().flatten().is_some() {
            return Ok(());
        }
    }

    if is_dev_mode() {
        if let Some(dev_key) = dev_api_key() {
            let a = header_token.as_bytes();
            let b = dev_key.as_bytes();

            if a.len() == b.len() {
                let mut equal = true;
                for (x, y) in a.iter().zip(b.iter()) {
                    equal &= x == y;
                }

                if equal {
                    return Ok(());
                }
            }
        }
    }

    Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"))
}

pub async fn handle_create_assignment(
    headers: HeaderMap,
    State(state): State<AppState>,
    Json(payload): Json<CreateAssignmentRequest>,
) -> Result<Json<CreateAssignmentResponse>, (StatusCode, Json<serde_json::Value>)> {
    authorize_manager_request(&headers, &state.registry, &state.db_pool).await?;

    if payload.quizz_id.is_empty() {
        return Err(json_error_response(StatusCode::BAD_REQUEST, "quizzId required"));
    }

    safe_asset_id(&payload.quizz_id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    let registry_read = state.registry.read().await;
    if registry_read.get_quiz_by_id(&payload.quizz_id).is_none() {
        return Err(json_error_response(
            StatusCode::NOT_FOUND,
            format!("Quizz \"{}\" not found", payload.quizz_id),
        ));
    }
    drop(registry_read);

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "database not configured")),
    };

    let id = uuid::Uuid::new_v4().to_string().replace("-", "")[0..12].to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let assigned_at = chrono::DateTime::<chrono::Utc>::from_timestamp_millis(now)
        .ok_or_else(|| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "invalid timestamp"))?;

    // Build metadata JSON with only present optionals
    let mut metadata = serde_json::Map::new();
    if let Some(deadline) = payload.deadline {
        metadata.insert("deadline".to_string(), serde_json::Value::Number(deadline.into()));
    }
    if let Some(max_attempts) = payload.max_attempts {
        metadata.insert("maxAttempts".to_string(), serde_json::Value::Number(max_attempts.into()));
    }
    if let Some(require_identifier) = payload.require_identifier {
        metadata.insert("requireIdentifier".to_string(), serde_json::Value::Bool(require_identifier));
    }
    if let Some(show_correct_answers) = payload.show_correct_answers {
        metadata.insert("showCorrectAnswers".to_string(), serde_json::Value::Bool(show_correct_answers));
    }
    let metadata_value = serde_json::Value::Object(metadata);

    sqlx::query(
        "INSERT INTO assignments (id, quiz_id, assigned_to, assigned_at, metadata, version) \
         VALUES ($1, $2, NULL, $3, $4, 0)"
    )
    .bind(&id)
    .bind(&payload.quizz_id)
    .bind(assigned_at)
    .bind(metadata_value)
    .execute(pool)
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to insert assignment: {}", e)))?;

    Ok(Json(CreateAssignmentResponse { id }))
}

pub async fn handle_get_assignment(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Assignment>, (StatusCode, Json<serde_json::Value>)> {
    safe_asset_id(&id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "database not configured")),
    };

    let (quiz_id, assigned_at, metadata) = sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>, serde_json::Value)>(
        "SELECT quiz_id, assigned_at, metadata FROM assignments WHERE id = $1"
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
    .ok_or_else(|| json_error_response(StatusCode::NOT_FOUND, "Assignment not found"))?;

    let created_at_ms = assigned_at.timestamp_millis();

    // Reconstruct optional fields from metadata
    let deadline = metadata.get("deadline").and_then(|v| v.as_i64());
    let max_attempts = metadata.get("maxAttempts").and_then(|v| v.as_i64().map(|n| n as i32));
    let require_identifier = metadata.get("requireIdentifier").and_then(|v| v.as_bool());
    let show_correct_answers = metadata.get("showCorrectAnswers").and_then(|v| v.as_bool());

    let assignment = Assignment {
        id,
        quizz_id: quiz_id,
        created_at: created_at_ms,
        deadline,
        max_attempts,
        require_identifier,
        show_correct_answers,
    };

    Ok(Json(assignment))
}

pub async fn handle_get_assignment_results(
    headers: HeaderMap,
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<GetAssignmentResultsResponse>, (StatusCode, Json<serde_json::Value>)> {
    authorize_manager_request(&headers, &state.registry, &state.db_pool).await?;

    safe_asset_id(&id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "database not configured")),
    };

    // Check that assignment exists
    let _quiz_id: String = sqlx::query_scalar("SELECT quiz_id FROM assignments WHERE id = $1")
        .bind(&id)
        .fetch_optional(pool)
        .await
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
        .ok_or_else(|| json_error_response(StatusCode::NOT_FOUND, "Assignment not found"))?;

    // Fetch solo_results for this assignment
    let results: Vec<(String, i32, chrono::DateTime<chrono::Utc>, Option<String>)> = sqlx::query_as(
        "SELECT player_name, score, answered_at, assignment_id FROM solo_results WHERE assignment_id = $1"
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?;

    // Convert to entry JSON format
    let results = results
        .into_iter()
        .map(|(player_name, score, answered_at, assignment_id)| {
            let mut entry = serde_json::json!({
                "playerName": player_name,
                "score": score,
                "answeredAt": answered_at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            });
            if let Some(aid) = assignment_id {
                entry["assignmentId"] = serde_json::Value::String(aid);
            }
            entry
        })
        .collect();

    Ok(Json(GetAssignmentResultsResponse { results }))
}
