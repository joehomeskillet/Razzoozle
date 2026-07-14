-- 014_class_students_junction.sql
-- Migration to support many-to-many student-class relationships.
--
-- Creates:
--   - class_students: junction table for student-class memberships
--   - students_audit: audit log for student attribute changes
--   - orphan_cleanup_on_class_students_delete: trigger to remove students with no class memberships
--
-- Modifies:
--   - students.class_id: drops NOT NULL, retargets FK to ON DELETE SET NULL
--
-- Idempotent (IF NOT EXISTS, DROP IF EXISTS patterns) — safe to re-apply on boot.

-- Create junction table for many-to-many student-class relationships
CREATE TABLE IF NOT EXISTS class_students (
  id BIGSERIAL PRIMARY KEY,
  class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, student_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_class_students_class_id ON class_students(class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);

-- Backfill junction table from existing students with class_id
INSERT INTO class_students (class_id, student_id, joined_at)
SELECT class_id, id, created_at FROM students
WHERE class_id IS NOT NULL
ON CONFLICT (class_id, student_id) DO NOTHING;

-- Allow students to exist without a class_id (legacy compat window)
ALTER TABLE students ALTER COLUMN class_id DROP NOT NULL;

-- Retarget foreign key: if a class is deleted, SET the student's class_id to NULL instead of cascading delete
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_class_id_fkey;
ALTER TABLE students ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;

-- Create audit table for tracking student attribute changes
CREATE TABLE IF NOT EXISTS students_audit (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL,
  actor_id BIGINT,
  old_display_name TEXT,
  new_display_name TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orphan cleanup trigger: when a student loses their last class membership via junction deletion,
-- delete the student row entirely (garbage collection).
CREATE OR REPLACE FUNCTION orphan_cleanup_on_class_students_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete student if they have no remaining class_students rows
  DELETE FROM students
  WHERE id = OLD.student_id
    AND NOT EXISTS (
      SELECT 1 FROM class_students WHERE student_id = OLD.student_id
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orphan_cleanup_on_class_students_delete ON class_students;
CREATE TRIGGER orphan_cleanup_on_class_students_delete
AFTER DELETE ON class_students
FOR EACH ROW
EXECUTE FUNCTION orphan_cleanup_on_class_students_delete();
