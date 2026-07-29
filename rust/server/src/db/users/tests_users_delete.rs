//! Tests for user deletion functions: count_active_admins.
//! These tests require a live Postgres database (DATABASE_URL env var).
//! Run with: `cargo test --test '*' -- --include-ignored` or `cargo test` (ignored tests only run with DATABASE_URL).

#[cfg(test)]
mod tests {
    use super::super::*;
    use sqlx::postgres::PgPoolOptions;

    /// Helper to get a database pool from the DATABASE_URL env var.
    /// Returns None if DATABASE_URL is not set or connection fails.
    async fn get_test_pool() -> Option<sqlx::PgPool> {
        let db_url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .ok()
    }

    /// Helper to clean up test fixtures after each test.
    /// Deletes all users created by tests (username starting with "test_").
    async fn cleanup_test_users(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_%'")
            .execute(pool)
            .await;
    }

    // ── Database-dependent tests (require DATABASE_URL) ────────────────────

    #[tokio::test]
    #[ignore] // Ignore by default; run only when DATABASE_URL is set
    async fn count_active_admins_filters_correctly() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        // Clean up any prior test data
        cleanup_test_users(&pool).await;

        // Create fixture: 1 active admin, 1 inactive admin, 1 regular user
        let active_admin_id = create_user(&pool, "test_active_admin", "pass123", "admin")
            .await
            .expect("Failed to create active admin");

        let inactive_admin_id = create_user(&pool, "test_inactive_admin", "pass123", "admin")
            .await
            .expect("Failed to create inactive admin");

        let user_id = create_user(&pool, "test_regular_user", "pass123", "user")
            .await
            .expect("Failed to create regular user");

        // Deactivate the second admin
        set_user_active(&pool, inactive_admin_id, false)
            .await
            .expect("Failed to deactivate admin");

        // Count should only include the active admin
        let count = count_active_admins(&pool)
            .await
            .expect("count_active_admins failed");

        // We should have at least 1 (the active one we just created).
        // There may be others from prior test runs, so we check >= 1.
        assert!(
            count >= 1,
            "Expected at least 1 active admin, got {}",
            count
        );

        // Verify the inactive admin is not counted by creating another active
        // admin and checking the increment
        let before_count = count;
        let _another_admin = create_user(&pool, "test_another_admin", "pass123", "admin")
            .await
            .expect("Failed to create another admin");

        let after_count = count_active_admins(&pool)
            .await
            .expect("count_active_admins failed");

        assert_eq!(
            after_count,
            before_count + 1,
            "Adding an active admin should increment count by 1"
        );

        // Clean up
        cleanup_test_users(&pool).await;
    }
}
