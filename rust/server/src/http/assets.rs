use axum::{
    extract::Path,
    http::StatusCode,
};
use std::fs;

use crate::state::safe_asset_id;
use crate::socket::manager::plugins_zip::PLUGIN_ASSET_EXT;
use super::get_config_path;

// ── Static file helpers ─────────────────────────────────────────────────────

/// Validate a file path component to prevent traversal attacks.
/// Rejects "..", "~", absolute paths, and null bytes.
fn safe_path_component(component: &str) -> Result<(), String> {
    if component.is_empty() || component == "." || component == ".." {
        return Err("Invalid path component".to_string());
    }
    if component.starts_with('/') || component.starts_with('~') {
        return Err("Absolute or home-relative paths not allowed".to_string());
    }
    if component.contains('\0') {
        return Err("Null bytes not allowed".to_string());
    }
    if component.contains('\\') {
        return Err("Backslashes not allowed".to_string());
    }
    Ok(())
}

/// Determine MIME type from file extension
fn mime_type_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "css" => "text/css",
        "js" => "application/javascript",
        "mjs" => "application/javascript",
        "json" => "application/json",
        "html" => "text/html",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" => "text/plain",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        _ => "application/octet-stream",
    }
}

/// Serve a static file with path-traversal protection
async fn serve_static_file(base_dir: &str, rel_path: &str) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Validate the relative path components
    for component in rel_path.split('/') {
        safe_path_component(component)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let file_path = std::path::Path::new(base_dir)
        .join(rel_path);

    // Move blocking FS operations off-thread
    let (canonical, base_canonical) = tokio::task::spawn_blocking({
        let base_dir = base_dir.to_string();
        move || {
            let canonical = file_path.canonicalize();
            let base_canonical = std::path::Path::new(&base_dir).canonicalize();
            (canonical, base_canonical)
        }
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?;

    let canonical = canonical
        .map_err(|_| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

    let base_canonical = base_canonical
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Invalid base directory".to_string()))?;

    if !canonical.starts_with(&base_canonical) {
        return Err((StatusCode::FORBIDDEN, "Path traversal detected".to_string()));
    }

    let body = tokio::task::spawn_blocking({
        let canonical = canonical.clone();
        move || fs::read(&canonical)
    })
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Task join error: {}", e),
        )
    })?
    .map_err(|_| (StatusCode::NOT_FOUND, "File not found".to_string()))?;

    let ext = canonical
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let content_type = mime_type_for_ext(ext);

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        content_type.parse().unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert(
        axum::http::header::CONTENT_LENGTH,
        body.len().to_string().parse().unwrap(),
    );

    Ok((StatusCode::OK, headers, body))
}

pub async fn handle_theme_asset(
    Path(rel_path): Path<String>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    let base_dir = format!("{}/theme", get_config_path());
    serve_static_file(&base_dir, &rel_path)
        .await
        .map(|(status, mut headers, body)| {
            // theme.json must not be cached; other theme assets get 1-day cache
            if rel_path == "theme.json" || rel_path.ends_with("/theme.json") {
                headers.insert(
                    axum::http::header::CACHE_CONTROL,
                    "no-store".parse().unwrap(),
                );
            } else {
                headers.insert(
                    axum::http::header::CACHE_CONTROL,
                    "public, max-age=86400".parse().unwrap(),
                );
            }
            (status, headers, body)
        })
}

pub async fn handle_plugin_asset(
    Path((plugin_id, rel_path)): Path<(String, String)>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Validate plugin ID
    safe_asset_id(&plugin_id)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    // Public unauth surface: mirror Node resolvePluginAsset — only ui.js or assets/**, allowlisted ext, no svg.
    if rel_path != "ui.js" && !rel_path.starts_with("assets/") {
        return Err((StatusCode::NOT_FOUND, "not found".to_string()));
    }
    let ext = rel_path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !PLUGIN_ASSET_EXT.contains(&ext.as_str()) {
        return Err((StatusCode::NOT_FOUND, "not found".to_string()));
    }

    let base_dir = format!("{}/plugins/{}", get_config_path(), plugin_id);
    serve_static_file(&base_dir, &rel_path).await
}

pub async fn handle_sounds_asset(
    Path(rel_path): Path<String>,
) -> Result<(StatusCode, axum::http::HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Try CONFIG_PATH/sounds first, then fallback to web/public/sounds
    let config_base = format!("{}/sounds", get_config_path());

    match serve_static_file(&config_base, &rel_path).await {
        Ok(result) => Ok(result),
        Err((StatusCode::NOT_FOUND, _)) => {
            // Fallback to web/public/sounds
            let cwd = std::env::current_dir()
                .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Cannot access cwd".to_string()))?;
            let web_base = cwd
                .parent()
                .and_then(|p| p.parent())
                .map(|p| {
                    p.join("packages/web/public/sounds")
                        .to_string_lossy()
                        .to_string()
                })
                .unwrap_or_else(|| "packages/web/public/sounds".to_string());

            serve_static_file(&web_base, &rel_path).await
        }
        Err(e) => Err(e),
    }
}
