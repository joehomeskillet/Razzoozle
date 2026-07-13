//! USER.* — User external AI credentials (per-user keys for AI generation).
//!
//! Events: user:setAiKey, user:getAiKeyStatus, user:deleteAiKey, user:listExternalProviders.
//! All are require_user (not admin-only). User can only manage their own keys.

use super::super::HandlerCtx;
use razzoozle_protocol::constants;
use socketioxide::extract::{Data, SocketRef};
use serde_json::{json, Value};

/// Check if a provider is external (not local/Ollama/localhost).
fn is_external_provider(provider: &Value) -> bool {
    // A provider is external if its baseUrl is NOT a local host.
    // Returns true only for remote providers.
    let base_url = provider.get("baseUrl").and_then(|v| v.as_str());
    !super::super::ai_utils::is_local_base_url(base_url)
}

pub fn register(socket: &SocketRef, ctx: HandlerCtx) {
    // ---- SET_AI_KEY ----
    socket.on(constants::user::SET_AI_KEY, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                // Validate payload
                let (provider_id, key_plain) = match validate_set_ai_key(&payload) {
                    Ok(result) => result,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                // Set the key for this user
                if let Some(ref pool) = ctx.db_pool {
                    match crate::db::user_ai::set_user_ai_key(pool, user.user_id, &provider_id, &key_plain).await {
                        Ok(()) => {
                            socket
                                .emit(
                                    constants::ai::SETTINGS,
                                    &super::super::ai_config::get_public_ai_settings(),
                                )
                                .ok();
                        }
                        Err(e) => {
                            socket.emit(constants::ai::ERROR, &e).ok();
                        }
                    }
                } else {
                    socket
                        .emit(constants::ai::ERROR, &"Database unavailable")
                        .ok();
                }
            });
        }
    });

    // ---- GET_AI_KEY_STATUS ----
    socket.on(constants::user::GET_AI_KEY_STATUS, {
        let ctx = ctx.clone();
        move |socket: SocketRef| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                if let Some(ref pool) = ctx.db_pool {
                    match crate::db::user_ai::list_user_ai_key_status(pool, user.user_id).await {
                        Ok(status) => {
                            // Return as Record<providerId, boolean> (configured true/false)
                            let mut result = serde_json::Map::new();
                            for (provider_id, configured) in status {
                                result.insert(provider_id, Value::Bool(configured));
                            }
                            socket
                                .emit(constants::user::AI_KEY_STATUS, &Value::Object(result))
                                .ok();
                        }
                        Err(e) => {
                            socket.emit(constants::ai::ERROR, &e).ok();
                        }
                    }
                } else {
                    socket
                        .emit(constants::ai::ERROR, &"Database unavailable")
                        .ok();
                }
            });
        }
    });

    // ---- DELETE_AI_KEY ----
    socket.on(constants::user::DELETE_AI_KEY, {
        let ctx = ctx.clone();
        move |socket: SocketRef, Data::<Value>(payload)| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                // Validate payload
                let provider_id = match validate_delete_ai_key(&payload) {
                    Ok(id) => id,
                    Err(err) => {
                        socket.emit(constants::ai::ERROR, &err).ok();
                        return;
                    }
                };

                if let Some(ref pool) = ctx.db_pool {
                    match crate::db::user_ai::delete_user_ai_key(pool, user.user_id, &provider_id)
                        .await
                    {
                        Ok(()) => {
                            socket
                                .emit(constants::ai::SETTINGS, &super::super::ai_config::get_public_ai_settings())
                                .ok();
                        }
                        Err(e) => {
                            socket.emit(constants::ai::ERROR, &e).ok();
                        }
                    }
                } else {
                    socket
                        .emit(constants::ai::ERROR, &"Database unavailable")
                        .ok();
                }
            });
        }
    });

    // ---- LIST_EXTERNAL_PROVIDERS ----
    socket.on(constants::user::LIST_EXTERNAL_PROVIDERS, {
        let ctx = ctx.clone();
        move |socket: SocketRef| {
            let ctx = ctx.clone();
            tokio::spawn(async move {
                let _user = match ctx.require_user().await {
                    Some(user) => user,
                    None => {
                        socket
                            .emit(constants::manager::UNAUTHORIZED, &"")
                            .ok();
                        return;
                    }
                };

                let settings = super::super::ai_config::get_ai_settings();

                // Filter text providers to external-only
                let mut external_providers = Vec::new();
                if let Some(text) = settings.get("text") {
                    if let Some(providers) = text.get("providers").and_then(|p| p.as_array()) {
                        for provider in providers {
                            if is_external_provider(provider) {
                                external_providers.push(provider.clone());
                            }
                        }
                    }
                }

                socket
                    .emit(
                        constants::user::EXTERNAL_PROVIDERS,
                        &json!({ "providers": external_providers }),
                    )
                    .ok();
            });
        }
    });
}

/// Validate SET_AI_KEY payload: { providerId, key }
fn validate_set_ai_key(payload: &Value) -> Result<(String, String), String> {
    let provider_id = payload
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or("providerId is required")?;

    if provider_id.is_empty() || provider_id.len() > 40 {
        return Err("providerId must be 1-40 chars".to_string());
    }

    // Validate provider ID using the same pattern as ai_secrets
    super::super::ai_secrets::assert_safe_id(provider_id)?;

    let key = payload
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or("key is required")?;

    if key.is_empty() {
        return Err("key must not be empty".to_string());
    }

    if key.len() > 400 {
        return Err("key must be max 400 chars".to_string());
    }

    Ok((provider_id.to_string(), key.to_string()))
}

/// Validate DELETE_AI_KEY payload: { providerId }
fn validate_delete_ai_key(payload: &Value) -> Result<String, String> {
    let provider_id = payload
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or("providerId is required")?;

    if provider_id.is_empty() || provider_id.len() > 40 {
        return Err("providerId must be 1-40 chars".to_string());
    }

    // Validate provider ID
    super::super::ai_secrets::assert_safe_id(provider_id)?;

    Ok(provider_id.to_string())
}
