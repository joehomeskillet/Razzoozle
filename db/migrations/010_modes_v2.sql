-- 010_modes_v2.sql
-- W1-M1: Modus-System v2 level-1 availability
--
-- Adds:
--   - klassen_enabled: boolean flag to enable Klassen-Modus availability
--   - end_screen_modes: CSV allow-list of end-screen display options (full, top3, private)
--   - Fix scoring_mode default: 'points' → 'speed'
--
-- Idempotent (IF NOT EXISTS) — safe to re-apply on boot.

-- ============================================================================
-- Add klassen_enabled column (tracks if Klassen-Modus is available)
-- ============================================================================

ALTER TABLE games_config ADD COLUMN IF NOT EXISTS klassen_enabled BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- Add end_screen_modes column (CSV of available end-screen display modes)
-- ============================================================================

ALTER TABLE games_config ADD COLUMN IF NOT EXISTS end_screen_modes VARCHAR(255) DEFAULT 'full,top3,private';

-- ============================================================================
-- Fix scoring_mode default from 'points' to 'speed'
-- ============================================================================
-- Note: This changes the DEFAULT for new rows. Existing rows keep their current value.
-- The schema vs code mismatch documented in SPEC 0b — 'points' → 'speed'.

ALTER TABLE games_config ALTER COLUMN scoring_mode SET DEFAULT 'speed';
