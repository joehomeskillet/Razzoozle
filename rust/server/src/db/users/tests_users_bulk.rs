//! Integration tests for bulk user ops and guarded single deactivate.
//! Covers: deactivate_user_guarded, bulk_activate, bulk_deactivate, bulk_delete.
//! Requires a live Postgres database (DATABASE_URL env var).
//! Run with: `cargo test -p razzoozle-server -- --include-ignored`

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

    /// Read whether a user is active. Panics if the row is missing.
    async fn user_is_active(pool: &sqlx::PgPool, user_id: i64) -> bool {
        let row = sqlx::query_as::<_, (bool,)>("SELECT active FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .expect("user row must exist");
        row.0
    }

    /// Temporarily deactivate every active admin whose id is not in `keep_ids`.
    /// Returns the suspended ids so the caller can restore them.
    /// Used only by LastActiveAdmin / LastAdminProtection tests.
    async fn suspend_other_active_admins(pool: &sqlx::PgPool, keep_ids: &[i64]) -> Vec<i64> {
        let all: Vec<(i64,)> = sqlx::query_as(
            "SELECT id FROM users WHERE role = 'admin' AND active = true",
        )
        .fetch_all(pool)
        .await
        .expect("list active admins");

        let mut suspended = Vec::new();
        for (id,) in all {
            if !keep_ids.contains(&id) {
                set_user_active(pool, id, false)
                    .await
                    .expect("suspend other admin");
                suspended.push(id);
            }
        }
        suspended
    }

    async fn restore_active(pool: &sqlx::PgPool, ids: &[i64]) {
        for id in ids {
            let _ = set_user_active(pool, *id, true).await;
        }
    }

    fn skip_reasons(result: &BulkOpResult) -> Vec<(i64, &str)> {
        result
            .skipped
            .iter()
            .map(|e| (e.id, e.reason.as_str()))
            .collect()
    }

    fn fail_reasons(result: &BulkOpResult) -> Vec<(i64, &str)> {
        result
            .failed
            .iter()
            .map(|e| (e.id, e.reason.as_str()))
            .collect()
    }

    // ── deactivate_user_guarded ────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_not_found() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // ≥2 active admins so unrelated seed state cannot surprise us later.
        let _a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");

        let outcome = deactivate_user_guarded(&pool, 999_999_999)
            .await
            .expect("deactivate_user_guarded");

        assert_eq!(outcome, DeactivateUserOutcome::NotFound);

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_already_inactive_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let _a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");

        let user_id = create_user(&pool, "test_bulk_inactive", "pass123", "user")
            .await
            .expect("user");
        set_user_active(&pool, user_id, false)
            .await
            .expect("deactivate fixture");

        let outcome = deactivate_user_guarded(&pool, user_id)
            .await
            .expect("deactivate_user_guarded");

        assert_eq!(outcome, DeactivateUserOutcome::Deactivated);
        assert!(!user_is_active(&pool, user_id).await, "must stay inactive");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_last_active_admin_remains_active() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let solo = create_user(&pool, "test_bulk_solo_admin", "pass123", "admin")
            .await
            .expect("solo admin");
        // Second admin fixture exists so cleanup/setup is consistent; suspend
        // everyone except `solo` so the guard actually fires.
        let spare = create_user(&pool, "test_bulk_spare_admin", "pass123", "admin")
            .await
            .expect("spare admin");

        let suspended = suspend_other_active_admins(&pool, &[solo]).await;
        // spare is among suspended (or was never the only one); ensure solo is alone.
        assert_eq!(
            count_active_admins(&pool).await.expect("count"),
            1,
            "fixture must leave exactly one active admin"
        );

        let outcome = deactivate_user_guarded(&pool, solo)
            .await
            .expect("deactivate_user_guarded");

        assert_eq!(outcome, DeactivateUserOutcome::LastActiveAdmin);
        assert!(
            user_is_active(&pool, solo).await,
            "last active admin must remain active"
        );

        restore_active(&pool, &suspended).await;
        // spare may already be in suspended; re-assert DB healthy for non-test admins
        let _ = spare;
        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn deactivate_user_guarded_normal_deactivate() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // ≥2 admins so deactivating one cannot trip last-admin.
        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");

        let user_id = create_user(&pool, "test_bulk_normal", "pass123", "user")
            .await
            .expect("user");

        let outcome = deactivate_user_guarded(&pool, user_id)
            .await
            .expect("deactivate_user_guarded");
        assert_eq!(outcome, DeactivateUserOutcome::Deactivated);
        assert!(!user_is_active(&pool, user_id).await);

        // Deactivating a non-last admin also works.
        let outcome_admin = deactivate_user_guarded(&pool, admin_a)
            .await
            .expect("deactivate admin a");
        assert_eq!(outcome_admin, DeactivateUserOutcome::Deactivated);
        assert!(!user_is_active(&pool, admin_a).await);

        cleanup_test_users(&pool).await;
    }

    // ── bulk_deactivate ────────────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_requester_self_skip() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_target", "pass123", "user")
            .await
            .expect("target");

        let result = bulk_deactivate(&pool, admin_a, vec![admin_a, target])
            .await
            .expect("bulk_deactivate");

        assert!(
            skip_reasons(&result).contains(&(admin_a, "self")),
            "requester must be skipped as self: {:?}",
            result.skipped
        );
        assert!(
            result.succeeded.contains(&target),
            "target should deactivate: {:?}",
            result.succeeded
        );
        assert!(
            user_is_active(&pool, admin_a).await,
            "requester must stay active"
        );
        assert!(!user_is_active(&pool, target).await);
        assert!(
            user_is_active(&pool, admin_b).await,
            "untouched admin stays active"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_last_admin_protection() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let requester = create_user(&pool, "test_bulk_requester", "pass123", "user")
            .await
            .expect("requester");

        // Isolate to exactly these two admins so the last one is skipped.
        let suspended = suspend_other_active_admins(&pool, &[admin_a, admin_b]).await;
        assert_eq!(count_active_admins(&pool).await.expect("count"), 2);

        let result = bulk_deactivate(&pool, requester, vec![admin_a, admin_b])
            .await
            .expect("bulk_deactivate");

        assert_eq!(
            result.succeeded.len(),
            1,
            "exactly one admin may deactivate: {:?}",
            result.succeeded
        );
        assert_eq!(
            result.skipped.len(),
            1,
            "exactly one last_admin skip: {:?}",
            result.skipped
        );
        assert_eq!(result.skipped[0].reason, "last_admin");
        let skipped_id = result.skipped[0].id;
        let succeeded_id = result.succeeded[0];
        assert!(
            (skipped_id == admin_a || skipped_id == admin_b)
                && (succeeded_id == admin_a || succeeded_id == admin_b)
                && skipped_id != succeeded_id,
            "skip/succeed must partition the two admins"
        );
        assert!(
            user_is_active(&pool, skipped_id).await,
            "last admin must remain active"
        );
        assert!(!user_is_active(&pool, succeeded_id).await);
        assert_eq!(count_active_admins(&pool).await.expect("count"), 1);

        restore_active(&pool, &suspended).await;
        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_not_found_handling() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_target", "pass123", "user")
            .await
            .expect("target");

        let missing = 999_999_999_i64;
        let result = bulk_deactivate(&pool, admin_a, vec![target, missing])
            .await
            .expect("bulk_deactivate");

        assert!(result.succeeded.contains(&target));
        assert!(
            fail_reasons(&result).contains(&(missing, "not_found")),
            "missing id must fail not_found: {:?}",
            result.failed
        );
        assert!(!user_is_active(&pool, target).await);

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_deduplicate_ids() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_dedup", "pass123", "user")
            .await
            .expect("target");

        let result = bulk_deactivate(&pool, admin_a, vec![target, target, target])
            .await
            .expect("bulk_deactivate");

        assert_eq!(
            result.succeeded,
            vec![target],
            "duplicate ids must collapse to a single success"
        );
        assert!(result.skipped.is_empty());
        assert!(result.failed.is_empty());
        assert!(!user_is_active(&pool, target).await);

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_deactivate_already_inactive_idempotent() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_already_off", "pass123", "user")
            .await
            .expect("target");
        set_user_active(&pool, target, false)
            .await
            .expect("pre-deactivate");

        let result = bulk_deactivate(&pool, admin_a, vec![target])
            .await
            .expect("bulk_deactivate");

        assert_eq!(result.succeeded, vec![target]);
        assert!(result.skipped.is_empty());
        assert!(result.failed.is_empty());
        assert!(!user_is_active(&pool, target).await);

        cleanup_test_users(&pool).await;
    }

    // ── bulk_delete ────────────────────────────────────────────────────────

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_self_skip() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let victim = create_user(&pool, "test_bulk_victim", "pass123", "user")
            .await
            .expect("victim");

        let result = bulk_delete(&pool, admin_a, vec![admin_a, victim])
            .await
            .expect("bulk_delete");

        assert!(
            skip_reasons(&result).contains(&(admin_a, "self")),
            "requester must be skipped: {:?}",
            result.skipped
        );
        assert!(result.succeeded.contains(&victim));

        let requester_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(admin_a)
                .fetch_one(&pool)
                .await
                .expect("count requester");
        assert_eq!(requester_exists.0, 1, "requester row must remain");

        let victim_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(victim)
                .fetch_one(&pool)
                .await
                .expect("count victim");
        assert_eq!(victim_exists.0, 0, "victim must be deleted");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_last_admin_protection() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let requester = create_user(&pool, "test_bulk_requester", "pass123", "user")
            .await
            .expect("requester");

        let suspended = suspend_other_active_admins(&pool, &[admin_a, admin_b]).await;
        assert_eq!(count_active_admins(&pool).await.expect("count"), 2);

        let result = bulk_delete(&pool, requester, vec![admin_a, admin_b])
            .await
            .expect("bulk_delete");

        assert_eq!(result.succeeded.len(), 1, "{:?}", result.succeeded);
        assert_eq!(result.skipped.len(), 1, "{:?}", result.skipped);
        assert_eq!(result.skipped[0].reason, "last_admin");

        let kept = result.skipped[0].id;
        let removed = result.succeeded[0];
        assert_ne!(kept, removed);

        let kept_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(kept)
                .fetch_one(&pool)
                .await
                .expect("count kept");
        assert_eq!(kept_exists.0, 1, "last admin row must remain");

        let removed_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(removed)
                .fetch_one(&pool)
                .await
                .expect("count removed");
        assert_eq!(removed_exists.0, 0, "non-last admin must be deleted");

        assert_eq!(count_active_admins(&pool).await.expect("count"), 1);

        restore_active(&pool, &suspended).await;
        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_not_found_handling() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let victim = create_user(&pool, "test_bulk_victim", "pass123", "user")
            .await
            .expect("victim");

        let missing = 999_999_999_i64;
        let result = bulk_delete(&pool, admin_a, vec![victim, missing])
            .await
            .expect("bulk_delete");

        assert!(result.succeeded.contains(&victim));
        assert!(
            fail_reasons(&result).contains(&(missing, "not_found")),
            "missing id must fail not_found: {:?}",
            result.failed
        );

        let victim_exists: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM users WHERE id = $1")
                .bind(victim)
                .fetch_one(&pool)
                .await
                .expect("count victim");
        assert_eq!(victim_exists.0, 0);

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_sessions_cascade() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let victim = create_user(&pool, "test_bulk_session_user", "pass123", "user")
            .await
            .expect("victim");

        let _token = mint_session(&pool, victim, 7)
            .await
            .expect("mint session");

        let sessions_before: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM sessions WHERE user_id = $1")
                .bind(victim)
                .fetch_one(&pool)
                .await
                .expect("count sessions before");
        assert!(
            sessions_before.0 >= 1,
            "fixture must have a session row, got {}",
            sessions_before.0
        );

        let result = bulk_delete(&pool, admin_a, vec![victim])
            .await
            .expect("bulk_delete");
        assert_eq!(result.succeeded, vec![victim]);

        let sessions_after: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM sessions WHERE user_id = $1")
                .bind(victim)
                .fetch_one(&pool)
                .await
                .expect("count sessions after");
        assert_eq!(
            sessions_after.0, 0,
            "sessions must cascade-delete with the user (FK ON DELETE CASCADE)"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_delete_owner_id_set_null() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let owner = create_user(&pool, "test_bulk_quiz_owner", "pass123", "user")
            .await
            .expect("owner");

        let quiz_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO quizzes (owner_id, name, design) VALUES ($1, 'Bulk Test Quiz', '{}') RETURNING id",
        )
        .bind(owner)
        .fetch_one(&pool)
        .await
        .expect("create quiz")
        .0;

        let owner_before: (Option<i64>,) =
            sqlx::query_as("SELECT owner_id FROM quizzes WHERE id = $1")
                .bind(quiz_id)
                .fetch_one(&pool)
                .await
                .expect("quiz owner before");
        assert_eq!(owner_before.0, Some(owner));

        let result = bulk_delete(&pool, admin_a, vec![owner])
            .await
            .expect("bulk_delete");
        assert_eq!(result.succeeded, vec![owner]);

        let owner_after: (Option<i64>,) =
            sqlx::query_as("SELECT owner_id FROM quizzes WHERE id = $1")
                .bind(quiz_id)
                .fetch_one(&pool)
                .await
                .expect("quiz owner after");
        assert_eq!(
            owner_after.0, None,
            "quizzes.owner_id must SET NULL on bulk user delete"
        );

        // Leave orphan quiz tidy for shared DB.
        let _ = sqlx::query("DELETE FROM quizzes WHERE id = $1")
            .bind(quiz_id)
            .execute(&pool)
            .await;

        cleanup_test_users(&pool).await;
    }

    // ── bulk_activate ──────────────────────────────────────────────────────

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

        let _admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_reactivate", "pass123", "user")
            .await
            .expect("target");
        set_user_active(&pool, target, false)
            .await
            .expect("pre-deactivate");
        assert!(!user_is_active(&pool, target).await);

        let result = bulk_activate(&pool, vec![target])
            .await
            .expect("bulk_activate");

        assert_eq!(result.succeeded, vec![target]);
        assert!(result.skipped.is_empty(), "activate has no skip guards");
        assert!(result.failed.is_empty());
        assert!(user_is_active(&pool, target).await);

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

        let _admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_already_on", "pass123", "user")
            .await
            .expect("target");
        assert!(user_is_active(&pool, target).await);

        let result = bulk_activate(&pool, vec![target])
            .await
            .expect("bulk_activate");

        assert_eq!(result.succeeded, vec![target]);
        assert!(result.skipped.is_empty());
        assert!(result.failed.is_empty());
        assert!(user_is_active(&pool, target).await);

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

        cleanup_test_users(&pool).await;

        let _admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let _admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");
        let target = create_user(&pool, "test_bulk_activate_ok", "pass123", "user")
            .await
            .expect("target");
        set_user_active(&pool, target, false)
            .await
            .expect("pre-deactivate");

        let missing = 999_999_999_i64;
        let result = bulk_activate(&pool, vec![target, missing])
            .await
            .expect("bulk_activate");

        assert!(result.succeeded.contains(&target));
        assert!(
            fail_reasons(&result).contains(&(missing, "not_found")),
            "missing id must fail: {:?}",
            result.failed
        );
        assert!(result.skipped.is_empty(), "activate has no skip guards");
        assert!(user_is_active(&pool, target).await);

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]
    async fn bulk_activate_no_guards_self_and_admins() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        let admin_a = create_user(&pool, "test_bulk_admin_a", "pass123", "admin")
            .await
            .expect("admin a");
        let admin_b = create_user(&pool, "test_bulk_admin_b", "pass123", "admin")
            .await
            .expect("admin b");

        set_user_active(&pool, admin_a, false)
            .await
            .expect("deactivate a");
        set_user_active(&pool, admin_b, false)
            .await
            .expect("deactivate b");

        // bulk_activate has no requester, no self-skip, no last-admin guard —
        // even reactivating every admin in the request must succeed.
        let result = bulk_activate(&pool, vec![admin_a, admin_b])
            .await
            .expect("bulk_activate");

        assert_eq!(result.succeeded.len(), 2);
        assert!(result.succeeded.contains(&admin_a));
        assert!(result.succeeded.contains(&admin_b));
        assert!(result.skipped.is_empty());
        assert!(result.failed.is_empty());
        assert!(user_is_active(&pool, admin_a).await);
        assert!(user_is_active(&pool, admin_b).await);

        cleanup_test_users(&pool).await;
    }
}
