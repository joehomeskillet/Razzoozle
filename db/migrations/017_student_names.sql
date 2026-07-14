ALTER TABLE students ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS last_name TEXT;
UPDATE students SET
  first_name = split_part(display_name, ' ', 1),
  last_name  = NULLIF(btrim(substring(display_name from length(split_part(display_name,' ',1)) + 1)), '')
WHERE first_name IS NULL;
