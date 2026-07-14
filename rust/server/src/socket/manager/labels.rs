//! LABELS handlers — global label (Fach) management
//!
//! label:list — list all global labels (require_user, payloadless)
//! label:create — create a new label (require_admin)
//! label:update — update label name/color (require_admin)
//! label:delete — delete a label (require_admin, cascades to junctions)
//! label:assign — assign labels to an entity (require_user + entity visibility)

use super::super::HandlerCtx;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json::json;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_list(socket, ctx.clone());
    register_create(socket, ctx.clone());
    register_update(socket, ctx.clone());
    register_delete(socket, ctx.clone());
    register_assign(socket, ctx.clone());
}

fn register_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::label::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &json!({}))
                            .ok();
                        tracing::warn!("label:list denied — require_user failed");
                        return;
                    }
                };

                let labels = db::get_labels(&ctx.db_pool).await;
                socket
                    .emit(
                        constants::label::DATA,
                        &json!({"labels": labels}),
                    )
                    .ok();
            });
        }
    });
}

fn register_create(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::label::CREATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &json!({}))
                            .ok();
                        tracing::warn!("label:create denied — require_admin failed");
                        return;
                    }
                };

                let name = match payload.get("name").and_then(|v| v.as_str()) {
                    Some(n) if !n.is_empty() => n,
                    _ => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "name required"}))
                            .ok();
                        return;
                    }
                };

                let color = payload
                    .get("color")
                    .and_then(|v| v.as_str())
                    .unwrap_or("gray");

                match db::create_label(&ctx.db_pool, name, color).await {
                    Ok(_) => {
                        let labels = db::get_labels(&ctx.db_pool).await;
                        socket
                            .emit(constants::label::DATA, &json!({"labels": labels}))
                            .ok();
                    }
                    Err(e) => {
                        tracing::warn!("label:create failed: {}", e);
                        socket
                            .emit(
                                constants::label::ERROR,
                                &json!({"message": if e == "name_exists" { "name_exists" } else { "create_failed" }}),
                            )
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_update(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::label::UPDATE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &json!({}))
                            .ok();
                        tracing::warn!("label:update denied — require_admin failed");
                        return;
                    }
                };

                let label_id = match payload.get("id").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "id required"}))
                            .ok();
                        return;
                    }
                };

                let name = payload.get("name").and_then(|v| v.as_str());
                let color = payload.get("color").and_then(|v| v.as_str());

                match db::update_label(&ctx.db_pool, label_id, name, color).await {
                    Ok(0) => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "not_found"}))
                            .ok();
                    }
                    Ok(_) => {
                        let labels = db::get_labels(&ctx.db_pool).await;
                        socket
                            .emit(constants::label::DATA, &json!({"labels": labels}))
                            .ok();
                    }
                    Err(e) => {
                        tracing::warn!("label:update failed: {}", e);
                        socket
                            .emit(
                                constants::label::ERROR,
                                &json!({"message": if e == "name_exists" { "name_exists" } else { "update_failed" }}),
                            )
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::label::DELETE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let _user = match ctx.require_admin().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &json!({}))
                            .ok();
                        tracing::warn!("label:delete denied — require_admin failed");
                        return;
                    }
                };

                let label_id = match payload.get("id").and_then(|v| v.as_i64()) {
                    Some(id) => id,
                    _ => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "id required"}))
                            .ok();
                        return;
                    }
                };

                match db::delete_label(&ctx.db_pool, label_id).await {
                    Ok(0) => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "not_found"}))
                            .ok();
                    }
                    Ok(_) => {
                        let labels = db::get_labels(&ctx.db_pool).await;
                        socket
                            .emit(constants::label::DATA, &json!({"labels": labels}))
                            .ok();
                    }
                    Err(e) => {
                        tracing::warn!("label:delete failed: {}", e);
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "delete_failed"}))
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_assign(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::label::ASSIGN, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &json!({}))
                            .ok();
                        tracing::warn!("label:assign denied — require_user failed");
                        return;
                    }
                };

                // Gate on klassenEnabled
                let (_team_mode, _ll_enabled, _join_locked, _rand, _scoring, _ll_config, klassen_enabled, _end_screen) =
                    db::get_game_config(&ctx.db_pool).await;
                if !klassen_enabled.unwrap_or(false) {
                    socket
                        .emit(constants::label::ERROR, &json!({"message": "klassenEnabled_required"}))
                        .ok();
                    tracing::warn!("label:assign denied — klassenEnabled is false");
                    return;
                }

                let entity_type = match payload.get("entityType").and_then(|v| v.as_str()) {
                    Some("quizz" | "media" | "catalog") => payload.get("entityType").unwrap().as_str().unwrap(),
                    _ => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "invalid entity_type"}))
                            .ok();
                        return;
                    }
                };

                let entity_id = match payload.get("entityId").and_then(|v| v.as_str()) {
                    Some(id) => id,
                    _ => {
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "entityId required"}))
                            .ok();
                        return;
                    }
                };

                // Strict labelIds validation: reject if any value is not i64
                let empty_array = vec![];
                let label_ids_raw = payload
                    .get("labelIds")
                    .and_then(|v| v.as_array())
                    .unwrap_or(&empty_array);

                let mut label_ids = Vec::new();
                for val in label_ids_raw {
                    match val.as_i64() {
                        Some(id) => label_ids.push(id),
                        None => {
                            socket
                                .emit(constants::label::ERROR, &json!({"message": "invalid_label_ids"}))
                                .ok();
                            tracing::warn!("label:assign rejected — non-i64 labelIds value");
                            return;
                        }
                    }
                }

                // Check if labelIds count matches sent count (ensure no silent skipping)
                if label_ids.len() != label_ids_raw.len() {
                    socket
                        .emit(constants::label::ERROR, &json!({"message": "invalid_label_ids"}))
                        .ok();
                    tracing::warn!("label:assign rejected — labelIds count mismatch");
                    return;
                }

                // Entity visibility gate: check if user owns/can see the entity
                let me = if user.role == "admin" { None } else { Some(user.user_id) };
                let entity_exists = match entity_type {
                    "quizz" => db::quiz_is_visible(&ctx.db_pool, entity_id, me).await,
                    "media" => db::media_is_visible(&ctx.db_pool, entity_id, me).await,
                    "catalog" => db::catalog_is_visible(&ctx.db_pool, entity_id, me).await,
                    _ => false,
                };

                if !entity_exists {
                    socket
                        .emit(constants::label::ERROR, &json!({"message": "errors:label.entityNotOwned"}))
                        .ok();
                    tracing::warn!("label:assign denied — entity not visible to user: type={} id={} user_id={:?}", entity_type, entity_id, me);
                    return;
                }

                match db::assign_labels(&ctx.db_pool, entity_type, entity_id, &label_ids).await {
                    Ok(_) => {
                        socket
                            .emit(
                                constants::label::ASSIGNED,
                                &json!({
                                    "entityType": entity_type,
                                    "entityId": entity_id,
                                    "labelIds": label_ids
                                }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        tracing::warn!("label:assign failed: {}", e);
                        socket
                            .emit(constants::label::ERROR, &json!({"message": "assign_failed"}))
                            .ok();
                    }
                }
            });
        }
    });
}
