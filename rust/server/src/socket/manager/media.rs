//! MANAGER.MEDIA — media library handlers

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx);
}

fn register_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::media::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(_payload)| {
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

                // Query media assets from database
                let media_list = db::get_media_list(&ctx.db_pool).await;

                // Emit the media data as a JSON array
                socket.emit(constants::media::DATA, &media_list).ok();
            });
        }
    });
}
