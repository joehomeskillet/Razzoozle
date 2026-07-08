#!/usr/bin/env bash
# backup-db.sh — snapshot the Razzoozle Postgres DB (pg_dump -Fc) + tar the live config mount.
# Run BEFORE any migration/seed. Output goes to $BACKUP_DIR (default ../backups, outside the repo).
set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/nvmetank1/projects/Razzoozle/backups}"
PG_CONTAINER="${PG_CONTAINER:-razzoozle_postgres}"
DB_NAME="${DB_NAME:-razzoozle}"
CONFIG_DIR="${CONFIG_DIR:-/nvmetank1/projects/Razzoozle/config}"

mkdir -p "$BACKUP_DIR"
DB_DUMP="$BACKUP_DIR/razzoozle-db-$TS.dump"
CFG_TAR="$BACKUP_DIR/razzoozle-config-$TS.tar.gz"

echo "[backup] pg_dump -Fc $PG_CONTAINER:$DB_NAME -> $DB_DUMP"
docker exec "$PG_CONTAINER" pg_dump -U razzoozle -Fc "$DB_NAME" > "$DB_DUMP"

echo "[backup] tar config $CONFIG_DIR -> $CFG_TAR"
tar -czf "$CFG_TAR" -C "$(dirname "$CONFIG_DIR")" "$(basename "$CONFIG_DIR")"

echo "[backup] done:"
echo "  DB:      $DB_DUMP ($(du -h "$DB_DUMP" | cut -f1))"
echo "  config:  $CFG_TAR ($(du -h "$CFG_TAR" | cut -f1))"
echo "  restore: scripts/restore-from-backup.sh $DB_DUMP $CFG_TAR"
