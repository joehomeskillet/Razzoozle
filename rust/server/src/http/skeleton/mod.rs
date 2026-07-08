//! GET /api/skeleton/export + POST /api/skeleton/import — manager-gated theme
//! bundle routes (Node http-routes.ts handleSkeletonExport/handleSkeletonImport).
//!
//! Auth mirrors assignments.rs authorize_manager_request: X-Manager-Token that
//! is either a logged-in manager clientId (registry.is_logged) or, in dev mode,
//! the DEV_API_KEY compared constant-time. Import broadcasts MANAGER.THEME via
//! state.io directly (no themeBroadcaster callback — io is in AppState).

mod bundle;

use axum::{
    body::{to_bytes, Body},
    extract::State,
    http::{header, HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};

use super::{dev_api_key, is_dev_mode, json_error_response, AppState};
use razzoozle_protocol::constants;

/// http-routes.ts:109 SKELETON_IMPORT_MAX.
const SKELETON_IMPORT_MAX: usize = 16 * 1024 * 1024;

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

async fn authorize_manager(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<(), (StatusCode, Json<Value>)> {
    let token = headers
        .get("x-manager-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token.is_empty() {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }
    if state.registry.read().await.is_logged(token) {
        return Ok(());
    }
    if is_dev_mode() {
        if let Some(key) = dev_api_key() {
            if constant_time_eq(token.as_bytes(), key.as_bytes()) {
                return Ok(());
            }
        }
    }
    Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"))
}

pub async fn handle_skeleton_export(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), (StatusCode, Json<Value>)> {
    authorize_manager(&headers, &state).await?;

    let bytes = tokio::task::spawn_blocking(bundle::build_skeleton_zip)
        .await
        .map_err(|e| {
            json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e))
        })?
        .map_err(|e| json_error_response(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let mut out = HeaderMap::new();
    out.insert(header::CONTENT_TYPE, "application/zip".parse().unwrap());
    out.insert(
        header::CONTENT_DISPOSITION,
        "attachment; filename=\"razzoozle-skeleton.zip\"".parse().unwrap(),
    );
    Ok((StatusCode::OK, out, bytes))
}

pub async fn handle_skeleton_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    authorize_manager(&headers, &state).await?;

    // Content-Length pre-check (readRawBody parity) -> 413 without reading body.
    let content_length = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > SKELETON_IMPORT_MAX {
        return Err(json_error_response(StatusCode::PAYLOAD_TOO_LARGE, "Payload Too Large"));
    }
    // Chunked-overflow guard: cap the streamed read at 16 MB.
    let bytes = to_bytes(body, SKELETON_IMPORT_MAX)
        .await
        .map_err(|_| json_error_response(StatusCode::PAYLOAD_TOO_LARGE, "Payload Too Large"))?;

    let buf = bytes.to_vec();
    // ZIP parse/validate + disk writes are blocking -> off-thread. Any parse /
    // cap / validation error -> 400 (Node: importSkeletonZip throw -> 400).
    let (theme, revision) = tokio::task::spawn_blocking(move || bundle::import_skeleton_zip(&buf))
        .await
        .map_err(|e| {
            json_error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Task join error: {}", e))
        })?
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    // Save revision to DB (if snapshot exists)
    if let Some(rev) = revision {
        let created_at = rev.get("createdAt")
            .and_then(|v| v.as_str())
            .unwrap_or("1970-01-01T00:00:00.000Z");
        if let Err(e) = crate::db::insert_theme_revision(&state.db_pool, &rev, created_at).await {
            eprintln!("skeleton import — revision save failed (non-fatal): {}", e);
        }
    }

    // Mirror to DB (additive, non-fatal — parity with the socket theme handlers).
    if let Err(e) = crate::db::upsert_theme(&state.db_pool, &theme).await {
        eprintln!("skeleton import — DB mirror failed (non-fatal): {}", e);
    }

    // Broadcast to every connected client (Node index.ts: io.emit(MANAGER.THEME)).
    state.io.emit(constants::manager::THEME, &theme).ok();

    Ok(Json(json!({ "ok": true, "theme": theme })))
}
