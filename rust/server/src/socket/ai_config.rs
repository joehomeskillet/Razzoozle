//! AI settings file I/O and configuration (mirrors Node config/ai.ts layer).
//! Handles read/write of config/ai-settings.json with seed defaults.

use std::fs;

/// Get public AI settings (with keyConfigured flags added per provider).
pub fn get_public_ai_settings() -> serde_json::Value {
    let mut settings = match fs::read_to_string("config/ai-settings.json") {
        Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(s) => s,
            Err(_) => {
                return seed_public_ai_settings();
            }
        },
        Err(_) => {
            return seed_public_ai_settings();
        }
    };

    if let Some(text) = settings.get_mut("text") {
        if let Some(providers) = text.get_mut("providers") {
            if let Some(arr) = providers.as_array_mut() {
                for provider in arr {
                    if let Some(id) = provider.get("id").and_then(|v| v.as_str()) {
                        let has_key = super::ai_secrets::has_key(id).unwrap_or(false);
                        provider["keyConfigured"] = serde_json::json!(has_key);
                    }
                }
            }
        }
    }

    settings
}

/// Get raw AI settings (without public masking).
pub fn get_ai_settings() -> serde_json::Value {
    match fs::read_to_string("config/ai-settings.json") {
        Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(s) => s,
            Err(_) => seed_public_ai_settings(),
        },
        Err(_) => seed_public_ai_settings(),
    }
}

/// Persist AI settings to config/ai-settings.json.
pub async fn persist_ai_settings(payload: &serde_json::Value) -> Result<(), String> {
    let settings = payload.clone();
    tokio::task::spawn_blocking(move || {
        let json_str = serde_json::to_string_pretty(&settings)
            .map_err(|e| format!("Failed to serialize: {}", e))?;
        fs::write("config/ai-settings.json", json_str)
            .map_err(|e| format!("errors:ai.saveFailed: {}", e))
    })
    .await
    .map_err(|e| format!("spawn_blocking error: {}", e))?
}

/// Seed default AI settings (returned when config file doesn't exist or is invalid).
pub fn seed_public_ai_settings() -> serde_json::Value {
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
