# Self-Hosting Razzoozle

This guide walks through deploying a complete Razzoozle instance using Docker Compose. The stack includes the application server, PostgreSQL database, and all required configuration.

> **Note:** This is a tested quick-start for development and self-hosted deployments. Production uses a single containerized runtime behind Caddy (see `rust-cd-poll.sh`).

## Architecture

The Docker Compose stack (hardened per WP DCK-09) includes:

- **app** (razzoozle-app): Rust backend + React frontend SPA, serving on port 3099 (configurable)
- **db** (postgres:16.4-alpine): Isolated PostgreSQL database on internal network only
- **dck09_net**: Internal bridge network (no public database exposure)
- **dck09_pgdata**: PostgreSQL data volume
- **dck09_config**: Razzoozle configuration directory (quizz files, themes, media)

## Prerequisites

- Docker 29.3+
- Docker Compose v2.29+
- ~2GB free disk space for images and data

## Quick Start

### 1. Prepare Secrets

Clone the example secrets and edit them:

```bash
# From the repo root (source/)
mkdir -p .secrets

cp secrets.example/database_url.example .secrets/database_url
cp secrets.example/postgres_password.example .secrets/postgres_password
cp secrets.example/ai_key_encryption_key.example .secrets/ai_key_encryption_key
cp secrets.example/bootstrap_admin_password.example .secrets/bootstrap_admin_password
```

**Edit `.secrets/database_url`** with a strong password (same as `.secrets/postgres_password`):

```
postgresql://razzoozle:YOUR_STRONG_PASSWORD_HERE@db:5432/razzoozle
```

**Edit `.secrets/postgres_password`**:

```
YOUR_STRONG_PASSWORD_HERE
```

**Edit `.secrets/ai_key_encryption_key`** (at least 20 characters):

```
your-encryption-key-min-20-chars
```

**Edit `.secrets/bootstrap_admin_password`** (admin login):

```
your-admin-password-here
```

All files in `.secrets/` are gitignored and will never be committed.

### 2. Create Environment File

Create `.env` in the repo root with the DATABASE_URL variable needed by the migration job:

```bash
echo "DATABASE_URL=postgresql://razzoozle:YOUR_STRONG_PASSWORD_HERE@db:5432/razzoozle" > .env
```

The value must match what you set in `.secrets/database_url`.

### 3. Build and Start

```bash
docker compose up --build
```

This will:
1. Build the Razzoozle application image (Rust + React, ~2 min)
2. Create isolated network, volumes, and containers
3. Start PostgreSQL and wait for readiness
4. Run schema migrations
5. Start the application server

Watch for the health check to pass:

```
razzoozle-dck09-app | (healthy)
razzoozle-dck09-db | (healthy)
```

### 4. Verify Deployment

Open your browser to **http://localhost:3099**. You should see the Razzoozle login page (German language).

To verify via API, the server exposes a readiness endpoint:

```bash
curl http://localhost:3099/readyz
# {"status":"ready","timestamp":"2026-07-29T16:28:29.527Z","db":"connected"}
```

Or use the built-in healthcheck subcommand (useful when testing without curl):

```bash
docker compose exec app razzoozle-server healthcheck
# healthcheck: server is ready
```

### 5. Admin Login

Navigate to `/admin` and log in with:

- **Username:** `admin`
- **Password:** *(value from `.secrets/bootstrap_admin_password`)*

The admin account is created on first startup from the bootstrap secret.

## Configuration

### Game Data

Place your quiz files under the `dck09_config/quizz/` directory (mounted from the `dck09_config` volume). The app watches this path at runtime.

### Theme and Styling

Customize appearance via `dck09_config/theme/` files (tokens, CSS variables, brand assets).

### Media Assets

Store custom images, videos, and audio in `dck09_config/media/`.

> **Important:** Do NOT bind `/nvmetank1/projects/Razzoozle/config` into a fresh instance. The shared config directory may contain production game data that will be loaded instead of your local setup.

## Stopping and Cleanup

To stop the stack without removing data:

```bash
docker compose stop
```

To remove everything (containers, networks, **and data volumes**):

```bash
docker compose down -v
```

> **Warning:** `docker compose down -v` deletes the `dck09_config` and `dck09_pgdata` volumes. Only use this when resetting the instance.

To remove only containers (keeping volumes):

```bash
docker compose down
```

## Troubleshooting

### Migration Fails with "DATABASE_URL not set"

The migrate job reads `DATABASE_URL` from the environment file. Ensure `.env` exists in the repo root and contains:

```
DATABASE_URL=postgresql://razzoozle:password@db:5432/razzoozle
```

The compose file uses `env_file: - .env` for the migrate service.

### Server Starts but Won't Respond

Check that port 3099 is not already in use:

```bash
netstat -tulpn | grep 3099
```

If busy, edit `docker-compose.yaml` and change the port mapping:

```yaml
ports:
  - "127.0.0.1:3099:3020"  # Change left side to 3100, 3101, etc.
```

Then restart:

```bash
docker compose up -d
```

### Database Connection Refused

Verify the database password in `.secrets/database_url` matches `.secrets/postgres_password`. If they differ, the app cannot connect.

Check database logs:

```bash
docker compose logs db | tail -20
```

### Application Crashes After Startup

Review application logs:

```bash
docker compose logs app | tail -50
```

Common issues:
- Missing config directory (will be created; if files are needed, add them to `dck09_config/`)
- Invalid secrets (too short, missing characters)

## Port Reference

| Service | Port | Host Binding | Network |
|---------|------|--------------|---------|
| App (HTTP/WS) | 3020 (internal) | 127.0.0.1:3099 | dck09_net |
| Database | 5432 (internal) | None (isolated) | dck09_net |

The database is **never** exposed to the host network.

## Volume Reference

| Volume | Mount Point (Container) | Purpose |
|--------|-------------------------|---------|
| dck09_pgdata | /var/lib/postgresql/data | Database tables and indices |
| dck09_config | /config | Quiz files, themes, media (writable) |

## Security Notes

- Containers run as non-root user (`uid 10001`)
- Root filesystem is read-only; only `/tmp` and writable volumes are writable
- All capabilities are dropped; postgres retains only `CHOWN`, `DAC_OVERRIDE`, `SETUID`, `SETGID`
- Database listens only on internal network (`no ports:` directive)
- Secrets are passed via Docker Compose secrets (not environment variables)
- Each deployment uses isolated network and volume names

## Development vs. Production

This Compose setup is ideal for:
- Local development
- Testing configuration changes
- Running CI/CD test environments
- Personal self-hosted instances

For production, consider:
- Running the container directly via `docker run` (simpler, less overhead)
- Placing it behind a reverse proxy (Caddy, Nginx) for HTTPS and load balancing
- Using a managed database service instead of containerized PostgreSQL
- Configuring persistent secret management (HashiCorp Vault, etc.)
- Setting up automated backups and monitoring

## Next Steps

- **Customize Quiz Data:** Add `.quizz` files to the `dck09_config/quizz/` directory
- **Branding:** Edit theme tokens in `dck09_config/theme/`
- **Persistent Deployment:** Move to a Kubernetes cluster or hosted container platform
- **Monitoring:** Integrate with Prometheus/Grafana using the built-in `/readyz` endpoint

## Support

For issues or questions about self-hosting:

1. Check the [Configuration Guide](./configuration.md) for runtime options
2. Review [Migration Guide](./migrations.md) for schema updates
3. Inspect logs: `docker compose logs [service-name]`
4. Verify secrets are correctly formatted and non-empty
