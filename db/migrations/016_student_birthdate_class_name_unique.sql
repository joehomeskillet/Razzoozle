ALTER TABLE students ADD COLUMN IF NOT EXISTS birthdate DATE;

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY id) as row_num
    FROM classes c
    WHERE (c.owner_id, c.name) IN (
      SELECT owner_id, name FROM classes GROUP BY owner_id, name HAVING COUNT(*) > 1
    )
  LOOP
    UPDATE classes SET name = name || ' (' || r.row_num || ')' WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_owner_name ON classes(owner_id, name);
