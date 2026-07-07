//! MANAGER.MEDIA — media library handlers

use super::super::HandlerCtx;
use crate::db;
use crate::state::safe_asset_id;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use chrono::Utc;
use uuid::Uuid;
use regex::Regex;
use lazy_static::lazy_static;

lazy_static! {
    static ref DATA_URL_REGEX: Regex = Regex::new(r"^data:([^;,]+);base64,(.+)$").unwrap();
    static ref DATA_URL_VALIDATOR_REGEX: Regex = Regex::new(r"^data:(?:image|audio)\/").unwrap();
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx.clone());
    register_upload(socket, ctx.clone());
    register_delete(socket, ctx);
}

fn register_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth: verify manager is logged in
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &())
                        .ok();
                    return;
                }

                // Query media assets from the shared DB and emit the list.
                let media_list = db::get_media_list(&ctx.db_pool).await;
                socket.emit(constants::media::DATA, &media_list).ok();
            });
        }
    });
}

fn register_upload(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::UPLOAD, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &())
                        .ok();
                    return;
                }

                // Validate payload (Zod-like validator). Returns first error message.
                let (filename, data_url, category) = match validate_upload_payload(&payload) {
                    Ok(data) => data,
                    Err(error_msg) => {
                        socket.emit(constants::media::ERROR, &error_msg).ok();
                        return;
                    }
                };

                // Decode base64 data URL
                let (mime, buffer) = match decode_data_url(data_url) {
                    Ok(result) => result,
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                        return;
                    }
                };

                // Validate decoded size (8 MB cap = 8,000,000 bytes)
                if buffer.len() > 8_000_000 {
                    socket
                        .emit(constants::media::ERROR, "errors:media.tooLarge")
                        .ok();
                    return;
                }

                // Infer type and validate MIME
                let (inferred_type, resolved_category) = match infer_type_and_validate_mime(&mime, category) {
                    Ok(result) => result,
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                        return;
                    }
                };

                // Normalize filename and generate stored filename
                let normalized_stem = normalize_media_stem(filename);
                let random_suffix = Uuid::new_v4().to_string().replace("-", "")[0..8].to_string();
                let ext = extension_for_mime(&mime);
                let stored_filename = format!("{}-{}{}", normalized_stem, random_suffix, ext);
                let url = format!("/media/{}/{}", resolved_category, stored_filename);
                let size = buffer.len() as i32;

                // Generate media asset ID: <category>-<filename-without-extension>
                let filename_stem = stored_filename
                    .rsplit('.')
                    .nth(1)
                    .unwrap_or(&stored_filename)
                    .to_string();
                let asset_id = format!("{}-{}", resolved_category, filename_stem);

                // Validate asset ID
                if let Err(e) = safe_asset_id(&asset_id) {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                // Write file to disk (spawn_blocking)
                let buffer_clone = buffer.clone();
                let stored_filename_clone = stored_filename.clone();
                let category_clone = resolved_category.clone();
                let write_result = tokio::task::spawn_blocking(move || {
                    write_media_file(&buffer_clone, &category_clone, &stored_filename_clone)
                })
                .await;

                if let Ok(Err(e)) = write_result {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                if let Err(_) = write_result {
                    socket
                        .emit(constants::media::ERROR, "errors:media.saveFailed")
                        .ok();
                    return;
                }

                // Insert into database
                let uploaded_at = Utc::now();
                match db::insert_media_asset(
                    &ctx.db_pool,
                    &asset_id,
                    &stored_filename,
                    &url,
                    size,
                    &inferred_type,
                    &resolved_category,
                    "upload",
                    None,
                    None,
                    uploaded_at,
                )
                .await
                {
                    Ok(_) => {
                        socket.emit(constants::media::UPLOAD_SUCCESS, &()).ok();
                        let media_list = db::get_media_list(&ctx.db_pool).await;
                        socket.emit(constants::media::DATA, &media_list).ok();
                    }
                    Err(e) => {
                        socket.emit(constants::media::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Check auth
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &())
                        .ok();
                    return;
                }

                // Validate payload (Zod-like validator). Returns first error message or the ID.
                let id = match validate_delete_payload(&payload) {
                    Ok(id) => id,
                    Err(error_msg) => {
                        socket.emit(constants::media::ERROR, &error_msg).ok();
                        return;
                    }
                };

                // Validate ID safety
                if let Err(e) = safe_asset_id(id) {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                // Get media asset by ID from database
                let media_entry = match get_media_asset_by_id(&ctx.db_pool, id).await {
                    Some(entry) => entry,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };

                // Extract category and filename for disk deletion — treat missing fields as error
                let category = match media_entry.get("category").and_then(|v| v.as_str()) {
                    Some(cat) => cat,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };
                let filename = match media_entry.get("filename").and_then(|v| v.as_str()) {
                    Some(f) => f,
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                };

                // Delete from disk (spawn_blocking)
                let category_owned = category.to_string();
                let filename_owned = filename.to_string();
                let disk_result =
                    tokio::task::spawn_blocking(move || {
                        delete_media_file(&category_owned, &filename_owned)
                    })
                    .await;

                if let Ok(Err(e)) = disk_result {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                if let Err(_) = disk_result {
                    socket
                        .emit(constants::media::ERROR, "errors:media.saveFailed")
                        .ok();
                    return;
                }

                // Delete from database
                if !db::delete_media_asset(&ctx.db_pool, id).await {
                    socket
                        .emit(constants::media::ERROR, "errors:media.notFound")
                        .ok();
                    return;
                }

                // Emit updated list
                let media_list = db::get_media_list(&ctx.db_pool).await;
                socket.emit(constants::media::DATA, &media_list).ok();
            });
        }
    });
}

/// Validate upload payload and return (filename, dataUrl, category) or error message.
/// Mimics Zod validation: returns first error message if validation fails.
fn validate_upload_payload(payload: &serde_json::Value) -> Result<(&str, &str, Option<&str>), String> {
    // Validate filename: required, string, 1-200 chars
    let filename = match payload.get("filename").and_then(|v| v.as_str()) {
        Some(f) if !f.is_empty() && f.len() <= 200 => f,
        Some(_) => return Err("errors:media.invalidDataUrl".to_string()),
        None => return Err("errors:media.invalidDataUrl".to_string()),
    };

    // Validate dataUrl: required, string, regex /^data:(?:image|audio)\/
    let data_url = match payload.get("dataUrl").and_then(|v| v.as_str()) {
        Some(d) if DATA_URL_VALIDATOR_REGEX.is_match(d) => d,
        Some(_) => return Err("errors:media.invalidDataUrl".to_string()),
        None => return Err("errors:media.invalidDataUrl".to_string()),
    };

    // Validate category: optional, enum of valid categories
    let category = payload
        .get("category")
        .and_then(|v| v.as_str())
        .map(|c| {
            // Validate against allowed categories: backgrounds, questions, generated, avatars, audio
            match c {
                "backgrounds" | "questions" | "generated" | "avatars" | "audio" => Ok(c),
                _ => Err("errors:media.invalidDataUrl".to_string()),
            }
        })
        .transpose()?;

    Ok((filename, data_url, category))
}

/// Validate delete payload and return ID or error message.
fn validate_delete_payload(payload: &serde_json::Value) -> Result<&str, String> {
    // Validate id: required, string, min 1 char
    match payload.get("id").and_then(|v| v.as_str()) {
        Some(id) if !id.is_empty() => Ok(id),
        _ => Err("errors:media.invalidId".to_string()),
    }
}

/// Decode a data URL and extract MIME type and base64-decoded buffer.
fn decode_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let caps = DATA_URL_REGEX
        .captures(data_url)
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?;

    let mime = caps
        .get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?
        .to_string();

    let base64_part = caps
        .get(2)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:media.invalidDataUrl".to_string())?;

    let buffer = super::theme::decode_base64(base64_part)
        .map_err(|_| "errors:media.invalidDataUrl".to_string())?;

    Ok((mime, buffer))
}

/// Infer media type from MIME and validate against allowed MIME types.
/// Also resolves category (default: audio->audio, else->questions).
fn infer_type_and_validate_mime(
    mime: &str,
    category: Option<&str>,
) -> Result<(String, String), String> {
    let inferred_type = if mime.starts_with("video/") {
        "video"
    } else if mime.starts_with("audio/") {
        "audio"
    } else {
        "image"
    };

    // Validate MIME type
    if inferred_type == "image" {
        if !mime.starts_with("image/png")
            && !mime.starts_with("image/jpeg")
            && !mime.starts_with("image/webp")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    } else if inferred_type == "audio" {
        if !mime.starts_with("audio/mpeg")
            && !mime.starts_with("audio/mp3")
            && !mime.starts_with("audio/wav")
            && !mime.starts_with("audio/ogg")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    } else if inferred_type == "video" {
        if !mime.starts_with("video/mp4")
            && !mime.starts_with("video/webm")
            && !mime.starts_with("video/ogg")
        {
            return Err("errors:media.invalidDataUrl".to_string());
        }
    }

    // Resolve category: Node semantics (audio→"audio", else→"questions")
    let resolved_category = if let Some(cat) = category {
        cat.to_string()
    } else if inferred_type == "audio" {
        "audio".to_string()
    } else {
        "questions".to_string()
    };

    Ok((inferred_type.to_string(), resolved_category))
}

/// Normalize filename: lowercase, strip non-alphanumeric (keep hyphens/underscores), max 64 chars.
/// parity: minimal accent fold — full Unicode NFD = Wave 4b
fn normalize_media_stem(filename: &str) -> String {
    // Extract stem (filename without extension)
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");

    // Lowercase first, then fold accents: ä→a, ö→o, ü→u, ß→ss, é/è/ê/ë→e, etc.
    let folded = stem
        .to_lowercase()
        .chars()
        .flat_map(|c| match c {
            // Umlauts & German
            'ä' => vec!['a'],
            'ö' => vec!['o'],
            'ü' => vec!['u'],
            'ß' => vec!['s', 's'],
            // French/Spanish accents: e-family
            'é' | 'è' | 'ê' | 'ë' => vec!['e'],
            // e-family continued
            'á' | 'à' | 'â' | 'ã' | 'å' => vec!['a'],
            'í' | 'ì' | 'î' | 'ï' => vec!['i'],
            'ó' | 'ò' | 'ô' | 'õ' => vec!['o'],
            'ú' | 'ù' | 'û' | 'ũ' => vec!['u'],
            'ç' => vec!['c'],
            'ñ' => vec!['n'],
            other => vec![other],
        })
        .collect::<String>();

    // Replace spaces/non-alnum with hyphens, trim leading/trailing hyphens, cap at 64
    let normalized = folded
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
        .chars()
        .take(64)
        .collect::<String>();

    if normalized.is_empty() {
        "media".to_string()
    } else {
        normalized
    }
}

/// Map MIME type to file extension.
/// parity: raw bytes + honest extension, not .webp transcode (Wave 4b)
fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        "audio/mpeg" | "audio/mp3" => ".mp3",
        "audio/wav" => ".wav",
        "audio/ogg" => ".ogg",
        "video/mp4" => ".mp4",
        "video/webm" => ".webm",
        "video/ogg" => ".ogv",
        _ => ".bin",
    }
}

/// Write media file to disk at config/media/<category>/<filename>.
fn write_media_file(buffer: &[u8], category: &str, filename: &str) -> Result<(), String> {
    let media_dir = Path::new("config/media").join(category);

    // Ensure directory exists
    if !media_dir.exists() {
        fs::create_dir_all(&media_dir)
            .map_err(|_| "errors:media.saveFailed".to_string())?;
    }

    let filepath = media_dir.join(filename);

    // Write file
    fs::write(&filepath, buffer).map_err(|_| "errors:media.saveFailed".to_string())?;

    Ok(())
}

/// Delete media file from disk at config/media/<category>/<filename>.
fn delete_media_file(category: &str, filename: &str) -> Result<(), String> {
    let filepath = Path::new("config/media").join(category).join(filename);

    if filepath.exists() {
        fs::remove_file(&filepath).map_err(|_| "errors:media.saveFailed".to_string())?;
    }

    Ok(())
}

/// Query database for a media asset by ID.
/// Returns the full media asset object or None if not found.
async fn get_media_asset_by_id(
    pool: &Option<sqlx::PgPool>,
    id: &str,
) -> Option<serde_json::Value> {
    let pool = pool.as_ref()?;

    match sqlx::query_as::<_, (String, String, String, i32, String, String, String, Option<i32>, Option<i32>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, filename, url, size, type, category, source, width, height, uploaded_at FROM media_assets WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    {
        Ok(Some((id, filename, url, size, media_type, category, source, width, height, uploaded_at))) => {
            let uploaded_at_rfc3339 = uploaded_at.to_rfc3339();
            let mut obj = serde_json::json!({
                "id": id,
                "filename": filename,
                "url": url,
                "size": size,
                "type": media_type,
                "category": category,
                "source": source,
                "uploadedAt": uploaded_at_rfc3339,
            });
            if let Some(w) = width {
                obj["width"] = serde_json::json!(w);
            }
            if let Some(h) = height {
                obj["height"] = serde_json::json!(h);
            }
            Some(obj)
        }
        _ => None,
    }
}
