//! MANAGER.SET_THEME — theme management handler
//! manager:setTheme — persist the theme to disk (the same file
//! MANAGER.GET_THEME reads, so the round-trip stays consistent), also mirror
//! it to the DB, then broadcast to all clients.

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_set_theme(socket, ctx);
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

                // Validate that payload is a proper theme object with required fields
                if !payload.is_object() {
                    socket
                        .emit(
                            constants::manager::THEME_ERROR,
                            &"Theme must be an object",
                        )
                        .ok();
                    return;
                }

                // Persist to disk first — MANAGER.GET_THEME reads this exact file, so
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

                // Emit success to requester
                socket
                    .emit(constants::manager::SET_THEME_SUCCESS, &payload)
                    .ok();

                // Broadcast new theme to all connected clients (including other managers)
                ctx.io.emit(constants::manager::THEME, &payload).ok();

                // Re-emit full manager config to requester so admin panel stays in sync
                config_helper::build_and_emit_config(&socket, &ctx).await;
            });
        }
    });
}
