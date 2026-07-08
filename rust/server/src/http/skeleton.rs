use axum::{
    http::StatusCode,
    Json,
};
use serde_json::json;

use super::json_error_response;

/// GET /api/skeleton/export - Skeleton export handler
/// Stub returning 501 (deferred to 3c-γ WP-rest-bundle-B when ZIP builder is available)
pub async fn handle_skeleton_export() -> (StatusCode, Json<serde_json::Value>) {
    json_error_response(
        StatusCode::NOT_IMPLEMENTED,
        "Skeleton export not yet implemented",
    )
}

/// POST /api/skeleton/import - Skeleton import handler
/// Stub returning 501 (deferred to 3c-γ WP-rest-bundle-B when ZIP parser is available)
pub async fn handle_skeleton_import() -> (StatusCode, Json<serde_json::Value>) {
    json_error_response(
        StatusCode::NOT_IMPLEMENTED,
        "Skeleton import not yet implemented",
    )
}
