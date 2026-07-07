//! AI provider API keys: persistent storage on disk (config/ai-secrets.json).
//!
//! A flat Record<providerId, string> with file mode 0600 (owner RW only). The file
//! path mirrors Node's config layer. Every provider id is validated via assertSafeId
//! before it touches a path or a record key. Keys NEVER leave the server, and the
//! client only ever sees a boolean `keyConfigured` flag per provider (see ai.rs).

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Get the secrets file path: config/ai-secrets.json. Mirrors Node's getPath().
fn get_secrets_path() -> PathBuf {
    if let Ok(config_path) = std::env::var("CONFIG_PATH") {
        PathBuf::from(config_path).join("ai-secrets.json")
    } else {
        // Fallback: ../../config/ai-secrets.json (relative to Rust source dir)
        PathBuf::from("../../config/ai-secrets.json")
    }
}

/// Validate a provider ID: must match [A-Za-z0-9_-]+ and not be a reserved name.
/// Mirrors Node's assertSafeId (config/shared.ts).
pub fn assert_safe_id(id: &str) -> Result<(), String> {
    // Regex: [A-Za-z0-9_-]+
    if id.is_empty() || !id.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err("Invalid id".to_string());
    }

    // Reject reserved names.
    let reserved = ["__proto__", "constructor", "prototype"];
    if reserved.contains(&id) {
        return Err("Invalid id".to_string());
    }

    Ok(())
}

/// Read and parse config/ai-secrets.json. Returns a map. If file missing or
/// parse fails, returns an empty map (never panics — mirrors Node logic).
fn read_secrets() -> BTreeMap<String, String> {
    let path = get_secrets_path();

    if !path.exists() {
        return BTreeMap::new();
    }

    match fs::read_to_string(&path) {
        Ok(content) => {
            match serde_json::from_str::<BTreeMap<String, String>>(&content) {
                Ok(map) => map,
                Err(_) => {
                    // Malformed file — treat as "no keys" (mirrors Node: never throw).
                    BTreeMap::new()
                }
            }
        }
        Err(_) => BTreeMap::new(),
    }
}

/// Write secrets to config/ai-secrets.json with file mode 0o600 (owner RW only).
/// Never logs the contents — plaintext keys are sensitive.
fn write_secrets(secrets: &BTreeMap<String, String>) -> Result<(), String> {
    let path = get_secrets_path();

    // Ensure config directory exists.
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }
    }

    // Write JSON (pretty-printed, 2 spaces, sorted keys for stability).
    let json = serde_json::to_string_pretty(secrets)
        .map_err(|e| format!("Failed to serialize secrets: {}", e))?;

    // Create file atomically with mode 0o600 on Unix, then write contents.
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&path)
            .map_err(|e| format!("Failed to open secrets file: {}", e))?;
        file.write_all(json.as_bytes())
            .map_err(|e| format!("Failed to write secrets file: {}", e))?;
        // Repair existing file with wrong perms (legacy case, harmless for new files).
        let perms = fs::Permissions::from_mode(0o600);
        fs::set_permissions(&path, perms)
            .map_err(|e| format!("Failed to set file permissions: {}", e))?;
    }
    #[cfg(not(unix))]
    {
        fs::write(&path, &json).map_err(|e| format!("Failed to write secrets file: {}", e))?;
    }

    Ok(())
}

/// Get a provider's API key. Returns None if the key doesn't exist or is empty.
/// Validates provider ID before access.
pub fn get_key(id: &str) -> Result<Option<String>, String> {
    assert_safe_id(id)?;

    let secrets = read_secrets();
    let key = secrets.get(id).cloned();

    Ok(key.filter(|k| !k.is_empty()))
}

/// Check if a provider has a configured key.
pub fn has_key(id: &str) -> Result<bool, String> {
    get_key(id).map(|k| k.is_some())
}

/// Set or clear a provider's key. A null or empty/whitespace string clears the entry.
/// Validates provider ID before modification.
pub fn set_key(id: &str, key: Option<String>) -> Result<(), String> {
    assert_safe_id(id)?;

    let mut secrets = read_secrets();

    let trimmed = key.as_ref().and_then(|k| {
        let t = k.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    });

    if let Some(key_val) = trimmed {
        secrets.insert(id.to_string(), key_val);
    } else {
        secrets.remove(id);
    }

    write_secrets(&secrets)
}
