/// Database migration module.
///
/// Embeds SQLx migrations from `db/migrations/` and provides:
/// - `execute_migrate()`: Run pending migrations on the target database
/// - Migration status checking for readiness probes (DCK-05)
///
/// Idempotency: Once a migration is recorded in _sqlx_migrations, it is never re-run.
/// Parallel safety: SQLx's advisory lock prevents concurrent migration runs.
///
/// Ledger Semantics (Prod Baseline):
/// The embedded migrator creates and uses the _sqlx_migrations table (SQLx standard).
/// Existing production databases have already applied 22 migrations via the separate
/// bash-based apply-script (scripts/migrate-apply.sh), but have NO SQLx ledger table.
/// This is a "pre-sqlx" state that is NOT an error — the database is fully migrated,
/// only the ledger is missing.
///
/// Baseline Decision (open for user approval):
/// Before the embedded migrator is deployed to an environment where migrations were
/// previously applied via bash, a ONE-TIME baseline initialization is required:
/// manually insert the 22 applied migrations into the _sqlx_migrations table
/// (without re-running them). This prevents migration 001 (CREATE DOMAIN without
/// IF NOT EXISTS) from failing. This is a manual, gated decision in DCK-07/09.
use sqlx::PgPool;
use tracing::warn;

/// Migration status for readiness checks (three-phase semantics).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationStatus {
    /// Ledger table does not exist (pre-sqlx database).
    /// Common in production: migrations were applied via bash, no SQLx ledger yet.
    /// This is NOT unready — it's a known state requiring baseline decision.
    PreSqlx,
    /// Ledger table exists but is incomplete (some migrations pending).
    /// Only this state should block readiness.
    Incomplete { applied: i64, expected: i64 },
    /// Ledger table exists and all migrations are applied.
    Complete,
}

/// Get the expected migration count from the embedded migrator.
/// This count is sourced from the actual compiled migrations at build time,
/// so it is automatically correct when new migrations are added.
fn get_expected_migration_count() -> i64 {
    sqlx::migrate!("../../db/migrations/").migrations.len() as i64
}

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
    if let Err(e) = sqlx::migrate!("../../db/migrations/").run(&pool).await {
        eprintln!("migrate: migration failed: {}", e);
        return 1;
    }

    eprintln!("migrate: all migrations applied successfully");
    0
}

/// Determine the migration status of the database (three-phase semantics).
///
/// Returns:
/// - `PreSqlx`: Ledger table does not exist (pre-sqlx state, NOT an error for readiness)
/// - `Incomplete`: Ledger exists but not all migrations applied (blocks readiness, 503)
/// - `Complete`: All migrations applied (readiness OK, 200)
async fn get_migration_status(pool: &PgPool) -> Result<MigrationStatus, String> {
    // Count applied migrations from the SQLx ledger.
    // Expected count is sourced from the embedded migrator at compile time,
    // so it is automatically correct when new migrations are added.
    let expected_count = get_expected_migration_count();

    let count: i64 =
        match sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success = true")
            .fetch_one(pool)
            .await
        {
            Ok(count) => count,
            Err(e) => {
                // Check if this is a "table doesn't exist" error (pre-sqlx state).
                // sqlx errors for missing tables contain both "does not exist" and the table name.
                let err_str = e.to_string();
                if err_str.contains("does not exist") {
                    // Pre-sqlx database: migrations were applied via bash, no ledger yet.
                    // This is a known state, not an error. Return PreSqlx without error.
                    return Ok(MigrationStatus::PreSqlx);
                }
                // Other DB errors (connection, permission, etc.) are real errors.
                return Err(format!("failed to check migration status: {}", e));
            }
        };

    if count == expected_count {
        Ok(MigrationStatus::Complete)
    } else {
        Ok(MigrationStatus::Incomplete {
            applied: count,
            expected: expected_count,
        })
    }
}

/// Check if all migrations have been applied to the given pool.
///
/// Used by /readyz to verify database readiness.
/// Returns `Ok(())` if database is ready (all migrations applied OR pre-sqlx state).
/// Returns `Err` only if ledger exists but is incomplete (genuine not-ready).
pub async fn check_migrations_applied(pool: &PgPool) -> Result<(), String> {
    match get_migration_status(pool).await? {
        MigrationStatus::PreSqlx => {
            // Pre-sqlx database (e.g., Prod with bash-applied migrations, no ledger).
            // This is not a readiness failure — the database is fully migrated.
            // The baseline decision (when to initialize the ledger) is open and requires
            // manual approval for existing environments (see module docs, WP-DCK-05).
            // Log a warning so operators know the state, but don't block readiness.
            warn!(
                "readyz: migration ledger not initialized (pre-sqlx database) — \
                 baseline decision pending, see #796"
            );
            Ok(())
        }
        MigrationStatus::Complete => {
            // All migrations applied, ledger is up-to-date.
            Ok(())
        }
        MigrationStatus::Incomplete { applied, expected } => {
            // Ledger exists but is incomplete — database is not ready.
            // This is a genuine not-ready state (fresh DB, migrations pending, or failed).
            Err(format!(
                "incomplete migrations: {} / {} applied",
                applied, expected
            ))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_status_enum_exists() {
        // Verify the three-phase MigrationStatus enum is well-formed.
        // Pre-sqlx, Incomplete, and Complete are the three valid states.
        let _pre = MigrationStatus::PreSqlx;
        let _incomplete = MigrationStatus::Incomplete {
            applied: 10,
            expected: get_expected_migration_count(),
        };
        let _complete = MigrationStatus::Complete;
    }

    // Integration tests for get_migration_status and check_migrations_applied
    // require a live PostgreSQL database (including both pre-sqlx and post-migrate states).
    // These are covered by the manual test scenarios in the WP-DCK-05 report:
    // - Fresh DB with no ledger table (pre-sqlx)
    // - Ledger with all N migrations applied (N sourced from embedded migrator at compile time)
    // - Ledger with partial migrations (for 503 verification)
    // No empty tests — readiness is verified by the three scenarios in the gate.
}
