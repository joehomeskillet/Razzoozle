//! media_ai.rs — OWNS: AI/media handlers for ComfyUI integration (image generation, editing, prompt enhancement, upload)
//!
//! Each handler is manager:-only (auth-gated). ComfyUI SSRF protection: only configured host allowed.

use crate::state::GameRegistry;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

const DEFAULT_COMFYUI_URL: &str = "http://127.0.0.1:8188";

/// Get the configured ComfyUI base URL
fn get_comfyui_base_url() -> String {
    std::env::var("COMFYUI_URL").unwrap_or_else(|_| DEFAULT_COMFYUI_URL.to_string())
}

/// Extract host from a URL string for SSRF validation
fn extract_host(url_str: &str) -> Option<String> {
    url::Url::parse(url_str)
        .ok()
        .and_then(|u| u.host().map(|h| h.to_string()))
}

/// Validate that user-supplied URL is from the allowed ComfyUI host (SSRF guard)
fn validate_url_host(url: &str, allowed_url: &str) -> Result<(), String> {
    let allowed_host = extract_host(allowed_url)
        .ok_or_else(|| "Invalid allowed ComfyUI URL".to_string())?;

    let user_host = extract_host(url)
        .ok_or_else(|| "Invalid user-supplied URL".to_string())?;

    if user_host == allowed_host {
        Ok(())
    } else {
        Err(format!(
            "URL host {} does not match allowed ComfyUI host {}",
            user_host, allowed_host
        ))
    }
}

pub fn register(socket: &SocketRef, registry: Arc<RwLock<GameRegistry>>, client_id: String) {
    // GENERATE_IMAGE: Create image from text prompt
    socket.on(constants::manager::GENERATE_IMAGE, {
        let registry = Arc::clone(&registry);
        let client_id = client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = Arc::clone(&registry);
            let client_id = client_id.clone();

            tokio::spawn(async move {
                // Auth gate
                let is_logged = {
                    let registry = registry.read().await;
                    registry.is_logged(&client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                // Extract prompt from payload
                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                info!("GENERATE_IMAGE: prompt={}", prompt);

                // Call ComfyUI API
                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_generate(&comfyui_url, prompt).await {
                    Ok(image_url) => {
                        let response = serde_json::json!({
                            "imageUrl": image_url,
                            "prompt": prompt
                        });
                        socket.emit(constants::manager::IMAGE_GENERATED, &response).ok();
                    }
                    Err(e) => {
                        warn!("GENERATE_IMAGE error: {}", e);
                        socket
                            .emit(constants::manager::IMAGE_ERROR, &serde_json::json!({"error": e}))
                            .ok();
                    }
                }
            });
        }
    });

    // EDIT_IMAGE: Modify existing image
    socket.on(constants::manager::EDIT_IMAGE, {
        let registry = Arc::clone(&registry);
        let client_id = client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = Arc::clone(&registry);
            let client_id = client_id.clone();

            tokio::spawn(async move {
                // Auth gate
                let is_logged = {
                    let registry = registry.read().await;
                    registry.is_logged(&client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let image_url = payload
                    .get("imageUrl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let edit_prompt = payload
                    .get("editPrompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                info!("EDIT_IMAGE: imageUrl={}, editPrompt={}", image_url, edit_prompt);

                // SSRF guard: validate image URL host
                let comfyui_url = get_comfyui_base_url();
                if !image_url.is_empty() {
                    if let Err(e) = validate_url_host(image_url, &comfyui_url) {
                        warn!("EDIT_IMAGE SSRF violation: {}", e);
                        socket
                            .emit(
                                constants::manager::IMAGE_ERROR,
                                &serde_json::json!({"error": "Invalid image source"}),
                            )
                            .ok();
                        return;
                    }
                }

                // Call ComfyUI API
                match call_comfyui_edit(&comfyui_url, image_url, edit_prompt).await {
                    Ok(edited_url) => {
                        let response = serde_json::json!({
                            "imageUrl": edited_url,
                            "editPrompt": edit_prompt
                        });
                        socket.emit(constants::manager::IMAGE_GENERATED, &response).ok();
                    }
                    Err(e) => {
                        warn!("EDIT_IMAGE error: {}", e);
                        socket
                            .emit(constants::manager::IMAGE_ERROR, &serde_json::json!({"error": e}))
                            .ok();
                    }
                }
            });
        }
    });

    // ENHANCE_PROMPT: Improve text prompt using AI
    socket.on(constants::manager::ENHANCE_PROMPT, {
        let registry = Arc::clone(&registry);
        let client_id = client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = Arc::clone(&registry);
            let client_id = client_id.clone();

            tokio::spawn(async move {
                // Auth gate
                let is_logged = {
                    let registry = registry.read().await;
                    registry.is_logged(&client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let prompt = payload
                    .get("prompt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                info!("ENHANCE_PROMPT: original={}", prompt);

                // Call ComfyUI API to enhance
                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_enhance(&comfyui_url, prompt).await {
                    Ok(enhanced) => {
                        let response = serde_json::json!({
                            "originalPrompt": prompt,
                            "enhancedPrompt": enhanced
                        });
                        socket.emit(constants::manager::PROMPT_ENHANCED, &response).ok();
                    }
                    Err(e) => {
                        warn!("ENHANCE_PROMPT error: {}", e);
                        socket
                            .emit(constants::manager::IMAGE_ERROR, &serde_json::json!({"error": e}))
                            .ok();
                    }
                }
            });
        }
    });

    // SUBMIT_UPLOAD_IMAGE: Accept user-uploaded image
    socket.on(constants::manager::SUBMIT_UPLOAD_IMAGE, {
        let registry = Arc::clone(&registry);
        let client_id = client_id.clone();

        move |socket: SocketRef, Data::<serde_json::Value>(payload)| {
            let registry = Arc::clone(&registry);
            let client_id = client_id.clone();

            tokio::spawn(async move {
                // Auth gate
                let is_logged = {
                    let registry = registry.read().await;
                    registry.is_logged(&client_id)
                };

                if !is_logged {
                    socket
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                let image_data = payload
                    .get("imageData")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let filename = payload
                    .get("filename")
                    .and_then(|v| v.as_str())
                    .unwrap_or("upload.png");

                info!("SUBMIT_UPLOAD_IMAGE: filename={}", filename);

                // Call ComfyUI API to store upload
                let comfyui_url = get_comfyui_base_url();
                match call_comfyui_upload(&comfyui_url, image_data, filename).await {
                    Ok(stored_url) => {
                        let response = serde_json::json!({
                            "imageUrl": stored_url,
                            "filename": filename
                        });
                        socket
                            .emit(constants::manager::UPLOAD_IMAGE_SUCCESS, &response)
                            .ok();
                    }
                    Err(e) => {
                        warn!("SUBMIT_UPLOAD_IMAGE error: {}", e);
                        socket
                            .emit(constants::manager::IMAGE_ERROR, &serde_json::json!({"error": e}))
                            .ok();
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

async fn call_comfyui_edit(
    base_url: &str,
    image_url: &str,
    edit_prompt: &str,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/edit", base_url);

    let payload = serde_json::json!({
        "imageUrl": image_url,
        "editPrompt": edit_prompt
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
