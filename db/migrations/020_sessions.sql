-- 020_sessions.sql
-- X2a: server-side multi-token sessions.
--
-- Discovery: the `sessions` table (007_users_sessions.sql) already allowed
-- multiple concurrent tokens per user — `token` is the primary key (not
-- `user_id`), and mint_session() only ever INSERTs a new row; nothing
-- deletes a user's prior sessions on login or anywhere else. The real gap
-- was security debt, not a single-session lock-out: the bearer token was
-- stored in the `sessions.token` column in PLAINTEXT.
--
-- This migration upgrades the existing table in place to store only a
-- SHA-256 hash of the token, replaces the token-as-primary-key with a
-- surrogate id, and adds last_seen (set at login only — never updated on
-- the request hot path, see db/users.rs). expires_at (7-day TTL) is kept
-- unchanged from 007.
--
-- Idempotent: scripts/migrate-apply.sh has no migration-version tracking,
-- so this file is re-applied on every deploy. Every statement below is safe
-- to run repeatedly against an already-migrated table.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now();

-- Pre-migration rows carry a plaintext token in the old `token` column and
-- no token_hash — they cannot be migrated forward (no hash was ever
-- persisted for them). Drop them; they are transient 7-day-TTL rows, and
-- affected users simply log in again. No-op once every row has a
-- token_hash (i.e. on every deploy after the first).
DELETE FROM sessions WHERE token_hash IS NULL;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
ALTER TABLE sessions DROP COLUMN IF EXISTS token;
ALTER TABLE sessions ALTER COLUMN token_hash SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
