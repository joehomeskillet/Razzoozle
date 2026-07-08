use super::super::super::HandlerCtx;
use super::apply::load_current_theme;
use super::decode_base64;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use regex::Regex;
use lazy_static::lazy_static;
use chrono::Utc;
use sqlx::PgPool;

lazy_static! {
    // Data URL pattern: data:<mime>;base64,<base64-data>
    static ref DATA_URL_REGEX: Regex = Regex::new(r"^data:([^;,]+);base64,(.+)$").unwrap();
}

const BACKGROUND_SIZE_CAP: usize = 8 * 1024 * 1024; // 8 MB
const SOUND_SIZE_CAP: usize = 4 * 1024 * 1024; // 4 MB

/// Decode a data URL with required ;base64, marker and return MIME type + buffer
fn decode_data_url(data_url: &str, expected_mimes: &[&str], error_key: &str) -> Result<(String, Vec<u8>), String> {
    let caps = DATA_URL_REGEX.captures(data_url)
        .ok_or_else(|| error_key.to_string())?;

    let mime_type = caps.get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| error_key.to_string())?;

    if !expected_mimes.contains(&mime_type) {
        return Err(error_key.to_string());
    }

    let data_part = caps.get(2)
        .map(|m| m.as_str())
        .ok_or_else(|| error_key.to_string())?;

    let buffer = decode_base64(data_part)
        .map_err(|_| error_key.to_string())?;

    Ok((mime_type.to_string(), buffer))
}

/// Map MIME type to file extension for background images
fn extension_for_image_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        _ => "png",
    }
}

/// Save background image with 8 MB cap (blocking I/O wrapped in spawn_blocking) and DB tracking
async fn save_background_image(slot: &str, data_url: &str, db_pool: &Option<PgPool>) -> Result<String, String> {
    let valid_slots = ["auth", "managerGame", "playerGame", "logo"];
    if !valid_slots.contains(&slot) {
        return Err("errors:theme.invalidSlot".to_string());
    }

    let (mime, buffer) = decode_data_url(data_url, &["image/png", "image/jpeg", "image/webp"], "errors:theme.invalidImage")?;

    if buffer.len() > BACKGROUND_SIZE_CAP {
        return Err("errors:theme.imageTooLarge".to_string());
    }

    // Delete old slot-* entries from media_assets table
    let _ = db::delete_media_assets_by_slot(db_pool, slot, "theme").await;

    let slot_owned = slot.to_string();
    let buffer_clone = buffer.clone();
    let mime_clone = mime.clone();
    let (filename, size) = tokio::task::spawn_blocking(move || {
        let backgrounds_dir = Path::new("config/media/backgrounds");
        if !backgrounds_dir.exists() {
            fs::create_dir_all(backgrounds_dir)
                .map_err(|_| "errors:theme.uploadFailed".to_string())?;
        }

        if let Ok(entries) = fs::read_dir(backgrounds_dir) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if name.starts_with(&format!("{}-", slot_owned)) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }

        let timestamp = Utc::now().timestamp_millis();
        // parity: no WebP transcode in Rust (no image lib) — original bytes + honest extension; transcode = Wave 4b (media-wr ADR)
        let ext = extension_for_image_mime(&mime_clone);
        let filename = format!("{}-{}.{}", slot_owned, timestamp, ext);
        let filepath = backgrounds_dir.join(&filename);

        fs::write(&filepath, &buffer_clone)
            .map_err(|_| "errors:theme.uploadFailed".to_string())?;

        Ok::<(String, i32), String>((filename, buffer_clone.len() as i32))
    })
    .await
    .map_err(|_| "errors:theme.uploadFailed".to_string())??;

    // Insert into DB with source="theme" and category="backgrounds"
    let url = format!("/media/backgrounds/{}", filename);
    let asset_id = format!("backgrounds-{}", filename.replace(".", "-"));
    let uploaded_at = Utc::now();
    let _ = db::insert_media_asset(
        db_pool,
        &asset_id,
        &filename,
        &url,
        size,
        "image",
        "backgrounds",
        "theme",
        None,
        None,
        uploaded_at,
    ).await;

    Ok(format!("/media/backgrounds/{}", filename))
}

/// Save sound file with 4 MB cap (blocking I/O wrapped in spawn_blocking) and DB tracking
async fn save_sound_file(slot: &str, data_url: &str, db_pool: &Option<PgPool>) -> Result<String, String> {
    let valid_slots = [
        "answersMusic", "answersSound", "podiumThree", "podiumSecond", "podiumFirst",
        "podiumSnearRoll", "results", "show", "boump", "tierBronze", "tierSilver",
        "tierGold", "tierDiamant"
    ];
    if !valid_slots.contains(&slot) {
        return Err("errors:theme.invalidSlot".to_string());
    }

    let (mime, buffer) = decode_data_url(
        data_url,
        &["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"], "errors:theme.invalidAudio"
    )?;

    if buffer.len() > SOUND_SIZE_CAP {
        return Err("errors:theme.audioTooLarge".to_string());
    }

    // Delete old slot-* entries from media_assets table
    let _ = db::delete_media_assets_by_slot(db_pool, slot, "theme").await;

    let slot_owned = slot.to_string();
    let buffer_clone = buffer.clone();
    let mime_clone = mime.clone();
    let (filename, size) = tokio::task::spawn_blocking(move || {
        let sounds_dir = Path::new("config/media/sounds");
        if !sounds_dir.exists() {
            fs::create_dir_all(sounds_dir)
                .map_err(|_| "errors:theme.uploadFailed".to_string())?;
        }

        if let Ok(entries) = fs::read_dir(sounds_dir) {
            for entry in entries.flatten() {
                if let Ok(name) = entry.file_name().into_string() {
                    if name.starts_with(&format!("{}-", slot_owned)) {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }

        let ext = match mime_clone.as_str() {
            "audio/mpeg" | "audio/mp3" => ".mp3",
            "audio/wav" => ".wav",
            "audio/ogg" => ".ogg",
            _ => ".mp3",
        };

        let timestamp = Utc::now().timestamp_millis();
        let filename = format!("{}-{}{}", slot_owned, timestamp, ext);
        let filepath = sounds_dir.join(&filename);

        fs::write(&filepath, &buffer_clone)
            .map_err(|_| "errors:theme.uploadFailed".to_string())?;

        Ok::<(String, i32), String>((filename, buffer_clone.len() as i32))
    })
    .await
    .map_err(|_| "errors:theme.uploadFailed".to_string())??;

    // Insert into DB with source="theme" and category="audio"
    let url = format!("/media/sounds/{}", filename);
    let asset_id = format!("audio-{}", filename.replace(".", "-"));
    let uploaded_at = Utc::now();
    let _ = db::insert_media_asset(
        db_pool,
        &asset_id,
        &filename,
        &url,
        size,
        "audio",
        "audio",
        "theme",
        None,
        None,
        uploaded_at,
    ).await;

    Ok(format!("/media/sounds/{}", filename))
}

pub(super) fn register_upload_background(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::UPLOAD_BACKGROUND, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
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

                let slot = match payload.get("slot").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.invalidSlot")
                            .ok();
                        return;
                    }
                };

                let data_url = match payload.get("dataUrl").and_then(|v| v.as_str()) {
                    Some(d) => d.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.invalidImage")
                            .ok();
                        return;
                    }
                };

                match save_background_image(&slot, &data_url, &ctx.db_pool).await {
                    Ok(path) => {
                        socket
                            .emit(
                                constants::manager::BACKGROUND_UPLOADED,
                                &serde_json::json!({ "slot": slot, "path": path })
                            )
                            .ok();
                    }
                    Err(error) => {
                        socket
                            .emit(constants::manager::THEME_ERROR, &error)
                            .ok();
                    }
                }
            });
        }
    });
}

pub(super) fn register_upload_sound(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::UPLOAD_SOUND, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
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

                let slot = match payload.get("slot").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.invalidSlot")
                            .ok();
                        return;
                    }
                };

                let data_url = match payload.get("dataUrl").and_then(|v| v.as_str()) {
                    Some(d) => d.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.invalidAudio")
                            .ok();
                        return;
                    }
                };

                let asset_ref = match save_sound_file(&slot, &data_url, &ctx.db_pool).await {
                    Ok(ref_path) => ref_path,
                    Err(error) => {
                        socket
                            .emit(constants::manager::THEME_ERROR, &error)
                            .ok();
                        return;
                    }
                };

                let current_theme = match load_current_theme() {
                    Some(theme) => theme,
                    None => super::public::get_default_theme(),
                };

                // Snapshot theme revision BEFORE persisting new theme
                let revision_snapshot = tokio::task::spawn_blocking({
                    move || {
                        if let Some(cur) = load_current_theme() {
                            let ts = Utc::now().timestamp_millis();
                            let id = format!("rev-{}", ts);
                            let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
                            Some(serde_json::json!({
                                "id": id,
                                "createdAt": created_at,
                                "theme": cur
                            }))
                        } else {
                            None
                        }
                    }
                })
                .await
                .ok()
                .flatten();

                // Save revision to DB (if snapshot exists)
                if let Some(revision) = revision_snapshot {
                    let created_at = revision.get("createdAt")
                        .and_then(|v| v.as_str())
                        .unwrap_or("1970-01-01T00:00:00Z");
                    if let Err(e) = db::insert_theme_revision(&ctx.db_pool, &revision, created_at).await {
                        eprintln!("upload_sound — revision save failed (non-fatal): {}", e);
                    }
                }

                let mut new_theme = current_theme.clone();
                if let Some(obj) = new_theme.as_object_mut() {
                    if !obj.contains_key("sounds") {
                        obj.insert("sounds".to_string(), serde_json::json!({}));
                    }
                    if let Some(sounds) = obj.get_mut("sounds").and_then(|s| s.as_object_mut()) {
                        sounds.insert(slot.clone(), serde_json::json!(asset_ref.clone()));
                    }
                }

                let theme_dir = Path::new("config/theme");
                if let Err(_) = fs::create_dir_all(theme_dir) {
                    socket
                        .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                        .ok();
                    return;
                }

                let theme_json = match serde_json::to_string_pretty(&new_theme) {
                    Ok(s) => s,
                    Err(_) => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                            .ok();
                        return;
                    }
                };

                if let Err(_) = fs::write(theme_dir.join("theme.json"), theme_json) {
                    socket
                        .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                        .ok();
                    return;
                }

                if let Err(e) = db::upsert_theme(&ctx.db_pool, &new_theme).await {
                    eprintln!("upload_sound — DB mirror failed: {}", e);
                }

                socket
                    .emit(
                        constants::manager::SOUND_UPLOADED,
                        &serde_json::json!({ "slot": slot, "assetRef": asset_ref })
                    )
                    .ok();

                socket.broadcast()
                    .emit(constants::manager::THEME, &new_theme)
                    .ok();
            });
        }
    });
}
