//! Tests for bulk user operations: bulk_activate, bulk_deactivate, bulk_delete, deactivate_user_guarded.
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
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_bulk_%'")
            .execute(pool)
            .await;
    }

    /// Temporarily deactivate non-test active admins so last-admin scenarios are
    /// deterministic against a shared DB that may already have a bootstrap admin.
    /// Returns the IDs that were deactivated so the caller can restore them.
    async fn suspend_non_test_active_admins(pool: &sqlx::PgPool) -> Vec<i64> {
        let others: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE role = 'admin' AND active = true \
             AND username NOT LIKE 'test_bulk_%'"
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

    // ── deactivate_user_guarded tests ──────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_nonexistent_returns_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let nonexistent_id: i64 = 999999999;
        let outcome = deactivate_user_guarded(&pool, nonexistent_id)
            .await
            .expect("deactivate_user_guarded failed");

        assert_eq!(
            outcome, DeactivateUserOutcome::NotFound,
            "Should return NotFound for nonexistent user"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_already_inactive_returns_deactivated_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a user and deactivate it
        let user_id = create_user(
            &pool,
            "test_bulk_already_inactive",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create test user");

        set_user_active(&pool, user_id, false)
            .await
            .expect("Failed to deactivate user initially");

        // Try to deactivate again — should succeed idempotently
        let outcome = deactivate_user_guarded(&pool, user_id)
            .await
            .expect("deactivate_user_guarded failed");

        assert_eq!(
            outcome, DeactivateUserOutcome::Deactivated,
            "Should return Deactivated even if already inactive (idempotent)"
        );

        // Verify still inactive
        let (role, active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch user");

        assert!(!active, "User should remain inactive");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_last_active_admin_blocks() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create two admins
        let admin1 = create_user(&pool, "test_bulk_admin1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let admin2 = create_user(&pool, "test_bulk_admin2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        // Deactivate admin2
        set_user_active(&pool, admin2, false)
            .await
            .expect("Failed to deactivate admin2");

        // Now admin1 is the LAST active admin. Try to deactivate it.
        let outcome = deactivate_user_guarded(&pool, admin1)
            .await
            .expect("deactivate_user_guarded failed");

        assert_eq!(
            outcome, DeactivateUserOutcome::LastActiveAdmin,
            "Should block deactivation of last active admin"
        );

        // Verify admin1 is still active
        let (_, active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(admin1)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch admin1");

        assert!(active, "Last active admin should remain active");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_normal_deactivate_succeeds() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create two admins
        let admin1 = create_user(&pool, "test_bulk_admin3", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let admin2 = create_user(&pool, "test_bulk_admin4", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        // Deactivate admin1 — admin2 remains active, so no last-admin guard
        let outcome = deactivate_user_guarded(&pool, admin1)
            .await
            .expect("deactivate_user_guarded failed");

        assert_eq!(
            outcome, DeactivateUserOutcome::Deactivated,
            "Should deactivate successfully when other active admin exists"
        );

        // Verify admin1 is now inactive
        let (_, active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(admin1)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch admin1");

        assert!(!active, "Admin should be deactivated");

        cleanup_test_users(&pool).await;
    }

    // ── bulk_deactivate tests ──────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_requester_skipped() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_requester", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let target = create_user(&pool, "test_bulk_target1", "pass123", "user")
            .await
            .expect("Failed to create target");

        // Bulk deactivate with requester in the list
        let result = bulk_deactivate(&pool, requester, vec![requester, target])
            .await
            .expect("bulk_deactivate failed");

        // Requester should be skipped
        assert_eq!(result.skipped.len(), 1, "Should have 1 skipped entry");
        assert_eq!(result.skipped[0].id, requester, "Requester should be skipped");
        assert_eq!(result.skipped[0].reason, "self", "Reason should be 'self'");

        // Target should be succeeded
        assert_eq!(result.succeeded.len(), 1, "Should have 1 succeeded");
        assert_eq!(result.succeeded[0], target, "Target should be succeeded");

        // Verify target is inactive, requester is still active
        let (_, target_active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch target");

        let (_, requester_active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(requester)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch requester");

        assert!(!target_active, "Target should be deactivated");
        assert!(requester_active, "Requester should remain active");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_last_admin_skipped() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_req_admin", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let admin1 = create_user(&pool, "test_bulk_admin5", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let admin2 = create_user(&pool, "test_bulk_admin6", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        // Deactivate admin2 to make admin1 the sole active admin
        set_user_active(&pool, admin2, false)
            .await
            .expect("Failed to deactivate admin2");

        // Try to deactivate both active and inactive admins
        let result = bulk_deactivate(&pool, requester, vec![admin1, admin2])
            .await
            .expect("bulk_deactivate failed");

        // admin1 (last active) should be skipped
        assert_eq!(result.skipped.len(), 1, "Should have 1 skipped (last admin)");
        assert_eq!(result.skipped[0].id, admin1, "Last admin should be skipped");
        assert_eq!(result.skipped[0].reason, "last_admin", "Reason should be 'last_admin'");

        // admin2 (already inactive) should be succeeded
        assert_eq!(result.succeeded.len(), 1, "Should have 1 succeeded");
        assert_eq!(result.succeeded[0], admin2, "Inactive admin should succeed");

        // Verify admin1 is still active
        let (_, admin1_active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(admin1)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch admin1");

        assert!(admin1_active, "Last active admin should remain active");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_not_found_fails() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_req2", "pass123", "user")
            .await
            .expect("Failed to create requester");

        let result = bulk_deactivate(&pool, requester, vec![999999999, 888888888])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(result.failed.len(), 2, "Should have 2 failed entries");
        assert_eq!(result.failed[0].reason, "not_found", "Reason should be 'not_found'");
        assert_eq!(result.failed[1].reason, "not_found", "Reason should be 'not_found'");
        assert!(result.succeeded.is_empty(), "Should have no succeeded entries");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_deduplicates_ids() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_req3", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let target = create_user(&pool, "test_bulk_dup_target", "pass123", "user")
            .await
            .expect("Failed to create target");

        // Deactivate with duplicate IDs
        let result = bulk_deactivate(&pool, requester, vec![target, target, target])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(result.succeeded.len(), 1, "Should have exactly 1 succeeded (duplicates removed)");
        assert_eq!(result.succeeded[0], target, "Target should be succeeded once");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_already_inactive_succeeded_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_req4", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let inactive_user = create_user(&pool, "test_bulk_inactive", "pass123", "user")
            .await
            .expect("Failed to create inactive user");

        set_user_active(&pool, inactive_user, false)
            .await
            .expect("Failed to deactivate user");

        // Try to deactivate an already-inactive user
        let result = bulk_deactivate(&pool, requester, vec![inactive_user])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 succeeded (idempotent)");
        assert_eq!(result.succeeded[0], inactive_user, "Inactive user should succeed");
        assert!(result.failed.is_empty(), "Should have no failed entries");

        cleanup_test_users(&pool).await;
    }

    // ── bulk_delete tests ──────────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_requester_skipped() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_del_req", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let target = create_user(&pool, "test_bulk_del_target", "pass123", "user")
            .await
            .expect("Failed to create target");

        let result = bulk_delete(&pool, requester, vec![requester, target])
            .await
            .expect("bulk_delete failed");

        assert_eq!(result.skipped.len(), 1, "Should have 1 skipped (self)");
        assert_eq!(result.skipped[0].id, requester, "Requester should be skipped");
        assert_eq!(result.skipped[0].reason, "self", "Reason should be 'self'");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 deleted");
        assert_eq!(result.succeeded[0], target, "Target should be deleted");

        // Verify target is deleted, requester still exists
        let target_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        let requester_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(requester)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        assert_eq!(target_count, 0, "Target should be deleted");
        assert_eq!(requester_count, 1, "Requester should still exist");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_last_admin_skipped() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_del_req_admin", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let admin1 = create_user(&pool, "test_bulk_del_admin1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let admin2 = create_user(&pool, "test_bulk_del_admin2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        // Deactivate admin2
        set_user_active(&pool, admin2, false)
            .await
            .expect("Failed to deactivate admin2");

        // Try to delete both
        let result = bulk_delete(&pool, requester, vec![admin1, admin2])
            .await
            .expect("bulk_delete failed");

        assert_eq!(result.skipped.len(), 1, "Should have 1 skipped (last admin)");
        assert_eq!(result.skipped[0].id, admin1, "Last active admin should be skipped");
        assert_eq!(result.skipped[0].reason, "last_admin", "Reason should be 'last_admin'");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 deleted (inactive admin)");
        assert_eq!(result.succeeded[0], admin2, "Inactive admin should be deleted");

        // Verify admin1 still exists, admin2 is deleted
        let admin1_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(admin1)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        let admin2_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(admin2)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        assert_eq!(admin1_count, 1, "Last active admin should still exist");
        assert_eq!(admin2_count, 0, "Inactive admin should be deleted");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_not_found_fails() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_del_req2", "pass123", "user")
            .await
            .expect("Failed to create requester");

        let result = bulk_delete(&pool, requester, vec![999999999, 888888888])
            .await
            .expect("bulk_delete failed");

        assert_eq!(result.failed.len(), 2, "Should have 2 failed entries");
        assert_eq!(result.failed[0].reason, "not_found", "Reason should be 'not_found'");
        assert!(result.succeeded.is_empty(), "Should have no succeeded entries");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_cascades_sessions() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_del_req_session", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let target = create_user(&pool, "test_bulk_session_owner", "pass123", "user")
            .await
            .expect("Failed to create target");

        // Create a session for the target user
        let _session_result = sqlx::query(
            "INSERT INTO sessions (user_id, token_hash, player_token, created_at) VALUES ($1, 'hash', 'token', now())"
        )
        .bind(target)
        .execute(&pool)
        .await
        .expect("Failed to create session");

        // Verify session exists
        let session_count_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        assert_eq!(session_count_before, 1, "Session should exist before delete");

        // Delete the user
        let result = bulk_delete(&pool, requester, vec![target])
            .await
            .expect("bulk_delete failed");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 deleted");

        // Verify session is gone (CASCADE)
        let session_count_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to count")
        .0;

        assert_eq!(session_count_after, 0, "Sessions should cascade-delete with user (FK ON DELETE CASCADE)");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_sets_owner_id_null_on_quiz() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let requester = create_user(&pool, "test_bulk_del_req_quiz", "pass123", "user")
            .await
            .expect("Failed to create requester");
        let quiz_owner = create_user(&pool, "test_bulk_quiz_owner", "pass123", "user")
            .await
            .expect("Failed to create quiz owner");

        // Create a quiz owned by quiz_owner
        let quiz_result = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO quizzes (owner_id, name, design) VALUES ($1, 'Test Quiz', '{}') RETURNING id"
        )
        .bind(quiz_owner)
        .fetch_one(&pool)
        .await
        .expect("Failed to create quiz");

        let quiz_id = quiz_result.0;

        // Verify owner_id is set
        let (owner_before,): (Option<i64>,) = sqlx::query_as(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch quiz");

        assert_eq!(owner_before, Some(quiz_owner), "Quiz should be owned by quiz_owner");

        // Delete the quiz owner
        let result = bulk_delete(&pool, requester, vec![quiz_owner])
            .await
            .expect("bulk_delete failed");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 deleted");

        // Verify owner_id is now NULL (SET NULL on FK)
        let (owner_after,): (Option<i64>,) = sqlx::query_as(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch quiz");

        assert_eq!(owner_after, None, "Quiz owner_id should be NULL after user deletion (ON DELETE SET NULL)");

        cleanup_test_users(&pool).await;
    }

    // ── bulk_activate tests ────────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn bulk_activate_deactivated_to_active() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let target = create_user(&pool, "test_bulk_act_target", "pass123", "user")
            .await
            .expect("Failed to create target");

        // Deactivate the user
        set_user_active(&pool, target, false)
            .await
            .expect("Failed to deactivate");

        // Activate via bulk
        let result = bulk_activate(&pool, vec![target])
            .await
            .expect("bulk_activate failed");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 succeeded");
        assert_eq!(result.succeeded[0], target, "Target should be succeeded");
        assert!(result.failed.is_empty(), "Should have no failed");

        // Verify user is now active
        let (_, active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch user");

        assert!(active, "User should be activated");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_activate_already_active_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let target = create_user(&pool, "test_bulk_act_already", "pass123", "user")
            .await
            .expect("Failed to create target");

        // User is already active by default. Activate via bulk.
        let result = bulk_activate(&pool, vec![target])
            .await
            .expect("bulk_activate failed");

        assert_eq!(result.succeeded.len(), 1, "Should have 1 succeeded (idempotent)");
        assert_eq!(result.succeeded[0], target, "Target should be succeeded");

        // Verify still active
        let (_, active) = sqlx::query_as::<_, (String, bool)>(
            "SELECT role, active FROM users WHERE id = $1"
        )
        .bind(target)
        .fetch_one(&pool)
        .await
        .expect("Failed to fetch user");

        assert!(active, "User should remain active");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_activate_not_found_fails() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let result = bulk_activate(&pool, vec![999999999, 888888888])
            .await
            .expect("bulk_activate failed");

        assert_eq!(result.failed.len(), 2, "Should have 2 failed entries");
        assert_eq!(result.failed[0].reason, "not_found", "Reason should be 'not_found'");
        assert!(result.succeeded.is_empty(), "Should have no succeeded entries");
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_activate_no_guards() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create two admins and deactivate both
        let admin1 = create_user(&pool, "test_bulk_act_admin1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let admin2 = create_user(&pool, "test_bulk_act_admin2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        set_user_active(&pool, admin1, false)
            .await
            .expect("Failed to deactivate admin1");
        set_user_active(&pool, admin2, false)
            .await
            .expect("Failed to deactivate admin2");

        // Activate both — should succeed with no guards (unlike deactivate/delete)
        let result = bulk_activate(&pool, vec![admin1, admin2])
            .await
            .expect("bulk_activate failed");

        assert_eq!(result.succeeded.len(), 2, "Should have 2 succeeded");
        assert!(result.skipped.is_empty(), "Should have no skipped (no guards)");
        assert!(result.failed.is_empty(), "Should have no failed");

        cleanup_test_users(&pool).await;
    }

    // ── Group 2: bulk_deactivate ──────────────────────────────────────────

    /// Skips the requester (self) and deactivates other targets.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_deactivate_skips_self_target() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_self_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_self_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        let result = bulk_deactivate(&pool, id1, vec![id1, id2])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(
            result.succeeded,
            vec![id2],
            "expected only peer admin in succeeded, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            1,
            "expected one self skip, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, id1, "skipped id should be requester");
        assert_eq!(
            result.skipped[0].reason, "self",
            "skip reason should be self, got {}",
            result.skipped[0].reason
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let (_, active1) = fetch_id_active(&pool, id1).await;
        let (_, active2) = fetch_id_active(&pool, id2).await;
        assert!(
            active1,
            "requester id1 must remain active after self skip"
        );
        assert!(!active2, "id2 should be inactive after bulk deactivate");

        cleanup_test_users(&pool).await;
    }

    /// Skips the last remaining active admin target so bulk cannot zero out admins.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_deactivate_blocks_last_active_admin() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        // Exactly three active admins in the system (after suspend). Requester is a
        // non-admin so self-skip does not apply and remaining_admins starts at 3.
        let id1 = create_user(&pool, "test_bulk_deactivate_g2_last_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_last_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_deactivate_g2_last_a3", "pass123", "admin")
            .await
            .expect("Failed to create admin3");
        let id4 = create_user(&pool, "test_bulk_deactivate_g2_last_req", "pass123", "user")
            .await
            .expect("Failed to create requester (regular user)");

        let result = bulk_deactivate(&pool, id4, vec![id1, id2, id3])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(
            result.succeeded,
            vec![id1, id2],
            "expected first two admins deactivated, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            1,
            "expected one last_admin skip, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, id3, "last admin id3 should be skipped");
        assert_eq!(
            result.skipped[0].reason, "last_admin",
            "skip reason should be last_admin, got {}",
            result.skipped[0].reason
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a3) = fetch_id_active(&pool, id3).await;
        let (_, a4) = fetch_id_active(&pool, id4).await;
        assert!(!a1, "id1 should be inactive");
        assert!(!a2, "id2 should be inactive");
        assert!(a3, "id3 (last admin) must remain active");
        assert!(a4, "requester id4 must remain active");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Mixed outcomes: self skip, peer deactivate, idempotent inactive, not_found.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_deactivate_multiple_ids_mixed_outcomes() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_mix_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_mix_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_deactivate_g2_mix_u3", "pass123", "user")
            .await
            .expect("Failed to create regular user");
        let id4 = create_user(&pool, "test_bulk_deactivate_g2_mix_u4", "pass123", "user")
            .await
            .expect("Failed to create inactive user");
        set_user_active(&pool, id4, false)
            .await
            .expect("Failed to pre-deactivate id4");

        let result = bulk_deactivate(&pool, id1, vec![id1, id2, id3, id4, 999999])
            .await
            .expect("bulk_deactivate failed");

        // Self is filtered first; work order preserves request order: id2, id3, id4 succeed;
        // missing id fails. Requester id1 remains active admin so id2 is not last_admin.
        assert_eq!(
            result.succeeded,
            vec![id2, id3, id4],
            "expected peer admin + regular + already-inactive in succeeded, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            1,
            "expected one self skip, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, id1);
        assert_eq!(result.skipped[0].reason, "self");
        assert_eq!(
            result.failed.len(),
            1,
            "expected one not_found, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, 999999);
        assert_eq!(result.failed[0].reason, "not_found");

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a3) = fetch_id_active(&pool, id3).await;
        let (_, a4) = fetch_id_active(&pool, id4).await;
        assert!(a1, "requester id1 should still be active");
        assert!(!a2, "id2 should be inactive after deactivate");
        assert!(!a3, "id3 should be inactive after deactivate");
        assert!(!a4, "id4 should remain inactive (idempotent)");

        cleanup_test_users(&pool).await;
    }

    /// Duplicate IDs are normalized to a single succeeded entry.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_deactivate_deduplicates_ids() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_dedup_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_dedup_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        let result = bulk_deactivate(&pool, id1, vec![id2, id2, id2])
            .await
            .expect("bulk_deactivate failed");

        assert_eq!(
            result.succeeded,
            vec![id2],
            "expected id2 once after dedup, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.succeeded.len(),
            1,
            "id2 must appear in succeeded only once"
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips, got {:?}",
            result.skipped
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let (_, active2) = fetch_id_active(&pool, id2).await;
        assert!(!active2, "id2 should be inactive after deduped deactivate");

        cleanup_test_users(&pool).await;
    }

    /// All missing IDs land in failed with not_found; no succeeded/skipped.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_deactivate_all_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_nf_admin", "pass123", "admin")
            .await
            .expect("Failed to create admin (requester)");

        let result = bulk_deactivate(&pool, id1, vec![888888, 999999])
            .await
            .expect("bulk_deactivate failed");

        assert!(
            result.succeeded.is_empty(),
            "expected no succeeded, got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skipped, got {:?}",
            result.skipped
        );
        assert_eq!(
            result.failed.len(),
            2,
            "expected two not_found entries, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, 888888);
        assert_eq!(result.failed[0].reason, "not_found");
        assert_eq!(result.failed[1].id, 999999);
        assert_eq!(result.failed[1].reason, "not_found");

        let (_, active1) = fetch_id_active(&pool, id1).await;
        assert!(active1, "requester should remain active");

        cleanup_test_users(&pool).await;
    }

    // ── Group 3: bulk_delete ────────────────────────────────────────────

    /// Skips the requester (self) and the last remaining active admin target.
    ///
    /// Self-skip does not reduce `remaining_admins` (requester stays active in
    /// the locked set). When the requester is an active admin, peer admins are
    /// therefore deletable. To exercise both `self` and `last_admin` in one
    /// call, the requester is a regular user included in the id list while two
    /// isolated active admins are targeted.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_skips_self_and_last_admin() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        // Exactly two active admins after suspend + one regular requester + one
        // bystander regular (must not be touched).
        let id1 = create_user(&pool, "test_bulk_delete_g3_self_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let id2 = create_user(&pool, "test_bulk_delete_g3_self_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id_req = create_user(&pool, "test_bulk_delete_g3_self_req", "pass123", "user")
            .await
            .expect("Failed to create requester (regular user)");
        let id_bystander =
            create_user(&pool, "test_bulk_delete_g3_self_bystander", "pass123", "user")
                .await
                .expect("Failed to create bystander regular user");

        // remaining_admins starts at 2. Self-skip removes id_req from work only.
        // work order: id1 then id2 → id1 deleted (2→1), id2 last_admin-skipped.
        let result = bulk_delete(&pool, id_req, vec![id_req, id1, id2])
            .await
            .expect("bulk_delete failed");

        assert_eq!(
            result.succeeded,
            vec![id1],
            "expected first admin deleted, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            2,
            "expected self + last_admin skips, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, id_req, "first skip should be self (requester)");
        assert_eq!(
            result.skipped[0].reason, "self",
            "skip reason should be self, got {}",
            result.skipped[0].reason
        );
        assert_eq!(result.skipped[1].id, id2, "second skip should be last admin id2");
        assert_eq!(
            result.skipped[1].reason, "last_admin",
            "skip reason should be last_admin, got {}",
            result.skipped[1].reason
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        // id1 deleted; id2 (last admin), requester, and bystander remain.
        let id1_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id1)
            .fetch_one(&pool)
            .await
            .expect("Failed to count id1");
        assert_eq!(id1_count.0, 0, "id1 should be deleted");

        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a_req) = fetch_id_active(&pool, id_req).await;
        let (_, a_by) = fetch_id_active(&pool, id_bystander).await;
        assert!(a2, "id2 (last admin) must remain active");
        assert!(a_req, "requester must remain active after self skip");
        assert!(a_by, "bystander regular user must be unaffected");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Deletes peer admins when multiple active admins remain (requester stays).
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_deletes_when_multiple_admins_remain() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        let id1 = create_user(&pool, "test_bulk_delete_g3_multi_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_delete_g3_multi_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_delete_g3_multi_a3", "pass123", "admin")
            .await
            .expect("Failed to create admin3");
        let id_reg = create_user(&pool, "test_bulk_delete_g3_multi_user", "pass123", "user")
            .await
            .expect("Failed to create regular user");

        let count_before: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE username LIKE 'test_bulk_delete_g3_multi_%'"
        )
        .fetch_one(&pool)
        .await
        .expect("Failed to count users before delete");
        assert_eq!(count_before.0, 4, "fixture should have 4 test users");

        // Requester id1 not in ids → no self skip. remaining_admins=3 (id1,id2,id3).
        // Deleting id2 then id3 leaves id1 as sole active admin.
        let result = bulk_delete(&pool, id1, vec![id2, id3])
            .await
            .expect("bulk_delete failed");

        assert_eq!(
            result.succeeded,
            vec![id2, id3],
            "expected id2 and id3 deleted, got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips (requester not in list), got {:?}",
            result.skipped
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        assert!(a1, "requester id1 must remain active");

        let gone: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE id = ANY($1)"
        )
        .bind(&vec![id2, id3])
        .fetch_one(&pool)
        .await
        .expect("Failed to count deleted users");
        assert_eq!(gone.0, 0, "id2 and id3 should be deleted from users");

        let (_, a_reg) = fetch_id_active(&pool, id_reg).await;
        assert!(a_reg, "regular user must be unaffected");

        let count_after: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM users WHERE username LIKE 'test_bulk_delete_g3_multi_%'"
        )
        .fetch_one(&pool)
        .await
        .expect("Failed to count users after delete");
        assert_eq!(
            count_after.0,
            count_before.0 - 2,
            "user count should drop by 2"
        );

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Bulk-delete cascades sessions (ON DELETE CASCADE) and nullifies quiz owner_id
    /// (ON DELETE SET NULL).
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_cascades_sessions_and_nullifies_quiz_owner() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_delete_g3_casc_admin", "pass123", "admin")
            .await
            .expect("Failed to create admin (requester)");
        let id2 = create_user(&pool, "test_bulk_delete_g3_casc_user", "pass123", "user")
            .await
            .expect("Failed to create regular user to delete");

        // Quiz owned by id2 (same insert shape as bulk_delete_sets_owner_id_null_on_quiz).
        let quiz_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO quizzes (owner_id, name, design) VALUES ($1, 'test_quiz_g3', '{}') RETURNING id"
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("Failed to insert test quiz")
        .0;

        // Two sessions for id2 (same column set as bulk_delete_cascades_sessions).
        sqlx::query(
            "INSERT INTO sessions (user_id, token_hash, player_token, created_at) \
             VALUES ($1, 'test_bulk_delete_g3_hash1', 'token1', now())"
        )
        .bind(id2)
        .execute(&pool)
        .await
        .expect("Failed to insert session 1");

        sqlx::query(
            "INSERT INTO sessions (user_id, token_hash, player_token, created_at) \
             VALUES ($1, 'test_bulk_delete_g3_hash2', 'token2', now())"
        )
        .bind(id2)
        .execute(&pool)
        .await
        .expect("Failed to insert session 2");

        let sessions_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1"
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("Failed to count sessions before delete")
        .0;
        assert_eq!(sessions_before, 2, "fixture should have 2 sessions for id2");

        let (owner_before,): (Option<i64>,) = sqlx::query_as(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to read quiz owner before delete");
        assert_eq!(owner_before, Some(id2), "quiz should be owned by id2");

        let result = bulk_delete(&pool, id1, vec![id2])
            .await
            .expect("bulk_delete failed");

        assert_eq!(
            result.succeeded,
            vec![id2],
            "expected id2 deleted, got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips, got {:?}",
            result.skipped
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let user_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("Failed to count id2 after delete")
        .0;
        assert_eq!(user_count, 0, "id2 should be deleted from users");

        let session_count = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1"
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("Failed to count sessions after delete")
        .0;
        assert_eq!(session_count, 0, "Sessions should be cascade-deleted");

        let (owner_after,): (Option<i64>,) = sqlx::query_as(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to read quiz owner after delete");
        assert_eq!(
            owner_after, None,
            "Quiz owner_id should be NULL after user delete"
        );

        // Orphan quiz row (owner already null) + remaining test users.
        let _ = sqlx::query("DELETE FROM quizzes WHERE id = $1")
            .bind(quiz_id)
            .execute(&pool)
            .await;
        cleanup_test_users(&pool).await;
    }

    // ── Group 4: bulk_activate ──────────────────────────────────────────

    /// Activates mixed active/inactive users idempotently (all succeed, no skips).
    #[tokio::test]
    #[ignore]
    async fn test_bulk_activate_succeeds_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_activate_g4_id1", "pass123", "user")
            .await
            .expect("Failed to create id1 (active)");
        let id2 = create_user(&pool, "test_bulk_activate_g4_id2", "pass123", "user")
            .await
            .expect("Failed to create id2 (active)");
        let id3 = create_user(&pool, "test_bulk_activate_g4_id3", "pass123", "user")
            .await
            .expect("Failed to create id3 (to deactivate)");

        set_user_active(&pool, id3, false)
            .await
            .expect("Failed to deactivate id3");

        let result = bulk_activate(&pool, vec![id1, id2, id3])
            .await
            .expect("bulk_activate failed");

        assert_eq!(
            result.succeeded,
            vec![id1, id2, id3],
            "expected all three ids succeeded, got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips, got {:?}",
            result.skipped
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a3) = fetch_id_active(&pool, id3).await;
        assert!(a1, "id1 should be active after bulk_activate");
        assert!(a2, "id2 should be active after bulk_activate");
        assert!(a3, "id3 should be active after bulk_activate");

        cleanup_test_users(&pool).await;
    }

    /// Missing ids land in failed with reason not_found; existing ids still succeed.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_activate_handles_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_activate_g4_nf_id1", "pass123", "user")
            .await
            .expect("Failed to create id1 (active)");

        let result = bulk_activate(&pool, vec![id1, 999999])
            .await
            .expect("bulk_activate failed");

        assert_eq!(
            result.succeeded,
            vec![id1],
            "expected id1 succeeded, got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips, got {:?}",
            result.skipped
        );
        assert_eq!(
            result.failed.len(),
            1,
            "expected one failure, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, 999999, "failed id should be 999999");
        assert_eq!(
            result.failed[0].reason, "not_found",
            "fail reason should be not_found, got {}",
            result.failed[0].reason
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        assert!(a1, "id1 should remain active");

        cleanup_test_users(&pool).await;
    }
}
