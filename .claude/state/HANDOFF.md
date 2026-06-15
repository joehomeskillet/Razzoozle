---
project: rahoot
written: 2026-06-15
reason: Long multi-feature session (config V2 → /submit redesign → KI-auth fix → Wave 1 → Welle 2). Clean milestone; remaining work is agent-ready in Gitea issues. Handoff for a fresh session (context budget).
---

# Handoff — rahoot — 2026-06-15

## ⚠ Resume basics (read first)
- **Warm `source/` tree, NOT fresh worktrees** — fresh-worktree `pnpm install` HANGS on this host. Parallel coders write disjoint files in `source/`; orchestrator gates centrally. (Full lesson: top of `TASK.md` + `[[feedback_worktree_agent_flood_default]]`.)
- **CD timer (`rahoot-deploy.timer`) is ACTIVE.** During any multi-WP wave with uncommitted changes: `sudo systemctl stop rahoot-deploy.timer` first (deploy.sh does `git reset --hard origin/main` → would wipe uncommitted work), then re-`start` after the clean deploy.
- **Route hard-block:** the orchestrator's own Write/Edit on `packages/*` product code is blocked. Open a window for a sanctioned wave: `claude-route-override "<reason>" --ttl 3600` (auto-expires; `--clear`). Delegated workflow agents' Write/Edit also need it open. `.md`/`.claude/`/`memory/` are exempt.
- **Manager password:** `VKfinuGRLVrIlvS6LiJ4` (in `config/game.json` as `managerPassword`).
- **Deploy:** `cd /nvmetank1/projects/rahoot && bash source/scripts/deploy.sh` (resets to origin/main → builds `rahoot:custom` → smoke-tests socket bundle → health-gates → auto-rollback). So **commit + push first**.
- **Gate (central, after a flood):** `corepack pnpm -r run types` · `corepack pnpm --filter @razzoozle/web run build` · `corepack pnpm --filter @razzoozle/socket run test`. (oxlint is NOT an enforced gate — 800+ pre-existing violations.)
- **Repo:** `git.joelduss.xyz/agent-claude/rahoot` (MCP issue-creation works directly there). Live: `https://rahoot.joelduss.xyz`.

## State (git)
- `source/` HEAD = `df4a4c3` (= origin/main, pushed, **deployed live**), container `razzia` healthy.
- Web vitest runner now exists (`packages/web/vitest.config.ts`, was 0 web tests). socket vitest = 261 tests.

## Shipped this session (all live)
Config V2 cockpit + full-viewport editor-aligned console frame (no tab-jump, uniform margins) · `/submit` redesign (purple frame + multicolor popping "?" + wider + two-column no-gap/no-jump + hidden scrollbar) · **KI-tab-empty-after-deploy fix** (manager re-auth on reconnect + AI-settings push on auth — `config.tsx` + `handlers/manager.ts`) · `/submit` validator fixes (lenient solutions/acceptedAnswers → friendly per-type msg; media URL accepts relative `/media`) · **Backlog #12 Wave 1+2** (12 WPs) · **#22** WP-1/2 (submit focus-a11y + `<html lang>`) · **#19** WP-A/B (animated nerd-humor error pages, 404 verified) · **#21 Security** (durable-clientId rate-limit, queue/GPU caps) — CLOSED.

## Backlog (agent-ready Gitea issues — pick up here)
| # | Status | Next |
|---|---|---|
| **#23** | open, **unblocked** | `/submit` Media: bessere KI-Prompts (Z-Image prompt-enhance) + **Upload** + **img2img** (Foto per Text ändern). Biggest user-requested feature. Backend (comfyui.ts + handlers/manager.ts + common events/validators) — needs the #21 hardening (done). Ref: jolly.joelduss.xyz/p/agent-fleet-zimage-demo. |
| **#12** | Wave 1+2 done | **Wave 4 backend** (WP-6 media-dims, WP-10 AI temp/resolution, WP-15 satellite live-status heartbeat, WP-17 submission reject-reason/category, WP-18 theme versioning; WP-13 answer-images optional/deferred) — coordinate on `common/constants.ts`+validators (serial or careful file split). Plus WP-19 (DE lang cleanup), WP-20 (a11y audit), WP-21 (perf, only if needed). |
| **#19** | WP-A/B done | WP-C (top-level ErrorBoundary + socket connect_error/disconnect notice + fetch fallbacks), WP-D (quote bank → 5 locales + screenshots). |
| **#22** | WP-1/2 done | WP-3 (mobile scroll-fade instead of visible scrollbar — confirm with user; do NOT un-hide the scrollbar). |
| **#25** | open | 4 P3 Welle-2 review nits (AIAssist distractor stale-snapshot + distractor count-slider; ConfigNumberInput unreachable hint; ConfigMedia DnD empty-state). |
| #21 | CLOSED | done + deployed. |

## Proven workflow (this session's pattern)
Per wave: `stop timer` → `route-override --ttl 3600` → **parallel Workflow flood** (disjoint files, agents use `t(key,{defaultValue})` for i18n, NO build) → central gate (types/build/socket-test) → **adversarial review Workflow** (security/correctness/a11y lenses) → fix agent → **i18n pass agent** (keys → 5 locales) → re-gate → commit+push → `deploy.sh` → `start timer` → live-verify (Playwright). Multiple disjoint epics can run as **parallel Workflows** (partition by file: web-features ‖ web-components ‖ socket).

## Gotchas captured (RAG/wm + memory)
- Auth is in-memory `loggedClients`; every deploy-restart wipes it → re-auth on reconnect needed (`config.tsx` now does it). Password kept in-memory only (full reload → re-login).
- Rate-limit must be durable-clientId-keyed (`handshake.auth.clientId`), not `socket.id` (reconnect bypass).
- `questionMediaValidator.url` accepts relative `/media|/theme` (AI-gen returns `/media/gen-*.webp`); quiz media no longer needs absolute URLs.
- Workflow scripts: plain JS only; **no inline backticks inside agent prompt strings** (they close the template literal).
- Memory: `[[project_rahoot_config_v2_cockpit]]`, `[[project_rahoot_issue10_config_ux]]`, `[[feedback_worktree_agent_flood_default]]`.
