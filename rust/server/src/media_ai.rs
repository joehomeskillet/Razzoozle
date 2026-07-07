//! media_ai.rs — OWNS: AI/media handlers for ComfyUI integration (image generation, editing, prompt enhancement, upload)
//!
//! #23 parity fix (fix/rust-mediaai-parity): GENERATE_IMAGE, EDIT_IMAGE,
//! ENHANCE_PROMPT and SUBMIT_UPLOAD_IMAGE are all PUBLIC events used by the
//! anonymous /submit flow in Node — despite the `manager:`-prefixed event
//! names (historical/shared namespace, NOT an auth boundary; see
//! packages/socket/src/handlers/manager/generate-image.ts:14 "Public AI image
//! generation (NO auth)"). The auth gates previously here were INVERTED vs
//! Node and have been removed. EDIT_IMAGE resolves its base image via a local
//! DISK READ (mirrors submitMedia.edit.ts#readMediaBytes) — never a network
//! fetch of a client-supplied URL — to avoid SSRF.

use crate::state::safe_asset_id;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use tracing::{info, warn};

const DEFAULT_COMFYUI_URL: &str = "http://127.0.0.1:8188";

// Mirrors packages/common/src/constants.ts — PROMPT_MAX_LEN / MEDIA_UPLOAD_MAX_BYTES.
// No shared validator crate to reuse across the Node/Rust boundary; these are a
// minimal same-value reimplementation (no new dependency/infra).
const PROMPT_MAX_LEN: usize = 300;
const MEDIA_UPLOAD_MAX_BYTES: usize = 8_000_000;

/// Get the configured ComfyUI base URL
fn get_comfyui_base_url() -> String {
    std::env::var("COMFYUI_URL").unwrap_or_else(|_| DEFAULT_COMFYUI_URL.to_string())
}

/// Minimal prompt-shape validation (non-empty + length cap). Mirrors Node's
/// zod `z.string().min(1).max(PROMPT_MAX_LEN)` on GENERATE_IMAGE/EDIT_IMAGE.
/// TODO(parity): Node also secret-scans the prompt (SECRET_PATTERNS) and
/// enforces a global+per-client GPU rate limit
/// (checkGlobalSubmissionRate + tryConsumeImageGenCredit, SHARED between
/// GENERATE_IMAGE and EDIT_IMAGE) before dispatch. Rust has no reusable
/// equivalent — state.rs::RateLimiter is purpose-built for solo-play/auth
/// throttling and reusing its maps here would cross-share an unrelated quota
/// with an unrelated feature, so it is intentionally NOT wired in. Not
/// implemented; needs new shared infra.
fn validate_prompt(prompt: &str) -> Result<(), &'static str> {
    if prompt.is_empty() || prompt.chars().count() > PROMPT_MAX_LEN {
        Err("errors:submission.promptInvalid")
    } else {
        Ok(())
    }
}

/// Resolve the config root directory for local media storage. Mirrors both
/// Node's services/config.ts#getPath() and this crate's own
/// state.rs#get_config_path() fallback: CONFIG_PATH env var when set, else the
/// sibling "config" dir two levels up from CWD (rust/server -> ../../config).
fn config_root() -> std::path::PathBuf {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        std::path::PathBuf::from(config_path)
    } else {
        std::env::current_dir()
            .ok()
            .and_then(|cwd| cwd.parent().and_then(|p| p.parent()).map(|p| p.join("config")))
            .unwrap_or_else(|| std::path::PathBuf::from("config"))
    }
}

/// Resolve a same-origin `/media/<category>/<file>` URL to bytes via a DISK
/// READ — mirrors Node's `readMediaBytes` (submitMedia.edit.ts) anti-SSRF
/// strategy: NEVER a network fetch of a client-supplied URL. Both path
/// segments are validated with the crate's existing `safe_asset_id` guard
/// (state.rs, already used for quiz/result/plugin asset ids) before touching
/// disk, then the resolved path is re-checked to stay under the media root.
fn read_media_bytes(base_url: &str) -> Result<Vec<u8>, String> {
    let rest = base_url
        .strip_prefix("/media/")
        .ok_or_else(|| "errors:media.invalidUrl".to_string())?;

    let segments: Vec<&str> = rest.split('/').collect();
    if segments.len() != 2 || segments.iter().any(|s| s.is_empty()) {
        return Err("errors:media.invalidUrl".to_string());
    }
    let (category, file) = (segments[0], segments[1]);

    let stem = file.rsplit_once('.').map(|(s, _)| s).unwrap_or(file);
    if safe_asset_id(category).is_err() || safe_asset_id(stem).is_err() {
        return Err("errors:media.invalidUrl".to_string());
    }

    let root = config_root().join("media");
    let target = root.join(category).join(file);

    let canonical_root = root
        .canonicalize()
        .map_err(|_| "errors:media.invalidUrl".to_string())?;
    let canonical_target = target
        .canonicalize()
        .map_err(|_| "errors:media.invalidUrl".to_string())?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("errors:media.invalidUrl".to_string());
    }

    std::fs::read(&canonical_target).map_err(|_| "errors:media.invalidUrl".to_string())
}

/// Approximate decoded byte length of a `data:<mime>;base64,<payload>` string
/// without a base64 crate (none available; adding one is out of scope). Close
/// enough to Node's `decodedByteLength()` (submitMedia.upload.ts) to reject
/// grossly-oversized payloads before forwarding them.
fn approx_base64_len(data_url: &str) -> Option<usize> {
    let comma = data_url.find(',')?;
    if !data_url[..comma].ends_with(";base64") {
        return None;
    }
    let payload = &data_url[comma + 1..];
    let len = payload.len();
    let padding = payload.chars().rev().take_while(|&c| c == '=').count();
    Some((len / 4 * 3).saturating_sub(padding))
}

pub fn register(socket: &SocketRef, _registry: std::sync::Arc<tokio::sync::RwLock<crate::state::GameRegistry>>, _client_id: String) {
    // GENERATE_IMAGE: Create image from text prompt — PUBLIC, NO auth (parity fix).
    socket.on(constants::manager::GENERATE_IMAGE, {
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            tokio::spawn(async move {
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if let Err(err) = validate_prompt(prompt) {
                    socket.emit(constants::manager::IMAGE_ERROR, &err).ok();
                    return;
                }

                info!("GENERATE_IMAGE: prompt={}", prompt);

                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_generate(&comfyui_url, prompt).await {
                    Ok(url) => {
                        socket
                            .emit(constants::manager::IMAGE_GENERATED, &serde_json::json!({ "url": url }))
                            .ok();
                    }
                    Err(e) => {
                        warn!("GENERATE_IMAGE error: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // EDIT_IMAGE: img2img edit — PUBLIC, NO auth (parity fix). Payload shape
    // matches the client contract {baseUrl, prompt} (was {imageUrl, editPrompt}).
    socket.on(constants::manager::EDIT_IMAGE, {
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            tokio::spawn(async move {
                let base_url = payload
                    .get("baseUrl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if base_url.is_empty() || base_url.len() > 300 || validate_prompt(prompt).is_err() {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, &"errors:submission.promptInvalid")
                        .ok();
                    return;
                }

                info!("EDIT_IMAGE: baseUrl={}, prompt={}", base_url, prompt);

                // Anti-SSRF: resolve the base image via a LOCAL DISK READ of the
                // same-origin /media/... path — NEVER a network fetch of a
                // client-supplied URL.
                let base_bytes = match read_media_bytes(base_url) {
                    Ok(bytes) => bytes,
                    Err(e) => {
                        warn!("EDIT_IMAGE invalid base image: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                        return;
                    }
                };

                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_edit(&comfyui_url, &base_bytes, prompt).await {
                    Ok(url) => {
                        socket
                            .emit(constants::manager::IMAGE_GENERATED, &serde_json::json!({ "url": url }))
                            .ok();
                    }
                    Err(e) => {
                        warn!("EDIT_IMAGE error: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        }
    });

    // ENHANCE_PROMPT: prompt-enhance preview — PUBLIC, NO auth, and MUST NEVER
    // error the path (parity fix). On ANY failure (missing prompt, enhance-call
    // failure) fall back to the raw prompt and ALWAYS emit PROMPT_ENHANCED
    // {prompt} — never IMAGE_ERROR.
    socket.on(constants::manager::ENHANCE_PROMPT, {
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            tokio::spawn(async move {
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                info!("ENHANCE_PROMPT: original={}", prompt);

                let result = if prompt.is_empty() {
                    prompt.clone()
                } else {
                    let comfyui_url = get_comfyui_base_url();
                    match call_comfyui_enhance(&comfyui_url, &prompt).await {
                        Ok(enhanced) => enhanced,
                        Err(e) => {
                            warn!("ENHANCE_PROMPT fell back to raw prompt: {}", e);
                            prompt.clone()
                        }
                    }
                };

                socket
                    .emit(constants::manager::PROMPT_ENHANCED, &serde_json::json!({ "prompt": result }))
                    .ok();
            });
        }
    });

    // SUBMIT_UPLOAD_IMAGE: public image upload — PUBLIC, NO auth (parity fix).
    // Payload shape matches the client contract {filename, dataUrl} (was
    // {imageData, filename}); success now emits {url} (was {imageUrl, filename}).
    socket.on(constants::manager::SUBMIT_UPLOAD_IMAGE, {
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            tokio::spawn(async move {
                let filename = payload
                    .get("filename")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let data_url = payload
                    .get("dataUrl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if filename.is_empty() || filename.len() > 200 || !data_url.starts_with("data:image/") {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, &"errors:media.invalidDataUrl")
                        .ok();
                    return;
                }

                // Byte cap BEFORE forwarding (mirrors Node's #21 gap-closing check
                // in submitMedia.upload.ts — decode-and-reject-oversize before the
                // expensive save/transcode path).
                if let Some(len) = approx_base64_len(data_url) {
                    if len > MEDIA_UPLOAD_MAX_BYTES {
                        socket
                            .emit(constants::manager::IMAGE_ERROR, &"errors:media.tooLarge")
                            .ok();
                        return;
                    }
                }

                info!("SUBMIT_UPLOAD_IMAGE: filename={}", filename);

                // NOTE(parity divergence — reported, not fixed): Node persists
                // via saveMediaFile() straight to local disk
                // (config/media/questions/<server-generated>.webp) plus a
                // media_assets manifest/DB row. Rust has no local-disk
                // media-save utility or media_assets INSERT path yet
                // (db::get_media_list is read-only) — kept the existing
                // ComfyUI-proxy backend rather than inventing new persistence
                // infra outside this file's scope; only the auth gate + public
                // client payload/response shapes were fixed here.
                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_upload(&comfyui_url, data_url, filename).await {
                    Ok(url) => {
                        socket
                            .emit(constants::manager::UPLOAD_IMAGE_SUCCESS, &serde_json::json!({ "url": url }))
                            .ok();
                    }
                    Err(e) => {
                        warn!("SUBMIT_UPLOAD_IMAGE error: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// ComfyUI HTTP API callers (mock implementations; real ones depend on ComfyUI)

async fn call_comfyui_generate(base_url: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/generate", base_url);

    let payload = serde_json::json!({
        "prompt": prompt
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) => {
                // Extract image URL from ComfyUI response
                body.get("imageUrl")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "No imageUrl in ComfyUI response".to_string())
            }
            Err(e) => Err(format!("Failed to parse ComfyUI response: {}", e)),
        },
        Err(e) => Err(format!("ComfyUI request failed: {}", e)),
    }
}

/// Edit an existing image. `image_bytes` are the base image bytes already
/// resolved from local disk by the caller (anti-SSRF — never a URL/fetch here).
async fn call_comfyui_edit(
    base_url: &str,
    image_bytes: &[u8],
    edit_prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/edit", base_url);

    match client
        .post(&url)
        .query(&[("prompt", edit_prompt)])
        .header("Content-Type", "application/octet-stream")
        .body(image_bytes.to_vec())
        .send()
        .await
    {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) => body
                .get("imageUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .ok_or_else(|| "No imageUrl in ComfyUI response".to_string()),
            Err(e) => Err(format!("Failed to parse ComfyUI response: {}", e)),
        },
        Err(e) => Err(format!("ComfyUI request failed: {}", e)),
    }
}

async fn call_comfyui_enhance(base_url: &str, prompt: &str) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/enhance", base_url);

    let payload = serde_json::json!({
        "prompt": prompt
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) => {
                body.get("enhancedPrompt")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "No enhancedPrompt in ComfyUI response".to_string())
            }
            Err(e) => Err(format!("Failed to parse ComfyUI response: {}", e)),
        },
        Err(e) => Err(format!("ComfyUI request failed: {}", e)),
    }
}

async fn call_comfyui_upload(
    base_url: &str,
    image_data: &str,
    filename: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/upload", base_url);

    let payload = serde_json::json!({
        "imageData": image_data,
        "filename": filename
    });

    match client.post(&url).json(&payload).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(body) => {
                body.get("imageUrl")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "No imageUrl in ComfyUI response".to_string())
            }
            Err(e) => Err(format!("Failed to parse ComfyUI response: {}", e)),
        },
        Err(e) => Err(format!("ComfyUI request failed: {}", e)),
    }
}
