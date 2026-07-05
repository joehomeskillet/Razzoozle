# Database Setup & Migrations

This directory contains all database schema migrations for Razzoozle's shared Postgres database.

## Overview

**Phase 0**: Database foundation for dual-write integration between Node and Rust backends.

- **Primary database**: PostgreSQL 16 (alpine container)
- **Schema location**: `db/migrations/`
- **Docker compose**: `docker-compose.postgres.yml` (available at project root)
- **Connection pool**: 10 connections per backend (Node + Rust), 5s acquire timeout
- **SSOT**: All game state, quizzes, results, themes, etc. centralize in this database

## Quick Start

### 1. Set a Strong Password (Critical)

Generate a strong random password for the Postgres user:

```bash
openssl rand -base64 32
# Example output: aB3xY9kL2mN5pQrStUvWxYz0abc1dEfGhIjKlMnOpQrS=
```

### 2. Create `.env` File (if not exists)

Create a `.env` file in the project root:

```bash
# Postgres credentials (use the generated password above)
POSTGRES_PASSWORD=aB3xY9kL2mN5pQrStUvWxYz0abc1dEfGhIjKlMnOpQrS=

# Database URL for Node (node-postgres) and Rust (sqlx)
DATABASE_URL=postgresql://razzoozle:aB3xY9kL2mN5pQrStUvWxYz0abc1dEfGhIjKlMnOpQrS=@localhost:5432/razzoozle

# Manager password (stored in DB after backfill)
MANAGER_PASSWORD=YourTestPassword123
```

### 3. Start Postgres Container

```bash
# Start Postgres container with docker-compose
docker-compose -f docker-compose.postgres.yml up -d

# Verify the container is healthy
docker-compose -f docker-compose.postgres.yml ps
# Output should show postgres service as "healthy"
```

### 4. Apply Migrations

Apply the initial schema migration:

```bash
# Option A: Using psql directly
psql ${DATABASE_URL} < db/migrations/001_initial_schema.sql

# Option B: Using docker exec (if container is running)
docker exec razzoozle_postgres psql -U razzoozle -d razzoozle < db/migrations/001_initial_schema.sql
```

### 5. Verify Schema

```bash
# Connect to database and verify tables exist
psql ${DATABASE_URL} -c "\dt"

# Expected output should list these 12 tables:
# - games_config
# - quizzes
# - game_results
# - submissions
# - solo_results
# - themes
# - theme_revisions
# - achievements_config
# - catalog_entries
# - media_assets
# - installed_plugins
# - assignments
```

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

### Constraints
- **safe_id DOMAIN**: All IDs validate the pattern `^[A-Za-z0-9_-]+$` (alphanumeric, underscore, hyphen)
- **games_config**: Enforced single row (id = 1)
- **submissions.status**: Must be one of ('pending', 'approved', 'rejected')
- **media_assets.type**: Must be one of ('image', 'audio', 'video')
- **media_assets.source**: Must be one of ('upload', 'ai', 'theme')
- **catalog_entries.source**: Must be one of ('upload', 'ai', 'submission')

## Phase 1-3 Workflow (Future)

### Phase 1: Read-Only Migration
- Backfill script reads files from `config/` and populates database
- Feature flag `DATABASE_MODE=file` (default) reads from file only
- Deduplication logic prevents duplicate entries on re-run
- Rollback: drop schema, restore tar backup

### Phase 2: Dual-Write Testing
- Set `DATABASE_MODE=dual-write`
- Write operations: FILE FIRST, then POSTGRES
- Audit logging captures every write outcome
- Twin-parity harness runs on every commit
- Staging test: monitor divergence logs for 3-5 days

### Phase 3: Cutover
- Set `DATABASE_MODE=pg-only`
- Postgres becomes single source of truth (no more file writes)
- Archive config bind-mount as read-only tarball
- Monitor production for 1 week (zero failed operations)

## Environment Variables

```bash
# Connection string (both Node and Rust backends)
DATABASE_URL=postgresql://razzoozle:PASSWORD@localhost:5432/razzoozle

# Database mode (Phase 0 → Phase 3 progression)
DATABASE_MODE=file          # Phase 1: file-based (default)
DATABASE_MODE=dual-write    # Phase 2: write both file + DB
DATABASE_MODE=pg-only       # Phase 3: DB only

# Manager password (stored in DB, env var is fallback during Phase 1)
MANAGER_PASSWORD=YourPassword

# Postgres container environment (docker-compose)
POSTGRES_PASSWORD=...       # Operator-set, from .env
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose -f docker-compose.postgres.yml logs postgres

# Verify port 5432 is not already in use
lsof -i :5432
```

### Schema application fails
```bash
# Check if migration file is valid SQL
psql -f db/migrations/001_initial_schema.sql --echo-all

# Check existing tables
psql ${DATABASE_URL} -c "SELECT * FROM information_schema.tables WHERE table_schema='public';"
```

### Rollback: Restore from Backup

If migration fails or divergence detected:

```bash
# Drop all tables and restore from tar backup
scripts/restore-from-backup.sh /path/to/backup.tar.gz

# Or manually drop schema
psql ${DATABASE_URL} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Then re-apply migration
psql ${DATABASE_URL} < db/migrations/001_initial_schema.sql
```

### Connection refused

```bash
# Ensure container is running and healthy
docker-compose -f docker-compose.postgres.yml ps

# Test connection manually
psql postgresql://razzoozle:PASSWORD@127.0.0.1:5432/razzoozle
```

## Notes

- **Password storage**: Currently plaintext (mirrors legacy config.json behavior). Upgrade to bcrypt in Phase 4 (out of scope).
- **Multi-tenancy**: Schema assumes single global game config. Per-game overrides deferred to future if needed.
- **Archived quizzes**: Use soft-delete pattern (`archived=true`). Hard deletion removes all dependent results via CASCADE.
- **Media files**: Database stores metadata only; actual files live on disk in `/media/` (bind-mount). Orphan detection job should periodically scan for untracked files.
