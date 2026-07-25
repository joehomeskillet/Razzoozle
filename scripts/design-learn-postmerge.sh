#!/usr/bin/env bash
set -euo pipefail

# Guarded post-merge design learning recorder script (WP wp-77cb237a91e4 / Issue #302)
# Manually installable hook or runner script that records HEAD SHA on main.

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")

if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "design-learn-postmerge: skipping — current branch is '$CURRENT_BRANCH' (main required)."
  exit 0
fi

HEAD_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")

if [ -z "$HEAD_SHA" ]; then
  echo "design-learn-postmerge: unable to resolve HEAD SHA."
  exit 1
fi

SYNC_DIR=".design-sync"
mkdir -p "$SYNC_DIR"
RECEIPT_FILE="$SYNC_DIR/postmerge-learned.log"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date)
echo "$TIMESTAMP | branch=main | sha=$HEAD_SHA" >> "$RECEIPT_FILE"
echo "$HEAD_SHA" > "$SYNC_DIR/last-learned-sha"

echo "design-learn-postmerge: recorded SHA $HEAD_SHA to $RECEIPT_FILE"
