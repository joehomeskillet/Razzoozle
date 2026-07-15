# Stagehand E2E Tests

Run stagehand specs with `npx tsx e2e/stagehand/<spec>.ts`. Specs use the factory `newStagehand()` from `./config.ts` (mistral-small-latest, Chrome headless). Environment: `E2E_PW` convention for Playwright URLs. Cache: `.stagehand-cache/` is committed—act() is LLM-free from run 2 onwards. Assert `result.success` + verify post-condition (URL/DOM), never catch-and-pass.
