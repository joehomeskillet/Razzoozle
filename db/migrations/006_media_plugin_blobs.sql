-- 006_media_plugin_blobs.sql
-- Last Alles-in-DB wave (E4 media #8 + E5 plugins #9): make Postgres the COMPLETE
-- source of truth so pg_dump captures media bytes + plugin files that today live only
-- on the host ./config volume (outside DB backups).
--
--   media_assets.data      bytea  -- the raw uploaded bytes (image/audio/video)
--   installed_plugins.files jsonb -- { "<relpath>": "<base64>" } map of the plugin dir
--
-- Disk (host ./config volume) stays the DERIVED cache: nginx-serve for /media/, and
-- runtime-require / asset-serve for plugins. Dual-write on upload/change (PG + disk);
-- boot-hydrate PG->disk reconstructs the cache on a fresh env / DB-restore.
-- See .claude/state/E4E5_contract.md. Idempotent (IF NOT EXISTS) — safe to re-apply.

ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS data bytea;
ALTER TABLE installed_plugins ADD COLUMN IF NOT EXISTS files jsonb;
