//! Tests for bulk user operations: bulk_activate, bulk_deactivate, bulk_delete.
//! These tests require a live Postgres database (DATABASE_URL env var).
//! Run with: `cargo test -- --include-ignored` (ignored tests only run with DATABASE_URL).

#[cfg(test)]
mod tests {
    use super::super::*;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::{Mutex, MutexGuard};

    /// Serializes tests that mutate the global active-admin set (suspend/restore).
    /// cargo test runs cases on multiple threads; without this, remaining_admins
    /// assertions race with sibling bulk tests.
    static DB_ISOLATION_LOCK: Mutex<()> = Mutex::new(());

    fn lock_db_isolation() -> MutexGuard<'static, ()> {
        DB_ISOLATION_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

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
    /// Deletes users created by bulk and deactivate-guarded specs.
    async fn cleanup_test_users(pool: &sqlx::PgPool) {
        let _ = sqlx::query(
            "DELETE FROM users WHERE username LIKE 'test_bulk_%' \
             OR username LIKE 'test_deactivate_g_spec_%'",
        )
        .execute(pool)
        .await;
        let _ = sqlx::query("DELETE FROM quizzes WHERE id LIKE 'test_q_%'")
            .execute(pool)
            .await;
    }

    /// Temporarily deactivate non-test active admins so last-admin scenarios are
    /// deterministic against a shared DB that may already have a bootstrap admin.
    /// Returns the IDs that were deactivated so the caller can restore them.
    async fn suspend_non_test_active_admins(pool: &sqlx::PgPool) -> Vec<i64> {
        let others: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE role = 'admin' AND active = true \
             AND username NOT LIKE 'test_bulk_%' \
             AND username NOT LIKE 'test_deactivate_g_spec_%'",
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_self_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_self_isolate_a2", "pass123", "admin")
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        // Exactly three active admins in the system (after suspend). Requester is a
        // non-admin so self-skip does not apply and remaining_admins starts at 3.
        let id1 = create_user(&pool, "test_bulk_deactivate_g2_last_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_last_isolate_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_deactivate_g2_last_isolate_a3", "pass123", "admin")
            .await
            .expect("Failed to create admin3");
        let id4 = create_user(&pool, "test_bulk_deactivate_g2_last_isolate_req", "pass123", "user")
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_mix_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_mix_isolate_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_deactivate_g2_mix_isolate_u3", "pass123", "user")
            .await
            .expect("Failed to create regular user");
        let id4 = create_user(&pool, "test_bulk_deactivate_g2_mix_isolate_u4", "pass123", "user")
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_dedup_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_deactivate_g2_dedup_isolate_a2", "pass123", "admin")
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_deactivate_g2_nf_isolate_admin", "pass123", "admin")
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

    /// Skips requester (self) and last remaining active admin target.
    ///
    /// Brief fixture is two active admins with requester=id1. Self-skip does not
    /// reduce `remaining_admins`, so a living admin requester leaves peer admins
    /// deletable. To fire both `self` and `last_admin` in one call with the
    /// id1/id2 pair, id1 is deactivated first so id2 is the sole active admin;
    /// id1 remains the requester id and is still self-skipped when listed.
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        let id1 = create_user(&pool, "test_bulk_delete_g3_self_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_delete_g3_self_isolate_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");

        // Sole active admin must be id2 so last_admin fires on the work list.
        set_user_active(&pool, id1, false)
            .await
            .expect("Failed to deactivate id1 for sole-admin setup");

        let result = bulk_delete(&pool, id1, vec![id1, id2])
            .await
            .expect("bulk_delete failed");

        assert!(
            result.succeeded.is_empty(),
            "expected no succeeded, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            2,
            "expected self + last_admin skips, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, id1);
        assert_eq!(result.skipped[0].reason, "self");
        assert_eq!(result.skipped[1].id, id2);
        assert_eq!(result.skipped[1].reason, "last_admin");
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        let count1 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id1)
            .fetch_one(&pool)
            .await
            .expect("count id1")
            .0;
        let count2 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id2)
            .fetch_one(&pool)
            .await
            .expect("count id2")
            .0;
        assert_eq!(count1, 1, "id1 must still exist");
        assert_eq!(count2, 1, "id2 must still exist");

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        assert!(!a1, "id1 stays inactive (setup for sole active admin)");
        assert!(a2, "id2 (last admin) must remain active");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Regular users delete freely when active admins remain untouched.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_deletes_regular_users_when_admins_remain() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_delete_g3_reg_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin1 (requester)");
        let id2 = create_user(&pool, "test_bulk_delete_g3_reg_isolate_a2", "pass123", "admin")
            .await
            .expect("Failed to create admin2");
        let id3 = create_user(&pool, "test_bulk_delete_g3_reg_isolate_a3", "pass123", "admin")
            .await
            .expect("Failed to create admin3");
        let id4 = create_user(&pool, "test_bulk_delete_g3_reg_isolate_u4", "pass123", "user")
            .await
            .expect("Failed to create regular user");

        let result = bulk_delete(&pool, id1, vec![id4])
            .await
            .expect("bulk_delete failed");

        assert_eq!(
            result.succeeded,
            vec![id4],
            "expected regular user deleted, got {:?}",
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

        let count4 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id4)
            .fetch_one(&pool)
            .await
            .expect("count id4")
            .0;
        assert_eq!(count4, 0, "id4 should be deleted from DB");

        let count1 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id1)
            .fetch_one(&pool)
            .await
            .expect("count id1")
            .0;
        let count2 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id2)
            .fetch_one(&pool)
            .await
            .expect("count id2")
            .0;
        let count3 = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id3)
            .fetch_one(&pool)
            .await
            .expect("count id3")
            .0;
        assert_eq!(count1, 1, "admin id1 should still exist");
        assert_eq!(count2, 1, "admin id2 should still exist");
        assert_eq!(count3, 1, "admin id3 should still exist");

        cleanup_test_users(&pool).await;
    }

    /// Deleting a user cascade-deletes their sessions via FK ON DELETE CASCADE.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_cascades_sessions() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_delete_g3_sess_isolate_a1", "pass123", "admin")
            .await
            .expect("Failed to create admin (requester)");
        let id2 = create_user(&pool, "test_bulk_delete_g3_sess_isolate_u2", "pass123", "user")
            .await
            .expect("Failed to create regular user");

        sqlx::query(
            "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) \
             VALUES ($1, $2, now(), now() + interval '7 days')",
        )
        .bind(id2)
        .bind(format!("test_bulk_delete_g3_sess_isolate_hash_a_{}", id2))
        .execute(&pool)
        .await
        .expect("Failed to insert session 1");

        sqlx::query(
            "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) \
             VALUES ($1, $2, now(), now() + interval '7 days')",
        )
        .bind(id2)
        .bind(format!("test_bulk_delete_g3_sess_isolate_hash_b_{}", id2))
        .execute(&pool)
        .await
        .expect("Failed to insert session 2");

        let sessions_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("count sessions before")
        .0;
        assert_eq!(sessions_before, 2, "expected 2 sessions for id2 before delete");

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

        let user_count = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM users WHERE id = $1")
            .bind(id2)
            .fetch_one(&pool)
            .await
            .expect("count id2")
            .0;
        assert_eq!(user_count, 0, "id2 should be deleted");

        let sessions_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM sessions WHERE user_id = $1",
        )
        .bind(id2)
        .fetch_one(&pool)
        .await
        .expect("count sessions after")
        .0;
        assert_eq!(
            sessions_after, 0,
            "sessions for id2 should cascade-delete (FK ON DELETE CASCADE)"
        );

        cleanup_test_users(&pool).await;
    }

    // ── Group 4: bulk_activate ──────────────────────────────────────────

    /// Already-active users succeed idempotently; inactive becomes active.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_activate_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_activate_g4_idem_isolate_u1", "pass123", "user")
            .await
            .expect("Failed to create user1");
        let id2 = create_user(&pool, "test_bulk_activate_g4_idem_isolate_u2", "pass123", "user")
            .await
            .expect("Failed to create user2");
        let id3 = create_user(&pool, "test_bulk_activate_g4_idem_isolate_u3", "pass123", "user")
            .await
            .expect("Failed to create user3");

        set_user_active(&pool, id3, false)
            .await
            .expect("Failed to deactivate user3");

        let result = bulk_activate(&pool, vec![id1, id2, id3])
            .await
            .expect("bulk_activate failed");

        assert_eq!(
            result.succeeded,
            vec![id1, id2, id3],
            "expected all three in succeeded (idempotent), got {:?}",
            result.succeeded
        );
        assert!(
            result.skipped.is_empty(),
            "expected no skips (no guards), got {:?}",
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
        assert!(a1, "id1 should be active");
        assert!(a2, "id2 should be active");
        assert!(a3, "id3 should be active after bulk_activate");

        cleanup_test_users(&pool).await;
    }

    /// Missing IDs land in failed with not_found; existing IDs succeed.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_activate_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(&pool, "test_bulk_activate_g4_nf_isolate_u1", "pass123", "user")
            .await
            .expect("Failed to create user1");

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
            "expected one not_found, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, 999999);
        assert_eq!(result.failed[0].reason, "not_found");

        let (_, a1) = fetch_id_active(&pool, id1).await;
        assert!(a1, "id1 should remain active");

        cleanup_test_users(&pool).await;
    }

    // ── Spec-Required: deactivate_user_guarded ───────────────────────────

    /// Last remaining active admin cannot be deactivated (C1 parity).
    #[tokio::test]
    #[ignore]
    async fn test_deactivate_user_guarded_last_admin_blocks() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        let id1 = create_user(
            &pool,
            "test_deactivate_g_spec_last_a1",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin1");
        let id2 = create_user(
            &pool,
            "test_deactivate_g_spec_last_a2",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin2");

        let outcome1 = deactivate_user_guarded(&pool, id1)
            .await
            .expect("deactivate_user_guarded id1 failed");
        assert_eq!(
            outcome1,
            DeactivateUserOutcome::Deactivated,
            "first of two admins should deactivate"
        );

        let outcome2 = deactivate_user_guarded(&pool, id2)
            .await
            .expect("deactivate_user_guarded id2 failed");
        assert_eq!(
            outcome2,
            DeactivateUserOutcome::LastActiveAdmin,
            "last active admin must be blocked"
        );

        let (_, a2) = fetch_id_active(&pool, id2).await;
        assert!(a2, "id2 must remain active after LastActiveAdmin");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Deactivate succeeds when other active admins remain.
    #[tokio::test]
    #[ignore]
    async fn test_deactivate_user_guarded_allows_with_multiple_admins() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        let id1 = create_user(
            &pool,
            "test_deactivate_g_spec_multi_a1",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin1");
        let id2 = create_user(
            &pool,
            "test_deactivate_g_spec_multi_a2",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin2");
        let id3 = create_user(
            &pool,
            "test_deactivate_g_spec_multi_a3",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin3");

        let outcome = deactivate_user_guarded(&pool, id1)
            .await
            .expect("deactivate_user_guarded id1 failed");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::Deactivated,
            "deactivating one of three admins should succeed"
        );

        let (_, a1) = fetch_id_active(&pool, id1).await;
        let (_, a2) = fetch_id_active(&pool, id2).await;
        let (_, a3) = fetch_id_active(&pool, id3).await;
        assert!(!a1, "id1 should be inactive");
        assert!(a2, "id2 should remain active");
        assert!(a3, "id3 should remain active");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Already-inactive target is idempotent success (no last-admin risk).
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;
        let suspended = suspend_non_test_active_admins(&pool).await;

        let _id1 = create_user(
            &pool,
            "test_deactivate_g_spec_idem_a1",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create active admin");
        let id2 = create_user(
            &pool,
            "test_deactivate_g_spec_idem_u2",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create user");
        set_user_active(&pool, id2, false)
            .await
            .expect("Failed to pre-deactivate id2");

        let outcome = deactivate_user_guarded(&pool, id2)
            .await
            .expect("deactivate_user_guarded id2 failed");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::Deactivated,
            "already-inactive user should return Deactivated (idempotent)"
        );

        let (_, a2) = fetch_id_active(&pool, id2).await;
        assert!(!a2, "id2 should remain inactive");

        cleanup_test_users(&pool).await;
        restore_active_admins(&pool, &suspended).await;
    }

    /// Missing user id yields NotFound.
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

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let outcome = deactivate_user_guarded(&pool, 999999)
            .await
            .expect("deactivate_user_guarded should not SQL-error for missing id");
        assert_eq!(
            outcome,
            DeactivateUserOutcome::NotFound,
            "missing id must return NotFound"
        );

        cleanup_test_users(&pool).await;
    }

    // ── Spec-Required: quiz owner SET NULL on bulk_delete ─────────────────

    /// bulk_delete nulls quizzes.owner_id (ON DELETE SET NULL) and keeps the quiz row.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_quiz_owner_set_null() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();

        cleanup_test_users(&pool).await;

        let id1 = create_user(
            &pool,
            "test_bulk_delete_g3_qown_isolate_a1",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create admin requester");
        let id2 = create_user(
            &pool,
            "test_bulk_delete_g3_qown_isolate_u2",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create quiz owner user");

        let quiz_id = format!("test_q_{}", id2);
        sqlx::query(
            "INSERT INTO quizzes (id, subject, questions, owner_id) \
             VALUES ($1, $2, '[]'::jsonb, $3)",
        )
        .bind(&quiz_id)
        .bind("test_subject")
        .bind(id2)
        .execute(&pool)
        .await
        .expect("Failed to insert quiz owned by id2");

        let owner_before = sqlx::query_as::<_, (Option<i64>,)>(
            "SELECT owner_id FROM quizzes WHERE id = $1",
        )
        .bind(&quiz_id)
        .fetch_one(&pool)
        .await
        .expect("fetch quiz owner before")
        .0;
        assert_eq!(owner_before, Some(id2), "quiz should be owned by id2 before delete");

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

        let row = sqlx::query_as::<_, (String, Option<i64>)>(
            "SELECT id, owner_id FROM quizzes WHERE id = $1",
        )
        .bind(&quiz_id)
        .fetch_optional(&pool)
        .await
        .expect("fetch quiz after bulk_delete");

        let (qid, owner_after) = row.expect("quiz row must still exist after owner delete");
        assert_eq!(qid, quiz_id);
        assert_eq!(
            owner_after, None,
            "quiz owner_id should be NULL after bulk_delete (ON DELETE SET NULL)"
        );

        cleanup_test_users(&pool).await;
    }
}
