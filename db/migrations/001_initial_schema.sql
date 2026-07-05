-- Razzoozle Shared Postgres Schema (Phase 0)
-- Initial schema for dual-write integration between Node and Rust backends
-- Created: 2026-07-06

-- ============================================================================
-- DOMAINS & CUSTOM TYPES
-- ============================================================================

-- safe_id: Alphanumeric, underscore, hyphen only (for quizzes, themes, etc.)
CREATE DOMAIN safe_id AS VARCHAR(100)
  CHECK (VALUE ~ '^[A-Za-z0-9_-]+$');

-- ============================================================================
-- TABLES
-- ============================================================================

-- games_config: Central game configuration (single row)
CREATE TABLE games_config (
  id INT PRIMARY KEY DEFAULT 1,
  manager_password VARCHAR(255),
  team_mode BOOLEAN DEFAULT FALSE,
  join_locked BOOLEAN DEFAULT FALSE,
  randomize_answers BOOLEAN DEFAULT FALSE,
  scoring_mode VARCHAR(20) DEFAULT 'points',
  low_latency_enabled BOOLEAN DEFAULT FALSE,
  low_latency_config JSONB DEFAULT NULL,
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT single_row_enforcer CHECK (id = 1)
);

CREATE INDEX idx_games_config_updated_at ON games_config(updated_at DESC);


-- quizzes: Quiz catalog (replaces config/quizz/*.json)
CREATE TABLE quizzes (
  id safe_id PRIMARY KEY,
  subject VARCHAR(255),
  questions JSONB NOT NULL DEFAULT '[]',
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP WITH TIME ZONE,
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quizzes_archived ON quizzes(archived);
CREATE INDEX idx_quizzes_created_at_desc ON quizzes(created_at DESC);


-- game_results: Multiplayer game results (replaces config/results/*.json)
CREATE TABLE game_results (
  id safe_id PRIMARY KEY,
  quiz_id safe_id REFERENCES quizzes(id) ON DELETE SET NULL,
  subject VARCHAR(255),
  date TIMESTAMP WITH TIME ZONE,
  players JSONB NOT NULL DEFAULT '[]',
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_game_results_quiz_id_created_at ON game_results(quiz_id, created_at DESC);
CREATE INDEX idx_game_results_date_desc ON game_results(date DESC);


-- submissions: Question submissions for approval (replaces config/submissions/*.json)
CREATE TABLE submissions (
  id safe_id PRIMARY KEY,
  quiz_id safe_id REFERENCES quizzes(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending',
  submitted_by VARCHAR(100),
  submitted_at TIMESTAMP WITH TIME ZONE,
  question JSONB NOT NULL DEFAULT '{}',
  source VARCHAR(50),
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_submissions_status_submitted_at ON submissions(status, submitted_at DESC);


-- solo_results: Solo play results (replaces config/solo-results/*.json)
CREATE TABLE solo_results (
  id safe_id PRIMARY KEY,
  quiz_id safe_id NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  player_name VARCHAR(100),
  score INT,
  answered_at TIMESTAMP WITH TIME ZONE,
  answers JSONB NOT NULL DEFAULT '{}',
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_solo_results_quiz_id_score_desc ON solo_results(quiz_id, score DESC);


-- themes: Theme templates and active theme (replaces config/theme-templates/*.json and config/theme/theme.json)
CREATE TABLE themes (
  id safe_id PRIMARY KEY,
  name VARCHAR(255),
  theme JSONB NOT NULL DEFAULT '{}',
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_themes_created_at_desc ON themes(created_at DESC);


-- theme_revisions: History of theme edits
CREATE TABLE theme_revisions (
  id SERIAL PRIMARY KEY,
  theme_id safe_id NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
  theme_snapshot JSONB NOT NULL,
  revision_number INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_theme_revisions_theme_id_revision_number ON theme_revisions(theme_id, revision_number DESC);


-- achievements_config: Achievement badges and thresholds (replaces config/achievements.json)
CREATE TABLE achievements_config (
  id safe_id PRIMARY KEY,
  enabled BOOLEAN DEFAULT TRUE,
  name VARCHAR(100),
  description TEXT,
  threshold INT,
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_achievements_config_enabled ON achievements_config(enabled);


-- catalog_entries: Question catalog for AI/submission sourcing (replaces config/catalog/*.json)
CREATE TABLE catalog_entries (
  id safe_id PRIMARY KEY,
  question JSONB NOT NULL DEFAULT '{}',
  tags JSONB NOT NULL DEFAULT '[]',
  source VARCHAR(50),
  added_at TIMESTAMP WITH TIME ZONE,
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_source CHECK (source IN ('upload', 'ai', 'submission'))
);

CREATE INDEX idx_catalog_entries_source_added_at ON catalog_entries(source, added_at DESC);


-- media_assets: Metadata for /media/ files (files stay on disk)
CREATE TABLE media_assets (
  id safe_id PRIMARY KEY,
  filename VARCHAR(255),
  url VARCHAR(500),
  size INT,
  type VARCHAR(20),
  category VARCHAR(50),
  source VARCHAR(50),
  width INT,
  height INT,
  uploaded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT valid_media_type CHECK (type IN ('image', 'audio', 'video')),
  CONSTRAINT valid_media_source CHECK (source IN ('upload', 'ai', 'theme'))
);

CREATE INDEX idx_media_assets_category_source_uploaded_at ON media_assets(category, source, uploaded_at DESC);


-- installed_plugins: Plugin manifest and config (replaces config/plugins/index.json)
CREATE TABLE installed_plugins (
  id safe_id PRIMARY KEY,
  name VARCHAR(255),
  version VARCHAR(50),
  enabled BOOLEAN DEFAULT TRUE,
  capabilities JSONB NOT NULL DEFAULT '[]',
  config JSONB NOT NULL DEFAULT '{}',
  plugin_version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_installed_plugins_enabled ON installed_plugins(enabled);


-- assignments: Quiz assignments (replaces config/assignments/*.json)
CREATE TABLE assignments (
  id safe_id PRIMARY KEY,
  quiz_id safe_id NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  assigned_to VARCHAR(100),
  assigned_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}',
  version INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assignments_quiz_id_assigned_to ON assignments(quiz_id, assigned_to);
CREATE INDEX idx_assignments_assigned_at_desc ON assignments(assigned_at DESC);


-- ============================================================================
-- SEED DATA (single games_config row)
-- ============================================================================

INSERT INTO games_config (
  id,
  manager_password,
  team_mode,
  join_locked,
  randomize_answers,
  scoring_mode,
  low_latency_enabled,
  low_latency_config,
  version,
  created_at,
  updated_at
) VALUES (
  1,
  'PASSWORD',
  FALSE,
  FALSE,
  FALSE,
  'points',
  FALSE,
  NULL,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;
