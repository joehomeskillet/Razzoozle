//! POST /api/plugins/import + GET /api/plugins/:id/export — manager-gated
//! plugin ZIP routes (Node skeleton-plugin-io.ts handlePluginImport/Export).
//!
//! Auth: shared `authorize_manager_request` (X-Manager-Token → logged clientId
//! or dev API key). ZIP parse/extract lives in socket/manager/plugins_zip.rs
//! (Node services/config/plugins.ts parity).

use axum::{
    body::{to_bytes, Body},
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};

use super::{authorize_admin_request, json_error_response, AppState};
use crate::socket::manager::plugins_zip::{
    build_plugin_files_map, build_plugin_zip, import_plugin_zip, PLUGIN_ZIP_MAX_BYTES,
};
use crate::state::safe_asset_id;
use razzoozle_protocol::constants;

/// POST /api/plugins/import — raw ZIP body → extract + index + optional PG mirror.
pub async fn handle_plugin_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    if !authorize_admin_request(&headers, &state.db_pool).await {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }

    // Content-Length pre-check (Node readRawBody) → 413 without reading body.
    let content_length = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > PLUGIN_ZIP_MAX_BYTES {
        return Err(json_error_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Payload Too Large",
        ));
    }

    let bytes = to_bytes(body, PLUGIN_ZIP_MAX_BYTES).await.map_err(|_| {
        json_error_response(StatusCode::PAYLOAD_TOO_LARGE, "Payload Too Large")
    })?;

    let buf = bytes.to_vec();
    let plugin = tokio::task::spawn_blocking(move || import_plugin_zip(&buf))
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task join error: {}", e),
            )
        })?
        .map_err(|e| json_error_response(StatusCode::BAD_REQUEST, e))?;

    // Mirror to Postgres (additive, non-fatal — Node upsertInstalledPluginPg).
    let db_pool = state.db_pool.clone();
    let plugin_for_db = plugin.clone();
    let plugin_id = plugin.id.clone();
    tokio::spawn(async move {
        let files = match tokio::task::spawn_blocking(move || build_plugin_files_map(&plugin_id))
            .await
        {
            Ok(Ok(m)) => m,
            Ok(Err(e)) => {
                eprintln!("plugin import — files map failed (non-fatal): {}", e);
                return;
            }
            Err(e) => {
                eprintln!("plugin import — files map join failed (non-fatal): {}", e);
                return;
            }
        };
        if let Err(e) = crate::db::upsert_installed_plugin(&db_pool, &plugin_for_db, &files).await {
            eprintln!("plugin import — DB mirror failed (non-fatal): {}", e);
        }
    });

    // Broadcast full installed list (Node registerPluginBroadcaster → PLUGIN_CONFIG).
    let list = crate::socket::manager::plugins::read_plugins_index();
    state
        .io
        .emit(constants::manager::PLUGIN_CONFIG, &list)
        .ok();

    Ok(Json(json!({ "ok": true, "plugin": plugin })))
}

/// GET /api/plugins/:id/export — pack config/plugins/<id>/ as application/zip.
pub async fn handle_plugin_export(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), (StatusCode, Json<Value>)> {
    if !authorize_admin_request(&headers, &state.db_pool).await {
        return Err(json_error_response(StatusCode::UNAUTHORIZED, "unauthorized"));
    }

    // Path-traversal / reserved-id guard (Node assertSafeId).
    if let Err(e) = safe_asset_id(&id) {
        return Err(json_error_response(StatusCode::BAD_REQUEST, e));
    }

    let id_for_zip = id.clone();
    let bytes = tokio::task::spawn_blocking(move || build_plugin_zip(&id_for_zip))
        .await
        .map_err(|e| {
            json_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Task join error: {}", e),
            )
        })?
        .map_err(|e| {
            if e == "errors:plugin.notFound" {
                json_error_response(StatusCode::NOT_FOUND, e)
            } else {
                json_error_response(StatusCode::BAD_REQUEST, e)
            }
        })?;

    let mut out = HeaderMap::new();
    out.insert(header::CONTENT_TYPE, "application/zip".parse().unwrap());
    // Attachment filename mirrors Node: plugin-<id>.zip
    let disposition = format!("attachment; filename=\"plugin-{}.zip\"", id);
    out.insert(
        header::CONTENT_DISPOSITION,
        disposition.parse().unwrap_or_else(|_| {
            "attachment; filename=\"plugin.zip\"".parse().unwrap()
        }),
    );

    Ok((StatusCode::OK, out, bytes))
}
