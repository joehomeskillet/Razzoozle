# Razzoozle Release & Deployment Process

This document describes the operational flow from a commit on `main` to production deployment. It covers how the automated continuous deployment (CD) system works, health gates, rollback procedures, and troubleshooting.

---

## Executive Summary

Razzoozle runs a Rust backend (`razzoozle-rust`) deployed automatically via a systemd timer. The Node.js frontend (`razzoozle`) CD system has been disabled; the application is now served entirely by the Rust backend. When a commit reaches `origin/main` (Gitea), the Rust poller detects the change, rebuilds the container, applies database migrations, and deploys with a health gate. On health gate failure, the previous image is restored automatically.

**Automation scope:** Builds, health checks, and rollbacks are fully automated. **Release tagging and version bumping are manual** (see [ADR 005: Version and Tag Schema](../adr/005-version-and-tag-schema.md) for the versioning contract).

---

## Architecture Overview

### Deployment Structure

```
┌─────────────────────────────────────────────────────┐
│  Gitea/main  (origin/main)                          │
│  ↓ (pushed commit)                                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  razzoozle-rust-cd.timer ──→ Rust deployment       │
│  (Rust poller)                                       │
│                                                      │
│  Each poller:                                       │
│  1. Detects change (SHA mismatch vs. deployed)      │
│  2. Clones/fetches into own build dir               │
│  3. Builds Docker image                             │
│  4. Applies migrations (Rust only)                  │
│  5. Deploys container                               │
│  6. Health gate (15 attempts, 3 sec each = 45 sec)  │
│  7. On pass: records deployed SHA                   │
│  8. On fail: reverts to previous image              │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Clone Topology

Razzoozle maintains **two independent Git clones** to isolate build contexts:

| Clone | Path | Purpose | Deployed Image |
|-------|------|---------|-----------------|
| `source/` | `/nvmetank1/projects/Razzoozle/source` | Developer working tree | (not deployed) |
| `cd-src-rust/` | `/nvmetank1/projects/Razzoozle/cd-src-rust` | Rust build context | `razzoozle-rust:db` |

The Node.js clone (`cd-src/`) exists for historical reference but is no longer used; the Node.js deployment system has been disabled.

---

## Deployment Triggers & Timing

### systemd Timer

The Rust CD poller is driven by a systemd timer running as a one-shot service.

#### Rust Twin: `razzoozle-rust-cd.timer`

```
Path: /etc/systemd/system/razzoozle-rust-cd.timer
Service: /etc/systemd/system/razzoozle-rust-cd.service
Script: /nvmetank1/projects/Razzoozle/rust-cd-poll.sh
```

**Timer Schedule:**
- **Initial delay:** 3 minutes after boot
- **Recurring:** Every 5 minutes
- **Jitter:** ±45 seconds (randomized to avoid burst contention)

**Service execution:**
- **Type:** `oneshot`
- **Timeout:** 1200 seconds (20 minutes)
- **Invocation:** Runs the entire `rust-cd-poll.sh` as a single unit

**Enable/disable:**
```bash
sudo systemctl status razzoozle-rust-cd.timer       # Check status
sudo systemctl start razzoozle-rust-cd.service      # Force immediate run
sudo systemctl enable razzoozle-rust-cd.timer       # Auto-start on boot
```

#### Node.js Twin: `razzoozle-cd.timer` (DISABLED)

```
Path: /etc/systemd/system/razzoozle-cd.timer
Service: /etc/systemd/system/razzoozle-cd.service
Status: INACTIVE (disabled)
```

The Node.js CD system has been disabled. The Rust backend now serves the complete application. The systemd unit files remain in place for historical reference but are not active.

---

## Rust Twin Deployment Flow

### 1. Clone & Fetch

```bash
# If cd-src-rust doesn't exist, shallow-clone from cd-src (which already holds origin URL)
if [[ -d "$CD/.git" ]]; then
  git fetch --quiet --depth 1 origin main
else
  git clone --quiet --depth 1 <origin-url> "$CD"
fi

# Fetch latest from main (shallow history)
cd "$CD"
git fetch --quiet --depth 1 origin main
NEW=$(git rev-parse origin/main)       # New commit SHA
CUR=$(cat "$ROOT/.rust-cd-deployed-sha" 2>/dev/null || echo none)  # Currently deployed SHA
[[ "$NEW" == "$CUR" ]] && exit 0      # No change → skip
```

**Early exit:** If `NEW == CUR` (same commit already deployed), the poller exits cleanly with no action.

### 2. Image Build

```bash
# Tag previous image as rollback (safety copy)
PREV=$(docker images -q razzoozle-rust:db)
[[ -n "$PREV" ]] && docker tag razzoozle-rust:db razzoozle-rust:cd-rollback

# Build new image from freshly-reset tree
DOCKER_BUILDKIT=1 docker build -q -f "$CD/rust/Dockerfile" -t razzoozle-rust:db "$CD"
```

**Notes:**
- `DOCKER_BUILDKIT=1` enables BuildKit for faster, more efficient builds.
- The new image is tagged immediately as `:db` (the production tag).
- The previous image is saved as `:cd-rollback` for emergency recovery.

### 3. Database Migrations

Migrations are **run before the container swap**, so the old container keeps running if migrations fail.

```bash
LEDGER="$ROOT/.rust-cd-migrations-applied"
touch "$LEDGER"
for MIG in "$CD"/db/migrations/*.sql; do
  BASE=$(basename "$MIG")
  grep -qxF "$BASE" "$LEDGER" && continue  # Already applied
  if ! docker exec -i razzoozle_postgres psql ... < "$MIG" >/dev/null; then
    log "MIGRATION FAILED: $BASE — aborting deploy (container not swapped)"
    exit 1
  fi
  echo "$BASE" >> "$LEDGER"
done
```

**Ledger-based idempotency:** The `.rust-cd-migrations-applied` file tracks which migrations have been run. A migration is only executed once; subsequent runs skip it.

**Failure semantics:** If any migration fails, the deployment is aborted **before** the container is swapped, keeping the old (stable) version running. See [Failure Scenarios](#failure-scenarios--recovery) below.

**Migration architecture:** See [`docs/operations/migrations.md`](../operations/migrations.md) and [ADR 006: Embedded Migration Architecture](../adr/006-embedded-migration-architecture.md) for more detail.

### 4. Web Dist Sync

The SPA build artifacts are extracted from the Rust container and placed into a shared mount (`.web-dist-live`) so the manager can serve Open Graph tags for embeds.

```bash
rm -rf "$ROOT/.web-dist-live.tmp"
WEBCID=$(docker create razzoozle-rust:db)
if docker cp "$WEBCID:/app/web/." "$ROOT/.web-dist-live.tmp" 2>/dev/null; then
  mkdir -p "$ROOT/.web-dist-live"
  rsync -a --delete "$ROOT/.web-dist-live.tmp/" "$ROOT/.web-dist-live/"
  rm -rf "$ROOT/.web-dist-live.tmp"
else
  log "WARN: web-dist extract failed — /app/web missing in image?"
fi
docker rm "$WEBCID"
```

### 5. Container Launch

```bash
docker stop razzoozle-rust >/dev/null 2>&1 || true
docker rm razzoozle-rust >/dev/null 2>&1 || true
docker run -d --name razzoozle-rust --restart unless-stopped \
  --env-file "$ROOT/source/scratchpad/rust.runenv" \
  --network source_razzoozle_network -p 127.0.0.1:3012:3020 \
  -v "$ROOT/source/docker:/workflows" \
  -v "$ROOT/config:/config" \
  -v "$ROOT/.web-dist-live:/app/web:ro" \
  razzoozle-rust:db

# Ensure config is writable by container user (uid 10001)
chown -R 10001:999 "$ROOT/config" 2>/dev/null || true
```

**Note:** The container runs on port 3012 (mapped to 3020 inside), connected to the shared Docker network.

### 6. Health Gate

The deployment is considered successful only if the health endpoint responds with HTTP 200 within 15 attempts (45 seconds total).

```bash
for _ in $(seq 15); do
  if [[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3012/healthz)" == 200 ]]; then
    echo "$NEW" > "$ROOT/.rust-cd-deployed-sha"
    docker image prune -f
    log "DEPLOY OK $NEW"
    exit 0
  fi
  sleep 3
done

# Health gate failed → rollback
log "HEALTH GATE FAILED — rolling back"
docker tag razzoozle-rust:cd-rollback razzoozle-rust:db 2>/dev/null || true
run_container  # Re-run with previous image
exit 1
```

**Health endpoint:** `GET http://127.0.0.1:3012/healthz`  
**Response:** HTTP 200 (liveness check; only confirms the server is running, not full readiness).

For detailed readiness checks (database connectivity, migrations complete, etc.), use `GET http://127.0.0.1:3012/readyz` (see [`rust/server/src/http/mod.rs`](../../rust/server/src/http/mod.rs)).

---

## Observing a Deployment

### Check Timer Status

```bash
# Rust timer
sudo systemctl status razzoozle-rust-cd.timer

# Next scheduled run
sudo systemctl list-timers razzoozle-rust-cd.timer
```

### Force Immediate Deployment

To trigger a deployment without waiting for the timer:

```bash
# Rust
sudo systemctl start razzoozle-rust-cd.service
```

### View Deployment Logs

#### Rust Twin

```bash
sudo journalctl -u razzoozle-rust-cd.service -f
```

Example output during a successful deployment:
```
[razzoozle-rust-cd] new main a1b2c3d4e5f6 (was previous_sha) — deploying rust twin
[razzoozle-rust-cd] migration applied: 001_initial_schema.sql
...
[razzoozle-rust-cd] DEPLOY OK a1b2c3d4e5f6
```

### Verify Container Status

```bash
# Rust
docker ps --filter "name=razzoozle-rust"
```

### Check Deployed SHA

```bash
# Rust
cat /nvmetank1/projects/Razzoozle/.rust-cd-deployed-sha
```

Compare with the current `main`:
```bash
cd /nvmetank1/projects/Razzoozle/cd-src-rust && git rev-parse origin/main
```

### Test Endpoints

```bash
# Rust liveness
curl http://127.0.0.1:3012/healthz

# Rust readiness (full checks)
curl http://127.0.0.1:3012/readyz

# Reverse proxy (serves manager and game)
curl http://localhost:3000/
```

---

## Failure Scenarios & Recovery

### Scenario: Deployment Hangs During Healthz Polling

**Symptoms:**
```
sudo journalctl -u razzoozle-rust-cd.service
[razzoozle-rust-cd] HEALTH GATE FAILED — rolling back
```

**Root causes:**
- Container failed to start (check `docker logs razzoozle-rust`).
- Application crashes during initialization (check logs for panics).
- Database connection timeout (check PostgreSQL is running).
- Migration failure (see [Migration Failures](#migration-failures) below).

**Recovery:**
1. Check container logs:
   ```bash
   docker logs razzoozle-rust --tail 50
   ```
2. If logs are empty or truncated, the container didn't start. Check `docker inspect razzoozle-rust`.
3. Fix the issue (e.g., restore database state, fix environment variables).
4. Trigger a new deployment:
   ```bash
   sudo systemctl start razzoozle-rust-cd.service
   ```

### Scenario: Migration Failures

**Symptoms:**
```
[razzoozle-rust-cd] MIGRATION FAILED: 021_my_schema_change.sql — aborting deploy
```

The deployment aborts **before** the old container is replaced. The old (stable) version keeps running.

**Root causes:**
- SQL syntax error in the migration file.
- Schema constraint violation (e.g., NOT NULL column added without default).
- Concurrent migration from another deployment or manual intervention.

**Recovery:**
1. Examine the failed migration:
   ```bash
   cat /nvmetank1/projects/Razzoozle/cd-src-rust/db/migrations/021_my_schema_change.sql
   ```
2. Check the database state:
   ```bash
   docker exec -i razzoozle_postgres psql -U razzoozle -d razzoozle -c "\dt"
   ```
3. Fix the migration file in the repository, commit, and push to `origin/main`.
4. Remove the failed migration from the ledger (or skip manually until the fix is pushed):
   ```bash
   # If you want to retry immediately after a code fix:
   grep -v "021_my_schema_change.sql" /nvmetank1/projects/Razzoozle/.rust-cd-migrations-applied \
     > /tmp/ledger.tmp && mv /tmp/ledger.tmp /nvmetank1/projects/Razzoozle/.rust-cd-migrations-applied
   ```
5. Trigger a new deployment:
   ```bash
   sudo systemctl start razzoozle-rust-cd.service
   ```

**Manual migration fallback:** If the automatic migrator is stuck, you can apply migrations manually:
```bash
docker exec -i razzoozle_postgres psql -U razzoozle -d razzoozle --set=ON_ERROR_STOP=1 \
  < /nvmetank1/projects/Razzoozle/cd-src-rust/db/migrations/021_my_schema_change.sql
# Then update the ledger:
echo "021_my_schema_change.sql" >> /nvmetank1/projects/Razzoozle/.rust-cd-migrations-applied
```

### Scenario: Rollback Triggered Incorrectly

**Symptoms:**
```
[razzoozle-rust-cd] HEALTH GATE FAILED — rolling back
[razzoozle-rust-cd] (container returns to previous version)
```

But the deployment was actually valid (your testing shows it works).

**Possible causes:**
- Transient startup delay (container needs >45 seconds to be ready).
- Network issue preventing healthz response.
- Health check is too strict (liveness vs. readiness).

**Recovery:**
1. Check if the new image is healthy once it stabilizes:
   ```bash
   docker ps -a --filter "name=razzoozle-rust"
   # Wait a few seconds, then:
   curl http://127.0.0.1:3012/healthz
   ```
2. If it's healthy, you can manually promote the new image:
   ```bash
   docker stop razzoozle-rust
   docker run -d --name razzoozle-rust ... razzoozle-rust:db
   ```
3. Increase the health gate timeout in `rust-cd-poll.sh` (line 77: change `seq 15` to `seq 25` for 75 seconds total).

### Scenario: Corrupted Deployed SHA File

**Symptoms:**
```
cat /nvmetank1/projects/Razzoozle/.rust-cd-deployed-sha
# Output: corrupt or missing
```

The poller can't determine what's deployed, so it keeps re-deploying.

**Recovery:**
```bash
# Query what's actually deployed
docker inspect razzoozle-rust | grep Image | head -1

# Get the commit SHA from that image (requires matching image ID)
git -C /nvmetank1/projects/Razzoozle/cd-src-rust log --all --oneline | head -1

# Write it back
echo "<correct-sha>" > /nvmetank1/projects/Razzoozle/.rust-cd-deployed-sha
```

---

## Version Management

### Release Tagging

**Tags are NOT created automatically.** To create a release:

1. **Bump versions** (see [ADR 005: Version and Tag Schema](../adr/005-version-and-tag-schema.md)):
   - Update `rust/Cargo.toml` `[workspace.package]` version.
   - Update `package.json` version to match.
   - Update `CHANGELOG.md` with release notes.

2. **Merge to main** via PR on Gitea.

3. **Create a signed tag:**
   ```bash
   git tag -s v3.0.0 -m "Release Razzoozle v3.0.0"
   git push origin v3.0.0
   ```

4. **GitHub mirror** (see [ADR 002: GitHub/Gitea Roles](../adr/002-github-gitea-roles.md)):
   - After pushing to Gitea, run the mirror sync to GitHub (via `_ghmirror` script or manual rebase with exclusions).
   - Ensure `.gitea/workflows/` and internal SDDs are **not** pushed to GitHub.

### Docker Image Tagging

Currently, the Rust image uses:
- `:db` for the current production version.
- `:cd-rollback` for the previous version (safety copy, discarded on the next deploy).

Future enhancement: Tag images with version numbers (`razzoozle-rust:v3.0.0`) for release artifact tracking.

---

## Related Documentation

- **[ADR 002: GitHub/Gitea Roles](../adr/002-github-gitea-roles.md)** — Explains the dual-mirror strategy and deployment authority.
- **[ADR 005: Version and Tag Schema](../adr/005-version-and-tag-schema.md)** — Semantic versioning and release tagging contract.
- **[ADR 006: Embedded Migration Architecture](../adr/006-embedded-migration-architecture.md)** — Database migration system design.
- **[docs/operations/migrations.md](../operations/migrations.md)** — Migration procedures and troubleshooting.
- **[docs/operations/configuration.md](../operations/configuration.md)** — Environment variable reference.
- **[REPO_RELATIONSHIP.md](/nvmetank1/projects/Razzoozle/REPO_RELATIONSHIP.md)** — High-level project structure and remotes.

---

## Scripts & Commands Reference

| Command | Purpose |
|---------|---------|
| `sudo systemctl status razzoozle-rust-cd.timer` | Check Rust timer status |
| `sudo systemctl start razzoozle-rust-cd.service` | Force immediate Rust deployment |
| `sudo journalctl -u razzoozle-rust-cd.service -f` | Watch Rust deployment logs |
| `/nvmetank1/projects/Razzoozle/rust-cd-poll.sh` | Rust CD script (executed by systemd) |
| `curl http://127.0.0.1:3012/healthz` | Test Rust health endpoint |
| `curl http://127.0.0.1:3012/readyz` | Test Rust readiness endpoint |
| `docker logs razzoozle-rust` | View Rust container logs |

---

**Last updated:** 2026-07-29  
**Maintained by:** Claude Code (orchestrator)
