-- 003: theme_id on quizzes + recap on game_results (2026-07-07)
-- Adds theme association to quizzes and recap data to game results
ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS theme_id VARCHAR(100);
ALTER TABLE game_results ADD COLUMN IF NOT EXISTS recap JSONB;
