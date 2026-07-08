use super::super::super::HandlerCtx;
use super::apply::load_current_theme;
use crate::db;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::fs;
use std::path::Path;
use chrono::Utc;

const SKELETON_ASSET_MAX_BYTES: usize = 512 * 1024; // 512 KB

/// Result of set_skeleton_asset with optional revision snapshot
struct SetSkeletonResult {
    new_theme: serde_json::Value,
    revision_snapshot: Option<serde_json::Value>,
}

/// Set skeleton asset and update theme (no empty check, 512 KB size cap check)
fn set_skeleton_asset(kind: &str, content: &str, current_theme: &serde_json::Value) -> Result<SetSkeletonResult, String> {
    if kind != "css" && kind != "js" {
        return Err("errors:skeleton.invalidKind".to_string());
    }

    // Check size cap (512 KB) — Node checks Buffer.byteLength(content) > SKELETON_ASSET_MAX_BYTES
    if content.as_bytes().len() > SKELETON_ASSET_MAX_BYTES {
        return Err("errors:skeleton.assetTooLarge".to_string());
    }

    let skeleton_dir = Path::new("config/theme");
    if !skeleton_dir.exists() {
        fs::create_dir_all(skeleton_dir)
            .map_err(|_| "errors:theme.saveFailed".to_string())?;
    }

    let filename = format!("skeleton.{}", kind);
    let filepath = skeleton_dir.join(&filename);

    fs::write(&filepath, content)
        .map_err(|_| "errors:theme.saveFailed".to_string())?;

    let mut theme = current_theme.clone();

    let enabled_key = if kind == "css" {
        "customCssEnabled"
    } else {
        "customJsEnabled"
    };

    if let Some(obj) = theme.as_object_mut() {
        obj.insert(enabled_key.to_string(), serde_json::json!(true));

        let current_version = obj.get("skeletonVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        obj.insert("skeletonVersion".to_string(), serde_json::json!(current_version + 1));
    }

    // Build revision snapshot of current theme before overwriting
    let revision_snapshot = if let Some(cur) = load_current_theme() {
        let ts = Utc::now().timestamp_millis();
        let id = format!("rev-{}", ts);
        let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        Some(serde_json::json!({
            "id": id,
            "createdAt": created_at,
            "theme": cur
        }))
    } else {
        None
    };

    Ok(SetSkeletonResult {
        new_theme: theme,
        revision_snapshot,
    })
}

/// Reset skeleton to defaults, restoring DEFAULT_THEME
fn reset_skeleton(current_theme: &serde_json::Value) -> Result<(serde_json::Value, Option<serde_json::Value>), String> {
    let skeleton_dir = Path::new("config/theme");
    let _ = fs::remove_file(skeleton_dir.join("skeleton.css"));
    let _ = fs::remove_file(skeleton_dir.join("skeleton.js"));

    // Build revision snapshot of current theme before resetting
    let revision_snapshot = if let Some(cur) = load_current_theme() {
        let ts = Utc::now().timestamp_millis();
        let id = format!("rev-{}", ts);
        let created_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        Some(serde_json::json!({
            "id": id,
            "createdAt": created_at,
            "theme": cur
        }))
    } else {
        None
    };

    Ok((super::public::get_default_theme(), revision_snapshot))
}

pub(super) fn register_set_skeleton_asset(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::SET_SKELETON_ASSET, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, "")
                        .ok();
                    return;
                }

                let kind = match payload.get("kind").and_then(|v| v.as_str()) {
                    Some(k) if k == "css" || k == "js" => k,
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:skeleton.invalidKind")
                            .ok();
                        return;
                    }
                };

                let content = match payload.get("content").and_then(|v| v.as_str()) {
                    Some(c) => c,
                    None => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:skeleton.invalidContent")
                            .ok();
                        return;
                    }
                };

                let current_theme = match load_current_theme() {
                    Some(theme) => theme,
                    None => super::public::get_default_theme(),
                };

                match tokio::task::spawn_blocking({
                    let kind = kind.to_string();
                    let content = content.to_string();
                    move || set_skeleton_asset(&kind, &content, &current_theme)
                })
                .await
                {
                    Ok(Ok(result)) => {
                        // Save revision to DB (if snapshot exists)
                        if let Some(revision) = result.revision_snapshot {
                            let created_at = revision.get("createdAt")
                                .and_then(|v| v.as_str())
                                .unwrap_or("1970-01-01T00:00:00Z");
                            if let Err(e) = db::insert_theme_revision(&ctx.db_pool, &revision, created_at).await {
                                eprintln!("set_skeleton_asset — revision save failed (non-fatal): {}", e);
                            }
                        }

                        let theme_dir = Path::new("config/theme");
                        if let Err(_) = fs::create_dir_all(theme_dir) {
                            socket
                                .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                .ok();
                            return;
                        }

                        let theme_json = match serde_json::to_string_pretty(&result.new_theme) {
                            Ok(s) => s,
                            Err(_) => {
                                socket
                                    .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                    .ok();
                                return;
                            }
                        };

                        if let Err(_) = fs::write(theme_dir.join("theme.json"), theme_json) {
                            socket
                                .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                .ok();
                            return;
                        }

                        if let Err(e) = db::upsert_theme(&ctx.db_pool, &result.new_theme).await {
                            eprintln!("set_skeleton_asset — DB mirror failed: {}", e);
                        }

                        socket.broadcast()
                            .emit(constants::manager::THEME, &result.new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::THEME, &result.new_theme)
                            .ok();
                        socket
                            .emit(
                                constants::manager::SET_SKELETON_ASSET_SUCCESS,
                                &serde_json::json!({ "kind": kind })
                            )
                            .ok();
                    }
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

pub(super) fn register_reset_skeleton(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::RESET_SKELETON, {
        let ctx = ctx.clone();

        move |socket: SocketRef| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                let is_logged = {
                    let registry = ctx.registry.read().await;
                    registry.is_logged(&ctx.client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, "")
                        .ok();
                    return;
                }

                let current_theme = match load_current_theme() {
                    Some(theme) => theme,
                    None => super::public::get_default_theme(),
                };

                match tokio::task::spawn_blocking({
                    let current = current_theme.clone();
                    move || reset_skeleton(&current)
                })
                .await
                {
                    Ok(Ok((new_theme, revision_snapshot))) => {
                        // Save revision to DB (if snapshot exists)
                        if let Some(revision) = revision_snapshot {
                            let created_at = revision.get("createdAt")
                                .and_then(|v| v.as_str())
                                .unwrap_or("1970-01-01T00:00:00Z");
                            if let Err(e) = db::insert_theme_revision(&ctx.db_pool, &revision, created_at).await {
                                eprintln!("reset_skeleton — revision save failed (non-fatal): {}", e);
                            }
                        }

                        let theme_dir = Path::new("config/theme");
                        if let Err(_) = fs::create_dir_all(theme_dir) {
                            socket
                                .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                .ok();
                            return;
                        }

                        let theme_json = match serde_json::to_string_pretty(&new_theme) {
                            Ok(s) => s,
                            Err(_) => {
                                socket
                                    .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                    .ok();
                                return;
                            }
                        };

                        if let Err(_) = fs::write(theme_dir.join("theme.json"), theme_json) {
                            socket
                                .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                                .ok();
                            return;
                        }

                        if let Err(e) = db::upsert_theme(&ctx.db_pool, &new_theme).await {
                            eprintln!("reset_skeleton — DB mirror failed: {}", e);
                        }

                        socket.broadcast()
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::THEME, &new_theme)
                            .ok();
                        socket
                            .emit(constants::manager::RESET_SKELETON_SUCCESS, "")
                            .ok();
                    }
                    _ => {
                        socket
                            .emit(constants::manager::THEME_ERROR, "errors:theme.saveFailed")
                            .ok();
                    }
                }
            });
        }
    });
}
