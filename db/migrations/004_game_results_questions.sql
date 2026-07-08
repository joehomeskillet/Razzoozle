-- WP-N4: Add questions column to game_results for result-detail persistence
-- Additive, idempotent, twin-shared-DB safe.
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS questions JSONB;
