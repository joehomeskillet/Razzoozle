-- Student PIN = persistent 4-emoji password (stored as the emoji string, teacher-visible by design)
ALTER TABLE students ADD COLUMN IF NOT EXISTS pin TEXT;

-- Drop the 014 orphan-delete trigger: students are now first-class entities (own PIN, own history).
-- Removing the last class membership must NOT destroy the student anymore; deletion is explicit only.
DROP TRIGGER IF EXISTS orphan_cleanup_on_class_students_delete ON class_students;
DROP FUNCTION IF EXISTS orphan_cleanup_on_class_students_delete();

-- Session tokens for solo-assignment plays (consumed by the solo-score handler in a later WP)
CREATE TABLE IF NOT EXISTS solo_sessions (
  token TEXT PRIMARY KEY,
  assignment_id VARCHAR(100) NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_solo_sessions_assignment ON solo_sessions(assignment_id);
