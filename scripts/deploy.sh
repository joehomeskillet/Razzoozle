#!/usr/bin/env bash
#
# deploy.sh — canonical, idempotent, health-gated, auto-rollback deploy for the
# live self-hosted Razzoozle app.
#
# What it does:
#   0. (unless SKIP_PULL=1) hard-reset source to origin/main
#   1. Tag the current image as a timestamped rollback point
#   2. Build the new image
#   3. Smoke-test the socket bundle in an ISOLATED container (host port 3001 is busy)
#   4. docker compose up -d
#   5. Health gate: poll container health + HTTP healthz for ~40s
#   6. Auto-rollback to the rollback tag if the health gate fails
#
# Env vars (with defaults):
#   DEPLOY_DIR  base dir holding source/ + config/ + compose       (repo root, auto-detected)
#   IMAGE       image tag built and run                            (razzoozle:custom)
#   CONTAINER   compose service container name to health-check     (razzoozle)
#   HEALTH_URL  HTTP healthcheck endpoint                          (http://127.0.0.1:3010/healthz)
#   SKIP_PULL   set to 1 to skip the git update step               (unset)
#
# n8n fallback: an Exec node runs `bash $DEPLOY_DIR/source/scripts/deploy.sh`.
#
set -euo pipefail

log() { printf '[deploy] %s\n' "$*"; }

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
IMAGE="${IMAGE:-razzoozle:custom}"
CONTAINER="${CONTAINER:-razzoozle}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3010/healthz}"

# ---------------------------------------------------------------------------
# STEP 0 — update source to origin/main
# ---------------------------------------------------------------------------
if [[ "${SKIP_PULL:-}" == "1" ]]; then
  log "STEP 0: SKIP_PULL=1 — skipping git update"
else
  log "STEP 0: updating source to origin/main"
  git -C "$DEPLOY_DIR/source" fetch --quiet origin main
  git -C "$DEPLOY_DIR/source" reset --hard --quiet origin/main
  NEW_SHA="$(git -C "$DEPLOY_DIR/source" rev-parse --short HEAD)"
  log "STEP 0: source now at $NEW_SHA"
fi

# ---------------------------------------------------------------------------
# STEP 1 — rollback tag
# ---------------------------------------------------------------------------
ROLLBACK=""
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  ROLLBACK="razzoozle:rollback-$(date +%Y%m%d-%H%M%S)"
  docker tag "$IMAGE" "$ROLLBACK"
  log "STEP 1: tagged current image as $ROLLBACK"
else
  log "STEP 1: no existing $IMAGE — first deploy, rollback not possible"
fi

# ---------------------------------------------------------------------------
# STEP 2 — build
# ---------------------------------------------------------------------------
log "STEP 2: building $IMAGE from $DEPLOY_DIR/source/"
docker build --build-arg VITE_DEFAULT_BACKEND="${VITE_DEFAULT_BACKEND:-rust}" -t "$IMAGE" "$DEPLOY_DIR/source/"

# ---------------------------------------------------------------------------
# STEP 3 — smoke-test the socket bundle in an isolated container
# ---------------------------------------------------------------------------
log "STEP 3: smoke-testing socket bundle (isolated container, port 3001)"
smoketmp="$(mktemp -d)"
cp -r "$DEPLOY_DIR/config/." "$smoketmp/" 2>/dev/null || true
out="$(timeout 6 docker run --rm --entrypoint node -e CONFIG_PATH=/app/config -v "$smoketmp:/app/config" "$IMAGE" /app/socket/index.cjs 2>&1 || true)"
rm -rf "$smoketmp"

if ! grep -qF 'Socket server running on port 3001' <<<"$out" \
   || grep -qE '^\s+at ' <<<"$out" \
   || grep -qF 'throw er;' <<<"$out" \
   || grep -qF 'Error: Cannot' <<<"$out"; then
  log "STEP 3: smoke-test output follows:"
  printf '%s\n' "$out"
  log "SMOKE FAILED — not deploying"
  exit 1
fi
log "STEP 3: smoke-test PASSED"

# ---------------------------------------------------------------------------
# STEP 4 — deploy
# ---------------------------------------------------------------------------
log "STEP 4: docker compose up -d"
cd "$DEPLOY_DIR" && docker compose up -d

# ---------------------------------------------------------------------------
# STEP 5 — health gate (poll up to ~40s)
# ---------------------------------------------------------------------------
log "STEP 5: health gate — polling container health + $HEALTH_URL"
healthy=0
for i in $(seq 1 20); do
  cstate="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo unknown)"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
  if [[ "$cstate" == "healthy" && "$code" == "200" ]]; then
    healthy=1
    break
  fi
  log "STEP 5: attempt $i/20 — container=$cstate http=$code"
  sleep 2
done

if [[ "$healthy" == "1" ]]; then
  LIVE_SHA="$(git -C "$DEPLOY_DIR/source" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  log "DEPLOY OK — image=$IMAGE sha=$LIVE_SHA"
  exit 0
fi

# ---------------------------------------------------------------------------
# STEP 6 — auto-rollback on health failure
# ---------------------------------------------------------------------------
if [[ -n "$ROLLBACK" ]]; then
  log "HEALTH FAILED — rolling back to $ROLLBACK"
  docker tag "$ROLLBACK" "$IMAGE"
  cd "$DEPLOY_DIR" && docker compose up -d
  sleep 5
  cstate="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo unknown)"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo 000)"
  log "STEP 6: post-rollback health — container=$cstate http=$code"
  log "DEPLOY FAILED — rolled back to previous image ($ROLLBACK)"
  exit 1
fi

log "HEALTH FAILED — no rollback tag available (first deploy?); manual intervention required"
exit 1
