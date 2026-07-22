//! Tests for bulk student ops + PIN validation:
//! - Group 1: bulk_set_student_active (WP-F6g1)
//! - Group 2: bulk_delete_students (WP-F6g2)
//! - Group 3: bulk_assign_students / bulk_remove_students (WP-F6g3)
//! - Group 4: validate_student_pin / validate_student_pin_plain (WP-F6g4)
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
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_f6_set_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_f6_set_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_f6_set_%'")
            .execute(pool)
            .await;
    }

    /// Scoped cleanup for Group 2 fixtures (bulk_delete_students).
    async fn cleanup_delete_fixtures(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_f6_delete_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_f6_delete_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_f6_delete_%'")
            .execute(pool)
            .await;
    }

    /// Scoped cleanup for Group 3 fixtures (bulk_assign / bulk_remove).
    async fn cleanup_assign_fixtures(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_f6_assign_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_f6_assign_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_f6_assign_%'")
            .execute(pool)
            .await;
    }

    /// Scoped cleanup for Group 3 remove fixtures.
    async fn cleanup_remove_fixtures(pool: &sqlx::PgPool) {
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_f6_remove_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_f6_remove_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_f6_remove_%'")
            .execute(pool)
            .await;
    }

    /// Scoped cleanup for Group 4 PIN validation fixtures.
    async fn cleanup_pin_fixtures(pool: &sqlx::PgPool) {
        // Assignments reference quizzes; students/classes before users (FK).
        let _ = sqlx::query("DELETE FROM assignments WHERE id LIKE 'test_validate_pin_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM quizzes WHERE id LIKE 'test_validate_pin_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE 'test_validate_pin_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE 'test_validate_pin_%'")
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE 'test_validate_pin_%'")
            .execute(pool)
            .await;
    }

    /// Minimal quiz + assignment so `validate_student_pin` can pass the assignment gate.
    async fn ensure_assignment(pool: &sqlx::PgPool, assignment_id: &str, quiz_id: &str) {
        sqlx::query(
            "INSERT INTO quizzes (id, subject, questions) VALUES ($1, 'pin-test', '[]'::jsonb) \
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(quiz_id)
        .execute(pool)
        .await
        .expect("Failed to insert test quiz");

        sqlx::query(
            "INSERT INTO assignments (id, quiz_id, assigned_to, assigned_at, metadata, version) \
             VALUES ($1, $2, NULL, now(), '{}'::jsonb, 0) \
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(assignment_id)
        .bind(quiz_id)
        .execute(pool)
        .await
        .expect("Failed to insert test assignment");
    }

    async fn fetch_student_pin(pool: &sqlx::PgPool, student_id: i64) -> String {
        sqlx::query_as::<_, (Option<String>,)>("SELECT pin FROM students WHERE id = $1")
            .bind(student_id)
            .fetch_one(pool)
            .await
            .expect("Failed to fetch student.pin")
            .0
            .expect("student.pin must be set")
    }

    async fn fetch_student_active(pool: &sqlx::PgPool, student_id: i64) -> bool {
        sqlx::query_as::<_, (bool,)>("SELECT active FROM students WHERE id = $1")
            .bind(student_id)
            .fetch_one(pool)
            .await
            .expect("Failed to fetch student.active")
            .0
    }

    async fn count_students(pool: &sqlx::PgPool, student_id: i64) -> i64 {
        sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM students WHERE id = $1")
            .bind(student_id)
            .fetch_one(pool)
            .await
            .expect("Failed to count students")
            .0
    }

    async fn count_class_students(pool: &sqlx::PgPool, student_id: i64) -> i64 {
        sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM class_students WHERE student_id = $1")
            .bind(student_id)
            .fetch_one(pool)
            .await
            .expect("Failed to count class_students")
            .0
    }

    async fn count_membership(pool: &sqlx::PgPool, student_id: i64, class_id: i64) -> i64 {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM class_students WHERE student_id = $1 AND class_id = $2",
        )
        .bind(student_id)
        .bind(class_id)
        .fetch_one(pool)
        .await
        .expect("Failed to count class_students membership")
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
            "test_f6_set_group1_idem_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_set_group1_idem_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_f6_set_group1_idem_s1",
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
            "test_f6_set_group1_idem_s2",
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
            "test_f6_set_group1_nf_owner",
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
            "test_f6_set_group1_dedup_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_set_group1_dedup_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_f6_set_group1_dedup_s1",
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
            "test_f6_set_group1_dedup_s2",
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
            "test_f6_set_group1_scope_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_set_group1_scope_class", owner_id)
            .await
            .expect("Failed to create class");

        let s1 = create_student(
            &opt,
            "test_f6_set_group1_scope_s1",
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
            "test_f6_set_group1_scope_s2",
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

    // ── Group 2: bulk_delete_students ─────────────────────────────────────

    /// Student delete removes the row; class_students CASCADE via FK.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_students_cascade() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_delete_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_f6_delete_cascade_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_delete_cascade_class", owner_id)
            .await
            .expect("Failed to create class");

        let student_id = create_student(
            &opt,
            "test_f6_delete_cascade_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student");

        assert_eq!(
            count_class_students(&pool, student_id).await,
            1,
            "fixture must have one class_students row"
        );

        let result =
            bulk_delete_students(&opt, vec![student_id], Some(owner_id), BULK_MAX_IDS)
                .await
                .expect("bulk_delete_students failed");

        assert_eq!(
            result.succeeded,
            vec![student_id],
            "expected student in succeeded, got {:?}",
            result.succeeded
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );
        assert_eq!(
            count_students(&pool, student_id).await,
            0,
            "student row must be hard-deleted"
        );
        assert_eq!(
            count_class_students(&pool, student_id).await,
            0,
            "class_students must CASCADE when student is deleted"
        );

        cleanup_delete_fixtures(&pool).await;
    }

    /// bulk_delete_students is a hard delete (not soft via active=false).
    /// Student with multiple class memberships is fully removed; junctions CASCADE.
    ///
    /// Note (SDD §8.4): class deletion retains students (`class_id` SET NULL /
    /// junction CASCADE on the class side). That path is bulk_delete_classes /
    /// delete_class — not covered here. This case locks the inverse: explicit
    /// student bulk-delete removes the student row entirely.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_delete_students_student_retained_class_nulled() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_delete_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_f6_delete_hard_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_a = create_class(&opt, "test_f6_delete_hard_class_a", owner_id)
            .await
            .expect("Failed to create class A");
        let class_b = create_class(&opt, "test_f6_delete_hard_class_b", owner_id)
            .await
            .expect("Failed to create class B");

        let student_id = create_student(
            &opt,
            "test_f6_delete_hard_s1",
            "",
            &[class_a, class_b],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student");

        assert_eq!(
            count_class_students(&pool, student_id).await,
            2,
            "fixture must have two class_students rows"
        );
        assert!(
            fetch_student_active(&pool, student_id).await,
            "student starts active (soft-delete would only flip this)"
        );

        let result =
            bulk_delete_students(&opt, vec![student_id], Some(owner_id), BULK_MAX_IDS)
                .await
                .expect("bulk_delete_students failed");

        assert_eq!(
            result.succeeded,
            vec![student_id],
            "expected hard-delete success, got {:?}",
            result.succeeded
        );
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );

        // Hard delete: row gone (not soft-deactivated).
        assert_eq!(
            count_students(&pool, student_id).await,
            0,
            "student must be hard-deleted (no soft-delete via active)"
        );
        assert_eq!(
            count_class_students(&pool, student_id).await,
            0,
            "all class_students memberships must CASCADE"
        );

        cleanup_delete_fixtures(&pool).await;
    }

    // ── Group 3: bulk_assign_students / bulk_remove_students ─────────────

    /// Already-member students land in skipped with reason already_member;
    /// they must not appear in succeeded and must not create duplicate rows.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_assign_students_already_member_skipped() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_assign_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_f6_assign_skip_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_assign_skip_class", owner_id)
            .await
            .expect("Failed to create class");

        // Student already enrolled via create_student class_ids.
        let student_id = create_student(
            &opt,
            "test_f6_assign_skip_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student");

        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "fixture must already have one class_students row"
        );

        let result = bulk_assign_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_assign_students failed");

        assert!(
            result.succeeded.is_empty(),
            "already-member must NOT be in succeeded, got {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            1,
            "expected one skipped entry, got {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].id, student_id);
        assert_eq!(result.skipped[0].reason, "already_member");
        assert!(
            result.failed.is_empty(),
            "expected no failures, got {:?}",
            result.failed
        );
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "must not create duplicate class_students rows"
        );

        cleanup_assign_fixtures(&pool).await;
    }

    /// Assigning the same student repeatedly yields a single class_students row.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_assign_students_no_duplicate_rows() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_assign_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_f6_assign_nodup_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_assign_nodup_class", owner_id)
            .await
            .expect("Failed to create class");

        // Student owned by me but NOT enrolled in the target class.
        let student_id = create_student(
            &opt,
            "test_f6_assign_nodup_s1",
            "",
            &[],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student");

        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            0,
            "fixture must start with no membership"
        );

        let first = bulk_assign_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_assign_students first call failed");

        assert_eq!(
            first.succeeded,
            vec![student_id],
            "first assign should succeed, got {:?}",
            first.succeeded
        );
        assert!(
            first.skipped.is_empty(),
            "first assign must not skip, got {:?}",
            first.skipped
        );
        assert!(
            first.failed.is_empty(),
            "expected no failures on first assign, got {:?}",
            first.failed
        );
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "exactly one class_students row after first assign"
        );

        // Second assign of the same pair: already_member skip, still one row.
        let second = bulk_assign_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_assign_students second call failed");

        assert!(
            second.succeeded.is_empty(),
            "re-assign must not succeed again, got {:?}",
            second.succeeded
        );
        assert_eq!(second.skipped.len(), 1);
        assert_eq!(second.skipped[0].id, student_id);
        assert_eq!(second.skipped[0].reason, "already_member");
        assert!(second.failed.is_empty());
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "re-assign must not insert a second class_students row"
        );

        // Third call still one row (ON CONFLICT / already_set path).
        let third = bulk_assign_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_assign_students third call failed");

        assert!(third.succeeded.is_empty());
        assert_eq!(third.skipped.len(), 1);
        assert_eq!(third.skipped[0].reason, "already_member");
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "SELECT COUNT(*) FROM class_students WHERE student_id = X AND class_id = Y must stay 1"
        );

        cleanup_assign_fixtures(&pool).await;
    }

    /// bulk_remove_students removes the junction row; re-call does not error
    /// and leaves membership empty (DB-state idempotent). Student row retained.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_remove_students_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_remove_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_f6_remove_idem_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_f6_remove_idem_class", owner_id)
            .await
            .expect("Failed to create class");

        let student_id = create_student(
            &opt,
            "test_f6_remove_idem_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            "1234",
        )
        .await
        .expect("Failed to create student");

        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "fixture must start enrolled"
        );

        let first = bulk_remove_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_remove_students first call failed");

        assert_eq!(
            first.succeeded,
            vec![student_id],
            "first remove should succeed, got {:?}",
            first.succeeded
        );
        assert!(
            first.failed.is_empty(),
            "expected no failures on first remove, got {:?}",
            first.failed
        );
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            0,
            "no class_students rows after first remove"
        );
        assert_eq!(
            count_students(&pool, student_id).await,
            1,
            "student row must be retained (remove is unenroll only)"
        );

        // Second call: no error; membership stays empty (idempotent DB state).
        // Already-not-enrolled maps to failed not_found (DELETE RETURNING empty).
        let second = bulk_remove_students(
            &opt,
            vec![student_id],
            class_id,
            Some(owner_id),
            BULK_MAX_IDS,
        )
        .await
        .expect("bulk_remove_students second call must not error");

        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            0,
            "re-remove must leave membership empty"
        );
        assert_eq!(
            count_students(&pool, student_id).await,
            1,
            "student row still retained after re-remove"
        );
        assert!(
            second.succeeded.is_empty(),
            "already-removed is not re-succeeded, got {:?}",
            second.succeeded
        );
        assert_eq!(
            second.failed.len(),
            1,
            "already-removed → failed not_found, got {:?}",
            second.failed
        );
        assert_eq!(second.failed[0].id, student_id);
        assert_eq!(second.failed[0].reason, "not_found");

        cleanup_remove_fixtures(&pool).await;
    }

    // ── Group 4: validate_student_pin / validate_student_pin_plain ────────

    /// Inactive student + correct PIN → Ok(false) (same shape as wrong PIN).
    #[tokio::test]
    #[ignore]
    async fn test_validate_student_pin_inactive_returns_false() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_pin_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_validate_pin_inactive_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_validate_pin_inactive_class", owner_id)
            .await
            .expect("Failed to create class");

        const PLAIN_PIN: &str = "1234";
        let student_id = create_student(
            &opt,
            "test_validate_pin_inactive_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            PLAIN_PIN,
        )
        .await
        .expect("Failed to create student");

        // Deactivate: inactive students must not authenticate.
        let n = set_student_active(&opt, student_id, false, Some(owner_id))
            .await
            .expect("set_student_active failed");
        assert_eq!(n, 1, "expected one row deactivated");
        assert!(
            !fetch_student_active(&pool, student_id).await,
            "fixture student must be inactive"
        );

        let stored_pin = fetch_student_pin(&pool, student_id).await;
        assert_eq!(stored_pin, PLAIN_PIN, "stored pin must match create input");

        let assignment_id = "test_validate_pin_inactive_asgn";
        ensure_assignment(&pool, assignment_id, "test_validate_pin_inactive_quiz").await;

        let result = validate_student_pin(&pool, assignment_id, student_id, &stored_pin)
            .await
            .expect("validate_student_pin must not Err");

        assert!(
            !result,
            "inactive student with correct PIN must return Ok(false)"
        );

        cleanup_pin_fixtures(&pool).await;
    }

    /// Active student + correct PIN + existing assignment → Ok(true).
    #[tokio::test]
    #[ignore]
    async fn test_validate_student_pin_active_correct_pin_returns_true() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_pin_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_validate_pin_active_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_validate_pin_active_class", owner_id)
            .await
            .expect("Failed to create class");

        const PLAIN_PIN: &str = "1234";
        let student_id = create_student(
            &opt,
            "test_validate_pin_active_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            PLAIN_PIN,
        )
        .await
        .expect("Failed to create student");

        assert!(
            fetch_student_active(&pool, student_id).await,
            "student must start active"
        );

        let stored_pin = fetch_student_pin(&pool, student_id).await;
        assert_eq!(stored_pin, PLAIN_PIN);

        let assignment_id = "test_validate_pin_active_asgn";
        ensure_assignment(&pool, assignment_id, "test_validate_pin_active_quiz").await;

        let result = validate_student_pin(&pool, assignment_id, student_id, &stored_pin)
            .await
            .expect("validate_student_pin must not Err");

        assert!(
            result,
            "active student with correct PIN must return Ok(true)"
        );

        cleanup_pin_fixtures(&pool).await;
    }

    /// Inactive student + correct plain PIN → Ok(false) (no assignment gate).
    #[tokio::test]
    #[ignore]
    async fn test_validate_student_pin_plain_inactive_returns_false() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_pin_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_validate_pin_plain_inact_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_validate_pin_plain_inact_class", owner_id)
            .await
            .expect("Failed to create class");

        const PLAIN_PIN: &str = "1234";
        let student_id = create_student(
            &opt,
            "test_validate_pin_plain_inact_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            PLAIN_PIN,
        )
        .await
        .expect("Failed to create student");

        let n = set_student_active(&opt, student_id, false, Some(owner_id))
            .await
            .expect("set_student_active failed");
        assert_eq!(n, 1);
        assert!(!fetch_student_active(&pool, student_id).await);

        let result = validate_student_pin_plain(&pool, student_id, PLAIN_PIN)
            .await
            .expect("validate_student_pin_plain must not Err");

        assert!(
            !result,
            "inactive student with correct plain PIN must return Ok(false)"
        );

        cleanup_pin_fixtures(&pool).await;
    }

    /// Active student + correct plain PIN → Ok(true).
    #[tokio::test]
    #[ignore]
    async fn test_validate_student_pin_plain_active_correct_returns_true() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        let _lock = lock_db_isolation();
        cleanup_pin_fixtures(&pool).await;

        let opt = Some(pool.clone());
        let owner_id = create_user(
            &pool,
            "test_validate_pin_plain_act_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create owner");

        let class_id = create_class(&opt, "test_validate_pin_plain_act_class", owner_id)
            .await
            .expect("Failed to create class");

        const PLAIN_PIN: &str = "1234";
        let student_id = create_student(
            &opt,
            "test_validate_pin_plain_act_s1",
            "",
            &[class_id],
            owner_id,
            Some(owner_id),
            None,
            PLAIN_PIN,
        )
        .await
        .expect("Failed to create student");

        assert!(fetch_student_active(&pool, student_id).await);

        // Plain PIN from create input / students.pin column (no hashing).
        let plain_pin = fetch_student_pin(&pool, student_id).await;
        assert_eq!(plain_pin, PLAIN_PIN);

        let result = validate_student_pin_plain(&pool, student_id, &plain_pin)
            .await
            .expect("validate_student_pin_plain must not Err");

        assert!(
            result,
            "active student with correct plain PIN must return Ok(true)"
        );

        cleanup_pin_fixtures(&pool).await;
    }
}
