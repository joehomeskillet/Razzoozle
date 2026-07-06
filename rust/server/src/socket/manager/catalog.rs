//! CATALOG — reusable question bank handlers (auth-gated manager handlers)
//! catalog:list -> catalog:data (list all entries)
//! catalog:add (save entry)
//! catalog:update (update entry)
//! catalog:delete (delete entry)

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_catalog_list(socket, ctx.clone());
    register_catalog_add(socket, ctx.clone());
    register_catalog_update(socket, ctx.clone());
    register_catalog_delete(socket, ctx.clone());
}

fn register_catalog_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::catalog::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
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

                // Fetch and emit catalog data
                let catalog = db::get_catalog(&ctx.db_pool).await;
                socket.emit(constants::catalog::DATA, &catalog).ok();
            });
        }
    });
}

fn register_catalog_add(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::catalog::ADD, {
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

                // Validate payload structure: { question: {...}, tags?: [...] }
                let question = match payload.get("question") {
                    Some(q) if q.is_object() => q.clone(),
                    _ => {
                        socket
                            .emit(
                                constants::catalog::ERROR,
                                &"Invalid or missing question object",
                            )
                            .ok();
                        return;
                    }
                };

                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));
                let source = payload
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("manual")
                    .to_string();

                // Persist to DB
                match db::insert_catalog_entry_with_tags(&ctx.db_pool, &question, &source, &tags).await {
                    Ok(_id) => {
                        socket.emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({})).ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to add: {}", e);
                        socket
                            .emit(constants::catalog::ERROR, &err_msg)
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_catalog_update(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::catalog::UPDATE, {
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

                // Validate payload: { id: string, question: {...}, tags?: [...] }
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, &"Missing id in payload")
                            .ok();
                        return;
                    }
                };

                let question = match payload.get("question") {
                    Some(q) if q.is_object() => q.clone(),
                    _ => {
                        socket
                            .emit(constants::catalog::ERROR, &"Invalid or missing question object")
                            .ok();
                        return;
                    }
                };

                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));

                // Persist to DB
                match db::update_catalog_entry(&ctx.db_pool, &id, &question, &tags).await {
                    Ok(_) => {
                        socket.emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({})).ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to update: {}", e);
                        socket
                            .emit(constants::catalog::ERROR, &err_msg)
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_catalog_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::catalog::DELETE, {
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

                // Validate payload: { id: string }
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, &"Missing id in payload")
                            .ok();
                        return;
                    }
                };

                // Delete from DB
                match db::delete_catalog_entry(&ctx.db_pool, &id).await {
                    Ok(_) => {
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Err(e) => {
                        let err_msg = format!("Failed to delete: {}", e);
                        socket
                            .emit(constants::catalog::ERROR, &err_msg)
                            .ok();
                    }
                }
            });
        }
    });
}
