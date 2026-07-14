-- 018_labels.sql — Fächer/Labels: global, admin-definiert, flach (kein owner_id, keine Hierarchie)

CREATE TABLE IF NOT EXISTS labels (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT 'gray',        -- Palette-Slug, siehe §5 / Offene Entscheide
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()   -- TIMESTAMPTZ → sqlx DateTime<Utc> (Memory socketioxide/sqlx)
);

CREATE TABLE IF NOT EXISTS quiz_labels (
  id       BIGSERIAL PRIMARY KEY,
  quiz_id  safe_id NOT NULL REFERENCES quizzes(id)  ON DELETE CASCADE,
  label_id BIGINT  NOT NULL REFERENCES labels(id)   ON DELETE CASCADE,
  UNIQUE (quiz_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_labels_quiz_id  ON quiz_labels(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_labels_label_id ON quiz_labels(label_id);

CREATE TABLE IF NOT EXISTS media_labels (
  id       BIGSERIAL PRIMARY KEY,
  media_id safe_id NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  label_id BIGINT  NOT NULL REFERENCES labels(id)       ON DELETE CASCADE,
  UNIQUE (media_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_media_labels_media_id ON media_labels(media_id);
CREATE INDEX IF NOT EXISTS idx_media_labels_label_id ON media_labels(label_id);

CREATE TABLE IF NOT EXISTS catalog_labels (
  id         BIGSERIAL PRIMARY KEY,
  catalog_id safe_id NOT NULL REFERENCES catalog_entries(id) ON DELETE CASCADE,
  label_id   BIGINT  NOT NULL REFERENCES labels(id)          ON DELETE CASCADE,
  UNIQUE (catalog_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_catalog_labels_catalog_id ON catalog_labels(catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_labels_label_id   ON catalog_labels(label_id);
