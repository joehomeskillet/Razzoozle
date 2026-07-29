mod achievements;
mod assignments;
pub mod emoji_pin;
pub mod assets;
pub mod logs;
mod metrics;
mod observability;
mod plugins;
pub mod skeleton;
mod client_events;
mod result_og;
pub mod solo;
mod templates;
mod static_files;
mod login;
mod submit;
mod users;

use axum::{
    extract::{State, Path},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post, put},
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

#[derive(Debug, serde::Serialize)]
struct LivenessResponse {
    status: String,
    timestamp: String,
}

#[derive(Debug, serde::Serialize)]
struct ReadinessResponse {
    status: String,
    timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    db: Option<String>,
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
    match crate::config::resolve_secret("DEV_API_KEY") {
        Ok(val) => val,
        Err(crate::config::SecretError::Conflict(v)) => {
            panic!("Configuration error: {} and {}_FILE both set", v, v);
        }
        Err(_) => None,
    }
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

/// Admin-only variant of the manager check, for privileged HTTP routes
/// (plugin import/export) that the socket layer gates with `ensure_admin`. The
/// `x-manager-token` (session token) must resolve to a user whose role is "admin";
/// a plain authenticated manager (role "user") is rejected. Closes the HTTP
/// privilege-escalation path around the admin-gated socket plugin handlers.
///
/// w2-7: delegates to the centralized `crate::auth::ensure_admin` (was
/// previously duplicated verbatim here, in `http::assignments`, and in
/// `http::skeleton`).
pub async fn authorize_admin_request(
    headers: &HeaderMap,
    db_pool: &Option<sqlx::PgPool>,
) -> bool {
    crate::auth::ensure_admin(headers, db_pool).await
}

/// Dev-route auth for `/metrics` (and similar): fail-closed on missing
/// `DEV_API_KEY`. When the key is set, require constant-time match on
/// `X-Manager-Token`. Registry is accepted for call-site parity with the
/// manager check (not used for session lookup here).
/// Dev-route auth for `/metrics` (and similar): fail-closed on missing
/// `DEV_API_KEY`. When the key is set, require constant-time match on
/// `Authorization: Bearer <key>` or `X-Manager-Token`. Registry is accepted
/// for call-site parity with the manager check (not used for session
/// lookup here).
pub async fn authorize_dev_request(
    headers: &HeaderMap,
    _registry: Arc<RwLock<GameRegistry>>,
) -> bool {
    let Some(key) = dev_api_key().filter(|k| !k.is_empty()) else {
        // No key configured → reject (fail closed; never serve metrics open).
        return false;
    };

    // Check Authorization: Bearer header first
    if let Some(auth_header) = headers.get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if let Some(token) = auth_str.strip_prefix("Bearer ") {
                return constant_time_eq(token.as_bytes(), key.as_bytes());
            }
        }
    }

    // Fallback to X-Manager-Token header for backward compatibility
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

/// Liveness probe: process is running and HTTP is serving.
/// No dependency checks (DB not required).
/// Returns 200 on success, 5xx only for internal process problems.
pub async fn handle_livez() -> Json<LivenessResponse> {
    Json(LivenessResponse {
        status: "alive".to_string(),
        timestamp: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })
}

/// Readiness probe: process is alive AND ready to handle requests.
/// Checks DB connectivity if configured.
/// Returns 200 if ready, 503 Service Unavailable if not ready (e.g., DB unreachable).
pub async fn handle_readyz(State(state): State<AppState>) -> Result<Json<ReadinessResponse>, StatusCode> {
    let timestamp = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    // If DB pool exists, perform a simple connectivity check.
    let db_status = if let Some(ref pool) = state.db_pool {
        match sqlx::query_scalar::<_, i64>("SELECT 1::bigint").fetch_one(pool).await {
            Ok(_) => Some("connected".to_string()),
            Err(_) => {
                // DB not reachable: return 503 Service Unavailable
                return Err(StatusCode::SERVICE_UNAVAILABLE);
            }
        }
    } else {
        // No DB configured; readiness is OK (file-mode or standalone).
        None
    };

    // DCK-05: Check if all migrations have been applied (if DB is configured).
    if let Some(ref pool) = state.db_pool {
        if let Err(e) = crate::migrate::check_migrations_applied(pool).await {
            tracing::warn!("readyz: migrations not fully applied: {}", e);
            // Migrations incomplete: return 503 Service Unavailable
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
    }

    Ok(Json(ReadinessResponse {
        status: "ready".to_string(),
        timestamp,
        db: db_status,
    }))
}

/// Health endpoint (legacy, used by CD gate rust-cd-poll.sh).
/// Routes: /health, /healthz, /api/v1/health
/// ALIAS DECISION (DCK-04): These aliases use liveness logic, NOT readiness,
/// because rust-cd-poll.sh::78 requires /healthz == 200 immediately after deploy.
/// If /healthz were readiness-strict (503 if DB down), the CD gate would roll back
/// on any DB transient, breaking every deploy. Liveness ensures the server can serve
/// before DB dependencies are guaranteed ready (migrations run separately, DCK-05).
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
        .route("/livez", get(handle_livez))
        .route("/readyz", get(handle_readyz))
        .route("/api/login", post(login::handle_login))
        .route("/api/users", get(users::list).post(users::create))
        .route("/api/users/bulk-activate", post(users::bulk_activate))
        .route("/api/users/bulk-deactivate", post(users::bulk_deactivate))
        .route("/api/users/bulk-delete", post(users::bulk_delete))
        .route("/api/users/:id", delete(users::delete_user_handler))
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
        .route("/api/quizz/:id/study", get(solo::handle_get_quiz_study))
        .route("/api/quizz/:id/practice-score", post(solo::handle_practice_score))
        .route("/api/templates", get(templates::handle_list_templates).post(templates::handle_create_template))
        .route("/api/templates/:id", get(templates::handle_get_template).put(templates::handle_update_template).delete(templates::handle_delete_template))
        .route("/api/templates/create-from", post(templates::handle_create_from_template))
        .route("/api/assignment", post(assignments::handle_create_assignment))
        .route("/api/assignment/:id", get(assignments::handle_get_assignment))
        .route("/api/assignment/:id/results", get(assignments::handle_get_assignment_results))
        .route("/api/assignment/:id/validate-pin", post(assignments::handle_validate_pin))
        // A4: curated emoji set for class-mode PIN picker (single source: emoji_pin.rs)
        .route("/api/emoji-pin-set", get(emoji_pin::handle_emoji_pin_set))
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


#[cfg(test)]
mod tests_health {
    use super::*;

    #[tokio::test]
    async fn test_handle_livez() {
        let response = handle_livez().await;
        assert_eq!(response.status, "alive");
        assert!(!response.timestamp.is_empty());
    }

    #[tokio::test]
    async fn test_handle_health() {
        let response = handle_health().await;
        assert_eq!(response.status, "ok");
        assert!(!response.ts.is_empty());
    }

    #[tokio::test]
    async fn test_handle_healthz() {
        let (status, msg) = handle_healthz().await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(msg, "ok");
    }
}
