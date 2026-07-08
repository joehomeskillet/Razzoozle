#!/usr/bin/env bash
# restore-from-backup.sh — restore the Razzoozle Postgres DB (pg_restore --clean --if-exists)
# and optionally the config mount, from a backup made by backup-db.sh.
# Usage: scripts/restore-from-backup.sh <db.dump> [config.tar.gz]
set -euo pipefail

DB_DUMP="${1:?usage: restore-from-backup.sh <db.dump> [config.tar.gz]}"
CFG_TAR="${2:-}"
PG_CONTAINER="${PG_CONTAINER:-razzoozle_postgres}"
DB_NAME="${DB_NAME:-razzoozle}"
CONFIG_PARENT="${CONFIG_PARENT:-/nvmetank1/projects/Razzoozle}"

[ -f "$DB_DUMP" ] || { echo "[restore] dump not found: $DB_DUMP" >&2; exit 1; }

echo "[restore] pg_restore --clean --if-exists -d $DB_NAME <- $DB_DUMP"
docker exec -i "$PG_CONTAINER" pg_restore --clean --if-exists -U razzoozle -d "$DB_NAME" < "$DB_DUMP"

if [ -n "$CFG_TAR" ]; then
  [ -f "$CFG_TAR" ] || { echo "[restore] config tar not found: $CFG_TAR" >&2; exit 1; }
  echo "[restore] untar $CFG_TAR -> $CONFIG_PARENT"
  tar -xzf "$CFG_TAR" -C "$CONFIG_PARENT"
fi

echo "[restore] done."
