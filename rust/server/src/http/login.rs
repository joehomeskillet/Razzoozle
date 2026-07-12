//! POST /api/login — user login handler. W0-A1 auth foundation primitive.

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::db;
use super::{json_error_response, AppState, RATE_LIMITER};

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub role: String,
    pub username: String,
}

/// POST /api/login — authenticate with username and password.
/// Returns a session token on success, or 401 with generic error on failure.
/// Applies global brute-force throttle; no user enumeration via distinct error messages.
pub async fn handle_login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<serde_json::Value>)> {
    // Apply global brute-force throttle: peek first (no increment).
    if RATE_LIMITER.is_auth_throttled_global() {
        return Err(json_error_response(
            StatusCode::UNAUTHORIZED,
            "Invalid username or password",
        ));
    }

    // Get the pool or fail closed
    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return Err(json_error_response(
                StatusCode::UNAUTHORIZED,
                "Invalid username or password",
            ));
        }
    };

    // Attempt to find the user
    let user_row = match db::users::find_user_for_login(pool, &req.username).await {
        Ok(Some((user_id, hash, role, active))) => {
            // User exists; verify password
            if !active || !db::users::verify_password(&hash, &req.password) {
                // Record failure and reject (same message as if user doesn't exist)
                RATE_LIMITER.record_auth_failure_global();
                return Err(json_error_response(
                    StatusCode::UNAUTHORIZED,
                    "Invalid username or password",
                ));
            }
            (user_id, role)
        }
        Ok(None) => {
            // User not found; record failure and reject
            RATE_LIMITER.record_auth_failure_global();
            return Err(json_error_response(
                StatusCode::UNAUTHORIZED,
                "Invalid username or password",
            ));
        }
        Err(_) => {
            // DB error; fail closed
            return Err(json_error_response(
                StatusCode::UNAUTHORIZED,
                "Invalid username or password",
            ));
        }
    };

    // Mint a 7-day session token
    let token = match db::users::mint_session(pool, user_row.0, 7).await {
        Ok(t) => t,
        Err(_) => {
            // Failed to mint session; fail closed
            return Err(json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create session",
            ));
        }
    };

    Ok(Json(LoginResponse {
        token,
        role: user_row.1,
        username: req.username,
    }))
}
