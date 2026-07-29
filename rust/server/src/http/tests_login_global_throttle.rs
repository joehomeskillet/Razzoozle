//! Integration test: Global login throttle DoS vulnerability (issue #705)
//!
//! This test demonstrates that the global login throttle allows one client to
//! lock out all other clients, even those with valid credentials.
//!
//! Vulnerability (BEFORE the fix): is_auth_throttled_global() checks a single
//! "global" key across ALL login attempts. Any client making 10+ failed
//! attempts triggers the throttle for everyone, causing a denial-of-service.
//! AFTER the fix, the throttle key is derived per-client (from the connecting
//! peer IP, or from X-Forwarded-For/X-Real-IP if the peer is a trusted proxy),
//! so an attacker's failures no longer affect other clients.
//!
//! Test requirements:
//! - A live PostgreSQL database (DATABASE_URL env var)
//! - Must be a separate test database (not razzoozle_postgres)
//! - Example: Start before running:
//!   docker run --rm -d --name test_razz \
//!     -e POSTGRES_PASSWORD=testpass \
//!     -p 5433:5432 \
//!     postgres:16-alpine
//!   Then: DATABASE_URL=postgres://postgres:testpass@localhost:5433/postgres \
//!     cargo test --bin razzoozle-server tests_login_global_throttle -- --ignored --nocapture
//!
//! Run with: cargo test --bin razzoozle-server tests_login_global_throttle -- --ignored

#[cfg(test)]
mod tests {
    use axum::{extract::State, http::StatusCode, Json};
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    // Re-import the handlers and types from the parent module
    use crate::db::users;
    use crate::http::login::{handle_login, LoginRequest};
    use crate::http::AppState;
    use crate::state::{GameRegistry, QuizFixture};

    /// Helper to get a database pool from the DATABASE_URL env var.
    /// Returns None if DATABASE_URL is not set or connection fails.
    async fn get_test_pool() -> Option<sqlx::PgPool> {
        let db_url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new()
            .max_connections(10)
            .connect(&db_url)
            .await
            .ok()
    }

    /// Helper to clean up test users after each test.
    async fn cleanup_test_users(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_login_%'")
            .execute(pool)
            .await;
    }

    /// Test that demonstrates the global throttle DoS vulnerability.
    ///
    /// EXPECTED BEHAVIOR (per-client throttle):
    /// - Client A makes 11+ failed login attempts
    /// - Client A becomes throttled (denied)
    /// - Client B makes a login attempt with CORRECT password
    /// - Client B succeeds (independent throttle per client)
    ///
    /// BUGGY BEHAVIOR (global throttle, pre-fix):
    /// - Client A makes 11+ failed login attempts (increments global counter)
    /// - Client B makes a login attempt with CORRECT password
    /// - Client B is DENIED (global throttle blocks them)
    /// - This is a DoS: attacker locks out all users
    #[tokio::test]
    #[ignore] // Ignore by default; run only when DATABASE_URL is set
    async fn global_throttle_allows_dos_attacker_to_lock_out_all_users() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        // Clean up any prior test data
        cleanup_test_users(&pool).await;

        // Create test users
        let client_a_username = "test_login_attacker";
        let client_a_password = "attacker_real_password";
        let client_a_attempt_password = "wrong_password";

        let client_b_username = "test_login_victim";
        let client_b_password = "correct_password_123";

        // Use the production user creation function
        let _client_a_id = users::create_user(&pool, client_a_username, client_a_password, "user")
            .await
            .expect("Failed to create client A user");

        let _client_b_id = users::create_user(&pool, client_b_username, client_b_password, "user")
            .await
            .expect("Failed to create client B user");

        // Create AppState with the test pool
        // Note: rate_limiter is a global lazy_static, not part of AppState
        let registry = GameRegistry::new(
            &Some(pool.clone()),
            QuizFixture::load().expect("Failed to load fixture quiz"),
        )
        .await;

        let app_state = AppState {
            db_pool: Some(pool.clone()),
            registry: Arc::new(RwLock::new(registry)),
            io: socketioxide::SocketIo::builder().build_layer().1,
        };

        // ─── Phase 1: Client A makes 11+ FAILED login attempts ─────────────────
        // Each failure with wrong password increments Client A's throttle counter.
        eprintln!(
            "\nPhase 1: Client A makes 11 failed login attempts (should exceed threshold of 10)"
        );

        for attempt in 1..=11 {
            let request = LoginRequest {
                username: client_a_username.to_string(),
                password: client_a_attempt_password.to_string(), // Wrong password
            };

            let result = handle_login(State(app_state.clone()), Json(request)).await;

            match result {
                Err((StatusCode::UNAUTHORIZED, _)) => {
                    eprintln!(
                        "  Attempt {}: DENIED (as expected, wrong password)",
                        attempt
                    );
                }
                Ok(_) => {
                    panic!(
                        "Attempt {}: Unexpectedly succeeded with wrong password",
                        attempt
                    );
                }
                Err((code, msg)) => {
                    eprintln!("  Attempt {}: Error {:?} - {}", attempt, code, msg);
                }
            }
        }

        // Verify that Client A is now throttled
        eprintln!("\nPhase 2: Verify Client A is now throttled (its own counter exceeded)");
        let request = LoginRequest {
            username: client_a_username.to_string(),
            password: client_a_password.to_string(), // Even with CORRECT password
        };

        let result = handle_login(State(app_state.clone()), Json(request)).await;

        match result {
            Err((StatusCode::UNAUTHORIZED, _)) => {
                eprintln!("  Client A with correct password: DENIED (throttled, as expected)");
            }
            Ok(_) => {
                eprintln!("  Client A with correct password: SUCCEEDED (unexpected!)");
            }
            Err((code, msg)) => {
                eprintln!(
                    "  Client A with correct password: Error {:?} - {}",
                    code, msg
                );
            }
        }

        // ─── Phase 3: Client B tries to login ──────────────────────────────────
        // Client B has NOT made any failed attempts, but should they succeed?
        // With a per-client throttle, YES. With a global throttle (the bug), NO.
        eprintln!("\nPhase 3: Client B makes login attempt with CORRECT password");
        eprintln!("Expected: SUCCESS (independent throttle per client)");

        let request = LoginRequest {
            username: client_b_username.to_string(),
            password: client_b_password.to_string(), // CORRECT password
        };

        let result = handle_login(State(app_state.clone()), Json(request)).await;

        // THIS ASSERTION DEMONSTRATES THE FIX (or the vulnerability, if it regresses).
        match result {
            Ok(response) => {
                // This is the CORRECT behavior (per-client throttle)
                eprintln!("\n✓ Client B SUCCEEDED with correct password");
                eprintln!("  Token: {}", response.token);
                eprintln!("  Username: {}", response.username);
                eprintln!("\n✓ TEST PASSED: Throttle is per-client (SECURE)");
            }
            Err((StatusCode::UNAUTHORIZED, msg)) => {
                // This is the BUG: Client B is blocked by a global throttle
                eprintln!("\n✗ Client B DENIED with correct password!");
                eprintln!("  Error: {}", msg);
                eprintln!("\n✗ TEST FAILED (DEMONSTRATES VULNERABILITY):");
                eprintln!("  - Attacker (Client A) made 11 failed attempts");
                eprintln!("  - Legitimate user (Client B) has NO failed attempts");
                eprintln!("  - Yet Client B is DENIED by the throttle");
                eprintln!("  - This is a Denial-of-Service vulnerability");

                panic!(
                    "VULNERABILITY CONFIRMED: Client B (legitimate user) was denied due to a \
                    shared throttle key. The login throttle must be keyed per client, not globally."
                );
            }
            Err((code, msg)) => {
                panic!("Unexpected error: {:?} - {}", code, msg);
            }
        }

        // Clean up
        cleanup_test_users(&pool).await;
    }
}
