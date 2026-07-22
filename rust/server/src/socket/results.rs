//! RESULTS.GET_SHARED / RESULTS.GET — game-result detail lookups.
//!
//! The shared DB (game_results) is the source of truth; a disk fallback covers
//! results not yet backfilled (e.g. solo-results still written to files).

use super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use serde::Deserialize;
use socketioxide::extract::{Data, SocketRef};
use std::fs;

/// Max ids accepted per `results:bulkDelete` (matches users bulk cap).
const BULK_DELETE_MAX_IDS: usize = 200;

#[derive(Debug, Deserialize)]
struct BulkDeletePayload {
    ids: Vec<String>,
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_get_shared(socket, ctx.clone());
    register_get(socket, ctx.clone());
    register_delete(socket, ctx.clone());
    register_bulk_delete(socket, ctx);
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

                if let Some(mut result) = db::get_result_by_id(&ctx.db_pool, &id, None).await {
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
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                if crate::state::safe_asset_id(&id).is_err() {
                    return;
                }

                if let Some(result) = db::get_result_by_id(&ctx.db_pool, &id, me).await {
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
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                // Path-traversal guard
                if crate::state::safe_asset_id(&id).is_err() {
                    return;
                }

                // Attempt to delete the result (owner-scoped)
                if db::delete_result(&ctx.db_pool, &id, me).await {
                    // On success, re-emit config so the manager sees the updated results list
                    crate::socket::manager::config_helper::build_and_emit_config(&socket, &ctx).await;
                } else {
                    // Not found or not owned — never silently succeed
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    crate::socket::manager::config_helper::build_and_emit_config(&socket, &ctx).await;
                }
            });
        }
    });
}

/// Manager (auth-gated): bulk-delete results by id list.
/// Payload is a typed `{ids: string[]}` object (not bare Value — socketioxide
/// would otherwise fail to extract and silently drop the event).
fn register_bulk_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::results::BULK_DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<BulkDeletePayload>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate — exact same logic as results:delete
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };
                let me = if user.role == "admin" { None } else { Some(user.user_id) };

                if payload.ids.is_empty() {
                    socket
                        .emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:results.bulkEmpty",
                        )
                        .ok();
                    return;
                }
                if payload.ids.len() > BULK_DELETE_MAX_IDS {
                    socket
                        .emit(
                            constants::manager::ERROR_MESSAGE,
                            "errors:results.bulkTooMany",
                        )
                        .ok();
                    return;
                }

                let pool = match &ctx.db_pool {
                    Some(p) => p,
                    None => {
                        socket
                            .emit(
                                constants::manager::ERROR_MESSAGE,
                                "errors:results.bulkFailed",
                            )
                            .ok();
                        return;
                    }
                };

                let outcome = match db::delete_results(pool, &payload.ids, me).await {
                    Ok(outcome) => outcome,
                    Err(_) => {
                        socket
                            .emit(
                                constants::manager::ERROR_MESSAGE,
                                "errors:results.bulkFailed",
                            )
                            .ok();
                        return;
                    }
                };

                socket
                    .emit(constants::results::BULK_DELETED, &outcome)
                    .ok();
                // Same list refresh as single-delete
                crate::socket::manager::config_helper::build_and_emit_config(&socket, &ctx).await;
            });
        }
    });
}
