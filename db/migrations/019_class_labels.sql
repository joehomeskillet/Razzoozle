-- 019_class_labels.sql — Fächer-Labels an Klassen (Junction; classes.id ist BIGSERIAL → BIGINT, NICHT safe_id)

CREATE TABLE IF NOT EXISTS class_labels (
  id       BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  label_id BIGINT NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  UNIQUE (class_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_class_labels_class_id ON class_labels(class_id);
CREATE INDEX IF NOT EXISTS idx_class_labels_label_id ON class_labels(label_id);
