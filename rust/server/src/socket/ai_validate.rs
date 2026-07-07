//! Input validation for AI socket handlers (mirrors Node Zod validators).
//! All validation functions return error strings matching Zod error message format.

use razzoozle_protocol::constants;
use serde_json::Value;

/// Validate SET_SETTINGS payload. Returns the validated data or an error message.
pub fn validate_set_settings(payload: &Value) -> Result<(), String> {
    // Check basic structure
    let text = payload
        .get("text")
        .ok_or("text is required")?
        .as_object()
        .ok_or("text must be an object")?;

    let image = payload
        .get("image")
        .ok_or("image is required")?
        .as_object()
        .ok_or("image must be an object")?;

    // Validate text section
    let active = text
        .get("activeProvider")
        .and_then(|v| v.as_str())
        .ok_or("text.activeProvider is required")?;
    if active.is_empty() {
        return Err("text.activeProvider must not be empty".to_string());
    }

    let providers = text
        .get("providers")
        .and_then(|v| v.as_array())
        .ok_or("text.providers must be an array")?;

    for (idx, provider) in providers.iter().enumerate() {
        let obj = provider
            .as_object()
            .ok_or(format!("text.providers[{}] must be an object", idx))?;

        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or(format!("text.providers[{}].id is required", idx))?;
        if id.is_empty() || id.len() > 40 {
            return Err(format!(
                "text.providers[{}].id must be 1-40 chars",
                idx
            ));
        }

        let label = obj
            .get("label")
            .and_then(|v| v.as_str())
            .ok_or(format!("text.providers[{}].label is required", idx))?;
        if label.is_empty() || label.len() > 60 {
            return Err(format!(
                "text.providers[{}].label must be 1-60 chars",
                idx
            ));
        }

        let kind = obj
            .get("kind")
            .and_then(|v| v.as_str())
            .ok_or(format!("text.providers[{}].kind is required", idx))?;
        if kind != "openai-compatible" && kind != "anthropic" {
            return Err(format!(
                "text.providers[{}].kind must be 'openai-compatible' or 'anthropic'",
                idx
            ));
        }

        let model = obj
            .get("model")
            .and_then(|v| v.as_str())
            .ok_or(format!("text.providers[{}].model is required", idx))?;
        if model.is_empty() || model.len() > 120 {
            return Err(format!(
                "text.providers[{}].model must be 1-120 chars",
                idx
            ));
        }

        // Optional: baseUrl validation (if present, must be valid URL)
        if let Some(base_url) = obj.get("baseUrl").and_then(|v| v.as_str()) {
            if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
                return Err(format!(
                    "text.providers[{}].baseUrl must be a valid URL",
                    idx
                ));
            }
        }

        // Optional: temperature validation (0-2)
        if let Some(temp) = obj.get("temperature").and_then(|v| v.as_f64()) {
            if temp < constants::AI::TEMP_MIN || temp > constants::AI::TEMP_MAX {
                return Err(format!(
                    "text.providers[{}].temperature must be {} to {}",
                    idx, constants::AI::TEMP_MIN, constants::AI::TEMP_MAX
                ));
            }
        }
    }

    // Validate image section
    let img_active = image
        .get("activeProvider")
        .and_then(|v| v.as_str())
        .ok_or("image.activeProvider is required")?;
    if img_active.is_empty() {
        return Err("image.activeProvider must not be empty".to_string());
    }

    let img_providers = image
        .get("providers")
        .and_then(|v| v.as_array())
        .ok_or("image.providers must be an array")?;

    for (idx, provider) in img_providers.iter().enumerate() {
        let obj = provider
            .as_object()
            .ok_or(format!("image.providers[{}] must be an object", idx))?;

        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or(format!("image.providers[{}].id is required", idx))?;
        if id.is_empty() || id.len() > 40 {
            return Err(format!(
                "image.providers[{}].id must be 1-40 chars",
                idx
            ));
        }

        let label = obj
            .get("label")
            .and_then(|v| v.as_str())
            .ok_or(format!("image.providers[{}].label is required", idx))?;
        if label.is_empty() || label.len() > 60 {
            return Err(format!(
                "image.providers[{}].label must be 1-60 chars",
                idx
            ));
        }

        // Optional: baseUrl, workflow, resolution
        if let Some(base_url) = obj.get("baseUrl").and_then(|v| v.as_str()) {
            if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
                return Err(format!(
                    "image.providers[{}].baseUrl must be a valid URL",
                    idx
                ));
            }
        }

        if let Some(workflow) = obj.get("workflow").and_then(|v| v.as_str()) {
            if workflow.len() > 300 {
                return Err(format!(
                    "image.providers[{}].workflow must be max 300 chars",
                    idx
                ));
            }
        }

        if let Some(_resolution) = obj.get("resolution") {
            let res = obj
                .get("resolution")
                .and_then(|v| v.as_u64())
                .ok_or(format!("image.providers[{}].resolution must be a number", idx))?;
            if res != 512 && res != 768 && res != 1024 {
                return Err(format!(
                    "image.providers[{}].resolution must be 512, 768, or 1024",
                    idx
                ));
            }
        }
    }

    Ok(())
}

/// Validate SET_KEY payload.
pub fn validate_set_key(payload: &Value) -> Result<(String, Option<String>), String> {
    let provider_id = payload
        .get("providerId")
        .and_then(|v| v.as_str())
        .ok_or("providerId is required")?;

    if provider_id.is_empty() || provider_id.len() > 40 {
        return Err("providerId must be 1-40 chars".to_string());
    }

    let key = payload
        .get("key")
        .and_then(|v| v.as_str())
        .ok_or("key is required")?;

    if key.len() > 400 {
        return Err("key must be max 400 chars".to_string());
    }

    // Trim and return Option<String>
    let trimmed_key = if key.trim().is_empty() { None } else { Some(key.trim().to_string()) };

    Ok((provider_id.to_string(), trimmed_key))
}

/// Validate TEST_PROVIDER payload.
pub fn validate_test_provider(payload: &Value) -> Result<Option<String>, String> {
    if let Some(provider_id) = payload.get("providerId") {
        let id = provider_id
            .as_str()
            .ok_or("providerId must be a string")?;

        if id.is_empty() || id.len() > 40 {
            return Err("providerId must be 1-40 chars".to_string());
        }

        Ok(Some(id.to_string()))
    } else {
        Ok(None)
    }
}

/// Validate GENERATE_QUESTION payload.
pub fn validate_generate_question(payload: &Value) -> Result<(String, String, String), String> {
    let topic = payload
        .get("topic")
        .and_then(|v| v.as_str())
        .ok_or("topic is required")?;

    if topic.is_empty() || topic.len() > constants::AI::TOPIC_MAX_LEN as usize {
        return Err(format!(
            "topic must be 1-{} chars",
            constants::AI::TOPIC_MAX_LEN
        ));
    }

    let q_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("choice");

    if !["choice", "boolean", "multiple-select", "type-answer"].contains(&q_type) {
        return Err("type must be one of: choice, boolean, multiple-select, type-answer".to_string());
    }

    let language = payload
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("de");

    if language.len() < 2 || language.len() > 8 {
        return Err("language must be 2-8 chars".to_string());
    }

    Ok((topic.to_string(), q_type.to_string(), language.to_string()))
}

/// Validate GENERATE_DISTRACTORS payload.
pub fn validate_generate_distractors(
    payload: &Value,
) -> Result<(String, String, usize, String), String> {
    let question = payload
        .get("question")
        .and_then(|v| v.as_str())
        .ok_or("question is required")?;

    if question.is_empty() || question.len() > 300 {
        return Err("question must be 1-300 chars".to_string());
    }

    let correct = payload
        .get("correct")
        .and_then(|v| v.as_str())
        .ok_or("correct is required")?;

    if correct.is_empty() || correct.len() > 200 {
        return Err("correct must be 1-200 chars".to_string());
    }

    let count = payload
        .get("count")
        .and_then(|v| v.as_u64())
        .map(|c| c as usize)
        .unwrap_or(3);

    if count < 1 || count > 3 {
        return Err("count must be 1-3".to_string());
    }

    let language = payload
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("de");

    if language.len() < 2 || language.len() > 8 {
        return Err("language must be 2-8 chars".to_string());
    }

    Ok((
        question.to_string(),
        correct.to_string(),
        count,
        language.to_string(),
    ))
}

/// Validate GENERATE_QUIZ payload.
pub fn validate_generate_quiz(payload: &Value) -> Result<(String, usize, String), String> {
    let topic = payload
        .get("topic")
        .and_then(|v| v.as_str())
        .ok_or("topic is required")?;

    if topic.is_empty() || topic.len() > constants::AI::TOPIC_MAX_LEN as usize {
        return Err(format!(
            "topic must be 1-{} chars",
            constants::AI::TOPIC_MAX_LEN
        ));
    }

    let count = payload
        .get("count")
        .and_then(|v| v.as_u64())
        .ok_or("count is required")?;

    if count < 1 || count > 15 {
        return Err("count must be 1-15".to_string());
    }

    let language = payload
        .get("language")
        .and_then(|v| v.as_str())
        .unwrap_or("de");

    if language.len() < 2 || language.len() > 8 {
        return Err("language must be 2-8 chars".to_string());
    }

    Ok((topic.to_string(), count as usize, language.to_string()))
}
