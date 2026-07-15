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
--
-- Live-DB correction (adversarial review): the first draft of this migration
-- DROPPED every pre-existing plaintext row, which would have logged out
-- every currently-active session on first apply. Instead we forward-hash the
-- existing plaintext token in place (SHA-256, lowercase hex — byte-identical
-- to db/users.rs::hash_token's format!("{:02x}", b) output) so already
-- logged-in users keep their session.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now();

-- Forward-hash any pre-migration plaintext token into token_hash. Guarded by
-- an information_schema check on the `token` column: on the 2nd+ apply that
-- column is already dropped (see below), so this must be a no-op rather than
-- erroring with "column token does not exist".
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'token'
  ) THEN
    UPDATE sessions
    SET token_hash = encode(digest(token, 'sha256'), 'hex')
    WHERE token_hash IS NULL AND token IS NOT NULL;
  END IF;
END $$;

-- Safety net only: rows that still have no token_hash at this point had no
-- recoverable plaintext token either (never happens in practice — every row
-- either already has a token_hash or came from the pre-migration `token`
-- column handled above). No-op in the normal case.
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
