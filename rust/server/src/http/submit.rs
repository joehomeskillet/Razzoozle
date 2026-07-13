//! POST /api/submit/:token — public owner-scoped question submission.
//!
//! Resolves the manager via `users.submit_token`, stamps `owner_id` on the
//! pending submission so it shows up in that manager's moderation queue.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::db;
use crate::socket::validation;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitRequest {
    pub submitted_by: String,
    pub question: serde_json::Value,
    #[serde(default)]
    pub category: Option<String>,
}

/// POST /api/submit/:token
///
/// Public (no session). Token identifies the receiving manager.
/// 404 when the token is unknown or the user is inactive.
pub async fn handle_submit(
    Path(token): Path<String>,
    State(db_pool): State<Option<PgPool>>,
    Json(req): Json<SubmitRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let owner_id = match db::users::owner_by_submit_token(&db_pool, &token).await {
        Ok(Some(id)) => id,
        Ok(None) => {
            return Err((StatusCode::NOT_FOUND, "Not found".to_string()));
        }
        Err(_) => {
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Database error".to_string(),
            ));
        }
    };

    let submitted_by = req.submitted_by.trim().to_string();
    let question = req.question;
    let q_text = question
        .get("question")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let question_bytes = serde_json::to_string(&question)
        .map(|s| s.len())
        .unwrap_or(usize::MAX);

    if submitted_by.is_empty()
        || submitted_by.chars().count() > 100
        || q_text.is_empty()
        || q_text.chars().count() > 1000
        || !question.is_object()
        || question_bytes > 16_384
    {
        return Err((StatusCode::BAD_REQUEST, "Invalid submission".to_string()));
    }

    if let Err(_key) = validation::validate_question(&question) {
        return Err((StatusCode::BAD_REQUEST, "Invalid question".to_string()));
    }

    if db::count_pending_submissions(&db_pool).await >= 200 {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Queue full".to_string()));
    }

    let id = slug_id(&q_text);

    db::insert_submission(
        &db_pool,
        &id,
        &submitted_by,
        &question,
        req.category.as_deref(),
        Some(owner_id),
    )
    .await
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to save submission".to_string(),
        )
    })?;

    Ok(StatusCode::CREATED)
}

/// Slug a question text into a safe id, mirroring the public socket submit path.
fn slug_id(text: &str) -> String {
    let mut s = String::new();
    let mut last_dash = false;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            s.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            s.push('-');
            last_dash = true;
        }
    }
    let s = s.trim_matches('-').chars().take(48).collect::<String>();
    if s.is_empty() {
        Uuid::new_v4().simple().to_string()
    } else {
        s
    }
}
