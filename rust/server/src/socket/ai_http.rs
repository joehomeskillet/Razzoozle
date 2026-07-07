//! AI provider HTTP client: direct API calls to OpenAI-compatible or Anthropic backends.

use serde_json::{json, Value};

const REQUEST_TIMEOUT_MS: u64 = 60_000;

/// Call OpenAI-compatible endpoint: POST {baseUrl}/chat/completions.
pub async fn call_openai_compatible(
    base_url: &str,
    model: &str,
    key: Option<&str>,
    messages: Vec<(String, String)>,
    json: bool,
    temperature: f64,
) -> Result<String, String> {
    let url = format!("{}/chat/completions", base_url);

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "content-type",
        reqwest::header::HeaderValue::from_static("application/json"),
    );

    if let Some(k) = key {
        headers.insert(
            "Authorization",
            reqwest::header::HeaderValue::from_str(&format!("Bearer {}", k))
                .map_err(|_| "errors:ai.providerError".to_string())?,
        );
    }

    // OpenRouter attribution headers (harmless on other providers).
    headers.insert(
        "HTTP-Referer",
        reqwest::header::HeaderValue::from_static("https://rahoot.local"),
    );
    headers.insert(
        "X-Title",
        reqwest::header::HeaderValue::from_static("Rahoot"),
    );

    let msg_objs: Vec<Value> = messages
        .into_iter()
        .map(|(role, content)| json!({"role": role, "content": content}))
        .collect();

    let mut body = json!({
        "model": model,
        "messages": msg_objs,
        "temperature": temperature,
    });

    if json {
        body["response_format"] = json!({"type": "json_object"});
    }

    let client = reqwest::Client::new();
    let response = tokio::time::timeout(
        std::time::Duration::from_millis(REQUEST_TIMEOUT_MS),
        client.post(&url).headers(headers).json(&body).send(),
    )
    .await
    .map_err(|_| "errors:ai.providerError".to_string())?
    .map_err(|_| "errors:ai.providerError".to_string())?;

    if !response.status().is_success() {
        return Err("errors:ai.providerError".to_string());
    }

    let data: Value = response
        .json()
        .await
        .map_err(|_| "errors:ai.providerError".to_string())?;

    let content = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str());

    content
        .ok_or("errors:ai.providerError".to_string())
        .map(|s| s.to_string())
}

/// Call Anthropic endpoint: POST https://api.anthropic.com/v1/messages.
pub async fn call_anthropic(
    model: &str,
    key: &str,
    system: Option<&str>,
    prompt: &str,
    json: bool,
    max_tokens: Option<u32>,
    temperature: f64,
) -> Result<String, String> {
    let url = "https://api.anthropic.com/v1/messages";

    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-api-key",
        reqwest::header::HeaderValue::from_str(key)
            .map_err(|_| "errors:ai.providerError".to_string())?,
    );
    headers.insert(
        "anthropic-version",
        reqwest::header::HeaderValue::from_static("2023-06-01"),
    );
    headers.insert(
        "content-type",
        reqwest::header::HeaderValue::from_static("application/json"),
    );

    let final_prompt = if json {
        format!("{}\n\nRespond ONLY with valid JSON.", prompt)
    } else {
        prompt.to_string()
    };

    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens.unwrap_or(1024),
        "temperature": temperature,
        "messages": [{"role": "user", "content": final_prompt}],
    });

    if let Some(sys) = system {
        body["system"] = Value::String(sys.to_string());
    }

    let client = reqwest::Client::new();
    let response = tokio::time::timeout(
        std::time::Duration::from_millis(REQUEST_TIMEOUT_MS),
        client.post(url).headers(headers).json(&body).send(),
    )
    .await
    .map_err(|_| "errors:ai.providerError".to_string())?
    .map_err(|_| "errors:ai.providerError".to_string())?;

    if !response.status().is_success() {
        return Err("errors:ai.providerError".to_string());
    }

    let data: Value = response
        .json()
        .await
        .map_err(|_| "errors:ai.providerError".to_string())?;

    let text = data
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str());

    text.ok_or("errors:ai.providerError".to_string())
        .map(|s| s.to_string())
}
