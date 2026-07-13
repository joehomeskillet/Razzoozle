//! User external AI credentials: encrypted at rest via pgcrypto, user-scoped.
//!
//! Each user (role=user/admin) can set their own external AI provider key, which is
//! encrypted at rest with pgp_sym_encrypt and stored in user_ai_keys. The encryption
//! passphrase comes from env AI_KEY_ENCRYPTION_KEY — if unset, all operations fail loudly.

use sqlx::PgPool;

/// Get the encryption passphrase from env AI_KEY_ENCRYPTION_KEY.
/// Returns Err if unset or empty — fail loud, never store unencrypted.
fn get_encryption_key() -> Result<String, String> {
    std::env::var("AI_KEY_ENCRYPTION_KEY")
        .map_err(|_| "AI_KEY_ENCRYPTION_KEY not set; cannot encrypt/decrypt user AI keys".to_string())
        .and_then(|key| {
            if key.trim().is_empty() {
                Err("AI_KEY_ENCRYPTION_KEY is empty".to_string())
            } else {
                Ok(key)
            }
        })
}

/// Set or update a user's API key for a provider.
/// Encrypts the plaintext key using pgp_sym_encrypt with passphrase from env.
/// Returns Err if passphrase is unset or if any DB operation fails.
pub async fn set_user_ai_key(
    pool: &PgPool,
    user_id: i64,
    provider_id: &str,
    key_plain: &str,
) -> Result<(), String> {
    let passphrase = get_encryption_key()?;

    sqlx::query(
        "INSERT INTO user_ai_keys (user_id, provider_id, key_encrypted, updated_at) \
         VALUES ($1, $2, pgp_sym_encrypt($3, $4), now()) \
         ON CONFLICT (user_id, provider_id) \
         DO UPDATE SET key_encrypted = pgp_sym_encrypt($3, $4), updated_at = now()"
    )
    .bind(user_id)
    .bind(provider_id)
    .bind(key_plain)
    .bind(&passphrase)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get a user's decrypted API key for a provider.
/// Returns None if the user has no key set for that provider.
/// Returns Err if the passphrase is unset.
pub async fn get_user_ai_key(
    pool: &PgPool,
    user_id: i64,
    provider_id: &str,
) -> Result<Option<String>, String> {
    let passphrase = get_encryption_key()?;

    let result = sqlx::query_as::<_, (String,)>(
        "SELECT pgp_sym_decrypt(key_encrypted, $3) \
         FROM user_ai_keys \
         WHERE user_id = $1 AND provider_id = $2"
    )
    .bind(user_id)
    .bind(provider_id)
    .bind(&passphrase)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|(key,)| key))
}

/// List all providers for which a user has configured a key.
/// Returns Vec<(provider_id, configured)> where configured is always true (or keys are filtered out).
/// Returns Err if passphrase is unset.
pub async fn list_user_ai_key_status(
    pool: &PgPool,
    user_id: i64,
) -> Result<Vec<(String, bool)>, String> {
    let _passphrase = get_encryption_key()?;

    let result = sqlx::query_as::<_, (String,)>(
        "SELECT provider_id FROM user_ai_keys WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.into_iter().map(|(provider_id,)| (provider_id, true)).collect())
}

/// Delete a user's API key for a provider.
pub async fn delete_user_ai_key(
    pool: &PgPool,
    user_id: i64,
    provider_id: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM user_ai_keys WHERE user_id = $1 AND provider_id = $2")
        .bind(user_id)
        .bind(provider_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
