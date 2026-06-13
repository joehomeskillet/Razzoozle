#!/usr/bin/env bash
set -euo pipefail

log() { printf '[auto-deploy-poll] %s\n' "$*"; }

# --- Config (env-overridable) ---
DEPLOY_DIR="${DEPLOY_DIR:-/nvmetank1/projects/rahoot}"
STATE_FILE="${STATE_FILE:-$DEPLOY_DIR/.last-deployed-sha}"

# --- Prevent overlapping runs ---
exec 9>"$DEPLOY_DIR/.auto-deploy.lock"
flock -n 9 || { log "another run in progress — skipping"; exit 0; }

# --- Step 1: refresh remote refs ---
git -C "$DEPLOY_DIR/source" fetch --quiet origin main

# --- Step 2: resolve remote HEAD ---
remote="$(git -C "$DEPLOY_DIR/source" rev-parse origin/main)"

# --- Step 3: read last-deployed sha ---
last="$(cat "$STATE_FILE" 2>/dev/null || echo none)"

# --- Step 4: common no-op path ---
if [ "$remote" = "$last" ]; then
  log "up to date ($remote) — nothing to deploy"
  exit 0
fi

# --- Step 5: deploy the new commit ---
log "new commit $remote (was $last) — deploying"
rc=0
bash "$DEPLOY_DIR/source/scripts/deploy.sh" || rc=$?

# --- Step 6: record outcome ---
if [ "$rc" -eq 0 ]; then
  printf '%s\n' "$remote" > "$STATE_FILE"
  log "deployed $remote OK"
  exit 0
else
  log "deploy FAILED for $remote — leaving state at $last so it retries next tick"
  exit 1
fi
