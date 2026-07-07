//! RESULTS.GET_SHARED / RESULTS.GET — game-result detail lookups.
//!
//! The shared DB (game_results) is the source of truth; a disk fallback covers
//! results not yet backfilled (e.g. solo-results still written to files).

use super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_get_shared(socket, ctx.clone());
    register_get(socket, ctx.clone());
    register_delete(socket, ctx);
}

/// Public (no auth): the `/r/:id` share page. The client emits a BARE STRING id
/// (Node handler: `(id) => ...`), so the extractor is `Data::<String>`, NOT a
/// `{id}` object — the old object-extractor silently matched nothing and every
/// share link read as "not found".
fn register_get_shared(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::results::GET_SHARED, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(id)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Path-traversal guard before any filesystem fallback.
                if crate::state::safe_asset_id(&id).is_err() {
                    return;
                }

                if let Some(mut result) = db::get_result_by_id(&ctx.db_pool, &id).await {
                    if let serde_json::Value::Object(ref mut obj) = result {
                        obj.remove("questions");
                    }
                    socket.emit(constants::results::SHARED_DATA, &result).ok();
                    return;
                }

                // Disk fallback (solo-results / not-yet-backfilled results).
                let disk = fs::read_to_string(format!("config/solo-results/{}.json", id))
                    .or_else(|_| fs::read_to_string(format!("config/results/{}.json", id)));

                if let Ok(contents) = disk {
                    if let Ok(mut result) = serde_json::from_str::<serde_json::Value>(&contents) {
                        if let serde_json::Value::Object(ref mut obj) = result {
                            obj.remove("questions");
                        }
                        socket.emit(constants::results::SHARED_DATA, &result).ok();
                    }
                }
            });
        }
    });
}

/// Manager (auth-gated): full result detail for the Results tab.
fn register_get(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::results::GET, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(id)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
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

                if crate::state::safe_asset_id(&id).is_err() {
                    return;
                }

                if let Some(result) = db::get_result_by_id(&ctx.db_pool, &id).await {
                    socket.emit(constants::results::DATA, &result).ok();
                }
            });
        }
    });
}

/// Manager (auth-gated): delete a result by id. The client emits a BARE STRING id
/// (not a {id} object), so extractor is Data::<String>.
fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::results::DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<String>(id)| {
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

                // Path-traversal guard
                if crate::state::safe_asset_id(&id).is_err() {
                    return;
                }

                // Attempt to delete the result
                if db::delete_result(&ctx.db_pool, &id).await {
                    // On success, re-emit config so the manager sees the updated results list
                    crate::socket::manager::config_helper::build_and_emit_config(&socket, &ctx).await;
                } else {
                    // On failure, emit error AND re-emit config so the manager sees the actual state
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:manager.resultDeleteFailed")
                        .ok();
                    crate::socket::manager::config_helper::build_and_emit_config(&socket, &ctx).await;
                }
            });
        }
    });
}
