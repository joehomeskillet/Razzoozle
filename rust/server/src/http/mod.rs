mod achievements;
mod assignments;
mod emoji_pin;
pub mod assets;
pub mod logs;
mod metrics;
mod observability;
mod plugins;
pub mod skeleton;
mod client_events;
mod result_og;
pub mod solo;
mod static_files;
mod login;
mod submit;
mod users;

use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use lazy_static::lazy_static;
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::{GameRegistry, RateLimiter};

// ── Shared HTTP state ────────────────────────────────────────────────────────
//
// AppState bundles everything the HTTP layer needs WITHOUT stuffing it into
// GameRegistry: the registry itself (games/quizzes/auth), an optional PgPool
// for DB-backed routes (/api/achievements), and the SocketIo handle so future
// routes (skeleton import, Wave gamma) can broadcast directly via state.io.
// DB queries never take the registry lock.

#[derive(Clone)]
pub struct AppState {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub db_pool: Option<sqlx::PgPool>,
    pub io: socketioxide::SocketIo,
}

// Bridge so handlers still extracting State<Arc<RwLock<GameRegistry>>>
// (assignments.rs) keep working unchanged against the AppState router.
impl axum::extract::FromRef<AppState> for Arc<RwLock<GameRegistry>> {
    fn from_ref(state: &AppState) -> Self {
        Arc::clone(&state.registry)
    }
}

// Bridge so login handler can extract State<Option<PgPool>>
impl axum::extract::FromRef<AppState> for Option<sqlx::PgPool> {
    fn from_ref(state: &AppState) -> Self {
        state.db_pool.clone()
    }
}

#[derive(Debug, serde::Serialize)]
struct HealthResponse {
    status: String,
    ts: String,
}

// ── HTTP helpers (auth, error formatting, dev-gating) ──────────────────────

pub(crate) fn json_error_response(
    status: StatusCode,
    msg: impl Into<String>,
) -> (StatusCode, Json<serde_json::Value>) {
    (status, Json(json!({"error": msg.into()})))
}

pub(crate) fn is_dev_mode() -> bool {
    std::env::var("RAZZOOLE_DEV").ok() == Some("1".to_string())
}

pub(crate) fn dev_api_key() -> Option<String> {
    std::env::var("DEV_API_KEY").ok()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Node `authorizeManagerRequest` parity: `X-Manager-Token` is a valid
/// session token (from DB). Authorization via session token only.
pub async fn authorize_manager_request(
    headers: &HeaderMap,
    registry: Arc<RwLock<GameRegistry>>,
    db_pool: &Option<sqlx::PgPool>,
) -> bool {
    let token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token.is_empty() {
        return false;
    }
    // Check if token is valid session token
    if let Some(ref pool) = db_pool {
        if crate::db::users::session_user(pool, token).await.ok().flatten().is_some() {
            return true;
        }
    }
    false
}

/// Admin-only variant of `authorize_manager_request` for privileged HTTP routes
/// (plugin import/export) that the socket layer gates with `ensure_admin`. The
/// `x-manager-token` (session token) must resolve to a user whose role is "admin";
/// a plain authenticated manager (role "user") is rejected. Closes the HTTP
/// privilege-escalation path around the admin-gated socket plugin handlers.
pub async fn authorize_admin_request(
    headers: &HeaderMap,
    db_pool: &Option<sqlx::PgPool>,
) -> bool {
    let token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token.is_empty() {
        return false;
    }
    if let Some(ref pool) = db_pool {
        if let Some(user) = crate::db::users::session_user(pool, token).await.ok().flatten() {
            return user.role == "admin";
        }
    }
    false
}

/// Dev-route auth for `/metrics` (and similar): fail-closed on missing
/// `DEV_API_KEY`. When the key is set, require constant-time match on
/// `X-Manager-Token`. Registry is accepted for call-site parity with
/// `authorize_manager_request` (not used for session lookup here).
pub async fn authorize_dev_request(
    headers: &HeaderMap,
    _registry: Arc<RwLock<GameRegistry>>,
) -> bool {
    let Some(key) = dev_api_key().filter(|k| !k.is_empty()) else {
        // No key configured → reject (fail closed; never serve metrics open).
        return false;
    };
    let token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token.is_empty() {
        return false;
    }
    constant_time_eq(token.as_bytes(), key.as_bytes())
}

// ── HTTP handlers ────────────────────────────────────────────────────────────

lazy_static! {
    pub static ref RATE_LIMITER: RateLimiter = RateLimiter::new();

}


pub async fn handle_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        ts: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })
}

pub async fn handle_healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

// ── Static file helpers ─────────────────────────────────────────────────

pub fn get_config_path() -> String {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        config_path
    } else {
        let cwd = std::env::current_dir().unwrap();
        cwd.parent()
            .and_then(|p| p.parent())
            .map(|p| {
                p.join("config")
                    .to_string_lossy()
                    .to_string()
            })
            .unwrap_or_else(|| "config".to_string())
    }
}

/// Build and return the HTTP router for solo play and health check endpoints
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(handle_health))
        .route("/healthz", get(handle_healthz))
        .route("/api/v1/health", get(handle_health))
        .route("/api/login", post(login::handle_login))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/:id/disable", post(users::disable))
        .route("/api/users/:id/enable", post(users::enable))
        .route("/api/users/:id/reset-password", post(users::reset_password))
        .route("/api/profile/change-password", post(users::change_password))
        .route("/api/submit/:token", post(submit::handle_submit))
        .route("/api/achievements", get(achievements::handle_achievements))
        .route("/api/quizzes", get(solo::handle_get_quizzes))
        .route("/api/quizz/:id/solo", get(solo::handle_get_quiz_solo))
        .route("/api/quizz/:id/check-answer", post(solo::handle_check_answer))
        .route("/api/quizz/:id/solo-score", post(solo::handle_solo_score))
        .route("/api/assignment", post(assignments::handle_create_assignment))
        .route("/api/assignment/:id", get(assignments::handle_get_assignment))
        .route("/api/assignment/:id/results", get(assignments::handle_get_assignment_results))
        .route("/api/assignment/:id/validate-pin", post(assignments::handle_validate_pin))
        .route("/api/skeleton/export", get(skeleton::handle_skeleton_export))
        .route(
            "/api/skeleton/import",
            post(skeleton::handle_skeleton_import)
                .layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route("/api/v1/client-events", post(client_events::handle_client_events))
        .route(
            "/api/plugins/import",
            post(plugins::handle_plugin_import)
                .layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route(
            "/api/plugins/:id/export",
            get(plugins::handle_plugin_export),
        )
        .route("/api/v1/observability/events", get(observability::handle_observability_events))
        .route("/api/v1/observability/schema", get(observability::handle_observability_schema))
        .route("/api/v1/observability/logs/server", get(logs::handle_logs_server))
        .route("/api/v1/observability/logs/client", get(logs::handle_logs_client))
        .route("/theme/*path", get(assets::handle_theme_asset))
        .route("/plugins/:id/*path", get(assets::handle_plugin_asset))
        .route("/sounds/*path", get(assets::handle_sounds_asset))
        .route("/r/:id", get(result_og::handle_result_og))
        .route("/metrics", get(metrics::handle_metrics))
        // Static file serving routes (added before fallback so explicit API routes take precedence)
        .route("/sw.js", get(|| async { static_files::handle_spa_static("sw.js").await }))
        .route("/registerSW.js", get(|| async { static_files::handle_spa_static("registerSW.js").await }))
        .route("/manifest.webmanifest", get(|| async { static_files::handle_spa_static("manifest.webmanifest").await }))
        .route("/media/*path", get(static_files::handle_media_asset))
        .route("/assets/*path", get(static_files::handle_assets))
        .route("/", get(static_files::handle_root))
        .layer(axum::middleware::from_fn(metrics::track_metrics))
        // SPA fallback for unknown routes
        .fallback(static_files::handle_spa_fallback)
        .with_state(state)
}
