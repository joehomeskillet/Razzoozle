//! Tests for bulk student ops: bulk_set_student_active (WP-F6 Group 1).
//! Requires a live Postgres database (`DATABASE_URL`).
//! Run with: `cargo test -- --include-ignored`.

#[cfg(test)]
mod tests {
    use super::super::classes::BULK_MAX_IDS;
    use super::super::*;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::{Mutex, MutexGuard};

    /// Serializes DB-mutating bulk student tests (shared DATABASE_URL).
    static DB_ISOLATION_LOCK: Mutex<()> = Mutex::new(());

    fn lock_db_isolation() -> MutexGuard<'static, ()> {
        DB_ISOLATION_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Pool from DATABASE_URL, or None if unset / unreachable.
    async fn get_test_pool() -> Option<sqlx::PgPool> {
        let db_url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .ok()
    }

    /// Scoped cleanup for Group 1 fixtures (display_name / class name / owner user).
    async fn cleanup_test_fixtures(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_bulk_set_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_bulk_set_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_bulk_set_%'")
            .execute(pool)
            .await;
    }

    async fn fetch_student_active(pool: &sqlx::PgPool, student_id: i64) -> bool {
        sqlx::query_as::<_, (bool,)>("SELECT active FROM students WHERE id = $1")
            .bind(student_id)
            .fetch_one(pool)
            .await
            .expect("Failed to fetch student.active")
            .0
    }

    // ── Group 1: bulk_set_student_active ──────────────────────────────────

    /// Already-active students succeed; second call with same flag is idempotent.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_set_student_active_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_test_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_bulk_set_group1_idem_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_bulk_set_group1_idem_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_bulk_set_group1_idem_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s1");
        let s2 = create_student(
            &opt,
            "test_bulk_set_group1_idem_s2",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s2");

        assert!(fetch_student_active(&pool, s1).await, "s1 should start active");
        assert!(fetch_student_active(&pool, s2).await, "s2 should start active");

        let first = bulk_set_student_active(&opt, vec![s1, s2], true, Some(owner_id), BULK_MAX_IDS)
            .await
            .expect("bulk_set_student_active first call failed");

        assert_eq!(
            first.succeeded,
            vec![s1, s2],
            "expected both students succeeded, got {:?}",
            first.succeeded
        );
        assert!(
            first.failed.is_empty(),
            "expected no failures, got {:?}",
            first.failed
        );

        let second =
            bulk_set_student_active(&opt, vec![s1, s2], true, Some(owner_id), BULK_MAX_IDS)
                .await
                .expect("bulk_set_student_active second call failed");

        assert_eq!(
            second.succeeded,
            vec![s1, s2],
            "idempotent re-call should still succeed both, got {:?}",
            second.succeeded
        );
        assert!(
            second.failed.is_empty(),
            "expected no failures on re-call, got {:?}",
            second.failed
        );
        assert!(fetch_student_active(&pool, s1).await, "s1 remains active");
        assert!(fetch_student_active(&pool, s2).await, "s2 remains active");

        cleanup_test_fixtures(&pool).await;
    }

    /// Missing student IDs land in failed with reason not_found.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_set_student_active_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_test_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_bulk_set_group1_nf_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let result =
            bulk_set_student_active(&opt, vec![99999, 88888], true, Some(owner_id), BULK_MAX_IDS)
                .await
                .expect("bulk_set_student_active failed");

        assert!(
            result.succeeded.is_empty(),
            "expected no succeeded, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.failed.len(),
            2,
            "expected two not_found entries, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, 99999);
        assert_eq!(result.failed[0].reason, "not_found");
        assert_eq!(result.failed[1].id, 88888);
        assert_eq!(result.failed[1].reason, "not_found");

        cleanup_test_fixtures(&pool).await;
    }

    /// Duplicate IDs are normalized; each student appears once in succeeded.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_set_student_active_dedupe() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_test_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_bulk_set_group1_dedup_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_bulk_set_group1_dedup_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_bulk_set_group1_dedup_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s1");
        let s2 = create_student(
            &opt,
            "test_bulk_set_group1_dedup_s2",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s2");

        let result = bulk_set_student_active(
            &opt,
            vec![s1, s1, s2, s2],
            true,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_set_student_active failed");

        assert_eq!(
            result.succeeded,
            vec![s1, s2],
            "expected s1,s2 once each after dedupe, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.succeeded.len(),
            2,
            "duplicates must not double-count succeeded"
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        cleanup_test_fixtures(&pool).await;
    }

    /// Wrong owner sees owned students as not_found (no ownership leak).
    #[tokio::test]
    #[ignore]
    async fn test_bulk_set_student_active_owner_scope_reject() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_test_fixtures(&pool).await;

        let opt = Some(pool.clone());
        // Real owner creates fixtures; call uses a different me (999).
        let owner_id = create_user(
            &pool,
            "test_bulk_set_group1_scope_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_bulk_set_group1_scope_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_bulk_set_group1_scope_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s1");
        let s2 = create_student(
            &opt,
            "test_bulk_set_group1_scope_s2",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student s2");

        let wrong_owner: i64 = 999;
        assert_ne!(
            owner_id, wrong_owner,
            "fixture owner must differ from wrong-owner probe id"
        );

        let result = bulk_set_student_active(
            &opt,
            vec![s1, s2],
            false,
            Some(wrong_owner),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_set_student_active failed");

        assert!(
            result.succeeded.is_empty(),
            "wrong owner must not succeed, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.failed.len(),
            2,
            "expected both as not_found, got {:?}",
            result.failed
        );
        assert_eq!(result.failed[0].id, s1);
        assert_eq!(result.failed[0].reason, "not_found");
        assert_eq!(result.failed[1].id, s2);
        assert_eq!(result.failed[1].reason, "not_found");

        // Ownership reject must not mutate rows.
        assert!(
            fetch_student_active(&pool, s1).await,
            "s1 must remain active after rejected bulk"
        );
        assert!(
            fetch_student_active(&pool, s2).await,
            "s2 must remain active after rejected bulk"
        );

        cleanup_test_fixtures(&pool).await;
    }
}
