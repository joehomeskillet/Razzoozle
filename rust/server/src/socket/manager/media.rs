//! MANAGER.MEDIA — media library handlers

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::SocketRef;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx);
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
