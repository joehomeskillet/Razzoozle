//! Tests for session revocation security issue (#712–#714)
//!
//! Verifies that a session revoked on the backend is properly invalidated
//! for open socket connections (or demonstrates the bug if not).

#[cfg(test)]
mod tests {
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
    /// **TEST EXPECTATION:** This test FAILS TODAY, demonstrating the bug. After
    /// delete_session() invalidates the token in the database, require_user() still
    /// returns Some(user) instead of None because the cache was populated on the
    /// first call and is never re-checked.
    ///
    /// **PRODUCTION IMPACT:** A manager/teacher whose session is revoked (disabled
    /// account, logout in another browser tab) can continue sending privileged events
    /// (game:start, skipQuestion, etc.) on the same socket connection until the
    /// handler explicitly calls require_user() again — which it won't, since the
    /// cache is opaque to the handler.
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
        let (_layer, io) = socketioxide::SocketIo::builder().build_layer();
        let ctx = crate::socket::HandlerCtx {
            registry: std::sync::Arc::new(tokio::sync::RwLock::new(
                crate::state::GameRegistry::new(
                    &None,
                    crate::state::QuizFixture::default().clone(),
                )
                .await,
            )),
            io,
            client_id: "test_client_id".to_string(),
            db_pool: Some(pool.clone()),
            session_token: Some(session_token.clone()),
            satellite_token: None,
            user_cache: std::sync::Arc::new(tokio::sync::RwLock::new(None)),
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
            second_require.is_none(),
            "SECURITY BUG: require_user() returned {:?} after session was deleted from database. \
             The user_cache was populated on the first call and is never re-validated, \
             allowing revoked sessions to remain active on open socket connections.",
            second_require
        );

        cleanup_test_users(&pool).await;
    }
}
