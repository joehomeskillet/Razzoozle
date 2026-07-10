//! MANAGER PLUGIN SYSTEM (WP2 parity) — install / remove / set-config
//!
//! manager:pluginInstall   — base64 ZIP → validate + extract to config/plugins/<id>/
//! manager:pluginRemove    — delete config/plugins/<id>/ + index entry
//! manager:pluginSetConfig — shallow-merge a config bag into the index entry
//!
//! Node source of truth: packages/socket/src/handlers/manager/plugins.ts +
//! packages/socket/src/services/config/plugins.ts.
//!
//! Substrate ruling (spec_plugins.md ORCHESTRATOR-VERIFIKATION): source of truth
//! is DISK — config/plugins/index.json (shared with Node via the host config
//! mount). The installed_plugins DB table mirrors the disk index for boot-hydrate
//! parity: upsert on install/setConfig, delete on remove.
//!
//! HONEST DEFER (documented, no fake success): Node's loadPlugin/unloadPlugin
//! execute the plugin's server.js hook in the JS runtime. Rust cannot run
//! plugin JS — server-hook plugins only run on the Node backend. This module
//! covers file/index management + broadcast only; UI assets are served by the
//! existing /plugins/:id/* static route.

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use razzoozle_protocol::manager::InstalledPlugin;
use serde_json::Value;
use socketioxide::extract::{Data, SocketRef};
use tracing;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};


/// Simple base64 encoder (no external dependency)
fn encode_base64(bytes: &[u8]) -> String {
    const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    let mut buf = 0u32;
    let mut bits = 0;

    for &byte in bytes {
        buf = (buf << 8) | (byte as u32);
        bits += 8;

        while bits >= 6 {
            bits -= 6;
            let idx = ((buf >> bits) & 0x3f) as usize;
            result.push(BASE64_CHARS[idx] as char);
        }
    }

    if bits > 0 {
        buf <<= 6 - bits;
        let idx = (buf & 0x3f) as usize;
        result.push(BASE64_CHARS[idx] as char);
    }

    while result.len() % 4 != 0 {
        result.push('=');
    }

    result
}

/// Mirror of Node PLUGIN_REVISIONS_MAX (= THEME_REVISIONS_MAX, constants.ts).
const PLUGIN_REVISIONS_MAX: usize = 10;

// ── Paths (config/plugins/*, resolved via CONFIG_PATH like every other
//    config consumer — NOT a cwd-relative literal, or the container mount
//    (ADR rust-container-host-config-mount) silently diverges from Node) ─────

fn plugins_root() -> PathBuf {
    Path::new(&crate::http::get_config_path()).join("plugins")
}

pub(crate) fn plugin_dir(id: &str) -> PathBuf {
    plugins_root().join(id)
}

fn plugin_index_file() -> PathBuf {
    plugins_root().join("index.json")
}

fn plugin_revisions_file() -> PathBuf {
    plugins_root().join("plugin-revisions.json")
}

// ── Safe-id guard (Node services/config/shared.ts assertSafeId) ─────────────

/// Node SAFE_ID = /^[A-Za-z0-9_-]+$/ plus the prototype-pollution deny-set
/// ("constructor"/"prototype" pass the plugin-id regex, so this re-assertion
/// is not redundant). On violation Node throws Error("Invalid id") — that
/// plain message is what reaches the client via manager:errorMessage.
pub(crate) fn is_generic_safe_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        && !matches!(id, "__proto__" | "constructor" | "prototype")
}

// ── Index read/write (Node readPlugins / writePlugins) ──────────────────────

/// Lenient per-entry parse mirroring Node's installedPluginValidator zod
/// semantics: id/name/version strings + enabled bool required; capabilities
/// defaults to [] when absent (but must be all-strings when present); config
/// optional (must be an object when present). Invalid entries are skipped —
/// never the whole list.
fn parse_installed_plugin(v: &Value) -> Option<InstalledPlugin> {
    let o = v.as_object()?;
    let id = o.get("id")?.as_str()?.to_string();
    let name = o.get("name")?.as_str()?.to_string();
    let version = o.get("version")?.as_str()?.to_string();
    let enabled = o.get("enabled")?.as_bool()?;

    let capabilities = match o.get("capabilities") {
        None => Vec::new(),
        Some(Value::Array(a)) => {
            let mut out = Vec::with_capacity(a.len());
            for c in a {
                out.push(c.as_str()?.to_string());
            }
            out
        }
        Some(_) => return None,
    };

    let config: Option<HashMap<String, Value>> = match o.get("config") {
        None => None,
        Some(Value::Object(m)) => Some(m.iter().map(|(k, v)| (k.clone(), v.clone())).collect()),
        Some(_) => return None,
    };

    Some(InstalledPlugin {
        id,
        name,
        version,
        enabled,
        capabilities,
        config,
    })
}

/// Read config/plugins/index.json → Vec<InstalledPlugin>. A missing, corrupt
/// or non-array file yields [] (Node readPlugins never throws).
pub(crate) fn read_plugins_index() -> Vec<InstalledPlugin> {
    let Ok(raw) = fs::read_to_string(plugin_index_file()) else {
        return Vec::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let Some(arr) = parsed.as_array() else {
        return Vec::new();
    };

    arr.iter()
        .filter_map(|entry| {
            let plugin = parse_installed_plugin(entry);
            if plugin.is_none() {
                eprintln!("Invalid installed-plugin entry in plugins index");
            }
            plugin
        })
        .collect()
}

pub(super) fn write_plugins_index(plugins: &[InstalledPlugin]) -> std::io::Result<()> {
    fs::create_dir_all(plugins_root())?;
    let json = serde_json::to_string_pretty(plugins)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(plugin_index_file(), json)
}

/// Snapshot the current index.json into the rolling revisions ring BEFORE any
/// mutation (Node savePluginRevision): newest-first, capped at 10.
pub(super) fn save_plugin_revision() -> std::io::Result<()> {
    let now = chrono::Utc::now();
    let record = serde_json::json!({
        "id": format!("rev-{}", now.timestamp_millis()),
        "createdAt": now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "plugins": read_plugins_index(),
    });

    let prior: Vec<Value> = fs::read_to_string(plugin_revisions_file())
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let mut next = Vec::with_capacity(prior.len() + 1);
    next.push(record);
    next.extend(prior);
    next.truncate(PLUGIN_REVISIONS_MAX);

    fs::create_dir_all(plugins_root())?;
    let json = serde_json::to_string_pretty(&next)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    fs::write(plugin_revisions_file(), json)
}

// ── Store mutations (Node removePlugin / setPluginConfig) ───────────────────

fn remove_plugin(id: &str) -> std::io::Result<()> {
    save_plugin_revision()?;

    let dir = plugin_dir(id);
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }

    let list: Vec<InstalledPlugin> = read_plugins_index()
        .into_iter()
        .filter(|p| p.id != id)
        .collect();
    write_plugins_index(&list)
}

fn set_plugin_config(id: &str, config: &serde_json::Map<String, Value>) -> std::io::Result<()> {
    save_plugin_revision()?;

    let list: Vec<InstalledPlugin> = read_plugins_index()
        .into_iter()
        .map(|mut p| {
            if p.id == id {
                // Shallow merge, new fields override (Node {...existing, ...config}).
                let mut merged = p.config.take().unwrap_or_default();
                for (k, v) in config {
                    merged.insert(k.clone(), v.clone());
                }
                p.config = Some(merged);
            }
            p
        })
        .collect();
    // Unknown id → the map above is a no-op but the index is still rewritten,
    // exactly like Node's setPluginConfig (silent no-op, no error).
    write_plugins_index(&list)
}

// ── Broadcast (Node broadcastPlugins: fresh disk list → all + self) ─────────

fn broadcast_plugins(socket: &SocketRef) {
    let plugins = read_plugins_index();
    socket
        .broadcast()
        .emit(constants::manager::PLUGIN_CONFIG, &plugins)
        .ok();
    socket
        .emit(constants::manager::PLUGIN_CONFIG, &plugins)
        .ok();
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    register_plugin_install(socket, ctx.clone());
    register_plugin_remove(socket, ctx.clone());
    register_plugin_set_config(socket, ctx.clone());
}

/// Auth-gate shared by all three handlers (Node manager.withAuth →
/// UNAUTHORIZED to the sender, then stop).
async fn ensure_logged(socket: &SocketRef, ctx: &HandlerCtx) -> bool {
    let is_logged = {
        let registry = ctx.registry.read().await;
        registry.is_logged(&ctx.client_id)
    };

    if !is_logged {
        socket
            .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
            .ok();
    }

    is_logged
}

fn register_plugin_install(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PLUGIN_INSTALL, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if !ensure_logged(&socket, &ctx).await {
                    return;
                }

                let zip_b64 = match payload.get("zipBase64").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.invalidPayload")
                            .ok();
                        return;
                    }
                };

                // Pre-decode size cap: bound memory BEFORE base64-decoding
                // (Node PLUGIN_ZIP_MAX_B64_LEN, handlers/manager/plugins.ts:47).
                if zip_b64.len() > super::plugins_zip::PLUGIN_ZIP_MAX_B64_LEN {
                    socket
                        .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.tooLarge")
                        .ok();
                    return;
                }

                let result = tokio::task::spawn_blocking(move || {
                    // Node Buffer.from(s, "base64") is lenient and yields garbage
                    // bytes for junk input, which then fails ZIP parsing with a
                    // non-key message; our decoder rejects invalid chars up
                    // front → same catch-all key either way.
                    let bytes = super::theme::decode_base64(&zip_b64)
                        .map_err(|_| "errors:plugin.installFailed".to_string())?;
                    super::plugins_zip::import_plugin_zip(&bytes)
                })
                .await;

                match result {
                    Ok(Ok(installed)) => {
                        // DEFER (spec ruling 4): Node calls loadPlugin(installed)
                        // here to run the server.js hook. Rust has no JS runtime —
                        // server-hook plugins run on the Node backend only.
                        broadcast_plugins(&socket);

                        // Mirror to DB for boot-hydrate parity
                        let db_pool = ctx.db_pool.clone();
                        let plugin_id = installed.id.clone();
                        tokio::spawn(async move {
                            // Build files JSON map by walking plugin_dir
                            let mut files_map = serde_json::json!({});
                            let dir = plugin_dir(&plugin_id);
                            if let Ok(entries) = std::fs::read_dir(&dir) {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if path.is_file() && !path.is_symlink() {
                                        if let Ok(bytes) = std::fs::read(&path) {
                                            let b64 = encode_base64(&bytes);
                                            if let Some(relative) = path.strip_prefix(&dir).ok().and_then(|p| p.to_str()) {
                                                files_map[relative] = serde_json::json!(b64);
                                            }
                                        }
                                    }
                                }
                            }
                            if let Err(e) = crate::db::upsert_installed_plugin(&db_pool, &installed, &files_map).await {
                                tracing::error!(error = %e, "failed to mirror plugin to DB");
                            }
                        });
                    }
                    Ok(Err(msg)) => {
                        socket.emit(constants::manager::ERROR_MESSAGE, &msg).ok();
                    }
                    Err(_join_err) => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.installFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_plugin_remove(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PLUGIN_REMOVE, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if !ensure_logged(&socket, &ctx).await {
                    return;
                }

                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.invalidPayload")
                            .ok();
                        return;
                    }
                };

                // Node assertSafeId throws Error("Invalid id") → emitted raw.
                if !is_generic_safe_id(&id) {
                    socket.emit(constants::manager::ERROR_MESSAGE, "Invalid id").ok();
                    return;
                }

                // Clone id before it's moved into the spawn_blocking closure
                let id_for_pg = id.clone();

                // DEFER (spec ruling 4): Node calls unloadPlugin(id) before the
                // files are deleted. Rust never loaded a JS server hook, so
                // there is nothing to tear down here.
                let result = tokio::task::spawn_blocking(move || remove_plugin(&id)).await;

                match result {
                    Ok(Ok(())) => {
                        broadcast_plugins(&socket);

                        // Mirror to DB for boot-hydrate parity
                        let db_pool = ctx.db_pool.clone();
                        tokio::spawn(async move {
                            if let Err(e) = crate::db::delete_installed_plugin(&db_pool, &id_for_pg).await {
                                tracing::error!(error = %e, "failed to mirror plugin deletion to DB");
                            }
                        });
                    }
                    _ => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.removeFailed")
                            .ok();
                    }
                }
            });
        }
    });
}

fn register_plugin_set_config(socket: &SocketRef, ctx: HandlerCtx) {
    socket.on(constants::manager::PLUGIN_SET_CONFIG, {
        let ctx = ctx.clone();

        move |socket: SocketRef, Data::<Value>(payload)| {
            let ctx = ctx.clone();

            tokio::spawn(async move {
                if !ensure_logged(&socket, &ctx).await {
                    return;
                }

                let id = match payload.get("id").and_then(|v| v.as_str()) {
                    Some(s) => s.to_string(),
                    None => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.invalidPayload")
                            .ok();
                        return;
                    }
                };

                // Node's `typeof config === "object"` also admits arrays; we
                // deliberately tighten to plain objects (the real client only
                // sends objects; array-spread index-keys are a JS quirk).
                let config = match payload.get("config") {
                    Some(Value::Object(m)) => m.clone(),
                    _ => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.invalidPayload")
                            .ok();
                        return;
                    }
                };

                if !is_generic_safe_id(&id) {
                    socket.emit(constants::manager::ERROR_MESSAGE, "Invalid id").ok();
                    return;
                }

                // Clone id before it's moved into the spawn_blocking closure
                let id_for_pg = id.clone();

                let result =
                    tokio::task::spawn_blocking(move || set_plugin_config(&id, &config)).await;

                match result {
                    Ok(Ok(())) => {
                        broadcast_plugins(&socket);

                        // Mirror to DB for boot-hydrate parity
                        let db_pool = ctx.db_pool.clone();
                        tokio::spawn(async move {
                            if let Some(plugin) = read_plugins_index().into_iter().find(|p| p.id == id_for_pg) {
                                // Build files JSON map by walking plugin_dir
                                let mut files_map = serde_json::json!({});
                                let dir = plugin_dir(&id_for_pg);
                                if let Ok(entries) = std::fs::read_dir(&dir) {
                                    for entry in entries.flatten() {
                                        let path = entry.path();
                                        if path.is_file() && !path.is_symlink() {
                                            if let Ok(bytes) = std::fs::read(&path) {
                                                let b64 = encode_base64(&bytes);
                                                if let Some(relative) = path.strip_prefix(&dir).ok().and_then(|p| p.to_str()) {
                                                    files_map[relative] = serde_json::json!(b64);
                                                }
                                            }
                                        }
                                    }
                                }
                                if let Err(e) = crate::db::upsert_installed_plugin(&db_pool, &plugin, &files_map).await {
                                    tracing::error!(error = %e, "failed to mirror plugin config to DB");
                                }
                            }
                        });
                    }
                    _ => {
                        socket
                            .emit(constants::manager::ERROR_MESSAGE, "errors:plugin.configFailed")
                            .ok();
                    }
                }
            });
        }
    });
}
