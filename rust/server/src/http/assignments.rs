use axum::{
    extract::{Path, State},
    http::{StatusCode, HeaderMap},
    Json,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::{safe_asset_id, GameRegistry};
use super::{get_config_path, json_error_response, is_dev_mode, dev_api_key};

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

fn get_assignment_path(id: &str) -> String {
    format!("{}/assignments/{}.json", get_config_path(), id)
}

fn get_solo_results_path(quiz_id: &str) -> String {
    format!("{}/solo-results/{}.json", get_config_path(), quiz_id)
}

async fn authorize_manager_request(
    headers: &HeaderMap,
    registry: &Arc<RwLock<GameRegistry>>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let header_token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if header_token.is_empty() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }

    let reg = registry.read().await;
    if reg.is_logged(header_token) {
        drop(reg);
        return Ok(());
    }
    drop(reg);

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
    State(registry): State<Arc<RwLock<GameRegistry>>>,
    Json(payload): Json<CreateAssignmentRequest>,
) -> Result<Json<CreateAssignmentResponse>, (StatusCode, Json<serde_json::Value>)> {
    authorize_manager_request(&headers, &registry).await?;

    if payload.quizz_id.is_empty() {
        return Err(json_error_response(StatusCode::BAD_REQUEST, "quizzId required"));
    }

    safe_asset_id(&payload.quizz_id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    let registry_read = registry.read().await;
    if registry_read.get_quiz_by_id(&payload.quizz_id).is_none() {
        return Err(json_error_response(
            StatusCode::NOT_FOUND,
            format!("Quizz \"{}\" not found", payload.quizz_id),
        ));
    }
    drop(registry_read);

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

    let file_path = get_assignment_path(&id);
    let assignment_json = serde_json::to_string_pretty(&assignment)
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("JSON error: {}", e)))?;

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
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .map_err(|e| json_error_response(e.0, e.1))?;

    Ok(Json(CreateAssignmentResponse { id }))
}

pub async fn handle_get_assignment(
    Path(id): Path<String>,
) -> Result<Json<Assignment>, (StatusCode, Json<serde_json::Value>)> {
    safe_asset_id(&id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

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
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .ok_or_else(|| json_error_response(StatusCode::NOT_FOUND, "Assignment not found"))?;

    Ok(Json(assignment))
}

pub async fn handle_get_assignment_results(
    headers: HeaderMap,
    Path(id): Path<String>,
    State(registry): State<Arc<RwLock<GameRegistry>>>,
) -> Result<Json<GetAssignmentResultsResponse>, (StatusCode, Json<serde_json::Value>)> {
    authorize_manager_request(&headers, &registry).await?;

    safe_asset_id(&id)
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    let file_path = get_assignment_path(&id);
    let assignment_exists = tokio::task::spawn_blocking({
        let path = file_path.clone();
        move || std::path::Path::new(&path).exists()
    })
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    if !assignment_exists {
        return Err(json_error_response(StatusCode::NOT_FOUND, "Assignment not found"));
    }

    let assignment = tokio::task::spawn_blocking({
        let path = file_path.clone();
        move || {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<Assignment>(&s).ok())
        }
    })
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?
    .ok_or_else(|| json_error_response(StatusCode::NOT_FOUND, "Assignment not found"))?;

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
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e)))?;

    Ok(Json(GetAssignmentResultsResponse { results }))
}
