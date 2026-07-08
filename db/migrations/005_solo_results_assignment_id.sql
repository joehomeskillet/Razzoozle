-- E2: solo-results DB port — link a solo result to an assignment (assignment-results filter).
-- Additive, idempotent, twin-shared-DB safe.
ALTER TABLE solo_results ADD COLUMN IF NOT EXISTS assignment_id text;
CREATE INDEX IF NOT EXISTS idx_solo_results_assignment_id ON solo_results (assignment_id);
