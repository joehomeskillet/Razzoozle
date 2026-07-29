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
  - Healthcheck instruction (required)
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
# Check 2: Runtime UID (numeric and non-root)
#

USER_STR=$(echo "$IMAGE_CONFIG" | jq -r '.User // empty')
UID_NUM=""

if [[ -z "$USER_STR" ]]; then
  echo "CHECK: Runtime UID must be numeric and non-root (no User set, defaulting to root) ... FAIL"
  FAILED=1
else
  # Extract UID (numeric part or username)
  UID_PART=$(echo "$USER_STR" | cut -d: -f1)
  
  if [[ "$UID_PART" =~ ^[0-9]+$ ]]; then
    # Already numeric
    UID_NUM=$UID_PART
  else
    # Username — need to extract actual UID from running container
    # Run container with 'id' entrypoint to get real UID
    ID_OUTPUT=$(docker run --rm --entrypoint id "$IMAGE" 2>/dev/null || echo "")
    if [[ -n "$ID_OUTPUT" ]]; then
      # Output: uid=10001(appuser) gid=999(appuser) groups=999(appuser)
      UID_NUM=$(echo "$ID_OUTPUT" | grep -oP 'uid=\K[0-9]+' || echo "")
    fi
  fi
  
  # Validate numeric UID
  if [[ -z "$UID_NUM" ]]; then
    echo "CHECK: Runtime UID must be numeric and non-root (unable to determine UID for user '$UID_PART') ... FAIL"
    FAILED=1
  elif [[ "$UID_NUM" -eq 0 ]]; then
    echo "CHECK: Runtime UID must be numeric and non-root (got: $UID_NUM, root) ... FAIL"
    FAILED=1
  else
    echo "CHECK: Runtime UID is numeric and non-root ($UID_NUM) ... OK"
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
# Check 4: Healthcheck (REQUIRED, not optional)
#

HEALTHCHECK=$(echo "$IMAGE_INSPECT" | jq -r '.[0].ContainerConfig.Healthcheck // empty')
if [[ -z "$HEALTHCHECK" ]]; then
  echo "CHECK: Healthcheck instruction ... FAIL"
  FAILED=1
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
