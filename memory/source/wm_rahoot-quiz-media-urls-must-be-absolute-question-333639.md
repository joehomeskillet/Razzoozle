---
name: wm_rahoot-quiz-media-urls-must-be-absolute-question-333639
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,migration,zod,url,validation
created: 2026-06-14T15:47:01.338933+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot quiz media URLs MUST be ABSOLUTE (questionMediaValidator.url uses zod z.url() which rejects relative paths). The media-migration script rewrote quiz media.url to RELATIVE /media/questions/... → those quizzes FAILED validation and vanished from the manager list (getQuizz skips invalid). Recovery: rewrite to absolute https://rahoot.joelduss.xyz/media/... (validates + points to migrated files). LATENT BUG: scripts/migrate-media.mjs still emits relative URLs (questionRef) — fix it to keep the absolute domain (rewrite only the /theme/<f> path segment → /media/<cat>/<f>, preserving the https://host prefix) before any future re-run, OR loosen questionMediaValidator to accept site-relative /media paths. Backups: config.bak-* per run.
