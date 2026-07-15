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

        move |socket: SocketRef, Data::<Option<serde_json::Value>>(payload)| {
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

                // Extract optional scope from payload
                let scope = payload
                    .as_ref()
                    .and_then(|p| p.get("scope"))
                    .and_then(|v| v.as_str());

                // Fetch and emit catalog data
                let catalog = db::get_catalog(&ctx.db_pool, me, scope).await;
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

                // Timestamp at handler level (Node parity: Date.now() in the handler)
                let added_at = chrono::Utc::now();

                // Persist to DB
                match db::insert_catalog_entry_with_tags(&ctx.db_pool, &question, &source, &tags, added_at, Some(user.user_id))
                    .await
                {
                    Ok(id) => {
                        socket
                            .emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({ "id": id.to_string() }))
                            .ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool, me, None).await;
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

                // Persist to DB (owner-scoped)
                match db::update_catalog_entry(&ctx.db_pool, &id, &question, &tags, me).await {
                    Ok(n) if n > 0 => {
                        socket
                            .emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({}))
                            .ok();
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool, me, None).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Ok(_) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
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

                // Delete from DB (owner-scoped)
                match db::delete_catalog_entry(&ctx.db_pool, &id, me).await {
                    Ok(n) if n > 0 => {
                        // Re-emit full catalog so connected admins stay in sync
                        let catalog = db::get_catalog(&ctx.db_pool, me, None).await;
                        socket.emit(constants::catalog::DATA, &catalog).ok();
                    }
                    Ok(_) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::catalog::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}
