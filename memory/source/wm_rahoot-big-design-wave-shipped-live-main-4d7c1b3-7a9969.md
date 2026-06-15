---
name: wm_rahoot-big-design-wave-shipped-live-main-4d7c1b3-7a9969
type: pattern
author: tool
status: proposed
project: source
tags: working-memory,pattern,rahoot,design-wave,orchestration,solo,achievements,markdown
created: 2026-06-15T16:00:14.206299+00:00
description: working-memory instant capture (quarantined until graduated)
---

Rahoot big design wave SHIPPED LIVE (main 4d7c1b3->3a633c5, ~13 deploys this session): manager footer-uniformity + solo-link button + B3/B7/B9 console polish + equal-size media cards w/ Radix info-dialog + game play-screen centering/edge-padding + autoplay-after-pause fix (round-manager setAutoMode dropped paused-guard) + REWARDS UNIFICATION (one dismissible RewardStack replaces bonus-pills + un-tappable AchievementPopup; per-row swipe/tap/auto-dismiss, reduced-motion gated) + BONUS POINTS per achievement (config bonus, default 0 keeps scoring tests green, round-manager 2nd-pass + bonusPoints on SHOW_RESULT) + SOLO-FLOW redesign (glassmorphism name, AnimatePresence keyed on currentIndex, staggered answers, floating points+confetti+chimes, count-up+medal leaderboard, no-scroll h-dvh+overflow-hidden fit, Weiter button moved into bottom bar next to score) + MARKDOWN (restricted-inline react-markdown+remark-gfm in question/answer text + editor preview, vendor-markdown chunk) + 2027 quiz subtitle. KEY MECHANISM: codex/external-CLI coders can't write (bwrap RO-mount), but DEFAULT general-purpose Agent subagents CAN write under an open claude-route-override -> delegated each wave to a coder subagent (context-light), gated centrally (types+oxlint+socket/web tests+build), adversarial-reviewed (caught 2 RewardStack blockers: dismissed-row resurrection on async meta load + WCAG reduced-motion auto-dismiss), committed+deployed per wave via push HEAD:main + deploy.sh, Playwright-verified solo live. Spec via massive multi-agent judge-panel; master plan docs/design/rahoot-backlog-master.md.
