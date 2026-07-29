#!/usr/bin/env bash
# test-postgres-harness.sh — Ephemeral Postgres Test Instance
#
# Spins up an isolated, temporary PostgreSQL container for testing.
# Ensures no interference with production (razzoozle_postgres).
#
# Usage pattern 1 (with trap management in caller):
#   source scripts/test-postgres-harness.sh
#   setup_test_db
#   echo "$TEST_DATABASE_URL"
#   ... run tests ...
#   cleanup_test_db
#
# Usage pattern 2 (with automatic cleanup):
#   bash scripts/test-postgres-harness.sh wrap <your-command>
#
# Standalone commands (for debugging):
#   bash scripts/test-postgres-harness.sh start  # starts, prints URL, waits
#   bash scripts/test-postgres-harness.sh url    # starts, prints URL, cleanup

set -euo pipefail

# Unique prefix to avoid collisions if multiple tests run simultaneously
HARNESS_ID="razzoozle-test-$(date +%s)-$$"
CONTAINER_NAME="${HARNESS_ID}-db"
POSTGRES_USER="testuser"
POSTGRES_PASSWORD="testpass"
POSTGRES_DB="testdb"
POSTGRES_PORT="54321"  # Avoid 5432 (prod) and any local dev instance

# Will be exported by setup_test_db
TEST_DATABASE_URL=""

# Cleanup function to be called on exit (or manually)
cleanup_test_db() {
  if [[ -n "${CONTAINER_NAME:-}" ]]; then
    printf '[harness] cleaning up container: %s\n' "$CONTAINER_NAME" >&2
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  fi
}

# Start an ephemeral PostgreSQL container
# Does NOT set a trap; caller is responsible for cleanup
setup_test_db() {
  printf '[harness] starting PostgreSQL container: %s\n' "$CONTAINER_NAME" >&2

  docker run \
    --rm \
    --name "$CONTAINER_NAME" \
    --detach \
    -e POSTGRES_USER="$POSTGRES_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -e PGDATA=/var/lib/postgresql/data/pgdata \
    -p "127.0.0.1:${POSTGRES_PORT}:5432" \
    postgres:16.4-alpine \
    >/dev/null

  printf '[harness] waiting for PostgreSQL to be ready...\n' >&2
  local retries=30
  while ((retries > 0)); do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      printf '[harness] PostgreSQL is ready\n' >&2
      break
    fi
    retries=$((retries - 1))
    sleep 0.5
  done

  if ((retries == 0)); then
    printf 'Error: PostgreSQL container failed to become ready\n' >&2
    exit 1
  fi

  # Export the connection URL for use by tests
  TEST_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
  export TEST_DATABASE_URL

  printf '[harness] PostgreSQL ready: %s\n' "$TEST_DATABASE_URL" >&2
}

# Run a command with test DB setup/teardown (sets trap internally)
with_test_db() {
  local cmd=("$@")
  trap cleanup_test_db EXIT
  setup_test_db
  "${cmd[@]}"
  local status=$?
  cleanup_test_db
  trap - EXIT  # clear trap
  return $status
}

# If this script is run directly (not sourced), support a few commands:
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  case "${1:-}" in
    start)
      trap cleanup_test_db EXIT
      setup_test_db
      printf '%s\n' "$TEST_DATABASE_URL"
      printf 'Press Ctrl+C to stop.\n'
      sleep infinity
      ;;
    url)
      trap cleanup_test_db EXIT
      setup_test_db
      printf '%s\n' "$TEST_DATABASE_URL"
      ;;
    wrap)
      shift || true
      with_test_db "$@"
      ;;
    *)
      printf 'Usage: %s {start|url|wrap <command>}\n' "${0##*/}" >&2
      exit 1
      ;;
  esac
fi
