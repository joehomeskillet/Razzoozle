-- 022_students_active.sql
-- WP-F1: Persist student active/inactive status for manager bulk management.
--
-- Deactivated students remain in the DB (class memberships, results preserved)
-- but are rejected from login and game join flows server-side.
-- Default TRUE so every existing student stays usable after migration.
--
-- Idempotent: scripts/migrate-apply.sh re-applies every file on deploy.
-- No index — status filter is client-side only (SDD §9.2 / §10.2).

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
