---
project: source
updated: 2026-06-15
checkpoint_kind: stop
---

# Session State — source

## Current Goal

(no TASK.md — set one)

## What's done

- 56d47d2 feat(submit): #23 media pipeline — Z-Image prompt-enhance + upload + img2img edit
- 0978564 docs(state): session handoff + backlog status for next session
- df4a4c3 feat: Welle 2 — #12 Wave-2 features + #22 a11y + #19 animated error pages + #21 security hardening
- 761b25b feat(manager): backlog #12 Wave 1 — editor data-loss guard, quiz search/sort, media-picker, results filter+anonymize
- 989a185 fix(submit): valid submissions no longer rejected with raw zod errors

## What's in flight

- M .claude/state/SESSION_STATE.md
-  M packages/common/src/constants.ts
-  M packages/common/src/types/ai.ts
-  M packages/common/src/types/game/socket.ts
-  M packages/common/src/types/media.ts
-  M packages/common/src/types/submission.ts
-  M packages/common/src/types/theme.ts
-  M packages/common/src/validators/ai.ts
-  M packages/common/src/validators/submission.ts
-  M packages/common/src/validators/theme.ts
-  M packages/mcp/src/config-store.ts
-  M packages/mcp/src/index.ts
-  M packages/socket/src/handlers/__tests__/display.test.ts
-  M packages/socket/src/handlers/display.ts
-  M packages/socket/src/handlers/manager.ts
-  M packages/socket/src/handlers/submitMedia.edit.ts
-  M packages/socket/src/index.ts
-  M packages/socket/src/services/__tests__/ai-provider.test.ts
-  M packages/socket/src/services/ai-provider.ts
-  M packages/socket/src/services/comfyui.ts
-  M packages/socket/src/services/config.ts
-  M packages/socket/src/services/registry.ts
-  M packages/socket/src/services/webp.ts
-  M packages/web/src/features/game/components/GameWrapper.tsx
-  M packages/web/src/features/manager/components/configurations/ConfigAI.tsx
-  M packages/web/src/features/manager/components/configurations/ConfigMedia.tsx
-  M packages/web/src/features/manager/components/configurations/ConfigSubmissions.tsx
-  M packages/web/src/features/manager/components/configurations/ConfigTheme.tsx
-  M packages/web/src/features/quizz/contexts/quizz-editor-context.tsx
-  M packages/web/src/features/submission/SubmitPage.tsx
-  M packages/web/src/locales/de/display.json
-  M packages/web/src/locales/de/manager.json
-  M packages/web/src/locales/de/submit.json
-  M packages/web/src/locales/en/display.json
-  M packages/web/src/locales/en/manager.json
-  M packages/web/src/locales/en/submit.json
-  M packages/web/src/locales/es/manager.json
-  M packages/web/src/locales/es/submit.json
-  M packages/web/src/locales/fr/manager.json
-  M packages/web/src/locales/fr/submit.json
-  M packages/web/src/locales/it/manager.json
-  M packages/web/src/locales/it/submit.json
-  M packages/web/src/pages/display/index.tsx
-  M packages/web/src/pages/display/play.tsx
- ?? memory/source/wm_comfyui-on-this-host-runs-as-the-comfyui-docker-aae062.md
- ?? memory/source/wm_deploy-discipline-burned-3x-this-session-never-r-70468f.md
- ?? memory/source/wm_local-vision-is-slow-timeouts-because-ollama-on-b461d4.md
- ?? memory/source/wm_rahoot-2-tab-playwright-sim-method-host-player-i-54b432.md
- ?? memory/source/wm_rahoot-after-a-socket-server-restart-deploy-cras-48082e.md
- ?? memory/source/wm_rahoot-assetref-gotcha-validators-theme-ts-asset-45c785.md
- ?? memory/source/wm_rahoot-media-migration-script-scripts-migrate-me-1aca6b.md
- ?? memory/source/wm_rahoot-public-submit-rate-limit-submissionrateli-5e9d6d.md
- ?? memory/source/wm_rahoot-quiz-media-urls-must-be-absolute-question-333639.md
- ?? memory/source/wm_rahoot-submit-validation-questionvalidator-base-ee04b9.md
- ?? memory/source/wm_rahoot-web-package-had-no-test-runner-0-web-test-fed778.md
- ?? packages/socket/src/handlers/__tests__/submission-reject.test.ts
- ?? packages/socket/src/handlers/theme-revision.ts
- ?? packages/socket/src/services/__tests__/comfyui-resolution.test.ts
- ?? packages/socket/src/services/__tests__/theme-revision.test.ts
- ?? packages/socket/src/services/__tests__/webp-dimensions.test.ts
- ?? packages/web/src/features/manager/components/DisplayStatusCard.tsx

## Recent decisions

- design:issue10-config-ux-polish

## Risks

(Manually maintained between checkpoints. Section is preserved.)

## Open points

(Manually maintained between checkpoints. Section is preserved.)

## Next step

(One concrete action.)
