---
name: wm_rahoot-web-package-had-no-test-runner-0-web-test-fed778
type: gotcha
author: tool
status: proposed
project: source
tags: working-memory,gotcha,rahoot,vitest,web,testing
created: 2026-06-14T23:16:24.765619+00:00
description: working-memory instant capture (quarantined until graduated)
---

rahoot web package had NO test runner (0 web tests); added vitest@4.1.7 + packages/web/vitest.config.ts (alias-only, node env) + 'test':'vitest run'. Pure-TS unit tests now run via 'pnpm -r --if-present test'; React component tests still need jsdom+@testing-library (backlog). tsc -b --noEmit includes src/**/__tests__ so a test importing 'vitest' breaks types until the devDep exists.
