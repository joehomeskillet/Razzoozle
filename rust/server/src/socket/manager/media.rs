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
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
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
                        .emit(constants::manager::UNAUTHORIZED, "")
                        .ok();
                    return;
                }

                // Validate request format
                let filename = match payload.get("filename").and_then(|v| v.as_str()) {
                    Some(f) if !f.is_empty() && f.len() <= 200 => f,
                    _ => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.invalidDataUrl")
                            .ok();
                        return;
                    }
                };

                let data_url = match payload.get("dataUrl").and_then(|v| v.as_str()) {
                    Some(d) if d.starts_with("data:") => d,
                    _ => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.invalidDataUrl")
                            .ok();
                        return;
                    }
                };

                let category = payload.get("category").and_then(|v| v.as_str());

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
                        socket.emit(constants::media::UPLOAD_SUCCESS, "").ok();
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
                        .emit(constants::manager::UNAUTHORIZED, "")
                        .ok();
                    return;
                }

                // Extract and validate ID
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(id_str) if !id_str.is_empty() => id_str,
                    _ => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.invalidId")
                            .ok();
                        return;
                    }
                };

                // Validate ID safety
                if let Err(e) = safe_asset_id(id) {
                    socket.emit(constants::media::ERROR, &e).ok();
                    return;
                }

                // Get media list to find the entry (so we know the filename and category for disk deletion)
                let media_list = db::get_media_list(&ctx.db_pool).await;
                let entry = media_list.iter().find(|item| {
                    item.get("id").and_then(|v| v.as_str()) == Some(id)
                });

                match entry {
                    None => {
                        socket
                            .emit(constants::media::ERROR, "errors:media.notFound")
                            .ok();
                        return;
                    }
                    Some(media_entry) => {
                        // Extract category and filename for disk deletion
                        let category = media_entry
                            .get("category")
                            .and_then(|v| v.as_str())
                            .unwrap_or("questions");
                        let filename = media_entry
                            .get("filename")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

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
                    }
                }
            });
        }
    });
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

    let buffer = base64_decode(base64_part)
        .map_err(|_| "errors:media.invalidDataUrl".to_string())?;

    Ok((mime, buffer))
}

/// Simple base64 decoder.
fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = Vec::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &byte in s.as_bytes() {
        let val = if byte == b'=' {
            break;
        } else if let Some(pos) = BASE64_CHARS.iter().position(|&b| b == byte) {
            pos as u32
        } else if byte.is_ascii_whitespace() {
            continue;
        } else {
            return Err("Invalid base64 character".to_string());
        };

        buf = (buf << 6) | val;
        bits += 6;

        if bits >= 8 {
            bits -= 8;
            result.push(((buf >> bits) & 0xff) as u8);
        }
    }

    Ok(result)
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
fn normalize_media_stem(filename: &str) -> String {
    // Extract stem (filename without extension)
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");

    // Lowercase, replace spaces/non-alnum with hyphens, trim leading/trailing hyphens, cap at 64
    let normalized = stem
        .to_lowercase()
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
fn extension_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpeg",
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
