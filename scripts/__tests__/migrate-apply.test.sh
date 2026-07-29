#!/usr/bin/env bash
# migrate-apply.test.sh — Validation Tests for scripts/migrate-apply.sh
#
# Tests:
#   1. All migrations apply successfully to a fresh database
#   2. Schema completeness: critical tables exist after migration
#   3. Idempotency: running migrations twice against the same DB works
#   4. Schema integrity after idempotent run
#
# Usage: bash scripts/__tests__/migrate-apply.test.sh
# Run from repo root.

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"

# Source the test harness utility
source "$REPO_ROOT/scripts/test-postgres-harness.sh"

# ============================================================================
# TEST 1: All migrations apply successfully to a fresh database
# ============================================================================
test_migrations_apply_fresh() {
  printf '\n[TEST 1] Applying migrations to fresh database...\n'

  local migrations_count
  migrations_count=$(find "$REPO_ROOT/db/migrations" -name "*.sql" | wc -l)
  printf '[TEST 1] Found %d migration files\n' "$migrations_count"

  if ((migrations_count == 0)); then
    printf '[TEST 1] ERROR: No migration files found\n' >&2
    return 1
  fi

  # Apply migrations using the production script
  printf '[TEST 1] Running migrate-apply.sh...\n'
  DATABASE_URL="$TEST_DATABASE_URL" bash "$REPO_ROOT/scripts/migrate-apply.sh" >/dev/null 2>&1
  RESULT=$?

  if ((RESULT == 0)); then
    printf '[TEST 1] PASS: All migrations applied successfully\n'
    return 0
  else
    printf '[TEST 1] FAIL: migrate-apply.sh exited with code %d\n' "$RESULT" >&2
    return 1
  fi
}

# ============================================================================
# TEST 2: Schema completeness (critical tables exist)
# ============================================================================
test_schema_completeness() {
  printf '\n[TEST 2] Checking schema completeness...\n'

  # Core tables that must exist for the application to function.
  # Extracted from actual migration files and verified via:
  #   psql ... -tc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
  local required_tables=(
    "users" "sessions" "classes" "students" "quizzes" "submissions"
    "game_results" "solo_results" "themes" "media_assets" "assignments"
  )

  local missing=()
  for table in "${required_tables[@]}"; do
    if ! psql "$TEST_DATABASE_URL" -tc "SELECT 1 FROM information_schema.tables WHERE table_name='$table'" 2>/dev/null | grep -q 1; then
      missing+=("$table")
    fi
  done

  if ((${#missing[@]} > 0)); then
    printf '[TEST 2] FAIL: Missing tables: %s\n' "${missing[*]}" >&2
    return 1
  fi

  printf '[TEST 2] PASS: All %d required tables exist\n' "${#required_tables[@]}"
  return 0
}

# ============================================================================
# TEST 3: Idempotency (applying migrations twice works)
# ============================================================================
test_idempotent_migrations() {
  printf '\n[TEST 3] Testing idempotency (second migration run)...\n'

  # Second run should succeed without errors (idempotent operations are safe)
  printf '[TEST 3] Running migrate-apply.sh again on the same database...\n'
  DATABASE_URL="$TEST_DATABASE_URL" bash "$REPO_ROOT/scripts/migrate-apply.sh" >/dev/null 2>&1
  RESULT=$?

  if ((RESULT == 0)); then
    printf '[TEST 3] PASS: Second migration run succeeded (idempotent)\n'
    return 0
  else
    printf '[TEST 3] FAIL: Second migration run exited with code %d (not idempotent)\n' "$RESULT" >&2
    return 1
  fi
}

# ============================================================================
# TEST 4: Schema integrity (no corruption after idempotent run)
# ============================================================================
test_schema_integrity_after_idempotent_run() {
  printf '\n[TEST 4] Verifying schema integrity after idempotent run...\n'

  # Query table count — should be consistent
  local table_count
  table_count=$(psql "$TEST_DATABASE_URL" -tc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')

  if [[ "$table_count" -lt 15 ]]; then
    printf '[TEST 4] FAIL: Expected at least 15 tables, found %s\n' "$table_count" >&2
    return 1
  fi

  printf '[TEST 4] PASS: Schema has %s public tables (expected >= 15)\n' "$table_count"
  return 0
}

# ============================================================================
# Main test runner
# ============================================================================
main() {
  printf '====================================================================\n'
  printf 'migrate-apply.sh Test Suite\n'
  printf '====================================================================\n'

  local failed=0

  setup_test_db

  if test_migrations_apply_fresh; then
    : # pass
  else
    ((failed++)) || true
  fi

  if test_schema_completeness; then
    : # pass
  else
    ((failed++)) || true
  fi

  if test_idempotent_migrations; then
    : # pass
  else
    ((failed++)) || true
  fi

  if test_schema_integrity_after_idempotent_run; then
    : # pass
  else
    ((failed++)) || true
  fi

  printf '\n====================================================================\n'
  if ((failed == 0)); then
    printf 'All tests PASSED ✓\n'
    printf '====================================================================\n'
    cleanup_test_db
    return 0
  else
    printf '%d test(s) FAILED ✗\n' "$failed"
    printf '====================================================================\n' >&2
    cleanup_test_db
    return 1
  fi
}

main "$@"
