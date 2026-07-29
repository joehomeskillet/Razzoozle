# Local Development Setup

This guide covers setting up Razzoozle for local development and running the verification gates required before committing changes.

## Prerequisites

- **Rust** — Latest stable version (uses `rust:1-bookworm` in Docker)
- **pnpm** — Version 11.5.1 (specified in `package.json`)
- **Node.js** — Version 20+ (from devDependencies)
- **PostgreSQL** — Version 14+ (required for database migrations)
- **Docker** — Optional (for containerized deployment)

## Clone and Install

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle/source/
pnpm install
```

The `pnpm-lock.yaml` file ensures reproducible dependency installs across all development environments.

## Database Setup

Create a PostgreSQL database and configure the connection:

```bash
# Create the database (adjust username/password as needed)
createdb razzoozle

# Copy the environment template
cp .env.example .env

# Edit .env and set DATABASE_URL
# Example: postgresql://username:password@localhost:5432/razzoozle
DATABASE_URL=postgresql://change-me:change-me@localhost:5432/razzoozle
```

Migrations are applied automatically when the server starts via the embedded SQLx migrator (see `docs/operations/migrations.md` for details).

## Running the Development Server

Start both the frontend (Vite) and backend (Socket.io + Rust server) in parallel:

```bash
pnpm dev
```

This launches:
- **Frontend**: http://localhost:5173 (Vite dev server, hot module reloading)
- **Backend**: http://localhost:3020 (Rust game server, Socket.io)

To run only the frontend:
```bash
pnpm dev:web
```

## Environment Configuration

The `.env.example` file in the repository root documents all supported environment variables. For details on each variable, see `docs/operations/configuration.md`.

### Secret Management

Variables marked with `*_FILE` support reading values from files instead of environment variables:

```bash
# Instead of: MANAGER_PASSWORD=mysecret
# Use: MANAGER_PASSWORD_FILE=/path/to/secret/file
MANAGER_PASSWORD_FILE=/run/secrets/manager_password
```

The trailing newline of the file (if present) is automatically removed. **If both `VARIABLE` and `VARIABLE_FILE` are set, an error is returned** — this is a fail-safe mechanism. Reference implementation: `rust/server/src/config/config_secret.rs`.

## Verification Gates

All of these commands **MUST pass before committing changes**:

1. **Design System Governance**
   ```bash
   pnpm tokens:gate
   ```
   Validates all UI token usage (colors, spacing, typography) against the design system.

2. **Linting**
   ```bash
   pnpm lint
   ```
   Runs `oxlint` for code quality checks across all packages.

3. **Unit Tests**
   ```bash
   pnpm test
   ```
   Runs `vitest` for TypeScript/JavaScript tests.

4. **Rust Server**
   ```bash
   bash rust/gate.sh
   ```
   Compiles the Rust server, runs server tests, and validates feature markers (deterministic, comprehensive).

5. **End-to-End Tests**
   ```bash
   pnpm e2e
   ```
   Runs Playwright browser tests. Required in CI, optional for local development but recommended.

6. **Internationalization (i18n)**
   ```bash
   pnpm i18n:check
   ```
   Validates German localization keys and coverage.

### Run All Gates at Once

```bash
pnpm verify
```

This runs `tokens:gate`, `types` (TypeScript check), `oxlint`, and `test` in sequence. It does **not** include `e2e` or `i18n:check` — run those separately if needed.

## Troubleshooting

### Port Already in Use

If port 3020 (backend) or 5173 (frontend) is already in use:

```bash
# Set an alternative port via environment variable
PORT=3021 pnpm dev
```

Frontend port is controlled by Vite config (can be customized in `packages/web/vite.config.ts`).

### Database Connection Refused

Verify PostgreSQL is running and the `DATABASE_URL` is correct:

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

If PostgreSQL isn't running, start it (or use Docker):
```bash
docker run -d \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=razzoozle \
  -p 5432:5432 \
  postgres:14-alpine
```

### pnpm install Fails

Clear the pnpm cache and reinstall:

```bash
rm pnpm-lock.yaml
pnpm install
```

### Rust Build Errors

Clean the Rust build cache and recompile:

```bash
cd rust/
cargo clean
cd ../
pnpm dev
```

Or use the gate directly:
```bash
bash rust/gate.sh
```

### Migration Errors

If the database migration fails on startup, check `docs/operations/migrations.md` for recovery procedures. Common issues:

- **Missing `_sqlx_migrations` table in pre-sqlx database**: This is expected for databases migrated via bash. The Rust migrator will create it on first run.
- **Incomplete migrations**: Run migrations explicitly:
  ```bash
  cargo run --bin razzoozle-server -- migrate
  ```

## Additional Resources

- **Configuration Reference**: `docs/operations/configuration.md`
- **Database Migrations**: `docs/operations/migrations.md`
- **Architecture**: `AGENTS.md` (project structure, worker rules, gotchas)
- **ADR 006**: `docs/adr/006-embedded-migration-architecture.md` (migration design rationale)
