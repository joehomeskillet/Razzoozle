#!/bin/bash
set -ex

# Start PG
docker rm -f pg_test || true
docker run --name pg_test -e POSTGRES_PASSWORD=postgres -d -p 5433:5432 postgres:15
sleep 5

MIGRATIONS_DIR="/nvmetank1/projects/Razzoozle/source/.claude/worktrees/sv-n1/db/migrations"

# Run 1..16
for f in $(ls $MIGRATIONS_DIR/0*.sql | grep -v '017'); do
    echo "Running $f"
    docker exec -i pg_test psql -U postgres < "$f"
done

# Insert Anna Muster and SingleName
docker exec -i pg_test psql -U postgres <<EOF
INSERT INTO users (id, username, password_hash, role) VALUES (1, 'test', 'hash', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO classes (id, name, owner_id) VALUES (1, 'test class', 1) ON CONFLICT DO NOTHING;
INSERT INTO students (id, display_name, owner_id, class_id) VALUES (1, 'Anna Muster', 1, 1);
INSERT INTO students (id, display_name, owner_id, class_id) VALUES (2, 'SingleName', 1, 1);
EOF

# Run 17 twice
echo "Running 017 1st time"
docker exec -i pg_test psql -U postgres < "$MIGRATIONS_DIR/017_student_names.sql"
echo "Running 017 2nd time"
docker exec -i pg_test psql -U postgres < "$MIGRATIONS_DIR/017_student_names.sql"

# Check data
docker exec -i pg_test psql -U postgres -c "SELECT id, display_name, first_name, last_name FROM students ORDER BY id;"

# Cleanup
docker rm -f pg_test
