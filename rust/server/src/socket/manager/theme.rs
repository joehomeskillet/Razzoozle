//! MANAGER.SET_THEME — theme management handler
//! manager:setTheme — persist the theme to disk (the same file
//! MANAGER.GET_THEME reads, so the round-trip stays consistent), also mirror
//! it to the DB, then broadcast to all clients.

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use razzoozle_protocol::constants;
use razzoozle_protocol::theme::ThemeRevision;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use regex::Regex;
use lazy_static::lazy_static;
use chrono::Utc;

lazy_static! {
    // Hex color pattern: #xxx or #xxxxxx (3 or 6 hex digits)
    static ref HEX_COLOR_REGEX: Regex = Regex::new(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$").unwrap();
    // Theme asset path pattern: /theme/{name}
    static ref THEME_PATH_REGEX: Regex = Regex::new(r"^/theme/[\w.-]+$").unwrap();
    // Segment pattern for media paths: [A-Za-z0-9_.-]+
    static ref SEGMENT_REGEX: Regex = Regex::new(r"^[A-Za-z0-9_.-]+$").unwrap();
    // Data URL pattern: data:<mime>;base64,<base64-data>
    static ref DATA_URL_REGEX: Regex = Regex::new(r"^data:([^;,]+);base64,(.+)$").unwrap();
}

const THEME_REVISIONS_MAX: usize = 10;
const BACKGROUND_SIZE_CAP: usize = 8 * 1024 * 1024; // 8 MB
const SOUND_SIZE_CAP: usize = 4 * 1024 * 1024; // 4 MB
const SKELETON_ASSET_MAX_BYTES: usize = 512 * 1024; // 512 KB

/// Simple base64 decoder (no external dependency)
fn decode_base64(s: &str) -> Result<Vec<u8>, String> {
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

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_theme(socket, ctx.clone());
    register_set_skeleton_asset(socket, ctx.clone());
    register_reset_skeleton(socket, ctx.clone());
    register_upload_background(socket, ctx.clone());
    register_upload_sound(socket, ctx.clone());
}

/// Validate hex color format (3 or 6 hex digits)
fn is_valid_hex_color(color: &str) -> bool {
    HEX_COLOR_REGEX.is_match(color)
}

/// Validate asset path: must match /theme/{name} or /media/{segments}
/// Each segment must be non-empty, not ".", not "..", and match [A-Za-z0-9_.-]+
fn is_safe_asset_path(value: &str) -> bool {
    // Check /theme/{name} pattern
    if THEME_PATH_REGEX.is_match(value) {
        return true;
    }

    // Check /media/{segments} pattern
    if !value.starts_with("/media/") {
        return false;
    }

    value["/media/".len()..].split('/').all(|segment| {
        !segment.is_empty() && segment != "." && segment != ".." && SEGMENT_REGEX.is_match(segment)
    })
}

/// Validate the theme payload structure and field types
pub fn validate_theme(payload: &serde_json::Value) -> Result<(), String> {
    if !payload.is_object() {
        return Err("Theme must be an object".to_string());
    }

    let obj = payload.as_object().unwrap();

    // Validate style: must be "flat" or "glass" (optional, defaults to "flat")
    if let Some(style) = obj.get("style") {
        if let Some(s) = style.as_str() {
            if s != "flat" && s != "glass" {
                return Err("errors:theme.invalidStyle".to_string());
            }
        } else {
            return Err("errors:theme.invalidStyle".to_string());
        }
    }

    // Validate colorPrimary: hex color
    if let Some(color) = obj.get("colorPrimary") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    } else {
        return Err("errors:theme.missingColorPrimary".to_string());
    }

    // Validate colorSecondary: hex color
    if let Some(color) = obj.get("colorSecondary") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    } else {
        return Err("errors:theme.missingColorSecondary".to_string());
    }

    // Validate colorText: hex color (optional, has default)
    if let Some(color) = obj.get("colorText") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate answerColors: 4-element array of hex colors
    if let Some(colors) = obj.get("answerColors") {
        if let Some(arr) = colors.as_array() {
            if arr.len() != 4 {
                return Err("errors:theme.invalidAnswerColors".to_string());
            }
            for (_i, color) in arr.iter().enumerate() {
                if let Some(c) = color.as_str() {
                    if !is_valid_hex_color(c) {
                        return Err("errors:theme.invalidColor".to_string());
                    }
                } else {
                    return Err("errors:theme.invalidColor".to_string());
                }
            }
        } else {
            return Err("errors:theme.invalidAnswerColors".to_string());
        }
    } else {
        return Err("errors:theme.missingAnswerColors".to_string());
    }

    // Validate answerTextColor: hex color (optional, has default)
    if let Some(color) = obj.get("answerTextColor") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate accentColor: hex color (optional, has default)
    if let Some(color) = obj.get("accentColor") {
        if let Some(c) = color.as_str() {
            if !is_valid_hex_color(c) {
                return Err("errors:theme.invalidColor".to_string());
            }
        } else {
            return Err("errors:theme.invalidColor".to_string());
        }
    }

    // Validate radius: number 0-40 (optional, has default)
    if let Some(r) = obj.get("radius") {
        if let Some(num) = r.as_u64() {
            if num > 40 {
                return Err("errors:theme.invalidRadius".to_string());
            }
        } else {
            return Err("errors:theme.invalidRadius".to_string());
        }
    }

    // Validate scrim: number 0-100 (optional, has default)
    if let Some(s) = obj.get("scrim") {
        if let Some(num) = s.as_u64() {
            if num > 100 {
                return Err("errors:theme.invalidScrim".to_string());
            }
        } else {
            return Err("errors:theme.invalidScrim".to_string());
        }
    }

    // Validate appTitle: string or null (optional)
    if let Some(title) = obj.get("appTitle") {
        if !title.is_null() && !title.is_string() {
            return Err("errors:theme.invalidAppTitle".to_string());
        }
        if let Some(s) = title.as_str() {
            if s.len() > 40 {
                return Err("errors:theme.invalidAppTitle".to_string());
            }
        }
    }

    // Validate logo: string or null (optional), must be safe asset path if string
    if let Some(logo) = obj.get("logo") {
        if let Some(logo_str) = logo.as_str() {
            if !is_safe_asset_path(logo_str) {
                return Err("errors:theme.invalidAsset".to_string());
            }
        } else if !logo.is_null() {
            return Err("errors:theme.invalidLogo".to_string());
        }
    }

    // Validate showBranding: boolean (optional, has default)
    if let Some(show) = obj.get("showBranding") {
        if !show.is_boolean() {
            return Err("errors:theme.invalidShowBranding".to_string());
        }
    }

    // Validate backgrounds: object with optional auth, managerGame, playerGame fields
    if let Some(backgrounds) = obj.get("backgrounds") {
        if let Some(bg_obj) = backgrounds.as_object() {
            for (key, value) in bg_obj.iter() {
                if key != "auth" && key != "managerGame" && key != "playerGame" &&
                   key != "animated" && key != "animatedCss" {
                    // Unknown background field, but don't fail hard — just ignore
                    continue;
                }
                if key == "auth" || key == "managerGame" || key == "playerGame" {
                    if let Some(asset_str) = value.as_str() {
                        if !is_safe_asset_path(asset_str) {
                            return Err("errors:theme.invalidAsset".to_string());
                        }
                    } else if !value.is_null() {
                        return Err("errors:theme.invalidAsset".to_string());
                    }
                }
            }
        } else {
            return Err("errors:theme.invalidBackgrounds".to_string());
        }
    }

    Ok(())
}

/// Load current theme from disk for revision snapshot
fn load_current_theme() -> Option<serde_json::Value> {
    let theme_path = Path::new("config/theme/theme.json");
    if theme_path.exists() {
        if let Ok(content) = fs::read_to_string(theme_path) {
            if let Ok(theme) = serde_json::from_str(&content) {
                return Some(theme);
            }
        }
    }
    None
}

/// Save theme revision snapshot before overwriting
fn save_theme_revision(current_theme: serde_json::Value) -> Result<(), String> {
    let revisions_path = Path::new("config/theme-revisions.json");

    // Load existing revisions
    let mut revisions: Vec<serde_json::Value> = if revisions_path.exists() {
        if let Ok(content) = fs::read_to_string(revisions_path) {
            if let Ok(arr) = serde_json::from_str(&content) {
                arr
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Create new revision with timestamp-based ID
    let timestamp_ms = Utc::now().timestamp_millis();
    let id = format!("rev-{}", timestamp_ms);
    let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    let revision = serde_json::json!({
        "id": id,
        "createdAt": created_at,
        "theme": current_theme
    });

    // Prepend new revision and cap at THEME_REVISIONS_MAX
    revisions.insert(0, revision);
    if revisions.len() > THEME_REVISIONS_MAX {
        revisions.truncate(THEME_REVISIONS_MAX);
    }

    // Write back to disk
    let json = serde_json::to_string_pretty(&revisions)
        .map_err(|e| format!("Failed to serialize revisions: {}", e))?;
    fs::write(revisions_path, json)
        .map_err(|e| format!("Failed to save revisions: {}", e))?;

    Ok(())
}


/// Apply theme: validate, save revision (if existing theme), persist to disk, and mirror to DB.
/// Returns the persisted theme on success, or an error message on failure.
pub async fn apply_theme(payload: &serde_json::Value, ctx: &HandlerCtx) -> Result<serde_json::Value, String> {
    // Validate theme payload structure and field types
    if let Err(error) = validate_theme(&payload) {
        return Err(error);
    }

    // Capture current theme and save as revision BEFORE overwriting
    // Run file I/O in a blocking task since we're in an async context
    let revision_result = tokio::task::spawn_blocking(|| {
        if let Some(current_theme) = load_current_theme() {
            save_theme_revision(current_theme)
        } else {
            // No existing theme to snapshot (first save), skip revision
            Ok(())
        }
    })
    .await;

    if let Err(_) = revision_result {
        return Err("Failed to save revision".to_string());
    }

    if let Ok(Err(e)) = revision_result {
        return Err(format!("Revision save failed: {}", e));
    }

    // Persist to disk — MANAGER.GET_THEME reads this exact file, so
    // writing it keeps the read/write round-trip consistent (a reload or a
    // fresh GET_THEME must see the theme this handler just saved).
    let theme_dir = std::path::Path::new("config/theme");

    if !theme_dir.exists() {
        if let Err(e) = fs::create_dir_all(theme_dir) {
            return Err(format!("Failed to save theme: {}", e));
        }
    }

    let theme_json = match serde_json::to_string_pretty(&payload) {
        Ok(s) => s,
        Err(e) => {
            return Err(format!("Failed to save theme: {}", e));
        }
    };

    if let Err(e) = fs::write(theme_dir.join("theme.json"), theme_json) {
        return Err(format!("Failed to save theme: {}", e));
    }

    // Mirror to DB (additive; keeps the themes table in sync for future
    // DB-only reads). The file write above is the source of truth for
    // GET_THEME, so a DB hiccup (or no pool configured) must not fail the
    // save — just log it and continue.
    if let Err(e) = db::upsert_theme(&ctx.db_pool, &payload).await {
        eprintln!("apply_theme — DB mirror failed (non-fatal): {}", e);
    }

    Ok(payload.clone())
}

/// Decode a data URL with required ;base64, marker and return MIME type + buffer
fn decode_data_url(data_url: &str, expected_mimes: &[&str]) -> Result<(String, Vec<u8>), String> {
    let caps = DATA_URL_REGEX.captures(data_url)
        .ok_or_else(|| "errors:theme.invalidImage".to_string())?;

    let mime_type = caps.get(1)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:theme.invalidImage".to_string())?;

    if !expected_mimes.contains(&mime_type) {
        return Err("errors:theme.invalidImage".to_string());
    }

    let data_part = caps.get(2)
        .map(|m| m.as_str())
        .ok_or_else(|| "errors:theme.invalidImage".to_string())?;

    let buffer = decode_base64(data_part)
        .map_err(|_| "errors:theme.invalidImage".to_string())?;

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

/// Save background image with 8 MB cap (blocking I/O wrapped in spawn_blocking)
async fn save_background_image(slot: &str, data_url: &str) -> Result<String, String> {
    let valid_slots = ["auth", "managerGame", "playerGame", "logo"];
    if !valid_slots.contains(&slot) {
        return Err("errors:theme.invalidSlot".to_string());
    }

    let (mime, buffer) = decode_data_url(data_url, &["image/png", "image/jpeg", "image/webp"])?;

    if buffer.len() > BACKGROUND_SIZE_CAP {
        return Err("errors:theme.imageTooLarge".to_string());
    }

    let slot_owned = slot.to_string();
    tokio::task::spawn_blocking(move || {
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
        let ext = extension_for_image_mime(&mime);
        let filename = format!("{}-{}.{}", slot_owned, timestamp, ext);
        let filepath = backgrounds_dir.join(&filename);

        fs::write(&filepath, &buffer)
            .map_err(|_| "errors:theme.uploadFailed".to_string())?;

        Ok(format!("/media/backgrounds/{}", filename))
    })
    .await
    .map_err(|_| "errors:theme.uploadFailed".to_string())?
}

/// Save sound file with 4 MB cap (blocking I/O wrapped in spawn_blocking)
async fn save_sound_file(slot: &str, data_url: &str) -> Result<String, String> {
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
        &["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"]
    )?;

    if buffer.len() > SOUND_SIZE_CAP {
        return Err("errors:theme.audioTooLarge".to_string());
    }

    let slot_owned = slot.to_string();
    tokio::task::spawn_blocking(move || {
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

        let ext = match mime.as_str() {
            "audio/mpeg" | "audio/mp3" => ".mp3",
            "audio/wav" => ".wav",
            "audio/ogg" => ".ogg",
            _ => ".mp3",
        };

        let timestamp = Utc::now().timestamp_millis();
        let filename = format!("{}-{}{}", slot_owned, timestamp, ext);
        let filepath = sounds_dir.join(&filename);

        fs::write(&filepath, &buffer)
            .map_err(|_| "errors:theme.uploadFailed".to_string())?;

        Ok(format!("/media/sounds/{}", filename))
    })
    .await
    .map_err(|_| "errors:theme.uploadFailed".to_string())?
}

/// Set skeleton asset and update theme (no empty check, 512 KB size cap check)
fn set_skeleton_asset(kind: &str, content: &str, current_theme: &serde_json::Value) -> Result<serde_json::Value, String> {
    if kind != "css" && kind != "js" {
        return Err("errors:skeleton.invalidKind".to_string());
    }

    // Check size cap (512 KB) — Node checks Buffer.byteLength(content) > SKELETON_ASSET_MAX_BYTES
    if content.as_bytes().len() > SKELETON_ASSET_MAX_BYTES {
        return Err("errors:skeleton.assetTooLarge".to_string());
    }

    let skeleton_dir = Path::new("config/theme");
    if !skeleton_dir.exists() {
        fs::create_dir_all(skeleton_dir)
            .map_err(|_| "errors:theme.saveFailed".to_string())?;
    }

    let filename = format!("skeleton.{}", kind);
    let filepath = skeleton_dir.join(&filename);

    fs::write(&filepath, content)
        .map_err(|_| "errors:theme.saveFailed".to_string())?;

    let mut theme = current_theme.clone();

    let enabled_key = if kind == "css" {
        "customCssEnabled"
    } else {
        "customJsEnabled"
    };

    if let Some(obj) = theme.as_object_mut() {
        obj.insert(enabled_key.to_string(), serde_json::json!(true));

        let current_version = obj.get("skeletonVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        obj.insert("skeletonVersion".to_string(), serde_json::json!(current_version + 1));
    }

    Ok(theme)
}

/// Reset skeleton to defaults, restoring DEFAULT_THEME
fn reset_skeleton(current_theme: &serde_json::Value) -> Result<serde_json::Value, String> {
    save_theme_revision(current_theme.clone())
        .map_err(|e| format!("Revision save failed: {}", e))?;

    let skeleton_dir = Path::new("config/theme");
    let _ = fs::remove_file(skeleton_dir.join("skeleton.css"));
    let _ = fs::remove_file(skeleton_dir.join("skeleton.js"));

    Ok(super::public::get_default_theme())
}

fn register_set_theme(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_THEME, {
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

                match apply_theme(&payload, &ctx).await {
                    Ok(theme) => {
                        socket
                            .emit(constants::manager::SET_THEME_SUCCESS, &theme)
                            .ok();

                        socket.broadcast()
                            .emit(constants::manager::THEME, &theme)
                            .ok();

                        config_helper::build_and_emit_config(&socket, &ctx).await;
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

fn register_set_skeleton_asset(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_SKELETON_ASSET, {
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

                let kind = match payload.get("kind").and_then(|v| v.as_str()) {
                    Some(k) if k == "css" || k == "js" => k,
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:skeleton.invalidKind")
                            .ok();
                        return;
                    }
                };

                let content = match payload.get("content").and_then(|v| v.as_str()) {
                    Some(c) => c,
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:skeleton.invalidContent")
                            .ok();
                        return;
                    }
                };

                let current_theme = match load_current_theme() {
                    Some(theme) => theme,
                    None => super::public::get_default_theme(),
                };

                match tokio::task::spawn_blocking({
                    let kind = kind.to_string();
                    let content = content.to_string();
                    move || set_skeleton_asset(&kind, &content, &current_theme)
                })
                .await
                {
                    Ok(Ok(new_theme)) => {
                        // MAJOR FIX: snapshot theme revision BEFORE persisting (Node calls setTheme which snapshots)
                        let snapshot_result = tokio::task::spawn_blocking({
                            move || {
                                if let Some(cur) = load_current_theme() {
                                    save_theme_revision(cur)
                                } else {
                                    Ok(())
                                }
                            }
                        })
                        .await;

                        if let Ok(Err(_)) = snapshot_result {
                            socket
                                .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                .ok();
                            return;
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
                            eprintln!("set_skeleton_asset — DB mirror failed: {}", e);
                        }

                        socket.broadcast()
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(
                                constants::manager::SET_SKELETON_ASSET_SUCCESS,
                                &serde_json::json!({ "kind": kind })
                            )
                            .ok();
                    }
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_reset_skeleton(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RESET_SKELETON, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
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

                let current_theme = match load_current_theme() {
                    Some(theme) => theme,
                    None => super::public::get_default_theme(),
                };

                match tokio::task::spawn_blocking({
                    let current = current_theme.clone();
                    move || reset_skeleton(&current)
                })
                .await
                {
                    Ok(Ok(new_theme)) => {
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
                            eprintln!("reset_skeleton — DB mirror failed: {}", e);
                        }

                        socket.broadcast()
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::RESET_SKELETON_SUCCESS, "")
                            .ok();
                    }
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_upload_background(socket: &SocketRef, ctx: HandlerCtx) {
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

                match save_background_image(&slot, &data_url).await {
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

fn register_upload_sound(socket: &SocketRef, ctx: HandlerCtx) {
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

                let asset_ref = match save_sound_file(&slot, &data_url).await {
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

                // MAJOR FIX: snapshot theme revision BEFORE persisting (Node calls setTheme which snapshots)
                let snapshot_result = tokio::task::spawn_blocking({
                    let current = current_theme.clone();
                    move || {
                        if let Some(cur) = load_current_theme() {
                            save_theme_revision(cur)
                        } else {
                            Ok(())
                        }
                    }
                })
                .await;

                if let Ok(Err(_)) = snapshot_result {
                    socket
                        .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                        .ok();
                    return;
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
