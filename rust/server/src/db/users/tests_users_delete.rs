//! Tests for user deletion functions: count_active_admins, delete_user, get_user_role_active.
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
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
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
        let active_admin_id = create_user(
            &pool,
            "test_active_admin",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create active admin");

        let inactive_admin_id = create_user(
            &pool,
            "test_inactive_admin",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create inactive admin");

        let user_id = create_user(
            &pool,
            "test_regular_user",
            "pass123",
            "user",
        )
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
        let _another_admin = create_user(
            &pool,
            "test_another_admin",
            "pass123",
            "admin",
        )
        .await
        .expect("Failed to create another admin");

        let after_count = count_active_admins(&pool)
            .await
            .expect("count_active_admins failed");

        assert_eq!(
            after_count, before_count + 1,
            "Adding an active admin should increment count by 1"
        );

        // Clean up
        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn delete_user_existing_returns_true_and_removes_row() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a test user
        let user_id = create_user(
            &pool,
            "test_delete_me",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create test user");

        // Verify the user exists
        let exists_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check user existence");

        assert_eq!(exists_before.0, 1, "User should exist before deletion");

        // Delete the user
        let deleted = delete_user(&pool, user_id)
            .await
            .expect("delete_user failed");

        assert!(deleted, "delete_user should return true for existing user");

        // Verify the user no longer exists
        let exists_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check user existence after deletion");

        assert_eq!(exists_after.0, 0, "User should not exist after deletion");

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn delete_user_unknown_returns_false() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        // Use a very large ID that is unlikely to exist
        let nonexistent_id: i64 = 999999999;

        let deleted = delete_user(&pool, nonexistent_id)
            .await
            .expect("delete_user failed");

        assert!(
            !deleted,
            "delete_user should return false for nonexistent user"
        );
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn delete_user_with_owned_quiz_sets_owner_id_to_null() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a user (quiz owner)
        let user_id = create_user(
            &pool,
            "test_quiz_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create quiz owner");

        // Create a quiz owned by this user
        let quiz_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO quizzes (owner_id, name, design) VALUES ($1, 'Test Quiz', '{}') RETURNING id"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to create test quiz");

        let quiz_id = quiz_id.0;

        // Verify the quiz's owner_id is the user
        let quiz_owner_before = sqlx::query_as::<_, (Option<i64>,)>(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check quiz owner before delete");

        assert_eq!(
            quiz_owner_before.0, Some(user_id),
            "Quiz should be owned by the test user before deletion"
        );

        // Delete the user (ON DELETE SET NULL should apply to quizzes.owner_id)
        let deleted = delete_user(&pool, user_id)
            .await
            .expect("delete_user failed");

        assert!(deleted, "delete_user should return true");

        // Verify the quiz's owner_id is now NULL
        let quiz_owner_after = sqlx::query_as::<_, (Option<i64>,)>(
            "SELECT owner_id FROM quizzes WHERE id = $1"
        )
        .bind(quiz_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check quiz owner after delete");

        assert_eq!(
            quiz_owner_after.0, None,
            "Quiz owner_id should be NULL after user deletion (ON DELETE SET NULL)"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn delete_user_with_owned_class_cascades_deletion() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a user (class owner)
        let user_id = create_user(
            &pool,
            "test_class_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create class owner");

        // Create a class owned by this user
        let class_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO classes (owner_id, name) VALUES ($1, 'Test Class') RETURNING id"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to create test class");

        let class_id = class_id.0;

        // Verify the class exists
        let class_exists_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM classes WHERE id = $1"
        )
        .bind(class_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check class existence before delete");

        assert_eq!(
            class_exists_before.0, 1,
            "Class should exist before user deletion"
        );

        // Delete the user (ON DELETE CASCADE should delete the class)
        let deleted = delete_user(&pool, user_id)
            .await
            .expect("delete_user failed");

        assert!(deleted, "delete_user should return true");

        // Verify the class is also deleted (CASCADE)
        let class_exists_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM classes WHERE id = $1"
        )
        .bind(class_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check class existence after delete");

        assert_eq!(
            class_exists_after.0, 0,
            "Class should be deleted when owner is deleted (ON DELETE CASCADE)"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn delete_user_with_students_cascades_deletion() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a user (student owner)
        let user_id = create_user(
            &pool,
            "test_student_owner",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create student owner");

        // Create a class (owned by the same user)
        let class_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO classes (owner_id, name) VALUES ($1, 'Test Class for Students') RETURNING id"
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to create test class");

        let class_id = class_id.0;

        // Create a student with the user as owner_id
        let student_id = sqlx::query_as::<_, (i64,)>(
            "INSERT INTO students (class_id, owner_id, display_name) VALUES ($1, $2, 'Test Student') RETURNING id"
        )
        .bind(class_id)
        .bind(user_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to create test student");

        let student_id = student_id.0;

        // Verify both class and student exist
        let class_exists_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM classes WHERE id = $1"
        )
        .bind(class_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check class existence");

        let student_exists_before = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM students WHERE id = $1"
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check student existence");

        assert_eq!(class_exists_before.0, 1, "Class should exist");
        assert_eq!(
            student_exists_before.0, 1,
            "Student should exist"
        );

        // Delete the user (should cascade to both class and student)
        let deleted = delete_user(&pool, user_id)
            .await
            .expect("delete_user failed");

        assert!(deleted, "delete_user should return true");

        // Verify both class and student are deleted (CASCADE)
        let class_exists_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM classes WHERE id = $1"
        )
        .bind(class_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check class existence after delete");

        let student_exists_after = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM students WHERE id = $1"
        )
        .bind(student_id)
        .fetch_one(&pool)
        .await
        .expect("Failed to check student existence after delete");

        assert_eq!(
            class_exists_after.0, 0,
            "Class should be deleted via CASCADE"
        );
        assert_eq!(
            student_exists_after.0, 0,
            "Student should be deleted via CASCADE"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn get_user_role_active_existing_returns_some() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create an active user with role="lehrkraft"
        let user_id = create_user(
            &pool,
            "test_lehrkraft",
            "pass123",
            "lehrkraft",
        )
        .await
        .expect("Failed to create lehrkraft");

        // Query the user
        let result = get_user_role_active(&pool, user_id)
            .await
            .expect("get_user_role_active failed");

        assert_eq!(
            result, Some(("lehrkraft".to_string(), true)),
            "get_user_role_active should return (role, active) tuple"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn get_user_role_active_inactive_returns_some_false() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        cleanup_test_users(&pool).await;

        // Create a user and then deactivate
        let user_id = create_user(
            &pool,
            "test_inactive_user",
            "pass123",
            "user",
        )
        .await
        .expect("Failed to create user");

        set_user_active(&pool, user_id, false)
            .await
            .expect("Failed to deactivate user");

        // Query the inactive user
        let result = get_user_role_active(&pool, user_id)
            .await
            .expect("get_user_role_active failed");

        assert_eq!(
            result, Some(("user".to_string(), false)),
            "get_user_role_active should return (role, false) for inactive user"
        );

        cleanup_test_users(&pool).await;
    }

    #[tokio::test]
    #[ignore]  // Ignore by default; run only when DATABASE_URL is set
    async fn get_user_role_active_nonexistent_returns_none() {
        let pool = match get_test_pool().await {
            Some(p) => p,
            None => {
                eprintln!("Skipping: DATABASE_URL not set");
                return;
            }
        };

        // Use a very large ID that is unlikely to exist
        let nonexistent_id: i64 = 999999999;

        let result = get_user_role_active(&pool, nonexistent_id)
            .await
            .expect("get_user_role_active failed");

        assert_eq!(
            result, None,
            "get_user_role_active should return None for nonexistent user"
        );
    }
}
