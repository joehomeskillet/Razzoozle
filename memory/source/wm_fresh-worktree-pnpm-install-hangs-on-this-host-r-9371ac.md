---
name: wm_fresh-worktree-pnpm-install-hangs-on-this-host-r-9371ac
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,worktree,pnpm,hang,orchestration,rahoot
created: 2026-06-14T11:39:09.183341+00:00
description: working-memory instant capture (quarantined until graduated)
---

Fresh-worktree pnpm install HANGS on this host (rahoot monorepo): codex coders sat 20-60min with zero edits stuck on 'pnpm install --frozen-lockfile' in a new worktree. Rule: for small or fully-disjoint WPs, skip the worktree — external-CLI coder (antigravity --dangerously-skip-permissions / codex --cd) edits directly in the warm shared source/ tree (node_modules present, gate in seconds; route-nudge hook only blocks the orchestrator's own Write, not external CLIs). Reserve worktrees for parallel WPs sharing files, and pre-seed their node_modules instead of fresh install. Always arm a git-status liveness watch to catch a stall in minutes.
