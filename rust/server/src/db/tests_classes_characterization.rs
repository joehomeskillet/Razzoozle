//! Characterization tests for `db::classes` — class-level operations
//! (create_class, get_class, get_classes, set_class_active, bulk variants,
//! delete_class, update_class). WP MOD-010 / ADR-011.
//!
//! Student-level operations are in `tests_students_characterization.rs`.
//!
//! These lock down what the code CURRENTLY DOES ahead of a Tier-1 module
//! split (classes.rs is 1629 lines). Some behaviors are surprising or
//! arguably wrong; they are still pinned so a refactor cannot change them by
//! accident. Each such case is called out with a comment.
//!
//! Requires a live Postgres database (`DATABASE_URL`). Ignored by default so
//! `cargo test` / `rust/gate.sh` stay green without a DB.
//! Run with: `cargo test -- --ignored --test-threads=1` (DATABASE_URL set).

#[cfg(test)]
mod tests {
    use super::super::classes::BULK_MAX_IDS;
    use super::super::*;
    use sqlx::postgres::PgPoolOptions;
    use std::sync::{Mutex, MutexGuard};

    static DB_ISOLATION_LOCK: Mutex<()> = Mutex::new(());

    fn lock_db_isolation() -> MutexGuard<'static, ()> {
        DB_ISOLATION_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    async fn get_test_pool() -> Option<sqlx::PgPool> {
        let db_url = std::env::var("DATABASE_URL").ok()?;
        PgPoolOptions::new()
            .max_connections(1)
            .connect(&db_url)
            .await
            .ok()
    }

    async fn cleanup(pool: &sqlx::PgPool, tag: &str) {
        let pat = format!("{tag}%");
        let _ = sqlx::query("DELETE FROM students WHERE display_name LIKE $1")
            .bind(&pat)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM classes WHERE name LIKE $1")
            .bind(&pat)
            .execute(pool)
            .await;
        let _ = sqlx::query("DELETE FROM users WHERE username LIKE $1")
            .bind(&pat)
            .execute(pool)
            .await;
    }

    /// Pool + Option<pool> + a fresh owner user, prefixed by `tag`. None if no DATABASE_URL.
    async fn ready(tag: &str) -> Option<(sqlx::PgPool, Option<sqlx::PgPool>, i64)> {
        let pool = get_test_pool().await?;
        cleanup(&pool, tag).await;
        let opt = Some(pool.clone());
        let owner = create_user(&pool, &format!("{tag}_owner"), "pass123", "user")
            .await
            .expect("create_user");
        Some((pool, opt, owner))
    }

    macro_rules! ready_or_skip {
        ($tag:expr) => {
            match ready($tag).await {
                Some(v) => v,
                None => {
                    eprintln!("Skipping: DATABASE_URL not set");
                    return;
                }
            }
        };
    }

    async fn count_membership(pool: &sqlx::PgPool, student_id: i64, class_id: i64) -> i64 {
        sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM class_students WHERE student_id = $1 AND class_id = $2",
        )
        .bind(student_id)
        .bind(class_id)
        .fetch_one(pool)
        .await
        .unwrap()
        .0
    }

    // ── create_class / get_class / get_classes ─────────────────────────────

    /// Class names are unique per-owner only (idx_classes_owner_name); a second
    /// owner may reuse the exact same name without conflict.
    #[tokio::test]
    #[ignore]
    async fn test_create_class_duplicate_name_scoped_per_owner() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner_a) = ready_or_skip!("test_cc_dupname");
        let owner_b = create_user(&pool, "test_cc_dupname_owner_b", "pass123", "user")
            .await
            .expect("create_user b");

        create_class(&opt, "test_cc_dupname_class", owner_a)
            .await
            .expect("first create must succeed");

        let err = create_class(&opt, "test_cc_dupname_class", owner_a)
            .await
            .expect_err("same owner + same name must conflict");
        assert_eq!(err, "name_exists");

        // Different owner, identical name: no conflict.
        create_class(&opt, "test_cc_dupname_class", owner_b)
            .await
            .expect("different owner may reuse the same class name");

        cleanup(&pool, "test_cc_dupname").await;
    }

    /// A class id that exists but is owned by someone else returns the SAME
    /// "class not found" error as a truly missing id — no existence oracle.
    #[tokio::test]
    #[ignore]
    async fn test_get_class_hides_existence_from_non_owner() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_getclass");
        let class_id = create_class(&opt, "test_cc_getclass_class", owner)
            .await
            .expect("create_class");

        let wrong_owner_err = get_class(&opt, class_id, Some(owner + 999_000))
            .await
            .expect_err("wrong owner must fail");
        let missing_err = get_class(&opt, 9_999_999_999, Some(owner))
            .await
            .expect_err("missing id must fail");
        assert_eq!(wrong_owner_err, "class not found");
        assert_eq!(
            missing_err, wrong_owner_err,
            "existing-but-unowned and truly-missing must be indistinguishable"
        );

        cleanup(&pool, "test_cc_getclass").await;
    }

    /// `ownerName` is only present in the admin (me=None) view; the field is
    /// absent (not null) in the owner-scoped view.
    #[tokio::test]
    #[ignore]
    async fn test_get_classes_owner_name_only_in_admin_view() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_ownername");
        create_class(&opt, "test_cc_ownername_class", owner)
            .await
            .expect("create_class");

        let scoped = get_classes(&opt, Some(owner)).await;
        let mine = scoped
            .iter()
            .find(|c| c["name"] == "test_cc_ownername_class")
            .expect("class must be visible to its owner");
        assert!(
            mine.get("ownerName").is_none(),
            "owner-scoped view must not carry ownerName, got {mine:?}"
        );

        let admin = get_classes(&opt, None).await;
        let admin_row = admin
            .iter()
            .find(|c| c["name"] == "test_cc_ownername_class")
            .expect("class must be visible to admin");
        assert_eq!(
            admin_row["ownerName"],
            serde_json::json!("test_cc_ownername_owner")
        );

        cleanup(&pool, "test_cc_ownername").await;
    }

    // ── set_class_active / bulk variants ────────────────────────────────────

    /// Re-setting the same flag is idempotent (rows_affected stays 1); a
    /// non-owner's call touches nothing and reports 0, not an error.
    #[tokio::test]
    #[ignore]
    async fn test_set_class_active_idempotent_and_owner_scoped() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_setactive");
        let class_id = create_class(&opt, "test_cc_setactive_class", owner)
            .await
            .expect("create_class");

        assert_eq!(
            set_class_active(&opt, class_id, false, Some(owner))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            set_class_active(&opt, class_id, false, Some(owner))
                .await
                .unwrap(),
            1,
            "re-applying the same value is still reported as a hit"
        );

        let wrong_owner = owner + 999_000;
        assert_eq!(
            set_class_active(&opt, class_id, true, Some(wrong_owner))
                .await
                .unwrap(),
            0,
            "non-owner call must be a silent no-op, not an Err"
        );

        cleanup(&pool, "test_cc_setactive").await;
    }

    /// Empty id lists short-circuit before touching the DB; ids beyond `max`
    /// error out before the transaction opens, so nothing is mutated either way.
    #[tokio::test]
    #[ignore]
    async fn test_bulk_class_ops_empty_and_max_exceeded() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_bulkedge");
        let c1 = create_class(&opt, "test_cc_bulkedge_c1", owner)
            .await
            .unwrap();
        let c2 = create_class(&opt, "test_cc_bulkedge_c2", owner)
            .await
            .unwrap();

        let empty_active = bulk_set_class_active(&opt, vec![], false, Some(owner), BULK_MAX_IDS)
            .await
            .unwrap();
        assert!(empty_active.succeeded.is_empty() && empty_active.failed.is_empty());

        let empty_delete = bulk_delete_classes(&opt, vec![], Some(owner), BULK_MAX_IDS)
            .await
            .unwrap();
        assert!(empty_delete.succeeded.is_empty() && empty_delete.failed.is_empty());

        let over_max = bulk_delete_classes(&opt, vec![c1, c2], Some(owner), 1)
            .await
            .expect_err("more ids than max must Err");
        assert!(over_max.contains("too many ids"));
        assert!(
            get_class(&opt, c1, Some(owner)).await.is_ok(),
            "c1 must survive rejected bulk"
        );
        assert!(
            get_class(&opt, c2, Some(owner)).await.is_ok(),
            "c2 must survive rejected bulk"
        );

        cleanup(&pool, "test_cc_bulkedge").await;
    }

    // ── delete_class / update_class ─────────────────────────────────────────

    /// Deleting a class cascades the `class_students` junction row and SETs
    /// the legacy `students.class_id` NULL (FK), but the student row itself
    /// SURVIVES. Migration 022 dropped the orphan-cleanup trigger that used to
    /// delete such rows, so `delete_class`'s doc comment ("may trigger orphan
    /// deletion") is now stale — this pins the current, trigger-less reality.
    #[tokio::test]
    #[ignore]
    async fn test_delete_class_cascades_junction_but_retains_student_row() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_delclass");
        let class_id = create_class(&opt, "test_cc_delclass_class", owner)
            .await
            .expect("create_class");
        let student_id = add_student(&opt, class_id, "test_cc_delclass_s1", owner)
            .await
            .expect("add_student");

        assert_eq!(count_membership(&pool, student_id, class_id).await, 1);

        assert_eq!(delete_class(&opt, class_id, Some(owner)).await.unwrap(), 1);

        assert_eq!(count_membership(&pool, student_id, class_id).await, 0);
        let survives: i64 =
            sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM students WHERE id = $1")
                .bind(student_id)
                .fetch_one(&pool)
                .await
                .unwrap()
                .0;
        assert_eq!(
            survives, 1,
            "student row must survive class deletion (no trigger anymore)"
        );
        let legacy_class_id: (Option<i64>,) =
            sqlx::query_as("SELECT class_id FROM students WHERE id = $1")
                .bind(student_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            legacy_class_id.0, None,
            "legacy class_id column must be SET NULL by FK"
        );

        cleanup(&pool, "test_cc_delclass").await;
    }

    /// Renaming to a name already used by the same owner conflicts (same
    /// unique index as create_class); the original name is left untouched.
    #[tokio::test]
    #[ignore]
    async fn test_update_class_duplicate_rejected_and_wrong_owner_noop() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_updclass");
        create_class(&opt, "test_cc_updclass_taken", owner)
            .await
            .unwrap();
        let mine = create_class(&opt, "test_cc_updclass_mine", owner)
            .await
            .unwrap();

        let err = update_class(&opt, mine, "test_cc_updclass_taken", Some(owner))
            .await
            .expect_err("renaming onto an existing name must conflict");
        assert_eq!(err, "name_exists");
        let unchanged = get_class(&opt, mine, Some(owner)).await.unwrap();
        assert_eq!(
            unchanged["name"],
            serde_json::json!("test_cc_updclass_mine")
        );

        let wrong_owner = owner + 999_000;
        assert_eq!(
            update_class(&opt, mine, "test_cc_updclass_renamed", Some(wrong_owner))
                .await
                .unwrap(),
            0,
            "non-owner rename is a silent no-op"
        );

        cleanup(&pool, "test_cc_updclass").await;
    }
}
