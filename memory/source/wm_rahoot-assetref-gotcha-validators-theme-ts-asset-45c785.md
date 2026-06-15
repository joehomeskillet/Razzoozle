---
name: wm_rahoot-assetref-gotcha-validators-theme-ts-asset-45c785
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,theme,assetRef,validation,migration
created: 2026-06-14T18:31:24.956047+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot assetRef gotcha: validators/theme.ts assetRef regex must accept BOTH /theme/ and nested /media/ paths after the media restructure — was /^\/theme\/[\w.-]+$/, which rejected /media/backgrounds/sudhang.webp → themeValidator failed → SET_THEME, server getTheme, AND theme-template SAVE all silently broke (client fetchTheme is unvalidated so the UI still rendered, masking it). Fixed to /^\/(?:theme|media)\/(?:[\w.-]+\/)*[\w.-]+$/ (commit 58cc721). Lesson: when moving served assets to new path prefixes, update EVERY validator that gates those paths.
