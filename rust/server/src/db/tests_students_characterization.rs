//! Characterization tests for `db::classes` — student-level operations
//! (add_student, get_students, students_for_class, remove_student,
//! update_student, move/remove_student_from_class, get_student_classes,
//! list_all_students, can_manage_student, create_student, class pins).
//! WP MOD-010 / ADR-011. Class-level operations are in
//! `tests_classes_characterization.rs`.
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
        let _ = sqlx::query(
            "DELETE FROM students_audit WHERE student_id IN \
             (SELECT id FROM students WHERE display_name LIKE $1 OR first_name LIKE $1)",
        )
        .bind(&pat)
        .execute(pool)
        .await;
        let _ =
            sqlx::query("DELETE FROM students WHERE display_name LIKE $1 OR first_name LIKE $1")
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

    // ── add_student / get_students / students_for_class ────────────────────

    /// `add_student` does not pre-validate `class_id`; an invalid FK surfaces
    /// the raw Postgres error text straight to the caller (no friendly
    /// "class not found" translation, unlike most other functions here).
    #[tokio::test]
    #[ignore]
    async fn test_add_student_invalid_class_id_leaks_raw_db_error() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_addstudent");

        let err = add_student(&opt, 9_999_999_999, "test_cc_addstudent_s1", owner)
            .await
            .expect_err("nonexistent class_id must fail");
        assert!(
            err.to_lowercase().contains("foreign key"),
            "expected a raw FK-violation message, got: {err}"
        );

        cleanup(&pool, "test_cc_addstudent").await;
    }

    /// `get_students` has no `active` filter: deactivated students are still
    /// returned (the client is expected to filter/display them, not the DB layer).
    #[tokio::test]
    #[ignore]
    async fn test_get_students_includes_inactive_students() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_getstudents");
        let class_id = create_class(&opt, "test_cc_getstudents_class", owner)
            .await
            .unwrap();
        let student_id = add_student(&opt, class_id, "test_cc_getstudents_s1", owner)
            .await
            .unwrap();

        set_student_active(&opt, student_id, false, Some(owner))
            .await
            .unwrap();

        let rows = get_students(&opt, class_id, Some(owner)).await;
        assert!(
            rows.iter()
                .any(|r| r["id"] == serde_json::json!(student_id)),
            "inactive student must still appear in get_students, got {rows:?}"
        );

        cleanup(&pool, "test_cc_getstudents").await;
    }

    /// `students_for_class` orders by display_name ascending, independent of
    /// insertion order.
    #[tokio::test]
    #[ignore]
    async fn test_students_for_class_orders_alphabetically() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_sfc");
        let class_id = create_class(&opt, "test_cc_sfc_class", owner)
            .await
            .unwrap();
        add_student(&opt, class_id, "test_cc_sfc_zeta", owner)
            .await
            .unwrap();
        add_student(&opt, class_id, "test_cc_sfc_alpha", owner)
            .await
            .unwrap();

        let rows = students_for_class(&opt, class_id, owner).await;
        let names: Vec<&str> = rows.iter().map(|r| r.display_name.as_str()).collect();
        assert_eq!(names, vec!["test_cc_sfc_alpha", "test_cc_sfc_zeta"]);

        cleanup(&pool, "test_cc_sfc").await;
    }

    // ── remove_student ───────────────────────────────────────────────────────

    /// A missing student id is Ok(0), never an Err — for both a scoped owner
    /// and the admin (me=None) path.
    #[tokio::test]
    #[ignore]
    async fn test_remove_student_missing_id_is_ok_zero() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_rmstudent");

        assert_eq!(
            remove_student(&opt, 9_999_999_999, Some(owner))
                .await
                .unwrap(),
            0
        );
        assert_eq!(remove_student(&opt, 9_999_999_999, None).await.unwrap(), 0);

        cleanup(&pool, "test_cc_rmstudent").await;
    }

    // ── update_student ───────────────────────────────────────────────────────

    /// FIXED (#818, was FRAGWÜRDIG): passing only `first_name` (no `last_name`)
    /// used to silently WIPE the student's existing `last_name` to NULL,
    /// because the SQL's CASE branched on whether `first_name_opt` was
    /// provided instead of whether `last_name_opt` was. Now the CASE gates on
    /// `last_name_opt` itself, so an update that never mentions `last_name`
    /// leaves it untouched — and `display_name` is recomputed from the FINAL
    /// first+last pair (not left stale), so the two columns can't drift apart.
    #[tokio::test]
    #[ignore]
    async fn test_update_student_first_name_only_preserves_last_name() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_updstudent");
        let student_id = create_student(
            &opt,
            "test_cc_updstudent_First",
            "Last",
            &[],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();

        let rows = update_student(
            &opt,
            student_id,
            None,
            Some("Newfirst"),
            None,
            None,
            Some(owner),
        )
        .await
        .unwrap();
        assert_eq!(rows, 1);

        let row: (String, Option<String>, Option<String>) = sqlx::query_as(
            "SELECT display_name, first_name, last_name FROM students WHERE id = $1",
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            row.1.as_deref(),
            Some("Newfirst"),
            "first_name updates as requested"
        );
        assert_eq!(
            row.2.as_deref(),
            Some("Last"),
            "last_name survives untouched — the caller never passed last_name_opt"
        );
        assert_eq!(
            row.0, "Newfirst Last",
            "display_name is recomputed from the FINAL first+last name, not left stale"
        );

        cleanup(&pool, "test_cc_updstudent").await;
    }

    /// `birthdate = None` means "unchanged" (COALESCE keeps the stored value);
    /// a non-owner update is a silent Ok(0) with no audit row inserted.
    #[tokio::test]
    #[ignore]
    async fn test_update_student_birthdate_preserved_and_wrong_owner_noop() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_updbday");
        let bday = chrono::NaiveDate::from_ymd_opt(2015, 6, 1).unwrap();
        let student_id = create_student(
            &opt,
            "test_cc_updbday_s1",
            "",
            &[],
            owner,
            Some(owner),
            Some(bday),
            "1234",
        )
        .await
        .unwrap();

        update_student(
            &opt,
            student_id,
            Some("Renamed"),
            None,
            None,
            None,
            Some(owner),
        )
        .await
        .unwrap();
        let stored: (Option<chrono::NaiveDate>,) =
            sqlx::query_as("SELECT birthdate FROM students WHERE id = $1")
                .bind(student_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(
            stored.0,
            Some(bday),
            "birthdate survives an update that omits it"
        );

        let wrong_owner = owner + 999_000;
        let before_audit: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM students_audit WHERE student_id = $1",
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .unwrap()
        .0;
        assert_eq!(
            update_student(
                &opt,
                student_id,
                Some("Hijacked"),
                None,
                None,
                None,
                Some(wrong_owner)
            )
            .await
            .unwrap(),
            0,
            "non-owner update is a silent no-op"
        );
        let after_audit: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM students_audit WHERE student_id = $1",
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .unwrap()
        .0;
        assert_eq!(
            before_audit, after_audit,
            "rejected update must not write an audit row"
        );

        cleanup(&pool, "test_cc_updbday").await;
    }

    // ── move_student_to_class / remove_student_from_class ──────────────────

    /// Re-moving the same student into the same class twice is a silent
    /// ON CONFLICT no-op (no duplicate row, no error); a non-owner target
    /// class is rejected with a real Err (unlike most owner-scope failures
    /// in this file, which return 0/empty instead).
    #[tokio::test]
    #[ignore]
    async fn test_move_student_to_class_idempotent_and_owner_checked() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_movestudent");
        let class_id = create_class(&opt, "test_cc_movestudent_class", owner)
            .await
            .unwrap();
        let student_id = create_student(
            &opt,
            "test_cc_movestudent_s1",
            "",
            &[],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();

        move_student_to_class(&opt, student_id, class_id, Some(owner))
            .await
            .unwrap();
        move_student_to_class(&opt, student_id, class_id, Some(owner))
            .await
            .unwrap();
        assert_eq!(
            count_membership(&pool, student_id, class_id).await,
            1,
            "second move must not create a duplicate class_students row"
        );

        let wrong_owner = owner + 999_000;
        let err = move_student_to_class(&opt, student_id, class_id, Some(wrong_owner))
            .await
            .expect_err("non-owner target class must Err");
        assert_eq!(err, "class not found or not owned");

        cleanup(&pool, "test_cc_movestudent").await;
    }

    /// FIXED (#819, was FRAGWÜRDIG): since migration 022 dropped the
    /// orphan-cleanup trigger, removing a student's LAST class membership no
    /// longer deletes the student row. `remove_student_from_class` used to
    /// still promise `Ok(true)` on orphan-delete in its doc comment while
    /// ALWAYS returning `Ok(false)` in practice — a bool that can never
    /// become true. It now returns `Ok(())`: there is nothing left to report.
    /// The explicit `: ()` annotation below is the actual regression check —
    /// it fails to COMPILE against the old `Result<bool, String>` signature.
    #[tokio::test]
    #[ignore]
    async fn test_remove_student_from_class_no_longer_orphan_deletes() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_rmfromclass");
        let class_id = create_class(&opt, "test_cc_rmfromclass_class", owner)
            .await
            .unwrap();
        let student_id = create_student(
            &opt,
            "test_cc_rmfromclass_s1",
            "",
            &[class_id],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();
        assert_eq!(count_membership(&pool, student_id, class_id).await, 1);

        let result: () = remove_student_from_class(&opt, student_id, class_id, Some(owner))
            .await
            .expect("removal must succeed even for the student's last class");
        let _ = result;
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
            "the now-classless student row is left behind, not garbage-collected"
        );

        cleanup(&pool, "test_cc_rmfromclass").await;
    }

    // ── get_student_classes / list_all_students / can_manage_student ───────

    /// Owner-scoping on `get_student_classes` is silent (empty vec for a
    /// wrong owner), unlike `move_student_to_class`'s explicit Err.
    #[tokio::test]
    #[ignore]
    async fn test_get_student_classes_scoped_silently_and_ordered() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_studclasses");
        let c1 = create_class(&opt, "test_cc_studclasses_c1", owner)
            .await
            .unwrap();
        let c2 = create_class(&opt, "test_cc_studclasses_c2", owner)
            .await
            .unwrap();
        let student_id = create_student(
            &opt,
            "test_cc_studclasses_s1",
            "",
            &[c1, c2],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();

        let mine = get_student_classes(&opt, student_id, Some(owner))
            .await
            .unwrap();
        let names: Vec<serde_json::Value> = mine.iter().map(|r| r["name"].clone()).collect();
        assert_eq!(
            names,
            vec![
                serde_json::json!("test_cc_studclasses_c1"),
                serde_json::json!("test_cc_studclasses_c2")
            ],
            "ordered by joined_at ASC, i.e. insertion order of class_ids"
        );

        let wrong_owner = owner + 999_000;
        let theirs = get_student_classes(&opt, student_id, Some(wrong_owner))
            .await
            .unwrap();
        assert!(
            theirs.is_empty(),
            "wrong owner silently sees no classes, not an Err"
        );

        cleanup(&pool, "test_cc_studclasses").await;
    }

    /// A student in two classes is listed exactly once (DISTINCT), with both
    /// class memberships aggregated into its `classes` array.
    #[tokio::test]
    #[ignore]
    async fn test_list_all_students_dedupes_multi_class_membership() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_listall");
        let c1 = create_class(&opt, "test_cc_listall_c1", owner)
            .await
            .unwrap();
        let c2 = create_class(&opt, "test_cc_listall_c2", owner)
            .await
            .unwrap();
        let student_id = create_student(
            &opt,
            "test_cc_listall_s1",
            "",
            &[c1, c2],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();

        let all = list_all_students(&opt, Some(owner)).await.unwrap();
        let matches: Vec<&serde_json::Value> = all
            .iter()
            .filter(|s| s["id"] == serde_json::json!(student_id))
            .collect();
        assert_eq!(
            matches.len(),
            1,
            "student must appear exactly once despite 2 memberships"
        );
        assert_eq!(matches[0]["classes"].as_array().unwrap().len(), 2);

        cleanup(&pool, "test_cc_listall").await;
    }

    /// Admin (me=None) can manage anyone; a non-owning stranger cannot; the
    /// real owner can.
    #[tokio::test]
    #[ignore]
    async fn test_can_manage_student_admin_owner_and_stranger() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_canmanage");
        let student_id = create_student(
            &opt,
            "test_cc_canmanage_s1",
            "",
            &[],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();

        assert!(can_manage_student(&opt, student_id, None).await.unwrap());
        assert!(can_manage_student(&opt, student_id, Some(owner))
            .await
            .unwrap());
        assert!(!can_manage_student(&opt, student_id, Some(owner + 999_000))
            .await
            .unwrap());

        cleanup(&pool, "test_cc_canmanage").await;
    }

    // ── create_student ───────────────────────────────────────────────────────

    /// If ANY of the requested class_ids is not owned by `me`, the whole call
    /// aborts before the student row is ever inserted — no partial student.
    #[tokio::test]
    #[ignore]
    async fn test_create_student_partial_class_ownership_aborts_entirely() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_createstud_partial");
        let mine = create_class(&opt, "test_cc_createstud_partial_mine", owner)
            .await
            .unwrap();
        let other_owner = create_user(&pool, "test_cc_createstud_partial_other", "pass123", "user")
            .await
            .unwrap();
        let not_mine = create_class(&opt, "test_cc_createstud_partial_notmine", other_owner)
            .await
            .unwrap();

        let err = create_student(
            &opt,
            "test_cc_createstud_partial_s1",
            "",
            &[mine, not_mine],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .expect_err("one unowned class id must fail the whole call");
        assert_eq!(err, "permission denied for one or more classes");

        let n: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM students WHERE display_name = 'test_cc_createstud_partial_s1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap()
        .0;
        assert_eq!(
            n, 0,
            "no orphan student row must be left behind by the aborted call"
        );

        cleanup(&pool, "test_cc_createstud_partial").await;
    }

    /// Empty last_name -> display_name is just the trimmed first name and the
    /// `last_name` column stays NULL (not ""); empty class_ids leaves the
    /// student with zero class_students rows.
    #[tokio::test]
    #[ignore]
    async fn test_create_student_empty_last_name_and_no_classes() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_createstud_empty");
        let student_id = create_student(
            &opt,
            "test_cc_createstud_empty_X",
            "",
            &[],
            owner,
            Some(owner),
            None,
            "0000",
        )
        .await
        .unwrap();

        let row: (String, Option<String>) =
            sqlx::query_as("SELECT display_name, last_name FROM students WHERE id = $1")
                .bind(student_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.0, "test_cc_createstud_empty_X");
        assert_eq!(
            row.1, None,
            "empty last_name is stored as NULL, not an empty string"
        );

        let memberships: i64 = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM class_students WHERE student_id = $1",
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .unwrap()
        .0;
        assert_eq!(memberships, 0);

        cleanup(&pool, "test_cc_createstud_empty").await;
    }

    // ── get_class_pins / class_get_student_pin / class_set_student_pin ─────

    /// `add_student` never sets a PIN; `get_class_pins` COALESCEs the NULL to
    /// an empty string (no lazy generation here). A non-owner sees an empty
    /// list, not an error (same "silent" family as get_student_classes).
    #[tokio::test]
    #[ignore]
    async fn test_get_class_pins_coalesces_null_and_owner_scoped() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_classpins");
        let class_id = create_class(&opt, "test_cc_classpins_class", owner)
            .await
            .unwrap();
        add_student(&opt, class_id, "test_cc_classpins_s1", owner)
            .await
            .unwrap();

        let rows = get_class_pins(&opt, class_id, Some(owner)).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["pin"], serde_json::json!(""));

        let wrong_owner = owner + 999_000;
        let theirs = get_class_pins(&opt, class_id, Some(wrong_owner))
            .await
            .unwrap();
        assert!(
            theirs.is_empty(),
            "wrong owner gets an empty list, not an Err"
        );

        cleanup(&pool, "test_cc_classpins").await;
    }

    /// FRAGWÜRDIG asymmetry: on a permission failure, `class_get_student_pin`
    /// returns an explicit Err, while `class_set_student_pin` swallows the
    /// same failure into a silent `Ok(0)`.
    #[tokio::test]
    #[ignore]
    async fn test_class_pin_get_set_permission_asymmetry() {
        let _lock = lock_db_isolation();
        let (pool, opt, owner) = ready_or_skip!("test_cc_pinasym");
        let student_id = create_student(
            &opt,
            "test_cc_pinasym_s1",
            "",
            &[],
            owner,
            Some(owner),
            None,
            "1234",
        )
        .await
        .unwrap();
        let wrong_owner = owner + 999_000;

        let err = class_get_student_pin(&opt, student_id, Some(wrong_owner))
            .await
            .expect_err("no-permission get must Err");
        assert_eq!(err, "cannot manage student");

        let rows_affected = class_set_student_pin(&opt, student_id, "9999", Some(wrong_owner))
            .await
            .expect("no-permission set must NOT Err");
        assert_eq!(
            rows_affected, 0,
            "no-permission set is a silent Ok(0), unlike the get path"
        );

        cleanup(&pool, "test_cc_pinasym").await;
    }
}
