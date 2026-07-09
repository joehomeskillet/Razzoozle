//! media_ai/ — public /submit AI-media pipeline (ComfyUI): GENERATE_IMAGE,
//! EDIT_IMAGE, ENHANCE_PROMPT, SUBMIT_UPLOAD_IMAGE. All are PUBLIC (NO auth):
//! the `manager:`-prefixed event names are a historical shared namespace, NOT
//! an auth boundary (parity with packages/socket handlers/manager/generate-image.ts
//! + submitMedia.{edit,enhance,upload}.ts).
//!
//! Wave 3c-gamma port — replaces the earlier mock (fictional `/api/*` endpoints,
//! no throttle, no secret-scan, no real disk save) with the FULL ComfyUI pipeline:
//!   - txt2img (`generate_image`) + img2img (`generate_image_from_base`) over HTTP,
//!   - shared GPU throttle stack (30s cooldown + 5/lifetime + 10/h, durable clientId),
//!   - secret-scan of the prompt, global + per-client submission rate limits,
//!   - server-internal prompt-enhance via the active text provider (graceful skip),
//!   - generated/uploaded bytes persisted under config/media/ (nginx-servable).
//!
//! Registered from main.rs (`media_ai::register`) — the module lives at crate
//! root (not socket/manager/) because main.rs already wired it here; keeping it
//! avoids a second, double-firing registration of the same four events.

use socketioxide::extract::SocketRef;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::state::GameRegistry;

mod comfyui;
mod handlers;
mod throttle;

// Mirrors packages/common/src/constants.ts (no shared Node/Rust validator crate).
pub(crate) const PROMPT_MAX_LEN: usize = 300;
pub(crate) const MEDIA_UPLOAD_MAX_BYTES: usize = 8_000_000;

/// Resolve the config root for local media I/O. Mirrors Node services/config.ts
/// getPath(): CONFIG_PATH env when set, else the sibling `config` dir two levels
/// up from CWD (rust/server -> ../../config).
pub(crate) fn config_root() -> std::path::PathBuf {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        std::path::PathBuf::from(config_path)
    } else {
        std::env::current_dir()
            .ok()
            .and_then(|cwd| cwd.parent().and_then(|p| p.parent()).map(|p| p.join("config")))
            .unwrap_or_else(|| std::path::PathBuf::from("config"))
    }
}

/// Register the four public AI-media handlers on a freshly-connected socket.
/// `client_id` is the durable handshake clientId (main.rs) — the throttle key
/// shared by GENERATE_IMAGE and EDIT_IMAGE so a reconnect can't reset the GPU
/// limits. `registry` is unused (imagegen carries no game state).
pub fn register(
    socket: &SocketRef,
    _registry: Arc<RwLock<GameRegistry>>,
    client_id: String,
    db_pool: Option<sqlx::PgPool>,
) {
    handlers::register_generate_image(socket, client_id.clone());
    handlers::register_edit_image(socket, client_id.clone());
    handlers::register_enhance_prompt(socket, client_id.clone());
    handlers::register_submit_upload_image(socket, client_id, db_pool);
}
