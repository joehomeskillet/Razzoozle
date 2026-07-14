-- 013_catalog_valid_source.sql
-- Fix pre-existing schema drift: the Rust catalog handler
-- (rust/server/src/socket/manager/catalog.rs) writes/validates
-- source IN ('manual','submission','editor','ai'), but the original valid_source
-- CHECK (001_initial_schema.sql) only allowed ('upload','ai','submission') — so every
-- manual/editor catalog save was rejected at the DB layer. Widen the constraint to the
-- full allowlist (keep legacy 'upload'). Additive + idempotent via DROP IF EXISTS.
ALTER TABLE catalog_entries DROP CONSTRAINT IF EXISTS valid_source;
ALTER TABLE catalog_entries ADD CONSTRAINT valid_source
  CHECK (source IN ('manual', 'submission', 'editor', 'ai', 'upload'));
