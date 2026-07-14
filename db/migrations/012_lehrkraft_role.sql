-- 012_lehrkraft_role.sql
-- WP-USR: Add lehrkraft role for class-mode teachers
-- Additive: extends the users.role CHECK constraint to include 'lehrkraft' alongside 'admin' and 'user'.

-- Drop the old inline CHECK constraint by name (PostgreSQL auto-names it as users_role_check).
-- Then recreate with the new role list.
ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_role_check";

-- Re-add the constraint with the expanded role list.
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'lehrkraft'));
