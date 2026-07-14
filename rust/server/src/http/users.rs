//! Admin users management API — W0-A5a admin users API (create/list/disable teachers).
//! ADMIN-ONLY endpoints: bearer token → require admin role.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::db;
use super::{AppState, json_error_response};

// ── HTTP request/response types ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub role: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: i64,
    pub username: String,
    pub role: String,
}

// ── HTTP auth helper ───────────────────────────────────────────────────────

/// Extract Authorization: Bearer token and verify it's an admin session.
/// Returns Some(AuthUser) iff token is valid and role=="admin", else None.
/// Fail closed: any error → None.
async fn require_admin_http(headers: &HeaderMap, pool: &Option<PgPool>) -> Option<db::users::AuthUser> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|auth| auth.strip_prefix("Bearer "))
        .unwrap_or("");

    if token.is_empty() {
        return None;
    }

    let pool = pool.as_ref()?;
    let user = db::users::session_user(pool, token).await.ok().flatten()?;

    if user.role == "admin" {
        Some(user)
    } else {
        None
    }
}

/// Extract Authorization: Bearer token and verify it's ANY valid session.
/// Returns Some(AuthUser) iff token is valid, else None.
/// Fail closed: any error → None.
async fn require_user_http(headers: &HeaderMap, pool: &Option<PgPool>) -> Option<db::users::AuthUser> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|auth| auth.strip_prefix("Bearer "))
        .unwrap_or("");

    if token.is_empty() {
        return None;
    }

    let pool = pool.as_ref()?;
    db::users::session_user(pool, token).await.ok().flatten()
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

/// GET /api/users — list all users (admin only).
/// Returns [{id, username, role, active, created_at}].
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<db::users::UserDetail>>, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    let users = db::users::list_users(pool)
        .await
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to list users: {}", e)))?;

    Ok(Json(users))
}

/// POST /api/users — create a new user (admin only).
/// Request body: {username, password, role?} (role defaults "user", must be one of admin, user, or lehrkraft).
/// Returns {id, username, role}.
pub async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<UserResponse>, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    // Validate role
    let role = req.role.as_deref().unwrap_or("user");
    if !matches!(role, "admin" | "user" | "lehrkraft") {
        return Err(json_error_response(
            StatusCode::BAD_REQUEST,
            "Role must be one of 'admin', 'user', or 'lehrkraft'",
        ));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    // Attempt to create user
    let user_id = match db::users::create_user(pool, &req.username, &req.password, role).await {
        Ok(id) => id,
        Err(e) => {
            let msg = if e.contains("unique violation") || e.contains("duplicate") {
                "Username already taken".to_string()
            } else {
                format!("Failed to create user: {}", e)
            };
            return Err(json_error_response(StatusCode::BAD_REQUEST, msg));
        }
    };

    Ok(Json(UserResponse {
        id: user_id,
        username: req.username,
        role: role.to_string(),
    }))
}

/// POST /api/users/:id/disable — disable a user (set active=false).
pub async fn disable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    db::users::set_user_active(pool, id, false)
        .await
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to disable user: {}", e)))?;

    Ok(StatusCode::OK)
}

/// POST /api/users/:id/enable — enable a user (set active=true).
pub async fn enable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    db::users::set_user_active(pool, id, true)
        .await
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to enable user: {}", e)))?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub newPassword: String,
}

/// POST /api/users/:id/reset-password — admin sets a new password for a user.
pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(req): Json<ResetPasswordRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    // Same validation as create path: reject empty passwords (create has no min-length either).
    if req.newPassword.is_empty() {
        return Err(json_error_response(StatusCode::BAD_REQUEST, "Password cannot be empty"));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    db::users::set_password(pool, id, &req.newPassword)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to reset password: {}", e),
            )
        })?;

    Ok(StatusCode::OK)
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub currentPassword: String,
    pub newPassword: String,
}

/// POST /api/profile/change-password — self-service password change.
/// Authenticated user changes their own password.
/// Request body: {currentPassword, newPassword}.
/// Returns 200 on success, 401/403 if current password is wrong, 400 if new password is empty.
pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify authenticated session (any logged-in user, not admin-gated)
    let session_user = match require_user_http(&headers, &state.db_pool).await {
        Some(user) => user,
        None => return Err(json_error_response(StatusCode::UNAUTHORIZED, "Authentication required")),
    };

    // Reject empty new password
    if req.newPassword.is_empty() {
        return Err(json_error_response(StatusCode::BAD_REQUEST, "New password cannot be empty"));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    // Fetch current password hash for this user
    let hash = sqlx::query_as::<_, (String,)>(
        "SELECT password_hash FROM users WHERE id = $1 AND active = true"
    )
    .bind(session_user.user_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e)))?
    .ok_or_else(|| json_error_response(StatusCode::UNAUTHORIZED, "User not found or inactive"))?;

    // Verify current password
    if !db::users::verify_password(&hash.0, &req.currentPassword) {
        return Err(json_error_response(StatusCode::FORBIDDEN, "Current password is incorrect"));
    }

    // Set the new password — session_user.user_id comes from server session, not client request
    db::users::set_password(pool, session_user.user_id, &req.newPassword)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to change password: {}", e),
            )
        })?;

    Ok(StatusCode::OK)
}
