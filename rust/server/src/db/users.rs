//! User account and session management — W0-A1 auth foundation primitive.
//! Additive: coexists with existing manager-password auth without modification.

use argon2::{Argon2, PasswordHasher, PasswordVerifier};
use argon2::password_hash::{SaltString, PasswordHash};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::Rng;
use sqlx::PgPool;
use tracing::info;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: i64,
    pub role: String,
}

/// Create a new user with username, plaintext password, and role.
/// Hashes the password using argon2, inserts into users table, returns user id.
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

    // Insert into users table
    let result = sqlx::query_as::<_, (i64,)>(
        "INSERT INTO users (username, password_hash, role, active, created_at) \
         VALUES ($1, $2, $3, true, now()) \
         RETURNING id"
    )
    .bind(username)
    .bind(&password_hash)
    .bind(role)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.0)
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
/// Token expires after ttl_days. Inserts into sessions table.
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

    // Calculate expiration
    let expires_at = sqlx::types::chrono::Utc::now() + chrono::Duration::days(ttl_days);

    // Insert into sessions table
    sqlx::query(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) \
         VALUES ($1, $2, now(), $3)"
    )
    .bind(&token)
    .bind(user_id)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(token)
}

/// Retrieve a user by session token. Returns AuthUser if token is valid and not expired.
pub async fn session_user(
    pool: &PgPool,
    token: &str,
) -> Result<Option<AuthUser>, String> {
    let result = sqlx::query_as::<_, (i64, String)>(
        "SELECT u.id, u.role FROM sessions s \
         JOIN users u ON s.user_id = u.id \
         WHERE s.token = $1 AND s.expires_at > now() AND u.active = true"
    )
    .bind(token)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.map(|(user_id, role)| AuthUser { user_id, role }))
}

/// Count the total number of users in the database.
pub async fn count_users(pool: &PgPool) -> Result<i64, String> {
    let result = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.0)
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
