//! Tests for bulk user management functions (deactivate_user_guarded, bulk_activate, bulk_deactivate, bulk_delete).
//! These tests require a live Postgres database (DATABASE_URL env var).
//! Run with: `cargo test --test '*' -- --include-ignored` or similar.

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

    /// Temporarily deactivate non-test active admins so last-admin scenarios are
    /// deterministic against a shared DB that may already have a bootstrap admin.
    /// Returns the IDs that were deactivated so the caller can restore them.
    async fn suspend_non_test_active_admins(pool: &sqlx::PgPool) -> Vec<i64> {
        let others: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE role = 'admin' AND active = true AND username NOT LIKE 'test_%'"
        )
        .fetch_all(pool)
        .await
        .expect("Failed to list non-test active admins");

        let mut ids = Vec::with_capacity(others.len());
        for (id,) in others {
            set_user_active(pool, id, false)
                .await
                .expect("Failed to suspend non-test admin for isolation");
            ids.push(id);
        }
        ids
    }

    async fn restore_active_admins(pool: &sqlx::PgPool, ids: &[i64]) {
        for id in ids {
            let _ = set_user_active(pool, *id, true).await;
        }
    }

    /// Fetch (id, active) for verification; panics if the row is missing.
    async fn fetch_id_active(pool: &sqlx::PgPool, user_id: i64) -> (i64, bool) {
        sqlx::query_as::<_, (i64, bool)>("SELECT id, active FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .expect("Failed to fetch user id/active")
    }

    // ── Group 1: deactivate_user_guarded ──────────────────────────────────

    /// Blocks deactivating the last remaining active admin after peers are gone.
    #[tokio::test]
    #[ignore] // Ignore by default; run only when DATABASE_URL is set
    async fn test_deactivate_user_guarded_blocks_last_active_admin() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        // Create 2 active admins + 1 regular user
        let id1 = create_user(&pool, "test_deactivate_g1_admin1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let id2 = create_user(&pool, "test_deactivate_g1_admin2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let _regular = create_user(&pool, "test_deactivate_g1_user", "pass123", "user")
            .await
            .expect("Failed to create regular user");

        // Deactivate first admin while a peer remains
        let outcome1 = deactivate_user_guarded(&pool, id1)
            .await
            .expect("deactivate_user_guarded(id1) failed");
        assert_eq!(
            outcome1,
            DeactivateUserOutcome::Deactivated,
            "expected Deactivated for first of two admins, got {:?}",
            outcome1
        );
        let (_, active1) = fetch_id_active(&pool, id1).await;
        assert!(!active1, "admin1 should be inactive after deactivation");

        // Second admin is now sole active admin → LastActiveAdmin
        let outcome2 = deactivate_user_guarded(&pool, id2)
            .await
            .expect("deactivate_user_guarded(id2) failed");
        assert_eq!(
            outcome2,
            DeactivateUserOutcome::LastActiveAdmin,
            "expected LastActiveAdmin for sole remaining admin, got {:?}",
            outcome2
        );
        let (_, active2) = fetch_id_active(&pool, id2).await;
        assert!(
            active2,
            "admin2 must remain active after LastActiveAdmin rejection"
        );

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Allows deactivating one admin when other active admins remain.
    #[tokio::test]
    #[ignore]
    async fn test_deactivate_user_guarded_allows_deactivation_with_multiple_admins() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_deactivate_g1_multi_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let id2 = create_user(&pool, "test_deactivate_g1_multi_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_deactivate_g1_multi_a3", "pass123", "admin")
            .await
            .expect("Failed to create admin3");

        let outcome = deactivate_user_guarded(&pool, id1)
            .await
            .expect("deactivate_user_guarded(id1) failed");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::Deactivated,
            "expected Deactivated with multiple admins remaining, got {:?}",
            outcome
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a3) = fetch_id_active(&pool, id3).await;
        assert!(!a1, "admin1 should be inactive after deactivation");
        assert!(a2, "admin2 should still be active");
        assert!(a3, "admin3 should still be active");

        cleanup_test_users(&pool).await;
    }

    /// Already-inactive users deactivate idempotently (Deactivated, still inactive).
    #[tokio::test]
    #[ignore]
    async fn test_deactivate_user_guarded_idempotent_when_already_inactive() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Keep at least one active admin fixture for shared-DB safety
        let _admin = create_user(&pool, "test_deactivate_g1_idem_admin", "pass123", "admin")
            .await
            .expect("Failed to create active admin");

        let inactive_id = create_user(&pool, "test_deactivate_g1_idem_user", "pass123", "user")
            .await
            .expect("Failed to create user");
        set_user_active(&pool, inactive_id, false)
            .await
            .expect("Failed to pre-deactivate user");

        let (_, before) = fetch_id_active(&pool, inactive_id).await;
        assert!(!before, "fixture user should be inactive before call");

        let outcome = deactivate_user_guarded(&pool, inactive_id)
            .await
            .expect("deactivate_user_guarded(inactive) failed");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::Deactivated,
            "expected Deactivated (idempotent) for already-inactive user, got {:?}",
            outcome
        );
        let (_, after) = fetch_id_active(&pool, inactive_id).await;
        assert!(!after, "user should still be inactive after idempotent deactivate");

        cleanup_test_users(&pool).await;
    }

    /// Unknown user ID returns NotFound.
    #[tokio::test]
    #[ignore]
    async fn test_deactivate_user_guarded_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let nonexistent_id: i64 = 999999;

        let outcome = deactivate_user_guarded(&pool, nonexistent_id)
            .await
            .expect("deactivate_user_guarded(nonexistent) failed");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::NotFound,
            "expected NotFound for missing user id {}, got {:?}",
            nonexistent_id,
            outcome
        );

        cleanup_test_users(&pool).await;
    }
}
