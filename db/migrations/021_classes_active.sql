-- 021_classes_active.sql
-- WP-E1: Persist class active/inactive status for manager bulk management.
--
-- Deactivated classes remain in the DB (students, labels, results preserved)
-- but are rejected from active game-start / assignment flows server-side.
-- Default TRUE so every existing class stays usable after migration.
--
-- Idempotent: scripts/migrate-apply.sh re-applies every file on deploy.
-- No index — status filter is client-side only (SDD §8 / §10.2).

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
