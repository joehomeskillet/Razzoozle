//! The four public /submit socket handlers. Validation order is LOAD-BEARING and
//! mirrors the Node handlers (packages/socket/src/handlers/manager/generate-image.ts
//! + submitMedia.{edit,enhance,upload}.ts) exactly:
//!
//!  GENERATE_IMAGE:      length → secret → global-rate → gpu-throttle → enhance → txt2img
//!  EDIT_IMAGE:          validate → secret → global-rate → gpu-throttle → disk-read → enhance → img2img
//!  ENHANCE_PROMPT:      global-rate → per-client-rate → validate → secret → enhance (graceful, never errors)
//!  SUBMIT_UPLOAD_IMAGE: global-rate → per-client-rate → validate → byte-cap → save
//!
//! All error payloads are PLAIN i18n key strings (socketioxide does NOT spread
//! arrays; a `["x"]` would emit a JSON array, not the string). Success payloads
//! are plain objects: IMAGE_GENERATED/UPLOAD_IMAGE_SUCCESS {url}, PROMPT_ENHANCED {prompt}.

use chrono::Utc;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use sqlx::PgPool;
use std::path::Path;
use tracing::warn;

use super::{comfyui, config_root, throttle, MEDIA_UPLOAD_MAX_BYTES, PROMPT_MAX_LEN};
use crate::db;
use crate::http::RATE_LIMITER;
use crate::socket::manager::media::to_webp;
use crate::state::safe_asset_id;

/// Graceful enhance: enhanced prompt when the provider succeeds and its output is
/// secret-free, else the raw prompt (Ok+secret → raw, Err → raw). Never blocks.
async fn enhance_or_raw(prompt: &str) -> String {
    match comfyui::enhance_prompt(prompt).await {
        Ok(enhanced) if !throttle::matches_secret(&enhanced) => enhanced,
        _ => prompt.to_string(),
    }
}

// ── GENERATE_IMAGE ──────────────────────────────────────────────────────────
pub(super) fn register_generate_image(socket: &SocketRef, client_id: String) {
    socket.on(
        constants::manager::GENERATE_IMAGE,
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let client_id = client_id.clone();
            tokio::spawn(async move {
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                // 1. length 1..=300
                let len = prompt.chars().count();
                if len < 1 || len > PROMPT_MAX_LEN {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptInvalid")
                        .ok();
                    return;
                }

                // 2. secret scan
                if throttle::matches_secret(&prompt) {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptRejected")
                        .ok();
                    return;
                }

                // 3. global server-wide submission ceiling FIRST (no per-user side effect)
                if !RATE_LIMITER.check_global_submission_rate() {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 4. shared GPU throttle (cooldown + lifetime + hourly), durable clientId
                if let Err(key) = throttle::try_consume_image_gen_credit(&client_id) {
                    socket.emit(constants::manager::IMAGE_ERROR, key).ok();
                    return;
                }

                // 5. server-internal prompt-enhance (graceful skip on any failure)
                let final_prompt = enhance_or_raw(&prompt).await;

                // 6. txt2img
                match comfyui::generate_image(&final_prompt).await {
                    Ok(url) => {
                        socket
                            .emit(
                                constants::manager::IMAGE_GENERATED,
                                &serde_json::json!({ "url": url }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        warn!("GENERATE_IMAGE failed: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        },
    );
}

// ── EDIT_IMAGE ──────────────────────────────────────────────────────────────
pub(super) fn register_edit_image(socket: &SocketRef, client_id: String) {
    socket.on(
        constants::manager::EDIT_IMAGE,
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let client_id = client_id.clone();
            tokio::spawn(async move {
                let base_url = payload
                    .get("baseUrl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                // 1. validate: baseUrl 1..=300 + ^/media/ (anti-SSRF); prompt 1..=300.
                //    Node emits a single fixed key for any validator miss.
                let blen = base_url.chars().count();
                let plen = prompt.chars().count();
                if blen < 1
                    || blen > 300
                    || !base_url.starts_with("/media/")
                    || plen < 1
                    || plen > PROMPT_MAX_LEN
                {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptInvalid")
                        .ok();
                    return;
                }

                // 2. secret scan
                if throttle::matches_secret(&prompt) {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptRejected")
                        .ok();
                    return;
                }

                // 3. global rate
                if !RATE_LIMITER.check_global_submission_rate() {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 4. shared GPU throttle (SAME store as GENERATE_IMAGE)
                if let Err(key) = throttle::try_consume_image_gen_credit(&client_id) {
                    socket.emit(constants::manager::IMAGE_ERROR, key).ok();
                    return;
                }

                // 5. resolve base image to bytes via a DISK read (anti-SSRF)
                let base_bytes = match read_media_bytes(&base_url) {
                    Ok(b) => b,
                    Err(e) => {
                        warn!("EDIT_IMAGE base read failed: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                        return;
                    }
                };
                let ext = base_url
                    .rsplit('.')
                    .next()
                    .filter(|e| !e.is_empty() && e.len() <= 5)
                    .unwrap_or("png")
                    .to_string();

                // 6. graceful enhance
                let final_prompt = enhance_or_raw(&prompt).await;

                // 7. img2img
                match comfyui::generate_image_from_base(&base_bytes, &ext, &final_prompt).await {
                    Ok(url) => {
                        socket
                            .emit(
                                constants::manager::IMAGE_GENERATED,
                                &serde_json::json!({ "url": url }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        warn!("EDIT_IMAGE failed: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        },
    );
}

// ── ENHANCE_PROMPT ──────────────────────────────────────────────────────────
pub(super) fn register_enhance_prompt(socket: &SocketRef, client_id: String) {
    socket.on(
        constants::manager::ENHANCE_PROMPT,
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let client_id = client_id.clone();
            tokio::spawn(async move {
                // 1. global rate FIRST (no per-user side effect)
                if !RATE_LIMITER.check_global_submission_rate() {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 2. per-client submission throttle (3/60s, shared with upload), durable clientId
                if !RATE_LIMITER.check_submission_rate(&client_id) {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 3. validate prompt 1..=300
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let len = prompt.chars().count();
                if len < 1 || len > PROMPT_MAX_LEN {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptInvalid")
                        .ok();
                    return;
                }

                // 4. secret scan
                if throttle::matches_secret(&prompt) {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.promptRejected")
                        .ok();
                    return;
                }

                // 5. graceful enhance — this path NEVER errors (always emits PROMPT_ENHANCED)
                let result = enhance_or_raw(&prompt).await;
                socket
                    .emit(
                        constants::manager::PROMPT_ENHANCED,
                        &serde_json::json!({ "prompt": result }),
                    )
                    .ok();
            });
        },
    );
}

// ── SUBMIT_UPLOAD_IMAGE ─────────────────────────────────────────────────────
pub(super) fn register_submit_upload_image(
    socket: &SocketRef,
    client_id: String,
    db_pool: Option<PgPool>,
) {
    socket.on(
        constants::manager::SUBMIT_UPLOAD_IMAGE,
        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let client_id = client_id.clone();
            let db_pool = db_pool.clone();
            tokio::spawn(async move {
                // 1. global rate
                if !RATE_LIMITER.check_global_submission_rate() {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 2. per-client submission throttle (shared with ENHANCE_PROMPT)
                if !RATE_LIMITER.check_submission_rate(&client_id) {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:submission.rateLimited")
                        .ok();
                    return;
                }

                // 3. validate: filename 1..=200 + dataUrl ^data:image/ (image only, NO audio)
                let filename = payload
                    .get("filename")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let data_url = payload
                    .get("dataUrl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                if filename.is_empty()
                    || filename.chars().count() > 200
                    || !data_url.starts_with("data:image/")
                {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:media.invalidDataUrl")
                        .ok();
                    return;
                }

                // 4. decode + byte cap (8 MB) BEFORE the save/transcode path (#21 gap)
                let (mime, bytes) = match decode_image_data_url(&data_url) {
                    Ok(v) => v,
                    Err(e) => {
                        socket.emit(constants::manager::IMAGE_ERROR, e).ok();
                        return;
                    }
                };
                if bytes.len() > MEDIA_UPLOAD_MAX_BYTES {
                    socket
                        .emit(constants::manager::IMAGE_ERROR, "errors:media.tooLarge")
                        .ok();
                    return;
                }

                // 5. transcode to WebP + persist to config/media/questions/ (category hardcoded)
                match save_upload_image(&mime, &bytes, &filename) {
                    Ok(saved) => {
                        let uploaded_at = Utc::now();
                        if let Err(e) = db::insert_media_asset(
                            &db_pool,
                            &saved.asset_id,
                            &saved.filename,
                            &saved.url,
                            saved.size,
                            "image",
                            "questions",
                            "upload",
                            Some(saved.width),
                            Some(saved.height),
                            uploaded_at,
                            &saved.bytes,
                        )
                        .await
                        {
                            warn!("SUBMIT_UPLOAD_IMAGE PG insert failed: {}", e);
                            socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                            return;
                        }

                        socket
                            .emit(
                                constants::manager::UPLOAD_IMAGE_SUCCESS,
                                &serde_json::json!({ "url": saved.url }),
                            )
                            .ok();
                    }
                    Err(e) => {
                        warn!("SUBMIT_UPLOAD_IMAGE failed: {}", e);
                        socket.emit(constants::manager::IMAGE_ERROR, &e).ok();
                    }
                }
            });
        },
    );
}

// ── helpers ─────────────────────────────────────────────────────────────────

/// Resolve a same-origin `/media/<category>/<file>` URL to bytes via a DISK READ
/// (anti-SSRF — NEVER a network fetch of a client-supplied URL). Mirrors Node's
/// readMediaBytes: split into exactly <category>/<file>, validate both segments
/// with `safe_asset_id`, then a canonicalized-containment guard under the media root.
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

/// Split a `data:<mime>;base64,<payload>` URL into (mime, decoded bytes), reusing
/// the crate's base64 decoder. Returns the invalid-data-url key on any mismatch.
fn decode_image_data_url(data_url: &str) -> Result<(String, Vec<u8>), &'static str> {
    let rest = data_url
        .strip_prefix("data:")
        .ok_or("errors:media.invalidDataUrl")?;
    let (mime, payload) = rest
        .split_once(";base64,")
        .ok_or("errors:media.invalidDataUrl")?;
    let bytes = crate::socket::manager::theme::decode_base64(payload)
        .map_err(|_| "errors:media.invalidDataUrl")?;
    Ok((mime.to_string(), bytes))
}

/// Image MIME allowlist (png/jpeg/webp — no audio/video). All stored outputs are `.webp`.
fn image_mime_allowed(mime: &str) -> bool {
    mime.starts_with("image/png")
        || mime.starts_with("image/jpeg")
        || mime.starts_with("image/webp")
}

/// Normalize a client filename stem to a safe slug (lowercase alnum/_/-, ≤64).
fn normalize_stem(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");

    let norm: String = stem
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<&str>>()
        .join("-")
        .chars()
        .take(64)
        .collect();

    if norm.is_empty() {
        "media".to_string()
    } else {
        norm
    }
}

struct SavedUploadImage {
    asset_id: String,
    filename: String,
    url: String,
    size: i32,
    width: i32,
    height: i32,
    bytes: Vec<u8>,
}

/// Persist a public upload to config/media/questions/ with a server-generated
/// name (`<stem>-<id>.webp`). Image-only MIME; bytes are transcoded to WebP first.
fn save_upload_image(mime: &str, bytes: &[u8], filename: &str) -> Result<SavedUploadImage, String> {
    if !image_mime_allowed(mime) {
        return Err("errors:media.invalidDataUrl".to_string());
    }

    let (webp_bytes, width, height) = to_webp(bytes)?;
    let stem = normalize_stem(filename);
    let id: String = uuid::Uuid::new_v4().simple().to_string().chars().take(8).collect();
    let stored = format!("{}-{}.webp", stem, id);
    let filename_stem = stored.rsplit_once('.').map(|(s, _)| s).unwrap_or(&stored);
    let asset_id = format!("questions-{}", filename_stem);
    safe_asset_id(&asset_id).map_err(|_| "errors:media.saveFailed".to_string())?;

    let dir = config_root().join("media").join("questions");
    std::fs::create_dir_all(&dir).map_err(|_| "errors:media.saveFailed".to_string())?;
    std::fs::write(dir.join(&stored), &webp_bytes)
        .map_err(|_| "errors:media.saveFailed".to_string())?;

    Ok(SavedUploadImage {
        asset_id,
        filename: stored.clone(),
        url: format!("/media/questions/{}", stored),
        size: webp_bytes.len() as i32,
        width: width as i32,
        height: height as i32,
        bytes: webp_bytes,
    })
}
