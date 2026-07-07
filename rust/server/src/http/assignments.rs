use axum::{
    extract::{Path, Request},
    http::{StatusCode, HeaderMap},
    Json,
};
use serde::{Deserialize, Serialize};
use std::fs;

use crate::state::safe_asset_id;
use super::get_config_path;

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

/// Helper: get path to assignment file
fn get_assignment_path(id: &str) -> String {
    format!("{}/assignments/{}.json", get_config_path(), id)
}

/// Helper: get path to solo-results file for a quiz
fn get_solo_results_path(quiz_id: &str) -> String {
    format!("{}/solo-results/{}.json", get_config_path(), quiz_id)
}

/// DEFER: manager.isLoggedClientId() is socket-only. For MVP, auth is dev-key only.
/// Checks X-Manager-Token header for devApiKey match (constant-time compare).
/// Returns Err(401) if not authorized.
fn authorize_manager_request(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    // Get dev API key from env (RAZZOOZLE_DEV_API_KEY)
    let dev_key = std::env::var("RAZZOOZLE_DEV_API_KEY").ok();

    if dev_key.is_none() {
        // No dev key configured — auth fails
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    let header_token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let expected = dev_key.unwrap();
    let a = header_token.as_bytes();
    let b = expected.as_bytes();

    // Constant-time compare (mimic Node's timingSafeEqual)
    if a.len() != b.len() {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    let mut equal = true;
    for (x, y) in a.iter().zip(b.iter()) {
        equal = equal && (x == y);
    }

    if !equal {
        return Err((StatusCode::UNAUTHORIZED, "unauthorized".to_string()));
    }

    Ok(())
}

/// POST /api/assignment — create a new assignment (manager-gated).
pub async fn handle_create_assignment(
    headers: HeaderMap,
    Json(payload): Json<CreateAssignmentRequest>,
) -> Result<Json<CreateAssignmentResponse>, (StatusCode, String)> {
    // DEFER: manager auth check should also accept manager.isLoggedClientId().
    // For now, devApiKey only.
    authorize_manager_request(&headers)?;

    // Validate quizzId is not empty
    if payload.quizz_id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "quizzId required".to_string()));
    }

    safe_asset_id(&payload.quizz_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // DEFER: Check if quiz exists in registry — requires registry access.
    // For MVP, we skip this check. In production, load from GameRegistry.

    // Generate nanoid-like ID (for simplicity, use UUID)
    let id = uuid::Uuid::new_v4().to_string().replace("-", "")[0..12].to_string();

    let now = chrono::Utc::now().timestamp_millis();

    let assignment = Assignment {
        id: id.clone(),
        quizz_id: payload.quizz_id,
        created_at: now,
        deadline: payload.deadline,
        max_attempts: payload.max_attempts,
        require_identifier: payload.require_identifier,
        show_correct_answers: payload.show_correct_answers,
    };

    // Persist to file (blocking I/O off-thread)
    let file_path = get_assignment_path(&id);
    let assignment_json = serde_json::to_string_pretty(&assignment)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("JSON error: {}", e)))?;

    tokio::task::spawn_blocking({
        let file_path = file_path.clone();
        let json = assignment_json.clone();
        move || {
            let dir = std::path::Path::new(&file_path).parent();
            if let Some(d) = dir {
                if !d.exists() {
                    if let Err(e) = fs::create_dir_all(d) {
                        return Err((
                            StatusCode::INTERNAL_SERVER_ERROR,
                            format!("Failed to create directory: {}", e),
                        ));
                    }
                }
            }

            if let Err(e) = fs::write(&file_path, json) {
                return Err((
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Failed to write assignment: {}", e),
                ));
            }

            Ok::<(), (StatusCode, String)>(())
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .map_err(|e| e)?;

    Ok(Json(CreateAssignmentResponse { id }))
}

/// GET /api/assignment/:id — get assignment metadata (public).
pub async fn handle_get_assignment(
    Path(id): Path<String>,
) -> Result<Json<Assignment>, (StatusCode, String)> {
    safe_asset_id(&id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    let file_path = get_assignment_path(&id);

    let assignment = tokio::task::spawn_blocking({
        let path = file_path.clone();
        move || {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<Assignment>(&s).ok())
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Assignment not found".to_string()))?;

    Ok(Json(assignment))
}

/// GET /api/assignment/:id/results — get solo results filtered by assignmentId (manager-gated).
pub async fn handle_get_assignment_results(
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<GetAssignmentResultsResponse>, (StatusCode, String)> {
    // DEFER: manager auth check should also accept manager.isLoggedClientId().
    // For now, devApiKey only.
    authorize_manager_request(&headers)?;

    safe_asset_id(&id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // First, check if assignment exists
    let file_path = get_assignment_path(&id);
    let assignment_exists = tokio::task::spawn_blocking({
        let path = file_path.clone();
        move || std::path::Path::new(&path).exists()
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    if !assignment_exists {
        return Err((StatusCode::NOT_FOUND, "Assignment not found".to_string()));
    }

    // Read assignment to get quizzId
    let assignment = tokio::task::spawn_blocking({
        let path = file_path.clone();
        move || {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<Assignment>(&s).ok())
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Assignment not found".to_string()))?;

    // Read solo-results for this quiz
    let quiz_id = assignment.quizz_id;
    let results_path = get_solo_results_path(&quiz_id);

    let results = tokio::task::spawn_blocking({
        let path = results_path.clone();
        let assignment_id = id.clone();
        move || {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<Vec<serde_json::Value>>(&s).ok())
                .map(|entries| {
                    entries
                        .into_iter()
                        .filter(|entry| {
                            entry.get("assignmentId").and_then(|v| v.as_str()) == Some(&assignment_id)
                        })
                        .collect()
                })
                .unwrap_or_default()
        }
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    Ok(Json(GetAssignmentResultsResponse { results }))
}
