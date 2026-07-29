/// Database migration module.
///
/// Embeds SQLx migrations from `db/migrations/` and provides:
/// - `execute_migrate()`: Run pending migrations on the target database
/// - Migration status checking for readiness probes
///
/// Idempotency: Once a migration is recorded in _sqlx_migrations, it is never re-run.
/// Parallel safety: SQLx's advisory lock prevents concurrent migration runs.

use sqlx::PgPool;
use tracing::info;

/// Execute pending database migrations.
///
/// - Requires DATABASE_URL environment variable
/// - Runs migrations from db/migrations/ in order
/// - Records applied migrations in _sqlx_migrations table
/// - Returns 0 on success (or no migrations to run)
/// - Returns non-zero on any error
pub async fn execute_migrate() -> i32 {
    // Read DATABASE_URL from environment (required for migrations)
    let database_url = match std::env::var("DATABASE_URL") {
        Ok(url) => url,
        Err(_) => {
            eprintln!("migrate: DATABASE_URL not set");
            return 1;
        }
    };

    // Create connection pool
    let pool = match PgPool::connect(&database_url).await {
        Ok(pool) => pool,
        Err(e) => {
            eprintln!("migrate: failed to connect to database: {}", e);
            return 1;
        }
    };

    // Run migrations embedded via sqlx::migrate!()
    // This macro collects all .sql files from db/migrations/ at compile time.
    if let Err(e) = sqlx::migrate!("../../db/migrations/")
        .run(&pool)
        .await
    {
        eprintln!("migrate: migration failed: {}", e);
        return 1;
    }

    info!("migrate: all migrations applied successfully");
    0
}

/// Check if all migrations have been applied to the given pool.
///
/// Used by /readyz to verify database readiness.
/// Returns `Ok(())` if all migrations are applied, `Err` otherwise.
pub async fn check_migrations_applied(pool: &PgPool) -> Result<(), String> {
    // Query the _sqlx_migrations table to count applied migrations.
    // We expect 22 migrations (001..022).
    const EXPECTED_MIGRATION_COUNT: i64 = 22;

    let count: i64 = match sqlx::query_scalar(
        "SELECT COUNT(*) FROM _sqlx_migrations WHERE success = true"
    )
    .fetch_one(pool)
    .await
    {
        Ok(count) => count,
        Err(e) => {
            // Table doesn't exist or query failed — this is an error condition.
            return Err(format!("failed to check migration status: {}", e));
        }
    };

    if count == EXPECTED_MIGRATION_COUNT {
        Ok(())
    } else {
        Err(format!(
            "incomplete migrations: {} / {} applied",
            count, EXPECTED_MIGRATION_COUNT
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_migrations_count() {
        // Placeholder test — real integration tests require a live database
    }
}
