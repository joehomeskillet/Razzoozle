-- 024_flower_battle_config.sql
-- WP #960: FlowerBattle game mode configuration fields on games_config.
--
-- Adds:
--   - flower_battle_target_level: growth level threshold to win a round (default 10)
--   - flower_battle_powerups_enabled: enable/disable power-up system (default true)
--   - flower_battle_acid_rain_enabled: enable/disable acid-rain hazard (default true)
--   - flower_battle_powerup_threshold: sun-points threshold triggering power-up offer (default 3)
--
-- Idempotent (IF NOT EXISTS) — safe to re-apply.
-- Prod does NOT auto-apply; use server embedded migrator or scripts/migrate-apply.sh.

ALTER TABLE games_config
  ADD COLUMN IF NOT EXISTS flower_battle_target_level INT DEFAULT 10 NOT NULL,
  ADD COLUMN IF NOT EXISTS flower_battle_powerups_enabled BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS flower_battle_acid_rain_enabled BOOLEAN DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS flower_battle_powerup_threshold INT DEFAULT 3 NOT NULL;
