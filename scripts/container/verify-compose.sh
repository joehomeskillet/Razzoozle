#!/bin/bash
set -euo pipefail

#
# verify-compose.sh — Validates docker-compose.yaml against security requirements
#
# Usage: verify-compose.sh <path/to/compose.yaml>
#        verify-compose.sh --help
#

SCRIPT_NAME="$(basename "$0")"

# Cleanup on exit
cleanup() {
  # No temporary resources created; cleanup is a no-op
  :
}
trap cleanup EXIT

#
# Help
#
show_help() {
  cat <<EOF
Usage: $SCRIPT_NAME <path/to/compose.yaml>
       $SCRIPT_NAME --help

Validates docker-compose.yaml configuration against security requirements.

Checks performed:
  - YAML syntax valid (docker compose config --quiet)
  - All services have read_only: true (or explicit R/W declaration)
  - All services have cap_drop: ['ALL']
  - All services have no-new-privileges: true
  - Services with database connectivity declare Healthcheck
  - Database services are NOT published on host ports
  - No images with tag 'latest' (only version-tagged images)

Exit code: 0 if all checks pass, 1 if any required check fails.

EOF
}

#
# Error handlers
#
die() {
  echo "ERROR: $*" >&2
  exit 1
}

check_tool() {
  if ! command -v "$1" &>/dev/null; then
    die "required tool not found: $1"
  fi
}

#
# Main
#

# Validate arguments
if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

if [[ "$1" == "--help" ]]; then
  show_help
  exit 0
fi

COMPOSE_FILE="$1"

# Check prerequisites
check_tool docker
check_tool jq

# Verify file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
  die "compose file not found: $COMPOSE_FILE"
fi

# Check 1: YAML syntax and validity
if ! docker compose -f "$COMPOSE_FILE" config --quiet >/dev/null 2>&1; then
  echo "CHECK: docker compose config validation ... FAIL"
  docker compose -f "$COMPOSE_FILE" config 2>&1 | head -20
  exit 1
fi
echo "CHECK: docker compose config validation ... OK"

FAILED=0

# Parse YAML to JSON and extract services
COMPOSE_JSON=$(docker compose -f "$COMPOSE_FILE" config --format json 2>/dev/null)
SERVICES=$(echo "$COMPOSE_JSON" | jq -r '.services | keys | .[]')

if [[ -z "$SERVICES" ]]; then
  echo "CHECK: Services defined in compose ... FAIL"
  exit 1
fi

#
# Check 2-5: Per-service validations
#

for SERVICE_NAME in $SERVICES; do
  SERVICE_OBJ=$(echo "$COMPOSE_JSON" | jq ".services[\"$SERVICE_NAME\"]")

  # Read_only check
  READ_ONLY=$(echo "$SERVICE_OBJ" | jq -r '.read_only // false')
  if [[ "$READ_ONLY" != "true" ]]; then
    echo "CHECK: Service '$SERVICE_NAME' has read_only: true ... FAIL"
    FAILED=1
  else
    echo "CHECK: Service '$SERVICE_NAME' has read_only: true ... OK"
  fi

  # cap_drop check
  CAP_DROP=$(echo "$SERVICE_OBJ" | jq -r '.cap_drop // []')
  if echo "$CAP_DROP" | jq -e 'index("ALL") != null' >/dev/null 2>&1; then
    echo "CHECK: Service '$SERVICE_NAME' has cap_drop: ['ALL'] ... OK"
  else
    echo "CHECK: Service '$SERVICE_NAME' has cap_drop: ['ALL'] ... FAIL"
    FAILED=1
  fi

  # no-new-privileges check (in security_opt)
  SECURITY_OPT=$(echo "$SERVICE_OBJ" | jq -r '.security_opt // []')
  if echo "$SECURITY_OPT" | jq -e 'index("no-new-privileges:true") != null' >/dev/null 2>&1; then
    echo "CHECK: Service '$SERVICE_NAME' has no-new-privileges: true ... OK"
  else
    echo "CHECK: Service '$SERVICE_NAME' has no-new-privileges: true ... FAIL"
    FAILED=1
  fi

  # Healthcheck (if database-like)
  if [[ "$SERVICE_NAME" == *"db"* ]] || [[ "$SERVICE_NAME" == *"postgres"* ]] || [[ "$SERVICE_NAME" == *"mysql"* ]]; then
    HEALTHCHECK=$(echo "$SERVICE_OBJ" | jq -r '.healthcheck // empty')
    if [[ -z "$HEALTHCHECK" ]]; then
      echo "CHECK: Service '$SERVICE_NAME' (database) has healthcheck ... FAIL"
      FAILED=1
    else
      echo "CHECK: Service '$SERVICE_NAME' (database) has healthcheck ... OK"
    fi
  fi

  # Check: Database NOT published on host
  if [[ "$SERVICE_NAME" == *"db"* ]] || [[ "$SERVICE_NAME" == *"postgres"* ]] || [[ "$SERVICE_NAME" == *"mysql"* ]]; then
    PORTS=$(echo "$SERVICE_OBJ" | jq -r '.ports // empty')
    if [[ -n "$PORTS" ]] && [[ "$PORTS" != "null" ]]; then
      echo "CHECK: Service '$SERVICE_NAME' (database) does NOT publish ports ... FAIL"
      echo "       Found published ports: $PORTS"
      FAILED=1
    else
      echo "CHECK: Service '$SERVICE_NAME' (database) does NOT publish ports ... OK"
    fi
  fi

  # Image tag check (no 'latest')
  IMAGE=$(echo "$SERVICE_OBJ" | jq -r '.image // empty')
  if [[ -n "$IMAGE" ]]; then
    if [[ "$IMAGE" == *":latest" ]]; then
      echo "CHECK: Service '$SERVICE_NAME' image '$IMAGE' does NOT use 'latest' tag ... FAIL"
      FAILED=1
    else
      echo "CHECK: Service '$SERVICE_NAME' image tag is versioned ... OK"
    fi
  fi
done

#
# Summary
#

if [[ $FAILED -eq 1 ]]; then
  exit 1
fi

exit 0
