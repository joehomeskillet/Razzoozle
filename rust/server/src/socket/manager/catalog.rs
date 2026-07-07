//! CATALOG — reusable question bank handlers (auth-gated manager handlers)
//! catalog:list -> catalog:data (list all entries)
//! catalog:add (save entry)
//! catalog:update (update entry)
//! catalog:delete (delete entry)

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use razzoozle_protocol::quizz::Question;
use socketioxide::extract::{Data, SocketRef};
use serde_json;

const CATALOG_SOURCES: &[&str] = &["manual", "submission", "editor", "ai"];

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_catalog_list(socket, ctx.clone());
    register_catalog_add(socket, ctx.clone());
    register_catalog_update(socket, ctx.clone());
    register_catalog_delete(socket, ctx.clone());
}

fn validate_question(question: &serde_json::Value) -> Result<(), String> {
    serde_json::from_value::<Question>(question.clone())
        .map_err(|_| "Invalid question: does not match Question schema".to_string())?;
    Ok(())
}

fn validate_tags(tags: &serde_json::Value) -> Result<(), String> {
    match tags {
        serde_json::Value::Array(arr) => {
            if arr.len() > 20 {
                return Err("tags must contain at most 20 items".to_string());
            }
            for tag in arr {
                match tag {
                    serde_json::Value::String(s) => {
                        if s.len() < 1 || s.len() > 40 {
                            return Err("each tag must be between 1 and 40 characters".to_string());
                        }
                    }
                    _ => return Err("tags must be an array of strings".to_string()),
                }
            }
            Ok(())
        }
        serde_json::Value::Null => Ok(()),
        _ => Err("tags must be an array".to_string()),
    }
}

fn validate_source(source: &str) -> Result<(), String> {
    if CATALOG_SOURCES.contains(&source) {
        Ok(())
    } else {
        Err(format!(
            "source must be one of: {}",
            CATALOG_SOURCES.join(", ")
        ))
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
                            .emit(constants::catalog::ERROR, &"question is required")
                            .ok();
                        return;
                    }
                };

                if let Err(e) = validate_question(&question) {
                    socket.emit(constants::catalog::ERROR, &e).ok();
                    return;
                }

                // Extract and validate tags
                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));

                if let Err(e) = validate_tags(&tags) {
                    socket.emit(constants::catalog::ERROR, &e).ok();
                    return;
                }

                // Extract and validate source
                let source = payload
                    .get("source")
                    .and_then(|v| v.as_str())
                    .unwrap_or("manual")
                    .to_string();

                if let Err(e) = validate_source(&source) {
                    socket.emit(constants::catalog::ERROR, &e).ok();
                    return;
                }

                // Persist to DB
                match db::insert_catalog_entry_with_tags(&ctx.db_pool, &question, &source, &tags).await {
                    Ok(_id) => {
                        socket.emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({})).ok();
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
                            .emit(constants::catalog::ERROR, &"id is required")
                            .ok();
                        return;
                    }
                };

                // Extract and validate question
                let question = match payload.get("question") {
                    Some(q) => q.clone(),
                    None => {
                        socket
                            .emit(constants::catalog::ERROR, &"question is required")
                            .ok();
                        return;
                    }
                };

                if let Err(e) = validate_question(&question) {
                    socket.emit(constants::catalog::ERROR, &e).ok();
                    return;
                }

                // Extract and validate tags
                let tags = payload
                    .get("tags")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!([]));

                if let Err(e) = validate_tags(&tags) {
                    socket.emit(constants::catalog::ERROR, &e).ok();
                    return;
                }

                // Persist to DB
                match db::update_catalog_entry(&ctx.db_pool, &id, &question, &tags).await {
                    Ok(_) => {
                        socket.emit(constants::catalog::ADD_SUCCESS, &serde_json::json!({})).ok();
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
                            .emit(constants::catalog::ERROR, &"id is required")
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
