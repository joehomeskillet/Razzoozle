# Decisions — source

<!-- entries below, newest first -->

---
id: design-issue10-config-ux-polish
date: 2026-06-14
project: source
status: accepted
tags: [rahoot, ui, issue-10]
---

# design:issue10-config-ux-polish

**Decision:** design:issue10-config-ux-polish

**Rationale:** Manager /config polish (issue #10): single scroll owner (ConsoleShell tabpanel), sticky-bottom save-bar (no shell footer prop), real AssetPreview thumbnails from existing /media paths (no backend change), themed .console-scroll utility, extract SectionCard/SubGroup/ColorSwatch + new AssetPreview into console barrel. Implement via external-CLI coders in warm source/ tree partitioned by disjoint files; orchestrator gates centrally (fresh-worktree pnpm install hangs on this host).

**Consequences:** (fill in)

