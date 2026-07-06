//! MANAGER.SET_THEME — theme management handler
//! manager:setTheme — save theme to database and broadcast to all clients

use super::super::HandlerCtx;
use super::config_helper;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

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

                // Persist to DB
                match db::upsert_theme(&ctx.db_pool, &payload).await {
                    Ok(_) => {
                        // Emit success to requester
                        socket
                            .emit(constants::manager::SET_THEME_SUCCESS, &payload)
                            .ok();

                        // Broadcast new theme to all connected clients (including other managers)
                        ctx.io
                            .emit(constants::manager::THEME, &payload)
                            .ok();

                        // Re-emit full manager config to requester so admin panel stays in sync
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to save theme: {}", e);
                        socket
                            .emit(
                                constants::manager::THEME_ERROR,
                                &err_msg,
                            )
                            .ok();
                    }
                }
            });
        }
    });
}
