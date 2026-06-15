---
name: wm_rahoot-media-migration-script-scripts-migrate-me-1aca6b
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,migration,media,dry-run
created: 2026-06-14T15:07:35.525629+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot media-migration script (scripts/migrate-media.mjs) has a BUG found via --dry: it moves q01-q12.webp→media/questions + firstcorrect.mp3→media/audio and rewrites theme.json + quiz JSONs, but does NOT move sudhang.webp/playerbg.webp (backgrounds) or wu1-3.webp (warmup images) — so rewriting their refs would dangle → broken backgrounds + warmup images. DO NOT RUN until fixed (move ALL referenced media incl. backgrounds+wu, OR only-rewrite-moved-files). Not urgent: the deployed socket code is back-compat (nginx /theme/ alias kept + assetRef accepts /theme/ AND /media/), so old media still serves from /theme/ and the app works without the migration.
