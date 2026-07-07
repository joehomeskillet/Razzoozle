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
}

const THEME_REVISIONS_MAX: usize = 10;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_theme(socket, ctx);
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
fn validate_theme(payload: &serde_json::Value) -> Result<(), String> {
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

fn register_set_theme(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_THEME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate
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

                // Validate theme payload structure and field types
                if let Err(error) = validate_theme(&payload) {
                    socket
                        .emit(constants::manager::THEME_ERROR, &error)
                        .ok();
                    return;
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
                    socket
                        .emit(constants::manager::THEME_ERROR, &"Failed to save revision")
                        .ok();
                    return;
                }

                if let Ok(Err(e)) = revision_result {
                    socket
                        .emit(constants::manager::THEME_ERROR, &format!("Revision save failed: {}", e))
                        .ok();
                    return;
                }

                // Persist to disk — MANAGER.GET_THEME reads this exact file, so
                // writing it keeps the read/write round-trip consistent (a reload or a
                // fresh GET_THEME must see the theme this handler just saved).
                let theme_dir = std::path::Path::new("config/theme");

                if !theme_dir.exists() {
                    if let Err(e) = fs::create_dir_all(theme_dir) {
                        socket
                            .emit(constants::manager::THEME_ERROR, &format!("Failed to save theme: {}", e))
                            .ok();
                        return;
                    }
                }

                let theme_json = match serde_json::to_string_pretty(&payload) {
                    Ok(s) => s,
                    Err(e) => {
                        socket
                            .emit(constants::manager::THEME_ERROR, &format!("Failed to save theme: {}", e))
                            .ok();
                        return;
                    }
                };

                if let Err(e) = fs::write(theme_dir.join("theme.json"), theme_json) {
                    socket
                        .emit(constants::manager::THEME_ERROR, &format!("Failed to save theme: {}", e))
                        .ok();
                    return;
                }

                // Mirror to DB (additive; keeps the themes table in sync for future
                // DB-only reads). The file write above is the source of truth for
                // GET_THEME, so a DB hiccup (or no pool configured) must not fail the
                // save — just log it and continue.
                if let Err(e) = db::upsert_theme(&ctx.db_pool, &payload).await {
                    eprintln!("manager:setTheme — DB mirror failed (non-fatal): {}", e);
                }

                // Emit success to requester only
                socket
                    .emit(constants::manager::SET_THEME_SUCCESS, &payload)
                    .ok();

                // Broadcast new theme to all connected clients EXCEPT the sender
                socket.broadcast()
                    .emit(constants::manager::THEME, &payload)
                    .ok();

                // Re-emit full manager config to requester so admin panel stays in sync
                config_helper::build_and_emit_config(&socket, &ctx).await;
            });
        }
    });
}
