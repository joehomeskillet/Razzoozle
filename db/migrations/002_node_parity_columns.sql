-- 002: node-parity columns (2026-07-07)
-- Node's submission/achievement validators carry fields the initial (rust-authored)
-- schema lacks. Additive + idempotent — safe on live DB, rust ignores extra columns.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE achievements_config ADD COLUMN IF NOT EXISTS bonus INTEGER;
