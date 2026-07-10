#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s [--dry-run]\n' "${0##*/}" >&2
}

dry_run=false
case "$#" in
  0) ;;
  1)
    if [[ "$1" == "--dry-run" ]]; then
      dry_run=true
    else
      printf 'Error: unknown argument: %s\n' "$1" >&2
      usage
      exit 2
    fi
    ;;
  *)
    printf 'Error: expected no arguments or --dry-run\n' >&2
    usage
    exit 2
    ;;
esac

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf 'Error: DATABASE_URL is required\n' >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
migrations_dir="$script_dir/../db/migrations"

if [[ ! -d "$migrations_dir" ]]; then
  printf 'Error: migrations directory not found: %s\n' "$migrations_dir" >&2
  exit 1
fi

migrations=()
migration_numbers=()
for migration in "$migrations_dir"/*.sql; do
  [[ -e "$migration" ]] || continue
  filename="${migration##*/}"
  number_text="${filename%%[^0-9]*}"
  if [[ -z "$number_text" ]]; then
    printf 'Error: migration filename must start with a number: %s\n' "$filename" >&2
    exit 1
  fi
  number=$((10#$number_text))
  insert_at="${#migrations[@]}"
  while ((insert_at > 0 && number < migration_numbers[insert_at - 1])); do
    migrations[insert_at]="${migrations[insert_at - 1]}"
    migration_numbers[insert_at]="${migration_numbers[insert_at - 1]}"
    insert_at=$((insert_at - 1))
  done
  migrations[insert_at]="$migration"
  migration_numbers[insert_at]="$number"
done

if ((${#migrations[@]} == 0)); then
  printf 'Error: no SQL migrations found in: %s\n' "$migrations_dir" >&2
  exit 1
fi

if [[ "$dry_run" == true ]]; then
  printf '[migrate] dry run: previewing %d migration(s)\n' "${#migrations[@]}"
  for migration in "${migrations[@]}"; do
    printf '[migrate] would apply %s\n' "${migration##*/}"
  done
  printf '[migrate] dry run complete: no migrations were applied\n'
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  printf 'Error: psql is required to apply migrations\n' >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  printf '[migrate] applying %s\n' "${migration##*/}"
  psql --set=ON_ERROR_STOP=1 --dbname="$DATABASE_URL" --file="$migration"
done
printf '[migrate] applied %d migration(s)\n' "${#migrations[@]}"
