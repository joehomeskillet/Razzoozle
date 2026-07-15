//! User account and session management — W0-A1 auth foundation primitive.
//! Additive: coexists with existing manager-password auth without modification.

use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{SaltString, PasswordHash};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::Rng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tracing::info;

/// Maximum concurrent sessions retained per user (X2a). Enforced at login by
/// deleting the oldest rows beyond this count — no cron, no background job.
const MAX_SESSIONS_PER_USER: i64 = 10;

/// Hash a bearer session token for storage/lookup. sessions.token_hash only
/// ever holds this digest — the raw token itself is never persisted (X2a).
fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex_encode(&hasher.finalize())
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: i64,
    pub role: String,
}

/// Create a new user with username, plaintext password, and role.
/// Hashes the password using argon2, inserts into users table, returns user id.
/// Also mints an opaque URL-safe submit_token for the public /submit/:token path.
pub async fn create_user(
    pool: &PgPool,
    username: &str,
    password_plain: &str,
    role: &str,
) -> Result<i64, String> {
    // Hash password using argon2
    let salt = SaltString::generate(rand::thread_rng());
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password_plain.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    // Opaque URL-safe submit token (~16 random bytes → base64url), same pattern as mint_session.
    let submit_token = {
        let mut rng = rand::thread_rng();
        let mut token_bytes = [0u8; 16];
        rng.fill(&mut token_bytes);
        URL_SAFE_NO_PAD.encode(&token_bytes)
    };

    // Insert into users table
    let result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO users (username, password_hash, role, active, created_at, submit_token) \
         VALUES ($1, $2, $3, true, now(), $4) \
         RETURNING id"
    )
    .bind(username)
    .bind(&password_hash)
    .bind(role)
    .bind(&submit_token)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.0)
}

/// Resolve the owner user id for a public submit token.
/// Returns None when the token is unknown or the user is inactive.
pub async fn owner_by_submit_token(
    pool: &Option<PgPool>,
    token: &str,
) -> Result<Option<i64>, String> {
    let pool = match pool {
        Some(p) => p,
        None => return Ok(None),
    };

    let result = sqlx::query_as::<_, (i64,)>(
        "SELECT id FROM users WHERE submit_token = $1 AND active = true",
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|(id,)| id))
}

/// Get the submit_token for a given user id.
/// Returns None if the user is not found, inactive, or has no token.
pub async fn get_submit_token(
    pool: &Option<PgPool>,
    user_id: i64,
) -> Option<String> {
    let pool = match pool {
        Some(p) => p,
        None => return None,
    };

    let result = sqlx::query_as::<_, (String,)>(
        "SELECT submit_token FROM users WHERE id = $1 AND active = true",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    result.map(|(token,)| token)
}

/// Find a user by username for login. Returns (user_id, password_hash, role, active).
pub async fn find_user_for_login(
    pool: &PgPool,
    username: &str,
) -> Result<Option<(i64, String, String, bool)>, String> {
    let result = sqlx::query_as::<_, (i64, String, String, bool)>(
        "SELECT id, password_hash, role, active FROM users WHERE username = $1"
    )
    .bind(username)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result)
}

/// Verify a plaintext password against an argon2 hash.
/// Returns false if verification fails or any error occurs (never panics).
pub fn verify_password(hash: &str, plain: &str) -> bool {
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };

    let argon2 = Argon2::default();
    argon2
        .verify_password(plain.as_bytes(), &parsed_hash)
        .is_ok()
}

/// Mint a session token for a user. Returns a URL-safe base64-encoded 256-bit random token.
/// Token expires after ttl_days. Inserts a NEW row into sessions (X2a: multiple
/// concurrent sessions per user are intentional — a prior login is never revoked),
/// storing only the SHA-256 hash of the token, then caps the user's session count
/// at MAX_SESSIONS_PER_USER by dropping the oldest rows beyond that limit.
pub async fn mint_session(
    pool: &PgPool,
    user_id: i64,
    ttl_days: i64,
) -> Result<String, String> {
    // Generate 256-bit (32 bytes) random token — scoped so the ThreadRng (!Send)
    // is dropped BEFORE the await below, keeping the handler future Send.
    let token = {
        let mut rng = rand::thread_rng();
        let mut token_bytes = [0u8; 32];
        rng.fill(&mut token_bytes);
        URL_SAFE_NO_PAD.encode(&token_bytes)
    };
    let token_hash = hash_token(&token);

    // Calculate expiration
    let expires_at = sqlx::types::chrono::Utc::now() + chrono::Duration::days(ttl_days);

    // Insert into sessions table (never the raw token — only its hash).
    sqlx::query(
        "INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at) \
         VALUES ($1, $2, now(), now(), $3)"
    )
    .bind(&token_hash)
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Session cap: keep only the MAX_SESSIONS_PER_USER most recent rows for
    // this user. One DELETE, no cron/background job.
    sqlx::query(
        "DELETE FROM sessions WHERE user_id = $1 AND id NOT IN ( \
           SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 \
         )"
    )
    .bind(user_id)
    .bind(MAX_SESSIONS_PER_USER)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(token)
}

/// Retrieve a user by session token. Returns AuthUser if token is valid and not expired.
/// Looks up by the SHA-256 hash of the supplied token — the raw token is never
/// compared or stored. Called on every authenticated socket/HTTP request, so this
/// intentionally does NOT write to last_seen (no DB write in a hot path).
pub async fn session_user(
    pool: &PgPool,
    token: &str,
) -> Result<Option<AuthUser>, String> {
    let token_hash = hash_token(token);
    let result = sqlx::query_as::<_, (i64, String)>(
        "SELECT u.id, u.role FROM sessions s \
         JOIN users u ON s.user_id = u.id \
         WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true"
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|(user_id, role)| AuthUser { user_id, role }))
}

/// Delete a single session by its token (logout). Removes ONLY the session row
/// matching this exact token — other concurrent sessions for the same user are
/// left untouched (X2a).
pub async fn delete_session(pool: &PgPool, token: &str) -> Result<(), String> {
    let token_hash = hash_token(token);
    sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Count the total number of users in the database.
pub async fn count_users(pool: &PgPool) -> Result<i64, String> {
    let result = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.0)
}


#[derive(Debug, serde::Serialize)]
pub struct UserDetail {
    pub id: i64,
    pub username: String,
    pub role: String,
    pub active: bool,
    pub created_at: String,
}

/// List all users with their details.
pub async fn list_users(pool: &PgPool) -> Result<Vec<UserDetail>, String> {
    let result = sqlx::query_as::<_, (i64, String, String, bool, sqlx::types::chrono::DateTime<sqlx::types::chrono::Utc>)>(
        "SELECT id, username, role, active, created_at FROM users ORDER BY created_at DESC"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result
        .into_iter()
        .map(|(id, username, role, active, created_at)| UserDetail {
            id,
            username,
            role,
            active,
            created_at: created_at.to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        })
        .collect())
}

/// Set the active flag for a user (enable or disable).
pub async fn set_user_active(pool: &PgPool, user_id: i64, active: bool) -> Result<(), String> {
    sqlx::query("UPDATE users SET active = $1 WHERE id = $2")
        .bind(active)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Admin password reset — hash and store a new password for the given user.
pub async fn set_password(pool: &PgPool, user_id: i64, new_password: &str) -> Result<(), String> {
    // Hash password using argon2 (same pattern as create_user).
    let salt = SaltString::generate(rand::thread_rng());
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
/// Bootstrap the admin user if the database is empty and env vars are set.
/// Checks count_users() == 0; if true and BOOTSTRAP_ADMIN_USER and BOOTSTRAP_ADMIN_PASSWORD
/// are both set, creates admin user. Otherwise no-op. Idempotent by the count==0 guard.
pub async fn bootstrap_admin(pool: &PgPool) {
    match count_users(pool).await {
        Ok(count) => {
            if count == 0 {
                if let (Ok(username), Ok(password)) = (
                    std::env::var("BOOTSTRAP_ADMIN_USER"),
                    std::env::var("BOOTSTRAP_ADMIN_PASSWORD"),
                ) {
                    match create_user(pool, &username, &password, "admin").await {
                        Ok(user_id) => {
                            info!("Bootstrap admin user created: id={}, username={}", user_id, username);
                        }
                        Err(e) => {
                            eprintln!("Failed to create bootstrap admin user: {}", e);
                        }
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to check user count during bootstrap: {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_token_is_deterministic_and_never_the_raw_token() {
        let a = hash_token("device-a-token");
        let b = hash_token("device-a-token");
        assert_eq!(a, b, "same input must hash to the same digest");
        assert_ne!(a, "device-a-token", "the digest must never equal the raw token");
        assert_eq!(a.len(), 64, "SHA-256 hex digest is 64 chars");
    }

    #[test]
    fn hash_token_differs_per_input() {
        let a = hash_token("device-a-token");
        let b = hash_token("device-b-token");
        assert_ne!(a, b, "different tokens (e.g. two devices) must hash differently");
    }

    // Multi-session behavior (two concurrent tokens valid, logout revokes only
    // one, the 10-session cap, and 401-on-invalid-token) all require a live
    // Postgres — this repo has no CI Postgres service (grep: no `postgres` in
    // .gitea/workflows/ci.yml), and every other DB-touching module here follows
    // the same convention of not spinning one up in `cargo test`. These were
    // verified manually end-to-end against a throwaway (non-live) Postgres 16
    // instance; see the WP-X2a report for the exact SQL/assertions run.
}
