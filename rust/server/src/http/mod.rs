mod achievements;
mod assignments;
pub mod assets;
pub mod logs;
mod observability;
pub mod skeleton;
mod client_events;
mod result_og;
pub mod solo;

use axum::{
    extract::Path,
    http::StatusCode,
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

// ── HTTP handlers ────────────────────────────────────────────────────────────

lazy_static! {
    pub static ref RATE_LIMITER: RateLimiter = RateLimiter::new();
}

pub async fn handle_health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        ts: chrono::Utc::now().to_rfc3339(),
    })
}

pub async fn handle_healthz() -> (StatusCode, &'static str) {
    (StatusCode::OK, "ok")
}

// ── Static file helpers ─────────────────────────────────────────────────────

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
        .route("/api/achievements", get(achievements::handle_achievements))
        .route("/api/quizzes", get(solo::handle_get_quizzes))
        .route("/api/quizz/:id/solo", get(solo::handle_get_quiz_solo))
        .route("/api/quizz/:id/check-answer", post(solo::handle_check_answer))
        .route("/api/quizz/:id/solo-score", post(solo::handle_solo_score))
        .route("/api/assignment", post(assignments::handle_create_assignment))
        .route("/api/assignment/:id", get(assignments::handle_get_assignment))
        .route("/api/assignment/:id/results", get(assignments::handle_get_assignment_results))
        .route("/api/skeleton/export", get(skeleton::handle_skeleton_export))
        .route(
            "/api/skeleton/import",
            post(skeleton::handle_skeleton_import)
                .layer(axum::extract::DefaultBodyLimit::disable()),
        )
        .route("/api/v1/client-events", post(client_events::handle_client_events))
        .route("/api/v1/observability/events", get(observability::handle_observability_events))
        .route("/api/v1/observability/schema", get(observability::handle_observability_schema))
        .route("/api/v1/observability/logs/server", get(logs::handle_logs_server))
        .route("/api/v1/observability/logs/client", get(logs::handle_logs_client))
        .route("/theme/*path", get(assets::handle_theme_asset))
        .route("/plugins/:id/*path", get(assets::handle_plugin_asset))
        .route("/sounds/*path", get(assets::handle_sounds_asset))
        .route("/r/:id", get(result_og::handle_result_og))
        .with_state(state)
}
