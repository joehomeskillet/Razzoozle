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

/// Revoke sessions for a user (SEC-M1). Call this after any change that
/// invalidates previously-issued credentials — password reset/change, or a
/// role downgrade — so old bearer tokens stop working immediately instead of
/// remaining valid until they naturally expire.
///
/// **For password changes, prefer set_password_and_revoke() which atomically
/// updates the password and revokes sessions in a single transaction, closing
/// a race condition where an attacker could use an old token between the two
/// operations.**
///
/// `keep_token`, when Some, is the raw token of the session making the change
/// (e.g. a self-service password change) — that one session is preserved so
/// the caller isn't logged out by their own request. When None, ALL sessions
/// for the user are deleted (admin-initiated reset — every existing login
/// should be forced out).
pub async fn revoke_user_sessions(
    pool: &PgPool,
    user_id: i64,
    keep_token: Option<&str>,
) -> Result<(), String> {
    match keep_token {
        Some(token) => {
            let keep_hash = hash_token(token);
            sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2")
                .bind(user_id)
                .bind(&keep_hash)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        None => {
            sqlx::query("DELETE FROM sessions WHERE user_id = $1")
                .bind(user_id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

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

/// Count active admins (role='admin' AND active=true). Used by the
/// last-admin delete guard so the final active admin can never be removed.
pub async fn count_active_admins(pool: &PgPool) -> Result<i64, sqlx::Error> {
    let result = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = true"
    )
    .fetch_one(pool)
    .await?;

    Ok(result.0)
}

/// Get (role, active) for a user id. None if the user does not exist.
pub async fn get_user_role_active(pool: &PgPool, user_id: i64) -> Result<Option<(String, bool)>, sqlx::Error> {
    let result = sqlx::query_as::<_, (String, bool)>(
        "SELECT role, active FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(result)
}

/// Permanently delete a user row. Returns true if a row was deleted, false if
/// no user with that id existed. Callers are responsible for revoking
/// sessions and enforcing self-delete/last-admin guards before calling this.
pub async fn delete_user(pool: &PgPool, user_id: i64) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;

    Ok(result.rows_affected() > 0)
}

/// Outcome of `delete_user_guarded` — the HTTP handler maps each variant to
/// its own status code (Deleted -> 200, NotFound -> 404, LastActiveAdmin -> 400).
#[derive(Debug, PartialEq, Eq)]
pub enum DeleteUserOutcome {
    Deleted,
    NotFound,
    LastActiveAdmin,
}

/// Delete a user with the last-admin guard enforced INSIDE a single
/// transaction — this closes a TOCTOU race that a separate
/// count_active_admins()-then-delete_user() call pair has: two admins
/// deleting each other concurrently could each read count=2 before either
/// commits, and both proceed, leaving zero admins. A "DELETE ... WHERE id NOT
/// IN (subquery)" one-liner does NOT fix this under READ COMMITTED either —
/// each statement's snapshot doesn't see the other transaction's uncommitted
/// delete.
///
/// Instead: `SELECT ... FOR UPDATE` locks the *entire* active-admin set (in a
/// deterministic `ORDER BY id`, so two concurrent callers block on each other
/// in the same row order instead of deadlocking) before deciding. The second
/// transaction to acquire the lock re-reads a set that already reflects the
/// first transaction's outcome (post-commit) or waits (pre-commit) — either
/// way the count it sees is correct at decision time.
pub async fn delete_user_guarded(pool: &PgPool, user_id: i64) -> Result<DeleteUserOutcome, sqlx::Error> {
    let mut tx = pool.begin().await?;

    // Read target WITHOUT a row lock — only used to decide whether the
    // last-admin check below even applies to this user.
    let target = sqlx::query_as::<_, (String, bool)>(
        "SELECT role, active FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;

    let (role, active) = match target {
        Some(v) => v,
        None => {
            tx.rollback().await?;
            return Ok(DeleteUserOutcome::NotFound);
        }
    };

    if role == "admin" && active {
        let locked_admin_ids: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE role = 'admin' AND active = true ORDER BY id FOR UPDATE"
        )
        .fetch_all(&mut *tx)
        .await?;

        let target_is_locked_active_admin = locked_admin_ids.iter().any(|(id,)| *id == user_id);
        if target_is_locked_active_admin && locked_admin_ids.len() <= 1 {
            tx.rollback().await?;
            return Ok(DeleteUserOutcome::LastActiveAdmin);
        }
        // Either the target dropped out of the locked active-admin set
        // (changed concurrently — guard is moot) or more than one active
        // admin remains — safe to proceed.
    }

    // sessions.user_id -> users.id ON DELETE CASCADE (migration 007): deleting
    // the user row atomically removes their sessions in this same
    // transaction. No separate revoke_user_sessions() call here — that would
    // run on its own connection/transaction and would NOT be atomic with the
    // delete (the exact gap this guard closes for the admin-count race).
    let result = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

    if result.rows_affected() == 0 {
        tx.rollback().await?;
        return Ok(DeleteUserOutcome::NotFound);
    }

    tx.commit().await?;
    Ok(DeleteUserOutcome::Deleted)
}

/// Hash and store a new password for the given user.
///
/// **For password changes followed by session revocation, prefer
/// set_password_and_revoke() which performs both operations atomically.**
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

/// Atomically update a user's password and revoke their sessions in a single transaction.
/// This closes the race condition where an attacker could use an old session token
/// between the password update and the session revocation.
///
/// SEC-M1: Both admin password resets and self-service password changes must
/// update the password and revoke conflicting sessions atomically.
///
/// When `keep_token` is Some (self-service change), the raw token of the session
/// making the request is preserved so the caller isn't logged out by their own
/// password change. When None (admin reset), all existing sessions are revoked.
///
/// Returns Ok(()) on success (transaction committed), Err on failure (rolled back).
pub async fn set_password_and_revoke(
    pool: &PgPool,
    user_id: i64,
    new_password: &str,
    keep_token: Option<&str>,
) -> Result<(), String> {
    // Hash password using argon2 (same pattern as set_password and create_user).
    let salt = SaltString::generate(rand::thread_rng());
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(new_password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?
        .to_string();

    // Begin transaction
    let mut tx = pool.begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Update password_hash for the user
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to update password: {}", e))?;

    // Revoke sessions (keeping one if specified)
    match keep_token {
        Some(token) => {
            let keep_hash = hash_token(token);
            sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2")
                .bind(user_id)
                .bind(&keep_hash)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to revoke sessions: {}", e))?;
        }
        None => {
            sqlx::query("DELETE FROM sessions WHERE user_id = $1")
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to revoke sessions: {}", e))?;
        }
    }

    // Commit transaction
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

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

    /// Cross-check against migration 020's backfill: `encode(digest(token,
    /// 'sha256'), 'hex')` must produce the exact same lowercase hex string as
    /// this function, otherwise a forward-hashed legacy row would silently
    /// stop matching require_user() lookups after the migration. Expected
    /// value computed via `psql -c "SELECT encode(digest('live-active-plaintext-token-abc123'::bytea,'sha256'),'hex')"`
    /// against a throwaway Postgres 16 (pgcrypto) — see WP-X2a report.
    #[test]
    fn hash_token_matches_pgcrypto_digest_sha256_hex() {
        let rust_hash = hash_token("live-active-plaintext-token-abc123");
        let sql_computed_hash = "50d217cface91deae25f6d34f09f563b76db3a2a69be1efdeb0048ffd598413c";
        assert_eq!(rust_hash, sql_computed_hash, "Rust hash_token() must be byte-identical to Postgres pgcrypto's encode(digest(token,'sha256'),'hex')");
    }

    // Multi-session behavior (two concurrent tokens valid, logout revokes only
    // one, the 10-session cap, and 401-on-invalid-token) all require a live
    // Postgres — this repo has no CI Postgres service (grep: no `postgres` in
    // .gitea/workflows/ci.yml), and every other DB-touching module here follows
    // the same convention of not spinning one up in `cargo test`. These were
    // verified manually end-to-end against a throwaway (non-live) Postgres 16
    // instance; see the WP-X2a report for the exact SQL/assertions run.

    // revoke_user_sessions (SEC-M1) is the same DELETE pattern as the two
    // cases above, so it follows the same manual-verification convention.
    // Verified against a throwaway Postgres 16: 2 users, user A with two
    // sessions (hash-a1, hash-a2) and user B with one (hash-b1). Running the
    // exact `keep_token = Some` query (DELETE ... token_hash <> $2) for user A
    // left only hash-a1 and did not touch user B's hash-b1. Running the exact
    // `keep_token = None` query (DELETE ... WHERE user_id = $1, no hash
    // filter) for user B removed hash-b1 and left user A's hash-a1 untouched.
}

mod tests_users_delete;
