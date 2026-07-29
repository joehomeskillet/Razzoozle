//! socket/ — one file per socket.io event handler (state-of-the-art modular layout
//! for agent-friendly parallel development: a worker editing one handler cannot touch
//! another). Each handler file exposes `pub fn register(socket: &SocketRef, ctx: HandlerCtx)`
//! and registers its own `socket.on(...)`. main.rs stays thin and calls `register_all`.

use crate::db::users::AuthUser;
use crate::state::GameRegistry;
use socketioxide::{extract::SocketRef, SocketIo};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Everything a handler closure needs, captured once at connect and cloned per handler.
#[derive(Clone)]
pub struct HandlerCtx {
    pub registry: Arc<RwLock<GameRegistry>>,
    pub io: SocketIo,
    pub client_id: String,
    pub db_pool: Option<sqlx::PgPool>,
    /// Session token from handshake auth payload (None if not provided).
    pub session_token: Option<String>,
    /// Satellite token from handshake auth payload (None if not provided).
    pub satellite_token: Option<String>,
    /// Lazily-resolved and cached user. Populated on first require_user/require_admin call.
    pub user_cache: Arc<RwLock<Option<AuthUser>>>,
}

impl HandlerCtx {
    /// Resolve and cache the user if not already cached. Returns Some(&user) if valid session, None otherwise.
    /// Call this before operations that require authentication.
    pub async fn require_user(&self) -> Option<AuthUser> {
        // Check cache first (read lock, non-blocking)
        {
            let cache = self.user_cache.read().await;
            if cache.is_some() {
                return cache.clone();
            }
        }

        // Not cached; try to resolve from token
        if let Some(ref token) = self.session_token {
            if let Some(ref pool) = self.db_pool {
                if let Ok(Some(user)) = crate::db::users::session_user(pool, token).await {
                    // Cache it
                    let mut cache = self.user_cache.write().await;
                    *cache = Some(user.clone());
                    return cache.clone();
                }
            }
        }

        None
    }

    /// Require admin role: return Some(user) if logged in AND role=="admin", None otherwise.
    pub async fn require_admin(&self) -> Option<AuthUser> {
        self.require_user()
            .await
            .and_then(|u| if u.role == "admin" { Some(u) } else { None })
    }
}

// AI submodules (used by ai handler)
pub mod ai_config;
pub mod ai_http;
pub mod ai_provider;
pub mod ai_ratelimit;
pub mod ai_secrets;
pub mod ai_utils;
pub mod ai_validate;

pub mod auth;

pub mod ai;
pub mod clock_ping;
pub mod cooldown;
pub mod display;
pub mod game;
pub mod lifecycle;
pub mod manager;
pub mod metrics;
pub mod player;
pub mod results;
pub mod reveal_helpers;
pub mod status_emit;
pub mod validation;

/// Register every extracted handler on a freshly-connected socket.
/// Handlers still inline in main.rs are registered there until they migrate here.
pub fn register_all(socket: &SocketRef, ctx: &HandlerCtx) {
    ai::register(socket, ctx.clone());
    clock_ping::register(socket, ctx.clone());
    display::register(socket, ctx.clone());
    game::register(socket, ctx.clone());
    manager::register(socket, ctx.clone());
    metrics::register(socket, ctx.clone());
    results::register(socket, ctx.clone());
    player::register(socket, ctx.clone());
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::postgres::PgPoolOptions;

    /// Helper: get test pool from DATABASE_URL env var
    async fn get_test_pool() -> Option<sqlx::PgPool> {
        let db_url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .ok()
    }

    /// Helper: cleanup test data
    async fn cleanup_test_users(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_socket_revoked_%'")
            .execute(pool)
            .await;
    }

    /// SECURITY ISSUE: Session revoked on open socket connection remains valid (#712–#714)
    ///
    /// Reproduces a security gap where a session is revoked (deleted/user deactivated)
    /// in the database, but an existing Socket-connected HandlerCtx still accepts it
    /// because require_user() caches the result and never re-validates against the DB.
    ///
    /// **TEST RESULT:** This test PASSES TODAY, demonstrating the bug exists. After
    /// delete_session() invalidates the token in the database, require_user() still
    /// returns Some(user) because the cache was populated on the first call and is
    /// never re-checked. If this test FAILS, it means the bug has been fixed.
    ///
    /// **PRODUCTION IMPACT:** A manager/teacher whose session is revoked (disabled
    /// account, logout in another browser tab) can continue sending privileged events
    /// (game:start, skipQuestion, etc.) on the same socket connection because the
    /// handler uses the cached user without re-validating the session token.
    #[tokio::test]
    #[ignore] // Runs only when DATABASE_URL is set
    async fn session_revoked_on_open_socket_connection_remains_valid_bug() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Step 1: Create a user
        let user_id = crate::db::users::create_user(&pool, "test_socket_revoked_user", "pass123", "user")
            .await
            .expect("Failed to create test user");

        // Step 2: Mint a session token
        let session_token = crate::db::users::mint_session(&pool, user_id, 7)
            .await
            .expect("Failed to mint session");

        // Step 3: Verify the session is valid before creating HandlerCtx
        let before_revoke = crate::db::users::session_user(&pool, &session_token)
            .await
            .expect("Failed to query session before revoke");
        assert!(
            before_revoke.is_some(),
            "Session should be valid in DB before revocation"
        );

        // Step 4: Create a HandlerCtx with this session token (simulates socket handshake)
        let quiz = crate::state::QuizFixture::load().expect("Failed to load quiz fixture");
        let (_layer, io) = SocketIo::builder().build_layer();
        let ctx = HandlerCtx {
            registry: Arc::new(RwLock::new(
                crate::state::GameRegistry::new(&None, quiz)
                    .await,
            )),
            io,
            client_id: "test_client_id".to_string(),
            db_pool: Some(pool.clone()),
            session_token: Some(session_token.clone()),
            satellite_token: None,
            user_cache: Arc::new(RwLock::new(None)),
        };

        // Step 5: Call require_user() once — this populates the cache
        let first_require = ctx.require_user().await;
        assert!(
            first_require.is_some(),
            "First require_user() should return Some (valid session)"
        );
        assert_eq!(
            first_require.clone().unwrap().user_id,
            user_id,
            "Returned user_id should match"
        );

        // Step 6: Revoke the session in the database (simulates logout/admin revocation)
        crate::db::users::delete_session(&pool, &session_token)
            .await
            .expect("Failed to delete session");

        // Step 7: Verify the session is now invalid in the database
        let after_revoke_db = crate::db::users::session_user(&pool, &session_token)
            .await
            .expect("Failed to query session after revoke");
        assert!(
            after_revoke_db.is_none(),
            "Session should be None after deletion in database"
        );

        // Step 8: Call require_user() again on the same HandlerCtx
        // BUG: This still returns Some(user) because the cache is not invalidated
        let second_require = ctx.require_user().await;

        // EXPECTED (secure): second_require should be None
        // ACTUAL (bug): second_require is Some(user) — cache is still valid
        assert!(
            second_require.is_some(),
            "SECURITY BUG FIXED: require_user() correctly rejected the revoked session. \
             If you see this failure, it means the cache no longer returns stale sessions after revocation.",
        );

        cleanup_test_users(&pool).await;
    }
}
