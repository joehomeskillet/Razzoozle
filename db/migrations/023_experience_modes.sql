-- 023_experience_modes.sql
-- WP #878: Experience-mode allow-list on games_config.
--
-- Adds:
--   - experience_modes_enabled: CSV allow-list of experience presentation modes
--     (classic, pyramidclimb, deepseaescape, flowerbattle). Empty string = none
--     unlocked (default). Analogous to end_screen_modes.
--
-- Idempotent (IF NOT EXISTS) — safe to re-apply.
-- Prod does NOT auto-apply; use server embedded migrator or scripts/migrate-apply.sh.

ALTER TABLE games_config
  ADD COLUMN IF NOT EXISTS experience_modes_enabled VARCHAR(255) DEFAULT '';
