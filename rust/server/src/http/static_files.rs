use axum::{
    extract::Path,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
};
use std::fs;
use std::path::{Path as StdPath, PathBuf};

use crate::state::safe_asset_id;
use super::get_config_path;

/// Validate a file path component to prevent traversal attacks.
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
        "avif" => "image/avif",
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
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

/// Serve a static file with path-traversal protection
async fn serve_static_file(
    base_dir: &str,
    rel_path: &str,
) -> Result<(StatusCode, HeaderMap, Vec<u8>), (StatusCode, String)> {
    // Validate the relative path components
    for component in rel_path.split('/').filter(|c| !c.is_empty()) {
        safe_path_component(component)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let file_path = StdPath::new(base_dir).join(rel_path);

    // Move blocking FS operations off-thread
    let (canonical, base_canonical) = tokio::task::spawn_blocking({
        let base_dir = base_dir.to_string();
        move || {
            let canonical = file_path.canonicalize();
            let base_canonical = StdPath::new(&base_dir).canonicalize();
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

    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        content_type
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().unwrap()),
    );
    headers.insert(
        axum::http::header::CONTENT_LENGTH,
        body.len().to_string().parse().unwrap(),
    );

    Ok((StatusCode::OK, headers, body))
}

/// Get WEB_DIST path, with fallback for development
fn get_web_dist_path() -> String {
    if let Ok(web_dist) = std::env::var("WEB_DIST") {
        return web_dist;
    }

    // Prod fallback
    if StdPath::new("/app/web").exists() {
        return "/app/web".to_string();
    }

    // Dev fallback paths
    let cwd = std::env::current_dir().unwrap();
    if let Some(parent) = cwd.parent().and_then(|p| p.parent()) {
        let dist_path = parent.join("packages/web/dist");
        if dist_path.exists() {
            return dist_path.to_string_lossy().to_string();
        }
    }

    "/app/web".to_string()
}

/// Handle root `/` with SPA fallback
pub async fn handle_root() -> Result<impl IntoResponse, (StatusCode, String)> {
    serve_static_file(&get_web_dist_path(), "index.html")
        .await
        .map(|(status, mut headers, body)| {
            headers.insert(
                axum::http::header::CACHE_CONTROL,
                "no-cache".parse().unwrap(),
            );
            (status, headers, body)
        })
}

/// Handle SPA fallback for unknown routes
pub async fn handle_spa_fallback(
    Path(path): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Guard: never fallback paths starting with protected prefixes
    if path.starts_with("api/")
        || path.starts_with("socket.io/")
        || path.starts_with("r/")
        || path.starts_with("plugins/")
        || path.starts_with("metrics")
        || path.starts_with("health")
    {
        return Err((StatusCode::NOT_FOUND, "Not found".to_string()));
    }

    // SPA fallback: return index.html with no-cache
    serve_static_file(&get_web_dist_path(), "index.html")
        .await
        .map(|(status, mut headers, body)| {
            headers.insert(
                axum::http::header::CACHE_CONTROL,
                "no-cache".parse().unwrap(),
            );
            (status, headers, body)
        })
}

/// Handle /assets/* with immutable cache for hashed files
pub async fn handle_assets(
    Path(rel_path): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let web_dist = get_web_dist_path();
    let full_path = format!("assets/{}", rel_path);

    serve_static_file(&web_dist, &full_path)
        .await
        .map(|(status, mut headers, body)| {
            // Hashed assets get immutable cache
            headers.insert(
                axum::http::header::CACHE_CONTROL,
                "public, max-age=31536000, immutable".parse().unwrap(),
            );
            (status, headers, body)
        })
}

/// Handle specific SPA files: /sw.js, /registerSW.js, /manifest.webmanifest
pub async fn handle_spa_static(
    filename: &str,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let web_dist = get_web_dist_path();

    serve_static_file(&web_dist, filename)
        .await
        .map(|(status, mut headers, body)| {
            headers.insert(
                axum::http::header::CACHE_CONTROL,
                "no-cache".parse().unwrap(),
            );
            (status, headers, body)
        })
}

/// Handle /media/* (NEW in Rust — nginx served it before)
pub async fn handle_media_asset(
    Path(rel_path): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Validate path components
    for component in rel_path.split('/').filter(|c| !c.is_empty()) {
        safe_path_component(component)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    }

    let base_dir = format!("{}/media", get_config_path());

    serve_static_file(&base_dir, &rel_path)
        .await
        .map(|(status, mut headers, body)| {
            headers.insert(
                axum::http::header::CACHE_CONTROL,
                "public, max-age=86400".parse().unwrap(),
            );
            (status, headers, body)
        })
}
