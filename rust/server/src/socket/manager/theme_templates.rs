//! THEME_TEMPLATE + THEME_REVISION handlers
//! themeTemplate:list -> themeTemplate:data (list all templates)
//! themeTemplate:save (create/update template with name dedup)
//! themeTemplate:delete (remove template)
//! themeRevision:list -> themeRevision:data (list revisions, newest-first)
//! themeRevision:restore (restore a revision snapshot)

use super::super::HandlerCtx;
use super::config_helper;
use super::theme;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json;
use uuid::Uuid;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_theme_template_list(socket, ctx.clone());
    register_theme_template_save(socket, ctx.clone());
    register_theme_template_delete(socket, ctx.clone());
    register_theme_revision_list(socket, ctx.clone());
    register_theme_revision_restore(socket, ctx);
}

/// Normalize a string to a safe ID slug: lowercase, replace spaces with hyphens,
/// remove non-alphanumeric except hyphens, and append a random 8-character suffix.
fn normalize_filename(s: &str) -> String {
    let slug = s
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c
            } else if c == ' ' {
                '-'
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|seg| !seg.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
        .chars()
        .take(10)
        .collect::<String>();

    let short_id = Uuid::new_v4()
        .to_string()
        .chars()
        .take(8)
        .collect::<String>();

    format!("{}-{}", slug, short_id)
}

fn register_theme_template_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::theme_template::LIST, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
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

                // Fetch and emit full theme templates (with theme payload)
                let templates = db::get_theme_templates_full(&ctx.db_pool, me).await;
                socket.emit(constants::theme_template::DATA, &templates).ok();
            });
        }
    });
}

fn register_theme_template_save(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::theme_template::SAVE, {
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

                // Extract name and theme
                let name = match payload.get("name").and_then(|v| v.as_str()) {
                    Some(n) => n.trim().to_string(),
                    None => {
                        socket
                            .emit(constants::theme_template::ERROR, &"name is required")
                            .ok();
                        return;
                    }
                };

                // Validate name: not empty, max 60 chars
                if name.is_empty() || name.len() > 60 {
                    socket
                        .emit(constants::theme_template::ERROR, &"name must be 1-60 characters")
                        .ok();
                    return;
                }

                let theme = match payload.get("theme") {
                    Some(t) => t.clone(),
                    None => {
                        socket
                            .emit(constants::theme_template::ERROR, &"theme is required")
                            .ok();
                        return;
                    }
                };

                // Validate theme using existing SET_THEME validator
                if let Err(e) = theme::validate_theme(&theme) {
                    socket.emit(constants::theme_template::ERROR, &e).ok();
                    return;
                }

                // Dedupe-on-save: find existing template with same display name
                // (case-insensitive, trimmed)
                let normalized_name = name.trim().to_lowercase();
                let existing_id = {
                    let templates = db::get_theme_templates_full(&ctx.db_pool, me).await;
                    templates
                        .iter()
                        .find(|t| {
                            t.get("name")
                                .and_then(|n| n.as_str())
                                .map(|n| n.trim().to_lowercase() == normalized_name)
                                .unwrap_or(false)
                        })
                        .and_then(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
                };

                let id = existing_id.unwrap_or_else(|| normalize_filename(&name));

                // Upsert to DB (owner-scoped DO UPDATE)
                match db::upsert_theme_template(
                    &ctx.db_pool,
                    &id,
                    &name,
                    &theme,
                    Some(user.user_id),
                    me,
                )
                .await
                {
                    Ok(n) if n > 0 => {
                        socket.emit(constants::theme_template::SAVE_SUCCESS, &serde_json::json!([])).ok();
                        // Re-emit full list so connected admins stay in sync
                        let templates = db::get_theme_templates_full(&ctx.db_pool, me).await;
                        socket.emit(constants::theme_template::DATA, &templates).ok();
                        // Re-emit full manager config
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Ok(_) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::theme_template::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

fn register_theme_template_delete(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::theme_template::DELETE, {
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

                // Extract id
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i.to_string(),
                    None => {
                        socket
                            .emit(constants::theme_template::ERROR, &"id is required")
                            .ok();
                        return;
                    }
                };

                // Delete from DB (owner-scoped)
                match db::delete_theme_template(&ctx.db_pool, &id, me).await {
                    Ok(n) if n > 0 => {
                        // Re-emit full list
                        let templates = db::get_theme_templates_full(&ctx.db_pool, me).await;
                        socket.emit(constants::theme_template::DATA, &templates).ok();
                        // Re-emit full manager config
                        config_helper::build_and_emit_config(&socket, &ctx).await;
                    }
                    Ok(_) => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                    }
                    Err(e) => {
                        socket.emit(constants::theme_template::ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

fn register_theme_revision_list(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::theme_revision::LIST_REVISIONS, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                // Auth-gate
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                            .ok();
                        return;
                    }
                };

                // Load revisions from database (newest-first, capped at 10)
                let revisions = db::list_theme_revisions(&ctx.db_pool).await;
                socket.emit(constants::theme_revision::DATA, &revisions).ok();
            });
        }
    });
}

fn register_theme_revision_restore(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::theme_revision::RESTORE_REVISION, {
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

                // Extract id
                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(i) => i,
                    None => {
                        socket
                            .emit(constants::theme_revision::ERROR, &"id is required")
                            .ok();
                        return;
                    }
                };

                // Find revision by id
                let revision = db::get_theme_revision_by_id(&ctx.db_pool, id).await;
                if revision.is_none() {
                    socket
                        .emit(constants::theme_revision::ERROR, &"errors:themeRevision.notFound")
                        .ok();
                    return;
                }

                let revision = revision.unwrap();
                let revision_theme = match revision.get("theme") {
                    Some(t) => t.clone(),
                    None => {
                        socket
                            .emit(constants::theme_revision::ERROR, &"errors:themeRevision.restoreFailed")
                            .ok();
                        return;
                    }
                };

                // Apply the theme (which snapshots the pre-restore state)
                match theme::apply_theme(&revision_theme, &ctx).await {
                    Ok(theme) => {
                        // Emit success with theme payload
                        socket.emit(constants::theme_revision::RESTORE_SUCCESS, &theme).ok();
                        // Broadcast to all OTHER clients
                        socket.broadcast()
                            .emit(constants::manager::THEME, &theme)
                            .ok();
                        // Re-emit fresh revisions to this socket
                        let revisions = db::list_theme_revisions(&ctx.db_pool).await;
                        socket.emit(constants::theme_revision::DATA, &revisions).ok();
                    }
                    Err(e) => {
                        socket
                            .emit(constants::theme_revision::ERROR, &e)
                            .ok();
                    }
                }
            });
        }
    });
}
