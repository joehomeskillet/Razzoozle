use super::super::super::HandlerCtx;
use super::super::config_helper;
use super::validate_theme;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use chrono::Utc;

/// Load current theme from disk for revision snapshot
pub(super) fn load_current_theme() -> Option<serde_json::Value> {
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

/// Save theme revision snapshot before overwriting (to database).
async fn save_theme_revision(current_theme: serde_json::Value, ctx: &HandlerCtx) -> Result<(), String> {
    // Create new revision with timestamp-based ID
    let timestamp_ms = Utc::now().timestamp_millis();
    let id = format!("rev-{}", timestamp_ms);
    let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

    let revision = serde_json::json!({
        "id": id,
        "createdAt": created_at,
        "theme": current_theme
    });

    // Persist to database
    db::insert_theme_revision(&ctx.db_pool, &revision, &created_at).await
}

/// Apply theme: validate, save revision (if existing theme), persist to disk, and mirror to DB.
/// Returns the persisted theme on success, or an error message on failure.
pub async fn apply_theme(payload: &serde_json::Value, ctx: &HandlerCtx) -> Result<serde_json::Value, String> {
    // Validate theme payload structure and field types
    if let Err(error) = validate_theme(&payload) {
        return Err(error);
    }

    // Capture current theme and save as revision BEFORE overwriting
    if let Some(current_theme) = load_current_theme() {
        if let Err(e) = save_theme_revision(current_theme, ctx).await {
            return Err(format!("Revision save failed: {}", e));
        }
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

pub(super) fn register_set_theme(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_THEME, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, "")
                            .ok();
                        return;
                    }
                };

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
