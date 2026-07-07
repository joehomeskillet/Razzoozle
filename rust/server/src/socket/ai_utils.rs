//! AI provider utility functions: secret scanning, JSON parsing, local host detection.

use regex::Regex;
use serde_json::Value;

const LOCAL_HOSTS: &[&str] = &["localhost", "127.0.0.1", "host.docker.internal"];

// Secret pattern regexes (compiled on first use, cached internally by regex crate).
fn secret_patterns() -> Vec<Regex> {
    vec![
        Regex::new(r"(?i)sk-").unwrap(),
        Regex::new(r"AKIA").unwrap(),
        Regex::new(r"(?i)BEGIN PRIVATE KEY").unwrap(),
    ]
}

/// Check if a string contains a detected secret pattern.
pub fn contains_secret(s: &str) -> bool {
    secret_patterns().iter().any(|re| re.is_match(s))
}

/// Assert that a string contains no secret patterns. Throws "errors:ai.invalidOutput" if detected.
pub fn assert_no_secret(s: &str) -> Result<(), String> {
    if contains_secret(s) {
        Err("errors:ai.invalidOutput".to_string())
    } else {
        Ok(())
    }
}

/// Strip markdown code fence (```json ... ```) from JSON output.
pub fn strip_code_fence(s: &str) -> String {
    let trimmed = s.trim();
    // Regex: ```(?:json)?\s*([\s\S]*?)\s*```
    let re = Regex::new(r"^```(?:json)?\s*([\s\S]*?)\s*```$").unwrap();
    if let Some(caps) = re.captures(trimmed) {
        if let Some(inner) = caps.get(1) {
            return inner.as_str().trim().to_string();
        }
    }
    trimmed.to_string()
}

/// Parse JSON with code-fence stripping. Throws "errors:ai.invalidOutput" on parse failure.
pub fn parse_json(raw: &str) -> Result<Value, String> {
    let stripped = strip_code_fence(raw);
    serde_json::from_str(&stripped)
        .map_err(|_| "errors:ai.invalidOutput".to_string())
}

/// Check if a baseUrl is a local host (no API key required).
pub fn is_local_base_url(base_url: Option<&str>) -> bool {
    if let Some(url_str) = base_url {
        if let Ok(url) = url::Url::parse(url_str) {
            if let Some(host) = url.host_str() {
                return LOCAL_HOSTS.contains(&host);
            }
        }
    }
    false
}
