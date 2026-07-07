//! AI.GET_SETTINGS — public AI settings for the KI manager tab.
//!
//! Reads persisted AI settings from config/ai-settings.json (same as Node's
//! getAISettings). If missing or corrupted, falls back to seed defaults. Each
//! text provider's `keyConfigured` is always false (Rust has no secret storage
//! yet — TODO(parity): integrate ai-secrets on disk or DB).

use super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::SocketRef;
use std::fs;

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // No-payload event → bare `SocketRef` signature (see submissions.rs note).
    socket.on(constants::ai::GET_SETTINGS, {
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
                        .emit(constants::manager::UNAUTHORIZED, &serde_json::json!([]))
                        .ok();
                    return;
                }

                socket
                    .emit(constants::ai::SETTINGS, &get_public_ai_settings())
                    .ok();
            });
        }
    });
}

/// Read persisted AI settings from config/ai-settings.json and return as
/// AISettingsPublic. Falls back to seed defaults if file missing or corrupted.
/// Always returns `keyConfigured: false` for all providers (Rust has no secrets
/// storage yet).
pub fn get_public_ai_settings() -> serde_json::Value {
    // Try to read persisted settings from config/ai-settings.json (same path
    // Node's config/ai.ts uses). If missing or corrupted, fall back to seed
    // defaults.
    match fs::read_to_string("config/ai-settings.json") {
        Ok(content) => {
            // Attempt to parse the persisted settings.
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(mut settings) => {
                    // TODO(parity): integrate ai-secrets on disk or DB so
                    // keyConfigured can reflect actual stored keys instead of
                    // always being false.

                    // Ensure all text providers have keyConfigured: false.
                    if let Some(text) = settings.get_mut("text") {
                        if let Some(providers) = text.get_mut("providers") {
                            if let Some(arr) = providers.as_array_mut() {
                                for provider in arr {
                                    provider["keyConfigured"] = serde_json::json!(false);
                                }
                            }
                        }
                    }

                    return settings;
                }
                Err(e) => {
                    eprintln!(
                        "Failed to parse config/ai-settings.json: {}, using seed defaults",
                        e
                    );
                }
            }
        }
        Err(_) => {
            // File doesn't exist or can't be read — use seed defaults.
        }
    }

    // Fall back to seed defaults (mirrors Node's seedAISettings()).
    seed_public_ai_settings()
}

/// Mirror of Node `toPublicAISettings(seedAISettings())` — provider presets from
/// `AI_TEXT_PROVIDER_PRESETS`, `activeProvider: "off"` (AI_PROVIDER_OFF), each
/// text provider carrying `keyConfigured: false` (no secret on the wire).
fn seed_public_ai_settings() -> serde_json::Value {
    serde_json::json!({
        "text": {
            "activeProvider": "off",
            "providers": [
                {
                    "id": "local",
                    "label": "Lokal (Ollama)",
                    "kind": "openai-compatible",
                    "baseUrl": "http://host.docker.internal:11434/v1",
                    "model": "llama3.2:3b",
                    "keyConfigured": false
                },
                {
                    "id": "claude",
                    "label": "Claude (Anthropic)",
                    "kind": "anthropic",
                    "model": "claude-haiku-4-5-20251001",
                    "keyConfigured": false
                },
                {
                    "id": "openai",
                    "label": "OpenAI",
                    "kind": "openai-compatible",
                    "baseUrl": "https://api.openai.com/v1",
                    "model": "gpt-4o-mini",
                    "keyConfigured": false
                },
                {
                    "id": "openrouter",
                    "label": "OpenRouter",
                    "kind": "openai-compatible",
                    "baseUrl": "https://openrouter.ai/api/v1",
                    "model": "meta-llama/llama-3.3-70b-instruct",
                    "keyConfigured": false
                }
            ]
        },
        "image": {
            "activeProvider": "comfyui",
            "providers": [
                { "id": "comfyui", "label": "ComfyUI / Z-Image" }
            ]
        }
    })
}
