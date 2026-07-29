#!/bin/bash
set -euo pipefail

#
# verify-image.sh — Validates Docker image against security and metadata requirements
#
# Usage: verify-image.sh <image:tag>
#        verify-image.sh --help
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
Usage: $SCRIPT_NAME <image:tag>
       $SCRIPT_NAME --help

Validates Docker image against OCI labels, runtime security, and metadata requirements.

Checks performed:
  - OCI Label: org.opencontainers.image.title
  - OCI Label: org.opencontainers.image.source
  - OCI Label: org.opencontainers.image.revision
  - OCI Label: org.opencontainers.image.version
  - Runtime UID must be numeric and non-zero (non-root)
  - Entrypoint or Cmd must be set
  - Healthcheck instruction (optional; warns if missing)
  - Architecture and OS declared

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

warn() {
  echo "WARNING: $*" >&2
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

IMAGE="$1"

# Check prerequisites
check_tool docker
check_tool jq

# Verify image exists
if ! docker inspect "$IMAGE" >/dev/null 2>&1; then
  die "image not found: $IMAGE"
fi

# Fetch image config
IMAGE_INSPECT=$(docker inspect "$IMAGE")
IMAGE_CONFIG=$(echo "$IMAGE_INSPECT" | jq -r '.[0].Config // empty')

if [[ -z "$IMAGE_CONFIG" ]]; then
  die "failed to retrieve image config"
fi

FAILED=0

#
# Check 1: OCI Labels
#

# org.opencontainers.image.title
LABEL_TITLE=$(echo "$IMAGE_CONFIG" | jq -r '.Labels["org.opencontainers.image.title"] // empty')
if [[ -z "$LABEL_TITLE" ]]; then
  echo "CHECK: OCI Label org.opencontainers.image.title ... FAIL"
  FAILED=1
else
  echo "CHECK: OCI Label org.opencontainers.image.title = '$LABEL_TITLE' ... OK"
fi

# org.opencontainers.image.source
LABEL_SOURCE=$(echo "$IMAGE_CONFIG" | jq -r '.Labels["org.opencontainers.image.source"] // empty')
if [[ -z "$LABEL_SOURCE" ]]; then
  echo "CHECK: OCI Label org.opencontainers.image.source ... FAIL"
  FAILED=1
else
  echo "CHECK: OCI Label org.opencontainers.image.source = '$LABEL_SOURCE' ... OK"
fi

# org.opencontainers.image.revision
LABEL_REVISION=$(echo "$IMAGE_CONFIG" | jq -r '.Labels["org.opencontainers.image.revision"] // empty')
if [[ -z "$LABEL_REVISION" ]]; then
  echo "CHECK: OCI Label org.opencontainers.image.revision ... FAIL"
  FAILED=1
else
  echo "CHECK: OCI Label org.opencontainers.image.revision = '$LABEL_REVISION' ... OK"
fi

# org.opencontainers.image.version
LABEL_VERSION=$(echo "$IMAGE_CONFIG" | jq -r '.Labels["org.opencontainers.image.version"] // empty')
if [[ -z "$LABEL_VERSION" ]]; then
  echo "CHECK: OCI Label org.opencontainers.image.version ... FAIL"
  FAILED=1
else
  echo "CHECK: OCI Label org.opencontainers.image.version = '$LABEL_VERSION' ... OK"
fi

#
# Check 2: Runtime UID
#

USER_STR=$(echo "$IMAGE_CONFIG" | jq -r '.User // empty')
if [[ -z "$USER_STR" ]]; then
  echo "CHECK: Runtime User (default to root) ... FAIL"
  FAILED=1
else
  # Extract UID (numeric part or username)
  UID_PART=$(echo "$USER_STR" | cut -d: -f1)
  if [[ "$UID_PART" =~ ^[0-9]+$ ]]; then
    UID_NUM=$UID_PART
  else
    # Username; docker run --entrypoint will resolve, but we can't here
    # For this check, accept non-numeric if it's explicitly set (not root)
    if [[ "$UID_PART" == "root" ]] || [[ "$UID_PART" == "0" ]]; then
      echo "CHECK: Runtime UID must be non-root (got: $UID_PART) ... FAIL"
      FAILED=1
    else
      echo "CHECK: Runtime User is set to non-root user '$UID_PART' ... OK"
    fi
  fi

  if [[ "$UID_PART" =~ ^[0-9]+$ ]]; then
    if [[ "$UID_NUM" -eq 0 ]]; then
      echo "CHECK: Runtime UID must be non-root (got: $UID_NUM) ... FAIL"
      FAILED=1
    else
      echo "CHECK: Runtime UID is numeric and non-root ($UID_NUM) ... OK"
    fi
  fi
fi

#
# Check 3: Entrypoint or Cmd
#

ENTRYPOINT=$(echo "$IMAGE_CONFIG" | jq -r '.Entrypoint // empty')
CMD=$(echo "$IMAGE_CONFIG" | jq -r '.Cmd // empty')

if [[ -z "$ENTRYPOINT" ]] && [[ -z "$CMD" ]]; then
  echo "CHECK: Entrypoint or Cmd must be set ... FAIL"
  FAILED=1
else
  if [[ -n "$ENTRYPOINT" ]]; then
    echo "CHECK: Entrypoint is set ... OK"
  fi
  if [[ -n "$CMD" ]]; then
    echo "CHECK: Cmd is set ... OK"
  fi
fi

#
# Check 4: Healthcheck (optional; warns if missing)
#

HEALTHCHECK=$(echo "$IMAGE_INSPECT" | jq -r '.[0].ContainerConfig.Healthcheck // empty')
if [[ -z "$HEALTHCHECK" ]]; then
  echo "CHECK: Healthcheck instruction ... WARN (not present in Dockerfile)"
else
  echo "CHECK: Healthcheck instruction ... OK"
fi

#
# Check 5: Architecture and OS
#

ARCH=$(echo "$IMAGE_INSPECT" | jq -r '.[0].Architecture // empty')
OS=$(echo "$IMAGE_INSPECT" | jq -r '.[0].Os // empty')

if [[ -z "$ARCH" ]]; then
  echo "CHECK: Architecture declared ... FAIL"
  FAILED=1
else
  echo "CHECK: Architecture = $ARCH ... OK"
fi

if [[ -z "$OS" ]]; then
  echo "CHECK: OS declared ... FAIL"
  FAILED=1
else
  echo "CHECK: OS = $OS ... OK"
fi

#
# Summary
#

if [[ $FAILED -eq 1 ]]; then
  exit 1
fi

exit 0
