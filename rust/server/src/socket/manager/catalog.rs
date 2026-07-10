//! CATALOG — reusable question bank handlers (auth-gated manager handlers)
//! catalog:list -> catalog:data (list all entries)
//! catalog:add (save entry)
//! catalog:update (update entry)
//! catalog:delete (delete entry)

use super::super::validation;
use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};

const CATALOG_SOURCES: &[&str] = &["manual", "submission", "editor", "ai"];

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_catalog_list(socket, ctx.clone());
    register_catalog_add(socket, ctx.clone());
    register_catalog_update(socket, ctx.clone());
    register_catalog_delete(socket, ctx.clone());
}

fn validate_tags(tags: &serde_json::Value) -> Result<(), &'static str> {
    match tags {
        serde_json::Value::Array(arr) => {
            if arr.len() > 20 {
                return Err("errors:catalog.invalid");
            }
            for tag in arr {
                match tag {
                    serde_json::Value::String(s) => {
                        // UTF-16 parity with JS string length: use scalar-count
                        // (chars) rather than UTF-8 byte length.
                        let n = s.chars().count();
                        if n < 1 || n > 40 {
                            return Err("errors:catalog.invalid");
                        }
                    }
                    _ => return Err("errors:catalog.invalid"),
                }
            }
            Ok(())
        }
        serde_json::Value::Null => Ok(()),
        _ => Err("errors:catalog.invalid"),
    }
}

fn validate_source(source: &str) -> Result<(), &'static str> {
    if CATALOG_SOURCES.contains(&source) {
        Ok(())
    } else {
        Err("errors:catalog.invalid")
    }
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

                // Extract and validate question
                let question = match payload.get("question") {
                    Some(q) => q.clone(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, "errors:catalog.invalid")
                            .ok();
                        return;
                    }
                };

                if let Err(e) = validation::validate_question(&question) {
                    socket.emit(constants::catalog::ERROR, e).ok();
                    return;
                }

                // Extract and validate tags
                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));

                if let Err(e) = validate_tags(&tags) {
                    socket.emit(constants::catalog::ERROR, e).ok();
                    return;
                }

                // Extract and validate source
                let source = payload
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("manual")
                    .to_string();

                if let Err(e) = validate_source(&source) {
                    socket.emit(constants::catalog::ERROR, e).ok();
                    return;
                }

                // Generate timestamp (matching Node's handler-level Date.now())
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                let added_at = chrono::DateTime::<chrono::Utc>::from(std::time::UNIX_EPOCH + std::time::Duration::from_millis(now as u64))
                    .to_rfc3339();

                // Persist to DB
                match db::insert_catalog_entry_with_tags(&ctx.db_pool, &question, &source, &tags, &added_at)
                    .await
                {
                    Ok(_id) => {
                        socket
                            .emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({}))
                            .ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Err(e) => {
                        socket.emit(constants::catalog::ERROR, &e).ok();
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

                // Extract and validate id
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, "errors:catalog.invalid")
                            .ok();
                        return;
                    }
                };

                // Extract and validate question
                let question = match payload.get("question") {
                    Some(q) => q.clone(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, "errors:catalog.invalid")
                            .ok();
                        return;
                    }
                };

                if let Err(e) = validation::validate_question(&question) {
                    socket.emit(constants::catalog::ERROR, e).ok();
                    return;
                }

                // Extract and validate tags
                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));

                if let Err(e) = validate_tags(&tags) {
                    socket.emit(constants::catalog::ERROR, e).ok();
                    return;
                }

                // Persist to DB
                match db::update_catalog_entry(&ctx.db_pool, &id, &question, &tags).await {
                    Ok(_) => {
                        socket
                            .emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({}))
                            .ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Err(e) => {
                        socket.emit(constants::catalog::ERROR, &e).ok();
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
                            .emit(constants::catalog::ERROR, "errors:catalog.invalid")
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
                        socket.emit(constants::catalog::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}
