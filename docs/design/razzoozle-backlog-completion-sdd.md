# Razzoozle Backlog Completion SDD

Status: canonical delivery specification

Baseline: `origin/main` at `5ad873db0378cfa0eb47b4877507d9ca483bd2e3`

Tracker: Gitea `agent-claude/Razzoozle`

Source audits: `audit-419-424`, `audit-ui-backlog`, `audit-reliability-391-393`

Scope owner: Codex orchestrator

## 1. Goal

Complete the genuine Razzoozle product backlog without rebuilding work already
merged into `main`. Delivery is spec-first, test-driven, worktree-isolated, and
evidence-gated.

This SDD:

- establishes tracker truth against source and merge history;
- defines contracts and ordering for genuine work;
- requires AGY Gemini 3.6 Flash design specs before UI implementation;
- delegates micro-WP derivation and implementation to workers;
- keeps enterprise/platform items previously classified `SKIP` out of scope;
- defines review, merge, mirror, deploy, production, and closure gates.

## 2. Canonical backlog truth

### 2.1 Closed as already implemented

The following stale-open issues were verified as merged and closed with commit
and gate receipts:

| Issues | Evidence summary |
| --- | --- |
| #134 | D14 wording superseded by canonical `af359e0b4` |
| #150–#155 | D22 card-anatomy merges `0a15ea529` through `933bf1536` |
| #199 | catalog fullscreen/edit/bulk/labels commits `80c1e2ac7`, `4220c637d`, `913bedee2` |
| #214 | manager UI audit artifacts from `98f1383f4` through `b7ea8a50d` |
| #335 | PlayerFinished implementation `b92bbbf69`, integration `c0728a486` |
| #392 | snapshot merge `ff9dc2fc3`; focused tests 10 passed |
| #393 | satellite-token merge `666a53dc7`; focused tests 4 passed |
| #419–#424 | auth/templates/reveal merges `9965ab20b` through `96d85b379` |

These issues must not produce new implementation WPs.

### 2.2 Genuine open issues

| Issue | Remaining scope |
| --- | --- |
| #191 | structural extraction only: `ConfigUsers` and `ConfigSkeleton`; no visual change |
| #281 | socket identity/role exclusivity across manager, player, and display |
| #302 | make design CI gate truly blocking; add guarded post-merge learning script |
| #319 | MultiSelect spacing, disabled hierarchy, ARIA state, focused tests |
| #320 | slider interaction redesign, focused tests, CSS and component alignment |
| #391 | umbrella for residual SHOULD/NICE program B0–B6 |

### 2.3 Explicit exclusions

All 19 entries classified `SKIP` in #391 remain excluded. “Implement
everything” activates genuine SHOULD/NICE residue; it does not silently reverse
deliberate exclusions covering enterprise SSO/LMS/integration/platform scope.

Any reclassification needs:

1. explicit product decision;
2. separate threat and cost assessment;
3. dedicated SDD and budget;
4. new tracker issue.

## 3. Global invariants

1. One live Socket.IO `SocketId` owns at most one role:
   `manager | player | display`.
2. Server owns authoritative limits, scoring, permutations, timeouts, roles,
   state transitions, and persisted results.
3. Reconnect and replay preserve deterministic question/answer ordering and do
   not duplicate transitions or scoring.
4. New payload or API fields land with their shared contract and required
   wiring in the same collision-safe wave.
5. Free-text modes never expose another participant’s raw identity unless the
   mode and moderation policy explicitly allow it.
6. AI/import output is always reviewable before publication.
7. Existing visual behavior stays unchanged for structural-only #191 work.
8. New UI uses project generators, mapped design tokens, surface boundaries,
   accessibility semantics, responsive states, and stable test IDs.
9. Credentials come from environment or existing secret stores. `E2E_PW` is
   never hardcoded.
10. No worker writes in shared `main`; every writer uses its assigned worktree.

## 4. Delivery architecture

```text
B0 tracker truth + canonical SDD
 ├─ B1 socket role exclusivity (#281)
 ├─ B2 bounded configuration and recovery features
 ├─ B3 independent live-mode vertical slices
 ├─ UI hygiene: #191, #302, #319, #320
 ├─ B4 learner identity and longitudinal data mission
 ├─ B5 deterministic replay and offline mission
 └─ B6 sandboxed document ingestion and AI extraction mission
```

B1 and UI hygiene may run in parallel after this SDD. B2 begins after shared
configuration contracts are frozen. B3 modes are independent after mode
contract conventions are frozen. B4, B5, and B6 are missions, not single WPs.

## 5. B1 — socket role exclusivity (#281)

### 5.1 Root cause

Web currently shares a module-scope socket and client identity across manager
and player routes. Rust stores manager and player membership independently.
Same-tab role changes can therefore leave one connection in multiple role
indexes and deliver conflicting personalized status payloads.

### 5.2 Contract

- Add shared `SocketRole = "manager" | "player" | "display"`.
- Build role-scoped web socket instances; role changes disconnect the old
  connection and create a fresh handshake.
- Carry verified role in Rust handler context.
- Reject handler events when verified connection role mismatches handler role.
- Add atomic registry transition/exclusivity API.
- Update manager auth, player login, display join, eviction, and cleanup paths.
- Remove listeners explicitly on route/provider teardown.
- Never fix conflict by deleting an unrelated player slot.

### 5.3 Required tests

- Same `SocketId` cannot occupy two roles.
- Role transition removes old indexes atomically.
- Manager reconnect after same-tab player use succeeds.
- Unrelated player remains connected.
- Role-mismatched events are rejected.
- Web role switch creates fresh handshake and no listener leak.
- Stagehand: create game → same-tab player join → leave → manager takeover;
  manager controls visible and stale player avatar absent.

### 5.4 Ordering

```text
281-SDD/AGY states
  -> shared role contract
  -> registry and handler RED tests
  -> Rust implementation
  -> web provider RED tests
  -> web provider implementation
  -> route/session wiring
  -> security review
  -> Stagehand and full gates
```

## 6. B2 — bounded configuration and recovery

Each feature receives its own focused SDD and WP graph.

### 6.1 Configurable participant cap

- Persist bounded `maxParticipants`.
- Server validates and enforces cap at join time.
- Default remains current safe server limit.
- Manager UI exposes permitted range and current occupancy.
- Reconnect of an existing participant is not rejected as a new join.

### 6.2 Connected-idle warning and finalization

- Persist bounded `idleTimeoutMinutes`.
- Server emits warning, then finalizes exactly once.
- Snapshot/restart preserves deadline and finalization state.
- Manager can distinguish warning, cancelled warning, finalized, and error.

### 6.3 Seeded question randomization

- Persist `randomizeQuestions`.
- Generate one seeded question permutation when session starts.
- Snapshot and reconnect preserve permutation.
- Answer randomization remains independent and already-shipped behavior.

### 6.4 Recovery UX

- Expose recoverable session/takeover state without leaking manager tokens.
- Define loading, recovered, stale, denied, incompatible, and failed states.
- Keep recovery idempotent across reload and reconnect.

### 6.5 Music presets

- Define licensed/bundled preset catalog and no-music default.
- Persist preset identifier, never arbitrary remote media URL.
- Respect reduced-motion/audio preferences and explicit user playback action.

### 6.6 PNG/PDF result export

- Build deterministic sanitized export document from existing result model.
- Prevent formula/markup injection and external-resource loading.
- Keep CSV export unchanged.
- PNG/PDF generation must be reproducible in browser and production runtime.

### 6.7 Shared configuration contract

Configuration additions must align:

- common manager types and validators;
- Rust configuration persistence;
- engine/game state and snapshot compatibility;
- join/eviction behavior;
- manager UI and six locales.

One writer per shared contract file per wave.

## 7. B3 — live-mode vertical slices

Modes are delivered separately:

1. Word Cloud
2. Brainstorm
3. Confidence Rating
4. Q&A
5. Micro-Lessons

Each mode follows this vertical contract:

```text
mode SDD + AGY design
 -> common schema and validation
 -> Rust protocol/engine/server RED tests
 -> aggregation/evaluation/reveal implementation
 -> editor RED tests and UI
 -> player RED tests and UI
 -> manager/display RED tests and UI
 -> snapshot compatibility
 -> locales
 -> moderation/privacy review
 -> browser/E2E/full gates
```

### 7.1 Free-text requirements

Word Cloud, Brainstorm, and Q&A require:

- length, count, rate, and Unicode bounds;
- normalization policy;
- moderator visibility and removal;
- privacy-safe participant attribution;
- deterministic aggregation;
- abuse and empty-state handling;
- no HTML execution or unsafe URL rendering.

### 7.2 Confidence Rating

- Fixed bounded scale with explicit labels.
- Aggregate distribution without exposing individual identity by default.
- Keyboard and screen-reader semantics match a native radiogroup or slider.

### 7.3 Micro-Lessons

- Compose existing content/question primitives.
- No parallel content-rendering system.
- Define progress, resume, completion, and interrupted-session behavior.

## 8. UI hygiene issues

### 8.1 #191 structural tail

Split-audit correction: #191 is two independent structural trains, not one
combined refactor.

Users train:

- freeze behavior in `p6-users-structural-tail-sdd.md`;
- extract HTTP API, bulk actions, and CRUD actions separately;
- scaffold `UserFilterPanel`, `UserManagementList`, `ResetPasswordDialog`, and
  `CreateUserDialog` individually with `pnpm g:console`;
- serialize all extractions because each minimally wires `ConfigUsers.tsx`;
- stop and revise SDD if final parent is not orchestration-only at roughly
  250–300 LOC.

Skeleton train:

- freeze behavior in `p6-skeleton-structural-tail-sdd.md`;
- separate socket/draft state into `useSkeletonDrafts`;
- separate HTTP import/export and object-URL cleanup into
  `useSkeletonTransfer`;
- serialize both hook extractions because each minimally wires
  `ConfigSkeleton.tsx`;
- stop and revise SDD if parent remains above roughly 300 LOC.

No AGY design artifact is required because visual output is frozen. Browser and
DOM regression evidence is still mandatory. Both trains preserve DOM order,
copy, test IDs, security/self-protection behavior, authorization headers, and
visuals.

### 8.2 #302 design gate

- CI design-lint step must fail on real lint failure.
- Missing optional binary may produce explicit documented skip.
- `continue-on-error` and `cmd && lint || echo skip` masking are forbidden.
- Post-merge learning script runs only on exact `main`, records exact `HEAD`,
  performs no automatic hook installation, and passes `bash -n`.

### 8.3 #319 MultiSelect parity

Tiny-fix AGY exception: current `ChoiceGrid` is canonical design reference.

- Use canonical game spacing tokens.
- Add explicit selected ARIA state.
- Preserve selected emphasis after submit/disable.
- Dim only unselected disabled tiles.
- Selection must not shift geometry.
- Preserve Solo motion and multiplayer no-motion behavior.

### 8.4 #320 slider redesign

AGY design artifact is mandatory before tests or code.

- Thumb hit target at least 32px.
- Value output tracks thumb and clamps at min/max.
- Unit remains visible and localizable.
- Native range semantics and keyboard behavior remain.
- Define focus, disabled, submitted, reduced-motion, and long-unit states.
- Use canonical `game:submitAnswer` copy.

## 9. B4 — learner identity and longitudinal data mission

B4 is security-sensitive and must run with budget, kill switch, migration plan,
and explicit retention policy.

```text
authenticated student identity + capability matrix
 -> consent, retention, pseudonymization, delete/export
 -> normalized attempts and sessions
 -> persistent answer history
 -> cross-session progress
 -> effectiveness and trend aggregation
 -> async challenge
```

Required controls:

- owner/teacher/student/admin authorization matrix;
- tenant/user isolation;
- deletion and export completeness;
- migration rollback;
- aggregation correctness;
- endpoint authorization tests;
- security audit before merge.

Stop mission if identity, ownership, deletion, or retention semantics remain
ambiguous.

## 10. B5 — deterministic replay and offline mission

Define a versioned event log before UI:

- stable event IDs and schema version;
- idempotent application;
- logical clock and ordering;
- duplicate/out-of-order handling;
- storage and retention bounds;
- replay compatibility across versions;
- offline merge/conflict policy;
- abuse and rate limits.

Delivery order:

```text
event-log SDD
 -> deterministic engine replay
 -> recovery/replay UI
 -> ghost replay
 -> async replay/challenge integration
 -> partial offline cache
 -> conflict UX and production soak
```

Stop mission on nondeterministic replay, unbounded storage, silent conflict
loss, or incompatible snapshot migration.

## 11. B6 — document ingestion and AI extraction mission

Refresh `content-import-sdd.md` before implementation.

Required pipeline:

```text
upload
 -> MIME and magic-byte validation
 -> sandboxed bounded parser
 -> normalized intermediate document
 -> human review UI
 -> optional AI extraction
 -> validated draft questions
 -> explicit publish
```

Controls:

- file, page, archive, memory, CPU, and wall-time limits;
- zip-bomb and path-traversal protection;
- temporary-file cleanup;
- corrupt and encrypted document handling;
- prompt-injection isolation;
- provider, privacy, cost, retry, and idempotency policy;
- AI output never auto-publishes.

Stop mission on parser escape, unbounded resource use, missing review boundary,
or undefined provider/data-retention policy.

## 12. AGY design-spec contract

AGY Gemini 3.6 Flash is design-spec author, not production implementer.

Every non-exempt UI slice gets `docs/design/<slug>.md` containing:

- purpose and user flow;
- semantic markup outline;
- mapped token inventory;
- existing component inventory and generator command;
- default, loading, empty, error, success, disabled, and submitted states;
- responsive wireframes for 375×667, 390×844, and 440×956 where player-facing;
- keyboard, focus, screen-reader, reduced-motion, and contrast behavior;
- stable test IDs;
- explicit forbidden patterns;
- browser acceptance checklist.

Production coding begins only after AGY artifact passes design review.

### 12.1 Design artifact queue

Worker second-opinion report `recon-agy-design-briefs` validated these 22
mandatory artifacts:

1. `gameui-slider-control.md`
2. `socket-role-transition-states.md`
3. `game-recovery-history.md`
4. `game-session-config.md`
5. `game-music-presets.md`
6. `result-png-pdf-export.md`
7. `question-mode-word-cloud.md`
8. `question-mode-brainstorm.md`
9. `question-mode-confidence-rating.md`
10. `question-mode-audience-qa.md`
11. `question-mode-micro-lessons.md`
12. `learner-identity-role-entry.md`
13. `learner-answer-history.md`
14. `learner-cross-session-progress.md`
15. `question-effectiveness-trends.md`
16. `async-challenge.md`
17. `deterministic-replay-viewer.md`
18. `ghost-replay-challenge.md`
19. `offline-sync-conflicts.md`
20. `content-import-intake.md`
21. `content-import-review.md`
22. `ai-question-extractor.md`

#191 is an explicit no-visual-change exception. #302 is tooling-only. #319
copies an existing canonical component pattern and is a tiny-fix exception.
Any new visual decision in those slices cancels the exception.

## 13. Worker-derived micro-WP contract

Workers derive WPs from this SDD. Orchestrator reviews split quality before
dispatch.

Each WP must include:

- stable `wp_id`, task class, assigned lane, model, and fallback chain;
- one owned file where practical and under 150 changed LOC;
- explicit contract and wiring carve-outs when shape changes require them;
- dependencies and parallel group;
- RED test or verification predecessor;
- exact acceptance commands;
- worktree, branch, commit, and no-push constraints;
- security/design flags;
- rollback;
- report and issue linkage.

Split tests, implementation, locales, docs, review, integration, deployment,
and production validation into separate WPs. New UI components are scaffolded
in their own generator WP before test/implementation WPs.

Contract/wiring carve-out is bounded to at most two wiring files and roughly 30
changed wiring LOC. Wiring may register/import/connect the primary change but
may not contain independent behavior, UI, tests, locale copy, or refactoring.
Exceeding either bound creates another WP. Generator WPs may own only generated
component plus generated test scaffold; hardening and implementation remain
later WPs.

B4–B6 must first yield mission SDDs. Workers must not flatten them into giant
implementation WPs.

## 14. Dispatch and fallback policy

1. Poll `claude-quota-healthmap` before each wave.
2. Skip providers marked down.
3. Prefer healthy subscription lanes, then separate free providers and local
   workers.
4. Paid OpenRouter Kimi is bounded fallback only.
5. Carry partial artifacts to a different model/provider after failure.
6. Never retry an exhausted provider.
7. Reviewer differs from author; review-fix worker differs from both where
   practical.
8. A worker “done” report with empty diff is false success.

## 15. Mandatory engineering gates

### 15.1 Before editing

- Read project `AGENTS.md`.
- Run GitNexus impact analysis for touched symbols.
- Warn before HIGH/CRITICAL blast radius.
- Confirm isolated worktree and clean owned scope.

### 15.2 Focused gates

- RED test captured before implementation.
- Targeted TypeScript/Vitest or Rust tests.
- Contract and locale parity.
- YAML/shell/JSON validation for tooling WPs.
- Security cases for auth, parser, free text, export, and identity changes.

### 15.3 Project gates

```bash
pnpm verify
pnpm tokens:validate
pnpm tokens:ast
pnpm tokens:wasm
pnpm tokens:morph
pnpm tokens:neural
pnpm tokens:ai-audit
pnpm tokens:daemon
bash rust/gate.sh
```

Run relevant locale checks and full workspace tests. UI work reports verbatim
token-gate output.

### 15.4 Browser gates

- Stagehand Solo and multiplayer suites.
- New feature-specific Stagehand spec.
- Player portrait viewports: 375×667, 390×844, 440×956.
- Keyboard, focus, reduced motion, disabled/submitted states, console errors,
  layout shift, reconnect, and reload.
- `E2E_PW` must come from environment. Missing value means blocked, never pass.

### 15.5 Before commit and merge

- GitNexus `detect_changes`.
- Diff and owned-file inspection by orchestrator.
- `gitleaks`/secret scan.
- Independent code, test, product/design, and security review as applicable.
- `claude-wp-verify --branch <branch> --base main`.

## 16. Integration, mirror, deploy, and production

For each green slice:

1. open Gitea PR;
2. attach WP, test, review, and gate receipts;
3. merge only after independent review;
4. update local `main` from Gitea;
5. mirror sanitized commit to GitHub without secrets, internal state, or
   ignored handoff artifacts;
6. deploy through existing Rust CD path;
7. verify `/healthz`, deployed SHA, affected API/socket flow, and browser flow;
8. record routing outcome;
9. close implementation issue only after production evidence.

After final program merge:

```bash
gitnexus-reindex /nvmetank1/projects/Razzoozle/source
```

Registry `lastCommit` must equal final `origin/main`.

## 17. Rollback

- Prefer reverting one merged slice over cross-feature rollback.
- Keep migrations backward-compatible until production validation completes.
- Feature/config additions need safe defaults preserving current behavior.
- Disable new UI entry points before destructive data rollback.
- Parser/AI and offline/replay missions require kill switches.
- Never delete worktrees/branches until PR, deployment, and evidence are
  complete.

## 18. Definition of done

Program is complete when:

- stale work is closed with receipts and never rebuilt;
- #191, #281, #302, #319, and #320 are merged, deployed, verified, and closed;
- #391 accurately marks shipped, partial, completed, and excluded items;
- every residual SHOULD/NICE item is either delivered or has a completed,
  accepted mission result with no remaining implementation node;
- every UI slice has an accepted AGY design artifact or documented tiny/no-
  visual-change exception;
- every implementation has TDD, independent review, full relevant gates,
  Gitea merge, sanitized GitHub mirror, deploy, and production validation;
- all worker reports and routing outcomes are recorded;
- final GitNexus index equals final `origin/main`;
- no secrets, dirty shared-main edits, abandoned unmerged implementation, or
  unexplained open backlog remains.
