-- 009_user_ai_keys.sql
-- W0-userai: Per-user external AI provider credentials with pgcrypto encryption at rest.
--
-- Adds:
--   - user_ai_keys table: user_id + provider_id (composite PK) → key_encrypted (pgp_sym_encrypt)
--   - NEVER store plaintext keys — pgcrypto with passphrase from AI_KEY_ENCRYPTION_KEY env var
--   - Encrypted keys are BYTEA, decryption via pgp_sym_decrypt + same passphrase
--   - Index on (user_id) for lookups per user
--   - Cleanup: ON DELETE CASCADE when user deleted
--
-- Idempotent (IF NOT EXISTS) — safe to re-apply on boot.

-- ============================================================================
-- Enable pgcrypto extension (required for key encryption)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- Create user_ai_keys table (composite PK: user_id + provider_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_ai_keys (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  key_encrypted BYTEA NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_id)
);

-- ============================================================================
-- Create index on user_id for efficient lookups (e.g., list user's keys)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_ai_keys_user_id ON user_ai_keys(user_id);
