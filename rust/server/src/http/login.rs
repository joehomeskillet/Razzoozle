//! POST /api/login — user login handler. W0-A1 auth foundation primitive.

use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

use super::{AppState, RATE_LIMITER};
use crate::db;

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

/// Core login logic, parameterized over an already-derived throttle key.
/// Applies a per-client brute-force throttle; no user enumeration via
/// distinct error messages.
async fn handle_login_impl(
    state: &AppState,
    client_key: &str,
    req: &LoginRequest,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    // Apply per-client brute-force throttle (issue #705/#706): peek first (no
    // increment). A hardcoded/global key here would let one attacker's failed
    // attempts lock out every other client — see client_throttle_key().
    if RATE_LIMITER.is_auth_throttled_per_client(client_key) {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Invalid username or password".to_string(),
        ));
    }

    // Get the pool or fail closed
    let pool = match &state.db_pool {
        Some(p) => p,
        None => {
            return Err((
                StatusCode::UNAUTHORIZED,
                "Invalid username or password".to_string(),
            ));
        }
    };

    // Attempt to find the user
    let user_row = match db::users::find_user_for_login(pool, &req.username).await {
        Ok(Some((user_id, hash, role, active))) => {
            // User exists; verify password
            if !active || !db::users::verify_password(&hash, &req.password) {
                // Record failure and reject (same message as if user doesn't exist)
                RATE_LIMITER.record_auth_failure_per_client(client_key);
                return Err((
                    StatusCode::UNAUTHORIZED,
                    "Invalid username or password".to_string(),
                ));
            }
            (user_id, role)
        }
        Ok(None) => {
            // User not found; record failure and reject
            RATE_LIMITER.record_auth_failure_per_client(client_key);
            return Err((
                StatusCode::UNAUTHORIZED,
                "Invalid username or password".to_string(),
            ));
        }
        Err(_) => {
            // DB error; fail closed
            return Err((
                StatusCode::UNAUTHORIZED,
                "Invalid username or password".to_string(),
            ));
        }
    };

    // Mint a 7-day session token
    let token = match db::users::mint_session(pool, user_row.0, 7).await {
        Ok(t) => t,
        Err(_) => {
            // Failed to mint session; fail closed
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create session".to_string(),
            ));
        }
    };

    Ok(Json(LoginResponse {
        token,
        role: user_row.1,
        username: req.username.clone(),
    }))
}

/// POST /api/login — authenticate with username and password (production handler).
/// Returns a session token on success, or 401 with generic error on failure.
/// Derives the throttle key from the connection's peer IP (or X-Forwarded-For/
/// X-Real-IP, only when that peer is a trusted proxy — see
/// `crate::state::client_throttle_key`).
pub async fn handle_login_http(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let xff = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok());
    let real_ip = headers.get("x-real-ip").and_then(|v| v.to_str().ok());
    let client_key = crate::state::client_throttle_key(addr.ip(), xff, real_ip);

    handle_login_impl(&state, &client_key, &req).await
}

// Router registration (http/mod.rs) always uses `handle_login`. In production
// builds that's the real ConnectInfo/HeaderMap-extracting handler above; in
// test builds it's the 2-arg shim below, which lets tests (no live socket)
// exercise the same throttle logic via a synthetic per-username key.
#[cfg(not(test))]
pub use handle_login_http as handle_login;

/// Test-only entry point: no ConnectInfo/HeaderMap available outside a live
/// server, so tests supply a synthetic per-client key derived from the
/// username instead (sufficient to prove per-client vs. global throttle
/// behavior — see tests_login_global_throttle.rs).
#[cfg(test)]
pub async fn handle_login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let client_key = format!("test-client:{}", req.username);
    handle_login_impl(&state, &client_key, &req).await
}
