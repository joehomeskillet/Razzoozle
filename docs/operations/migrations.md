# Database Migrations

This document describes the migration architecture, procedures for applying migrations, and recovery steps.

## Architecture Overview

Razzoozle uses **SQLx embedded database migrations** as the standard migration system (see ADR 006: `docs/adr/006-embedded-migration-architecture.md`).

### How It Works

- Migration SQL files are embedded in the Rust server binary at compile time via SQLx macros
- A migration ledger (`_sqlx_migrations` table) tracks applied migrations
- The migrator is **idempotent** — already-applied migrations are never re-run
- **Parallel-safe** — SQLx uses PostgreSQL advisory locks to prevent concurrent conflicts
- **Deterministic** — all migrations run in order, no skipping or manual intervention needed

### Standard vs. Deprecated

| Component | Status | Used When |
|-----------|--------|-----------|
| **Rust Embedded Migrator** | Standard | All new deployments, server startup |
| **Bash Script** (`scripts/migrate-apply.sh`) | Deprecated | Fallback/emergency only, not automated |

The bash-based migration script is kept in the repository for emergency/offline scenarios but is not part of standard operations.

---

## Migration Count

The database schema consists of **exactly 23 sequential migrations**:

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | Initial database schema (domain types, tables, indexes) |
| `002_node_parity_columns.sql` | Node parity tracking columns |
| `003_theme_id_and_recap.sql` | Theme ID and recap support |
| ... | (19 more migrations) |
| `022_students_active.sql` | Student active status tracking |
| `023_experience_modes.sql` | Experience-mode CSV allow-list on `games_config` (WP #878) |

**Verify locally**:
```bash
ls db/migrations/ | wc -l
# Expected output: 23
```

### Apply path for 023 (prod does NOT auto-apply)

1. **Standard (embedded SQLx migrator):** restart/redeploy the Rust server after the binary includes `023_experience_modes.sql`. On boot the migrator runs pending files under `db/migrations/` and records them in `_sqlx_migrations`.
2. **Emergency (deprecated bash):** `scripts/migrate-apply.sh` against the target `DATABASE_URL` (idempotent `IF NOT EXISTS`).
3. **Manual SQL:** `ALTER TABLE games_config ADD COLUMN IF NOT EXISTS experience_modes_enabled VARCHAR(255) DEFAULT '';`

---

## Pre-Sqlx Baseline (Production Databases)

### Scenario

Production databases have already applied all 22 migrations via the **bash script**, but have **NO `_sqlx_migrations` ledger table**. This is called "pre-sqlx" state.

### Is This an Error?

**No, it is NOT an error.**

This is an expected, known state for existing production deployments that predated the SQLx migrator. The database is **fully migrated**; only the ledger is missing.

### Ledger Semantics

The SQLx migrator recognizes three database states:

1. **`_sqlx_migrations` table does NOT exist** (pre-sqlx)
   - Status: ✓ Acceptable
   - Readiness check (`/readyz`): ✓ GREEN (with warning in logs)
   - Action: Migrator creates the ledger on first run and records all 22 migrations as applied

2. **`_sqlx_migrations` table EXISTS and is COMPLETE** (22 entries)
   - Status: ✓ Acceptable
   - Readiness check (`/readyz`): ✓ GREEN
   - Action: Migrator is a no-op (idempotent)

3. **`_sqlx_migrations` table EXISTS but is INCOMPLETE** (<22 entries)
   - Status: ✗ Not acceptable
   - Readiness check (`/readyz`): ✗ RED (BLOCKED)
   - Action: Migrator runs pending migrations until ledger is complete

**Implementation reference**: `rust/server/src/migrate.rs`

---

## Backup Before Migration

**Always backup before any production database migration.**

```bash
# Create a full database backup in custom format (allows selective restore)
pg_dump -Fc \
  -U postgres \
  -h localhost \
  razzoozle > razzoozle_$(date +%Y%m%d_%H%M%S).dump

# Verify backup size (should be > 1 MB for a populated database)
ls -lh razzoozle_*.dump
```

**Best practices**:
- Stop the server or drain connections before backup
- Store backups in a safe location (replicated storage, offsite)
- Test restore procedures periodically
- Include backup timestamp in filename

---

## Apply Migrations (Standard Procedure)

### Docker Deployment

The Docker image automatically runs migrations on startup:

```dockerfile
CMD [ "razzoozle-server", "migrate" ]
```

Migrations run before the game server starts accepting connections. The server will not listen on the HTTP port until migrations are complete.

**To deploy**:
```bash
docker run \
  -e DATABASE_URL=postgresql://user:password@host:5432/razzoozle \
  razzoozle-rust:latest
# Migrations run automatically, server starts on :3020
```

### Standalone / Local Testing

```bash
# Set the database connection string
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/razzoozle

# Option A: Run the compiled server binary
razzoozle-server migrate

# Option B: From source (requires Rust toolchain)
cargo run --bin razzoozle-server -- migrate
```

### Verification

After migrations complete, verify the ledger table:

```bash
# Connect to the database and check migration count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM _sqlx_migrations;"
# Expected output: 22

# View all applied migrations with timestamps
psql $DATABASE_URL -c "SELECT installed_on, version, description, success FROM _sqlx_migrations ORDER BY installed_on;"
```

### Idempotency

If you run the migrator again:
- It checks the `_sqlx_migrations` ledger
- Already-applied migrations are skipped (no-op)
- Only new migrations (if any) are executed
- Server can be started/stopped/restarted safely

---

## Migration Failure

If the migration process fails:

### 1. Check Error Logs

Review the server or migration logs for the specific error:

```bash
# If running in Docker:
docker logs <container-id> | grep -i "migrate"

# If running standalone:
cargo run --bin razzoozle-server -- migrate 2>&1 | grep -i error
```

**Common errors**:
- `duplicate key value violates unique constraint` — constraint already exists
- `column ... already exists` — prior partial migration applied
- `permission denied` — insufficient database user permissions

### 2. Restore from Backup

If an error occurs, restore the pre-migration database from backup:

```bash
# Restore the database
pg_restore \
  -U postgres \
  -h localhost \
  -d razzoozle \
  razzoozle_YYYYMMDD_HHMMSS.dump

# This drops and recreates the schema, returning the database to backup state
```

The `_sqlx_migrations` ledger will also be restored to its backup state. After restore, retry the migrator.

### 3. Investigate Root Cause

Before retrying:
- Check if the database schema has been manually modified outside of migrations
- Verify that no migrations were partially applied by a previous failed run
- Confirm database permissions are correct for the server user
- Check the specific migration SQL in `db/migrations/` to understand what was attempted

### 4. Retry Migrations

Once the root cause is addressed:

```bash
# Restore from backup (if not already done)
pg_restore -U postgres -h localhost -d razzoozle razzoozle_backup.dump

# Run migrations again
razzoozle-server migrate
```

If the error persists, **contact the maintainers** with:
- Specific error message from logs
- Database version (`SELECT version();`)
- Steps to reproduce

---

## Rollback (Recovery to Prior State)

SQLx migrations are **forward-only** — there are no "down" migrations to undo individual migration steps.

### To Rollback to a Previous Database State

The only recovery mechanism is to **restore from a pre-migration backup**:

```bash
# 1. Restore the database to the backup point
pg_restore \
  -U postgres \
  -h localhost \
  -d razzoozle \
  razzoozle_YYYYMMDD_HHMMSS.dump

# 2. This restores both the schema AND the migration ledger to the backup state

# 3. After restore, you can re-apply migrations from that point forward
razzoozle-server migrate
```

**Critical**: Always create backups BEFORE any production migration. This is your only rollback option.

---

## Testing Migrations Locally

To verify migrations work in your development environment:

### Setup Local PostgreSQL

```bash
# Start a temporary PostgreSQL container
docker run -d \
  --name razzoozle-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=razzoozle \
  -p 5432:5432 \
  postgres:14-alpine
```

### Run Migrations from Source

```bash
# Set DATABASE_URL to local database
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/razzoozle

# Run migrations from source
cargo run --bin razzoozle-server -- migrate

# Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM _sqlx_migrations;"
# Expected: 22

# View detailed migration history
psql $DATABASE_URL << EOF
SELECT
  installed_on,
  version,
  description,
  success,
  execution_time / 1000000000.0 as execution_time_seconds
FROM _sqlx_migrations
ORDER BY installed_on;
EOF
```

### Cleanup

```bash
# Stop and remove the test container
docker stop razzoozle-db
docker rm razzoozle-db
```

---

## Pre-Sqlx Baseline Initialization (For Existing Prod)

If you have a production database with all 22 bash-applied migrations but no ledger table, and you want to migrate to the SQLx system:

### Option A: Let SQLx Auto-Create the Ledger (Recommended)

Simply run the migrator:

```bash
razzoozle-server migrate
```

The migrator will:
1. Detect the pre-sqlx state (no ledger)
2. Log a warning: "Pre-sqlx database detected"
3. Create the `_sqlx_migrations` table
4. **NOT re-run** any migrations (the database is already up-to-date)
5. Return success

The server will then start normally with a complete, tracked migration ledger.

### Option B: Manual Ledger Baseline (Advanced)

If you need explicit control, you can manually insert the 22 migrations into the ledger:

```bash
# This is a template; adjust version numbers and timestamps as needed
psql $DATABASE_URL << EOF
INSERT INTO _sqlx_migrations (version, description, installed_on, success, execution_time)
VALUES
  (1, 'initial schema', NOW() - INTERVAL '22 days', true, 0),
  (2, 'node parity columns', NOW() - INTERVAL '21 days', true, 0),
  -- ... (repeat for all 22 migrations)
  (22, 'students active', NOW() - INTERVAL '1 day', true, 0);
EOF
```

**Note**: This is rarely necessary. Option A (letting the migrator handle it) is simpler and safer.

---

## References

- **ADR 006**: `docs/adr/006-embedded-migration-architecture.md` — Detailed rationale for embedded vs. bash migrations
- **Migration Source**: `db/migrations/` — All 22 SQL migration files
- **Migration Runner**: `rust/server/src/migrate.rs` — Embedded migrator implementation, pre-sqlx detection, ledger semantics
- **Deprecated Script**: `scripts/migrate-apply.sh` — Legacy bash-based migrator (fallback/emergency only)
- **PostgreSQL Backup**: [pg_dump documentation](https://www.postgresql.org/docs/current/app-pgdump.html)
- **PostgreSQL Restore**: [pg_restore documentation](https://www.postgresql.org/docs/current/app-pgrestore.html)
