# Database Setup & Migrations

This directory contains all database schema migrations for Razzoozle's shared Postgres database, managed by an embedded SQLx migrator in the Rust server.

## Overview

**Current Architecture**: Single Postgres database (version 16) serving as single source of truth for all game state, quizzes, results, themes, and user data.

- **DBMS**: PostgreSQL 16 (alpine container)
- **Migrations**: 22 SQL files in `db/migrations/`, applied by embedded SQLx migrator at server startup
- **Ledger**: `_sqlx_migrations` table tracks applied migrations (automatically created by SQLx)
- **Connection Pool**: 10 connections per Rust backend, 5s acquire timeout
- **Connection String**: Set via `DATABASE_URL` environment variable

## Environment Variables

All configuration is provided via environment variables (or `*_FILE` variants for secret mounts).

```bash
# Required: Postgres connection string
# Format: postgresql://username:password@host:port/database
DATABASE_URL=postgresql://razzoozle:<PASSWORD>@localhost:5432/razzoozle

# Optional: Bootstrap admin password for initial setup
# If set, the Rust server uses this to create or update the manager password on startup
# Used only once during initialization; afterwards ignored in favor of database-stored value
BOOTSTRAP_ADMIN_PASSWORD=<ADMIN_PASSWORD>

# Server runtime configuration
PORT=3020                                    # HTTP server port (default shown)
CONFIG_PATH=/config                         # Path to config/ directory for quizzes, themes
WEB_DIST=/app/web                          # Path to bundled web SPA assets
```

### Secret Resolution

For sensitive values, both direct and file-based resolution are supported:
- If `<VAR>_FILE` is set, the value is read from that file (one trailing newline removed).
- Otherwise, if `<VAR>` is set, its value is used directly.
- Avoid setting both — the server will error if both are present.

## Embedded Migrator

The Rust server embeds all migrations at compile time using the SQLx `sqlx::migrate!()` macro:

```rust
// In rust/server/src/migrate.rs
sqlx::migrate!("../../db/migrations/").run(&pool).await
```

**Behavior**:
- Reads all `.sql` files from `db/migrations/` at build time
- On server startup (or explicit `razzoozle-server migrate` invocation), applies pending migrations in order
- Records each applied migration in the `_sqlx_migrations` table with timestamp and success status
- Parallel runs are serialized via SQLx's advisory lock to prevent race conditions
- Idempotency: Once a migration is recorded as `success = true`, it is never re-run

## Running Migrations

### Automatic (during server startup)
The Rust server runs migrations automatically when the `Serve` command is executed:
```bash
razzoozle-server
```

### Manual migration execution
To run migrations without starting the server:
```bash
razzoozle-server migrate
```

This command:
- Reads `DATABASE_URL` from environment
- Applies all pending migrations
- Exits with code 0 on success
- Exits with code 1 on any error (connection failure, SQL error, etc.)

## Ledger State: Pre-sqlx Databases

**For existing production databases** that had migrations applied via bash scripts (before the embedded migrator was deployed):
- The database schema is fully up-to-date with all 22 migrations
- However, the `_sqlx_migrations` ledger table may not exist
- This is a "pre-sqlx" state and **is not an error**

The server detects this state and logs a warning but does **not** block startup or fail readiness checks.

**Baseline initialization** (for existing environments): Before deploying the embedded migrator to production, manually insert the 22 applied migrations into the `_sqlx_migrations` table (without re-running them) to initialize the ledger. This is a one-time, manual operation to prevent migration 001 (which uses `CREATE DOMAIN`) from re-executing.

See issue #796 for ongoing decision on when and how to perform this baseline initialization.

## Schema Overview

### Core Configuration
- **games_config**: Single-row table storing global game settings (manager password, scoring mode, team mode, etc.)
- **themes**: Theme templates and customization
- **theme_revisions**: History of theme changes

### Content Management
- **quizzes**: Quiz catalog with questions (JSONB)
- **catalog_entries**: Question library sourced from uploads, AI, or user submissions
- **achievements_config**: Badge definitions and unlock thresholds

### Game & Results
- **game_results**: Multiplayer game session results
- **solo_results**: Solo quiz play results (tied to quiz via CASCADE)
- **submissions**: User-submitted questions awaiting approval
- **assignments**: Quiz assignments to players/teams

### Users & Access Control
- **users**: Teacher and admin user accounts with roles and authentication
- **sessions**: Active user sessions (with expiry tracking)
- **class_students_junction**: Many-to-many link between classes and students
- **student_pins**: Student login PINs for class-based quizzes
- **classes**: Class groups with teacher ownership

### Media & Plugins
- **media_assets**: Metadata for images, audio, video files (files stored on disk)
- **installed_plugins**: Installed plugin manifests and configuration

## Constraints & Defaults

### Foreign Keys & Cascades
- `solo_results` → `quizzes` (ON DELETE CASCADE): Solo results orphaned if quiz deleted
- `assignments` → `quizzes` (ON DELETE CASCADE): Assignments removed if quiz deleted
- `theme_revisions` → `themes` (ON DELETE CASCADE): Revisions removed if theme deleted
- `game_results` → `quizzes` (ON DELETE SET NULL): Game results preserved if quiz deleted
- `submissions` → `quizzes` (ON DELETE SET NULL): Submissions preserved if quiz deleted

### Optimistic Locking
All tables include a `version INT` column for optimistic concurrency control.

When updating a row:
```sql
UPDATE quizzes SET ... , version = version + 1 WHERE id = $1 AND version = $2
```

If no rows are affected, a ConflictError is raised (update failed, retry).

### Indexes

**Performance indexes** for common queries:
- `quizzes`: (archived), (created_at DESC)
- `game_results`: (quiz_id, created_at DESC), (date DESC)
- `submissions`: (status, submitted_at DESC)
- `solo_results`: (quiz_id, score DESC)
- `catalog_entries`: (source, added_at DESC)
- `media_assets`: (category, source, uploaded_at DESC)
- `assignments`: (quiz_id, assigned_to), (assigned_at DESC)
- `theme_revisions`: (theme_id, revision_number DESC)
- `users`: (email), (username)
- `classes`: (teacher_id), (active)
- `student_pins`: (pin)

### Domain & Check Constraints
- **safe_id DOMAIN**: All IDs validate the pattern `^[A-Za-z0-9_-]+$` (alphanumeric, underscore, hyphen)
- **games_config**: Enforced single row (id = 1)
- **submissions.status**: Must be one of ('pending', 'approved', 'rejected')
- **media_assets.type**: Must be one of ('image', 'audio', 'video')
- **media_assets.source**: Must be one of ('upload', 'ai', 'theme')
- **catalog_entries.source**: Must be one of ('upload', 'ai', 'submission')
- **users.role**: Must be one of ('teacher', 'admin')

## Troubleshooting

### Migrations fail to apply
```bash
# Check if all migration files are valid SQL
sqlx migrate add -r <name>  # (Optional) add a new migration

# Verify the database connection
psql "$DATABASE_URL" -c "SELECT version();"

# Check migration ledger status (if ledger exists)
psql "$DATABASE_URL" -c "SELECT * FROM _sqlx_migrations;"
```

### Connection refused
Verify the Postgres container is running and accessible:
```bash
# Test connection directly
psql postgresql://razzoozle:<PASSWORD>@localhost:5432/razzoozle -c "SELECT 1;"
```

### "Migration table does not exist" warning
This is expected for pre-sqlx databases (see "Ledger State" section). The database is fully migrated; only the ledger is missing. No action required unless you plan to manually initialize the ledger.

## Development

When adding a new migration:
1. Create a new `.sql` file in `db/migrations/` with the next sequential number (e.g., `023_my_change.sql`)
2. Write pure SQL (no Rust code)
3. Build the Rust server — the SQLx macro will include the new file at compile time
4. On next server startup, the migration will be applied automatically

## Notes

- **Single source of truth**: All game state, quiz definitions, results, and user data centralize in Postgres. The embedded migrator ensures schema consistency across all deployments.
- **Archived quizzes**: Use soft-delete pattern (`archived=true`). Hard deletion removes all dependent results via CASCADE.
- **Media files**: Database stores metadata only; actual files live on disk in `/media/` (bind-mount). Orphan detection job should periodically scan for untracked files.
- **No manual SQL scripts needed**: The embedded migrator eliminates the need for separate migration apply scripts. Simply start the server or run `razzoozle-server migrate`.
