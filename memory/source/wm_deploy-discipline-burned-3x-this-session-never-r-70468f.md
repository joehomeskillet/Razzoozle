---
name: wm_deploy-discipline-burned-3x-this-session-never-r-70468f
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,deploy,git-reset,discipline,rahoot
created: 2026-06-14T18:31:25.289634+00:00
description: working-memory instant capture (quarantined until graduated)
---

DEPLOY DISCIPLINE (burned 3x this session): NEVER run the deploy (auto-deploy-poll → deploy.sh git reset --hard origin/main) with ANY uncommitted tracked changes — reset --hard WIPES them. Twice it wiped #28; once the es/fr/it translations. ALWAYS: git add the FULL intended set, commit, then a BLOCKING 'test -z ""' check — only deploy if clean. Do NOT chain deploy after a non-blocking clean-check in an && pipeline (the chain proceeds anyway). config/ is gitignored so runtime data is safe, but packages/ work is not.
