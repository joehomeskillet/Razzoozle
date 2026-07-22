//! Admin users management API — W0-A5a admin users API (create/list/disable teachers).
//! ADMIN-ONLY endpoints: bearer token → require admin role.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{info, warn};

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

// ── Self-modification guard ────────────────────────────────────────────────

/// True when the authenticated admin targets their own account.
/// Authoritative for delete / disable — UI is defensive only.
pub(crate) fn is_self_target(session_user_id: i64, target_user_id: i64) -> bool {
    session_user_id == target_user_id
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
/// Guards: an admin can never disable their own account (self-disable) → 400,
/// and the last remaining active admin can never be deactivated → 400.
pub async fn disable(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    let admin = match require_admin_http(&headers, &state.db_pool).await {
        Some(user) => user,
        None => return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required")),
    };

    // Self-disable guard: locking yourself out is never allowed.
    if is_self_target(admin.user_id, id) {
        warn!(
            "Attempted self-modification: user={}, action=disable target={}",
            admin.user_id, id
        );
        return Err(json_error_response(
            StatusCode::BAD_REQUEST,
            "Cannot disable your own account",
        ));
    }

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    // Load + last-admin-check + deactivate all happen inside a single DB
    // transaction (deactivate_user_guarded) — parity with delete_user_handler.
    match db::users::deactivate_user_guarded(pool, id).await {
        Ok(db::users::DeactivateUserOutcome::Deactivated) => {
            info!("user disabled: id={}", id);
            Ok(StatusCode::OK)
        }
        Ok(db::users::DeactivateUserOutcome::NotFound) => {
            Err(json_error_response(StatusCode::NOT_FOUND, "User not found"))
        }
        Ok(db::users::DeactivateUserOutcome::LastActiveAdmin) => {
            warn!("user disable denied: check=last_admin user={}", id);
            Err(json_error_response(
                StatusCode::BAD_REQUEST,
                "Cannot deactivate the last active admin",
            ))
        }
        Err(e) => Err(json_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to disable user: {}", e),
        )),
    }
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

/// DELETE /api/users/:id — permanently delete a user (admin only).
/// Guards: an admin can never delete their own account (self-delete), and the
/// last remaining active admin can never be deleted (last-admin), both 400.
pub async fn delete_user_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<StatusCode, (StatusCode, Json<serde_json::Value>)> {
    // Verify admin
    let admin = match require_admin_http(&headers, &state.db_pool).await {
        Some(user) => user,
        None => return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required")),
    };

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    // Self-delete guard: an admin can never delete their own account.
    if is_self_target(admin.user_id, id) {
        warn!(
            "Attempted self-modification: user={}, action=delete target={}",
            admin.user_id, id
        );
        return Err(json_error_response(StatusCode::BAD_REQUEST, "Cannot delete your own account"));
    }

    // Load + last-admin-check + delete all happen inside a single DB
    // transaction (delete_user_guarded) to close the TOCTOU race a separate
    // count-then-delete pair has: two admins deleting each other concurrently
    // could each read count=2 before either commits.
    match db::users::delete_user_guarded(pool, id).await {
        Ok(db::users::DeleteUserOutcome::Deleted) => {
            info!("user deleted: id={}", id);
            Ok(StatusCode::OK)
        }
        Ok(db::users::DeleteUserOutcome::NotFound) => {
            Err(json_error_response(StatusCode::NOT_FOUND, "User not found"))
        }
        Ok(db::users::DeleteUserOutcome::LastActiveAdmin) => {
            warn!("user delete denied: check=last_admin user={}", id);
            Err(json_error_response(StatusCode::BAD_REQUEST, "Cannot delete the last active admin"))
        }
        Err(e) => Err(json_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to delete user: {}", e),
        )),
    }
}

// ── Bulk user ops (WP-C1) ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct BulkRequestIds {
    pub ids: Vec<i64>,
}

/// Validate bulk id list: non-empty and ≤ BULK_MAX_IDS. Duplicates are
/// normalized downstream in the DB helpers.
fn validate_bulk_ids(ids: &[i64]) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if ids.is_empty() {
        return Err(json_error_response(
            StatusCode::BAD_REQUEST,
            "At least one id is required",
        ));
    }
    if ids.len() > db::users::BULK_MAX_IDS {
        return Err(json_error_response(
            StatusCode::BAD_REQUEST,
            format!("At most {} ids allowed per request", db::users::BULK_MAX_IDS),
        ));
    }
    Ok(())
}

/// POST /api/users/bulk-activate — activate many users (admin only).
/// Body: `{ "ids": [i64, ...] }`. Response: `{ succeeded, skipped, failed }`.
pub async fn bulk_activate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<BulkRequestIds>,
) -> Result<Json<db::users::BulkOpResult>, (StatusCode, Json<serde_json::Value>)> {
    if require_admin_http(&headers, &state.db_pool).await.is_none() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required"));
    }

    validate_bulk_ids(&req.ids)?;

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    let result = db::users::bulk_activate(pool, req.ids)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to bulk-activate users: {}", e),
            )
        })?;

    info!(
        "bulk-activate: succeeded={}, failed={}",
        result.succeeded.len(),
        result.failed.len()
    );
    Ok(Json(result))
}

/// POST /api/users/bulk-deactivate — deactivate many users (admin only).
/// Self-target and last-active-admin entries are skipped with structured reasons.
pub async fn bulk_deactivate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<BulkRequestIds>,
) -> Result<Json<db::users::BulkOpResult>, (StatusCode, Json<serde_json::Value>)> {
    let admin = match require_admin_http(&headers, &state.db_pool).await {
        Some(user) => user,
        None => return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required")),
    };

    validate_bulk_ids(&req.ids)?;

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    let result = db::users::bulk_deactivate(pool, admin.user_id, req.ids)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to bulk-deactivate users: {}", e),
            )
        })?;

    if !result.skipped.is_empty() {
        warn!(
            "bulk-deactivate: requester={}, skipped={}",
            admin.user_id,
            result.skipped.len()
        );
    }
    info!(
        "bulk-deactivate: succeeded={}, skipped={}, failed={}",
        result.succeeded.len(),
        result.skipped.len(),
        result.failed.len()
    );
    Ok(Json(result))
}

/// POST /api/users/bulk-delete — permanently delete many users (admin only).
/// Self-target and last-active-admin entries are skipped; missing → failed.
pub async fn bulk_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<BulkRequestIds>,
) -> Result<Json<db::users::BulkOpResult>, (StatusCode, Json<serde_json::Value>)> {
    let admin = match require_admin_http(&headers, &state.db_pool).await {
        Some(user) => user,
        None => return Err(json_error_response(StatusCode::UNAUTHORIZED, "Admin authorization required")),
    };

    validate_bulk_ids(&req.ids)?;

    let pool = match &state.db_pool {
        Some(p) => p,
        None => return Err(json_error_response(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable")),
    };

    let result = db::users::bulk_delete(pool, admin.user_id, req.ids)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to bulk-delete users: {}", e),
            )
        })?;

    if !result.skipped.is_empty() {
        warn!(
            "bulk-delete: requester={}, skipped={}",
            admin.user_id,
            result.skipped.len()
        );
    }
    info!(
        "bulk-delete: succeeded={}, skipped={}, failed={}",
        result.succeeded.len(),
        result.skipped.len(),
        result.failed.len()
    );
    Ok(Json(result))
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

    // SEC-M1: atomically update password and revoke all sessions (admin reset).
    // Both operations commit together — there's no window for old tokens to work.
    db::users::set_password_and_revoke(pool, id, &req.newPassword, None)
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to reset password and revoke sessions: {}", e),
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

    // Raw bearer token of the session making this request (SEC-M1) — kept so
    // the caller's own session survives the sweep below instead of being
    // logged out by their own password change.
    let current_token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|auth| auth.strip_prefix("Bearer "))
        .unwrap_or("");

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

    // SEC-M1: atomically update password and revoke other sessions (self-service change).
    // Both operations commit together — there's no window for old tokens to work.
    // The current session is preserved via keep_token.
    db::users::set_password_and_revoke(pool, session_user.user_id, &req.newPassword, Some(current_token))
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to change password and revoke sessions: {}", e),
            )
        })?;

    Ok(StatusCode::OK)
}

#[cfg(test)]
mod tests {
    use super::is_self_target;

    #[test]
    fn test_user_cannot_delete_self() {
        assert!(
            is_self_target(42, 42),
            "same session and target id must be treated as self-modification"
        );
    }

    #[test]
    fn test_user_can_modify_other() {
        assert!(
            !is_self_target(42, 7),
            "distinct ids must not be blocked as self-modification"
        );
    }

    #[test]
    fn test_self_disable_same_guard() {
        // disable reuses the same predicate as delete
        assert!(is_self_target(1, 1));
        assert!(!is_self_target(1, 2));
    }
}
