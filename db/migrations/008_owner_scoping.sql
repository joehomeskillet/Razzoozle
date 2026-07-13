-- 008_owner_scoping.sql
-- W0-A4: Data owner-scoping + admin-global catalog/media + per-user submit token
--
-- Adds:
--   - owner_id to quizzes, game_results, solo_results, assignments, submissions,
--     catalog_entries, media_assets, themes (backfill to admin user id=1)
--   - is_global flag to catalog_entries and media_assets (admin explicitly opts in to release)
--   - submit_token to users (opaque URL-safe token for public submit link)
--
-- Idempotent (IF NOT EXISTS) — safe to re-apply on boot; legacy rows stay NULL
-- until backfill, then default to owner_id=1 (admin).

-- ============================================================================
-- Add owner_id columns
-- ============================================================================

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE solo_results ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE catalog_entries ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE themes ADD COLUMN IF NOT EXISTS owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- Add is_global flag (catalog + media only)
-- ============================================================================

ALTER TABLE catalog_entries ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- Add submit_token to users (per-user opaque token for public submit link)
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS submit_token TEXT;

-- ============================================================================
-- Backfill owner_id = 1 (admin bootstrap user) for legacy rows
-- ============================================================================
-- Idempotent: UPDATE ... WHERE ... IS NULL so re-runs are safe.
--
-- ORDERING: the bootstrap admin (id=1) is created by the Rust server at BOOT,
-- not by this migration, so on a fresh `users` table id=1 does not yet exist and
-- an unconditional backfill would violate the owner_id FK. Guard on user 1's
-- existence: fresh DB -> skip (legacy rows stay owner_id NULL = admin-visible via
-- the `$me IS NULL` unfiltered read); once the admin exists a re-apply reconciles
-- the still-NULL legacy rows to owner_id=1.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id = 1) THEN
    UPDATE quizzes         SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE game_results    SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE solo_results    SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE assignments     SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE submissions     SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE catalog_entries SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE media_assets    SET owner_id = 1 WHERE owner_id IS NULL;
    UPDATE themes          SET owner_id = 1 WHERE owner_id IS NULL;
  END IF;
END $$;

-- ============================================================================
-- Backfill submit_token for existing users
-- ============================================================================
-- CSPRNG token via pgcrypto gen_random_bytes (required — no weak md5 fallback).
-- pgcrypto is ensured idempotently; a missing/permission-denied extension fails
-- the migration loudly rather than silently minting guessable capability tokens.
-- (New tokens are minted in Rust with a CSPRNG; this backfill covers pre-existing rows.)
-- Idempotent: UPDATE ... WHERE ... IS NULL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE users SET submit_token = encode(gen_random_bytes(16),'hex')
  WHERE submit_token IS NULL;

-- ============================================================================
-- Create unique index on submit_token
-- ============================================================================
-- Ensures the token can be used as a lookup key and prevents duplicates.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_submit_token ON users(submit_token);

-- ============================================================================
-- Create indexes on owner_id for query performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_quizzes_owner_id ON quizzes(owner_id);
CREATE INDEX IF NOT EXISTS idx_game_results_owner_id ON game_results(owner_id);
CREATE INDEX IF NOT EXISTS idx_solo_results_owner_id ON solo_results(owner_id);
CREATE INDEX IF NOT EXISTS idx_assignments_owner_id ON assignments(owner_id);
CREATE INDEX IF NOT EXISTS idx_submissions_owner_id ON submissions(owner_id);
CREATE INDEX IF NOT EXISTS idx_catalog_entries_owner_id ON catalog_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_id ON media_assets(owner_id);
CREATE INDEX IF NOT EXISTS idx_themes_owner_id ON themes(owner_id);

-- ============================================================================
-- Create composite indexes for global reads (catalog + media)
-- ============================================================================
-- Optimizes: WHERE owner_id = $1 OR is_global = true

CREATE INDEX IF NOT EXISTS idx_catalog_entries_owner_or_global ON catalog_entries(owner_id, is_global);
CREATE INDEX IF NOT EXISTS idx_media_assets_owner_or_global ON media_assets(owner_id, is_global);
