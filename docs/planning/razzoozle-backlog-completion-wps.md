# Razzoozle Backlog Completion WP Registry

Status: dispatch registry

Baseline: `origin/main` at `5ad873db0378cfa0eb47b4877507d9ca483bd2e3`

Orchestrator: Codex

Tracker: Gitea `agent-claude/Razzoozle`

Canonical specification:

- [current full SDD on branch](https://git.joelduss.xyz/agent-claude/Razzoozle/src/branch/docs/backlog-completion-sdd/docs/design/razzoozle-backlog-completion-sdd.md)
- [review-fixed full SDD at commit `661c4b0292267b0ad483bbaaf85ab33ecdf7c0c0`](https://git.joelduss.xyz/agent-claude/Razzoozle/src/commit/661c4b0292267b0ad483bbaaf85ab33ecdf7c0c0/docs/design/razzoozle-backlog-completion-sdd.md)

## 1. Purpose

This registry turns the accepted master SDD into deterministic, reviewable
micro work packages. It covers the currently dispatchable Wave 0 and Wave 1
nodes and defines the derivation gates for later trains.

Workers execute WPs. Codex owns decomposition, collision control, scheduling,
integration, and the ledger. A child SDD author may propose a lower-level DAG,
but Codex derives and approves its deterministic WPs before dispatch.

## 2. Mandatory issue and WP format

Every existing and future WP issue contains:

1. status, baseline SHA, parent issue, and stable `wp_id`;
2. full branch and immutable commit links for every governing SDD or design
   artifact;
3. problem, goal, and explicit non-goals;
4. exact `generated_route`, concrete generated model, `fallback_chain`,
   `quota_class`, active lane/model override, and matching lane label;
5. one `primary_file`, plus explicit `contract_files` and `wiring_files`
   arrays;
6. dependencies, parallel group, collision order, and stop conditions;
7. RED or characterization predecessor;
8. exact focused and project-wide acceptance commands;
9. author, reviewer, and review-fix separation;
10. worktree, branch, commit, no-shared-main, and no-push constraints;
11. GitNexus impact before edit, `detect_changes` before commit, and reindex
    after merge;
12. rollback, `claude-wp-verify`, PR, sanitized GitHub mirror, deploy,
    production, and issue-close requirements.

`quota_class` is one of `subscription`, `free`, `local`, or `paid-fallback`.
Other values are invalid.

Normal writer WPs change fewer than 150 LOC. A declared wiring carve-out may
touch at most two wiring files and fewer than 30 wiring LOC. Tests, production
code, scaffolds, locales, reviews, integration, deployment, and production
validation remain separate WPs.

### 2.1 Lane labels

| Label                     | Meaning                                                              |
| ------------------------- | -------------------------------------------------------------------- |
| `lane/codex-orchestrator` | Architecture, decomposition, collision control, ledger               |
| `lane/agy-design`         | AGY Gemini 3.6 Flash writes design specs only                        |
| `lane/cursor-sub`         | Cursor Composer 2.5 subscription writer or reviewer                  |
| `lane/nim-free`           | NVIDIA NIM free-capacity writer or reviewer                          |
| `lane/local-free`         | Local OpenVINO/Ollama zero-quota worker                              |
| `lane/free-alt`           | Healthy Alibaba, Cerebras, Mistral, Zen, or other separate free pool |
| `lane/paid-kimi`          | Bounded OpenRouter Kimi fallback after subscription and free lanes   |

If a label does not yet exist, the orchestrator creates it before the first WP
that needs it. `agent-*` labels are reserved for intentional n8n dispatch and
must not be added as descriptive metadata.

### 2.2 Deterministic route and live quota override

`claude-workpackage` output remains the reproducible route record. Live quota
status may require a different active lane. Each issue records both:

```yaml
generated_route:
  assigned_agent: <deterministic agent>
  model: <deterministic model>
  fallback_chain: [<ordered deterministic fallbacks>]
active_lane_override:
  lane: <healthy execution lane>
  label: <exact lane/... label>
  model: <concrete execution model>
  reason: <quota, sandbox, or capability fact>
  checked_at: <ISO-8601 timestamp>
```

Quota failures do not change the stable `wp_id`. They change only the active
execution receipt. Transient quota failures are not recorded as model-quality
failures.

Current scheduling facts at registry creation:

- Cursor Composer 2.5 is authenticated and available; user-reported usage is
  12 percent.
- AGY remains gated until its reset and a successful preflight.
- Codex subscription, Cline, and Cursor API pool are unavailable.
- Grok remains excluded despite an optimistic health probe because the user's
  observed limit takes precedence.
- NVIDIA NIM, Alibaba, Cerebras, Mistral, and several separate free providers
  are available.
- Paid OpenRouter Kimi is fallback only, with total program spend capped at
  USD 5 unless the user changes the budget.

### 2.3 Execution profiles

Every WP below names one exact profile. The issue copies all fields, not only
the profile name.

| Profile        | Exact lane label  | Concrete model                              | Quota          | Ordered active fallback                                                                                     |
| -------------- | ----------------- | ------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `cursor-write` | `lane/cursor-sub` | Cursor Composer 2.5                         | `subscription` | NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3           |
| `nim-write`    | `lane/nim-free`   | NVIDIA NIM Kimi K2.5                        | `free`         | Alibaba Qwen3 Coder Plus -> Cerebras GLM-4.7 -> local Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3        |
| `free-review`  | `lane/free-alt`   | Alibaba Qwen3.6 Flash                       | `free`         | NVIDIA Nemotron Super 49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3                                    |
| `local-write`  | `lane/local-free` | OpenVINO Qwen3-Coder-30B-A3B-int4           | `local`        | NVIDIA NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> paid OpenRouter Kimi K3                                 |
| `agy-design`   | `lane/agy-design` | AGY Gemini 3.6 Flash                        | `subscription` | Cursor Composer 2.5 design-only -> Alibaba Qwen3.6 Flash design-only -> paid OpenRouter Kimi K3 design-only |
| `browser-qa`   | `lane/free-alt`   | Playwright/Stagehand with Mistral free lane | `free`         | Cursor Composer 2.5 browser lane -> NVIDIA NIM Kimi K2.5 -> paid OpenRouter Kimi K3                         |
| `ops-free`     | `lane/local-free` | local shell plus Qwen3-Coder-30B-A3B        | `local`        | NVIDIA NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> paid OpenRouter Kimi K3                                 |

Generated routes remain separate from these live profiles. If quota or
capability health differs at dispatch, the issue updates only
`active_lane_override`; it never rewrites `generated_route` or `wp_id`.

### 2.4 Common delivery contract

Every dispatchable WP below inherits these requirements. An issue that omits
one is not ready:

- create isolated worktree from then-current `origin/main`; never edit shared
  main; never push directly to `main`;
- make targeted edits only and commit only owned scope;
- run GitNexus impact before code edits and `detect_changes` before commit;
- run focused commands listed by the WP, `git diff --check`, scoped gitleaks,
  owned-file inspection, and
  `claude-wp-verify --branch <branch> --base main`;
- publish Gitea PR and add branch plus immutable commit full-file links for
  every governed artifact; mirror sanitized branch/PR to GitHub;
- author, reviewer, and review-fix are different workers/providers;
- deploy only after accepted review and green project gates; record deployed
  SHA, `/healthz`, affected API/socket/browser flow, routing outcome, GitNexus
  reindex, and issue closure;
- a missing `E2E_PW` blocks browser acceptance and is never a pass;
- rollback is the WP commit or PR unless its block states a narrower
  operational disable path.

### 2.5 Canonical regeneration ledger

Original 30 IDs were retained only in session summary; their exact generator
prompts and route JSON were not persisted. They are legacy aliases, never issue
IDs. On 2026-07-25 Codex reran `claude-workpackage --batch -` with the complete,
stable tasks now quoted by this registry. New IDs and routes are canonical:

| Legacy alias      | Canonical `wp_id` |
| ----------------- | ----------------- |
| `wp-3e0101a24d70` | `wp-9bc19829c026` |
| `wp-e37d66178bad` | `wp-e610f5ee363a` |
| `wp-4d83630e3205` | `wp-eae39b592b0e` |
| `wp-12556cab62c9` | `wp-477270d4b260` |
| `wp-54af08de52d0` | `wp-51c3dba89a8b` |
| `wp-95c956369f23` | `wp-77cb237a91e4` |
| `wp-9a7b3b2da658` | `wp-809d42ff1e38` |
| `wp-1a71cd1ed8ee` | `wp-d4213d11d0dd` |
| `wp-ad4e651b828e` | `wp-7d83b3bec100` |
| `wp-8137086d95cd` | `wp-cbb022ccf2d2` |
| `wp-8cffedc64237` | `wp-c21a3b35a9be` |
| `wp-3ea6bb00d228` | `wp-4de90a550062` |
| `wp-3270ffc86d0a` | `wp-277ec89e54a5` |
| `wp-1b59a9c3cd1b` | `wp-cabdaf0bf64a` |
| `wp-a62036d4363c` | `wp-edb8ddd6c2d6` |
| `wp-c92ac4a77ee8` | `wp-fafd16e45af6` |
| `wp-0c963d8ca608` | `wp-954db36b1a96` |
| `wp-cf2c6eee9973` | `wp-6dd51fe238c9` |
| `wp-b3aae6793d62` | `wp-55143eec640c` |
| `wp-47152d9dc911` | `wp-5e3c80e61110` |
| `wp-aa78fb707cb3` | `wp-756582782e29` |
| `wp-83b96c859e81` | `wp-b8a1ad4e4c28` |
| `wp-9dfe1476979d` | `wp-0750f2440b08` |
| `wp-0415ddcd32c6` | `wp-4245abf40d23` |
| `wp-1e17eab6412d` | `wp-6a7d21e7606d` |
| `wp-600dd8733ed1` | `wp-cb630c705425` |
| `wp-6eb4b33cd517` | `wp-0b49f236836b` |
| `wp-39d744d9ba2c` | `wp-64880ab01ae2` |
| `wp-1fb449e7a2ae` | `wp-410ffe91be14` |
| `wp-42462a852c2f` | `wp-990421df98ac` |

The three B0 follow-up prompts were already available verbatim and retain
`wp-06da92b15523`, `wp-cdded99a9afe`, and `wp-57756f2b4ea3`.

Canonical generator inputs are immutable registry data. Reuse each exact string
when checking its hash; changing wording creates a new WP:

```text
wp-9bc19829c026 | Correct only docs/gaps/kahoot-gap-analysis-2026-07-23.md so every SHOULD, NICE, and SKIP row matches accepted backlog SDD and then-current origin/main; change no source files.
wp-e610f5ee363a | Correct only docs/gaps/kahoot-feature-matrix-2026.md so every shipped and residual classification is evidence-backed by accepted backlog SDD and then-current origin/main; change no source files.
wp-eae39b592b0e | Correct stale claims only in docs/design/host-analytics-sdd.md so shipped responseMs, aggregate, CSV, and streak behavior matches then-current origin/main; change fewer than 150 lines and no source files.
wp-477270d4b260 | Correct only docs/design/study-practice-modes-sdd.md so Study and Practice descriptions match shipped behavior on then-current origin/main; create no implementation scope.
wp-51c3dba89a8b | Edit only .gitea/workflows/ci.yml so design lint fails CI on real lint errors while a genuinely missing optional binary yields an explicit safe skip; add no hook or UI changes.
wp-77cb237a91e4 | Create only scripts/design-learn-postmerge.sh as a manually installable recorder that runs only on exact main and records exact HEAD; do not auto-install hooks, add credentials, or call a network target.
wp-809d42ff1e38 | Create only packages/web/src/features/game/components/answers/MultiSelectGrid.test.tsx as focused RED characterization for selected ARIA state, selected emphasis after disable, unselected-only dimming, and stable geometry; change no production files.
wp-d4213d11d0dd | Create only docs/design/gameui-slider-control.md as AGY Gemini 3.6 Flash slider design contract per master SDD; write no production code.
wp-7d83b3bec100 | Create only docs/planning/p6-users-structural-tail-sdd.md as cold-agent-ready ConfigUsers structural extraction SDD per master SDD; preserve visuals and generate no code WPs.
wp-cbb022ccf2d2 | Create only docs/planning/p6-skeleton-structural-tail-sdd.md as cold-agent-ready ConfigSkeleton extraction SDD resolving authentication and targeting roughly 300 orchestration lines; preserve visuals and generate no code WPs.
wp-c21a3b35a9be | Create only docs/design/socket-role-exclusivity-sdd.md as security architecture contract for one verified role per SocketId, atomic transition rollback, HandlerCtx policy, registry ownership, and all raw clients; write no production code.
wp-4de90a550062 | Create only docs/design/socket-role-transition-states.md as AGY Gemini 3.6 Flash UI state contract for manager, player, display, and satellite role transitions per accepted security SDD; write no production code.
wp-277ec89e54a5 | Read-only cross-review every Wave 0 artifact against master SDD, current origin/main, collision rules, and child-SDD gates; report exact Critical, Important, and Minor findings; change no files.
wp-cabdaf0bf64a | Create an independent test harness for the issue 302 CI workflow and guarded learning hook after both writer commits; prove failure propagation, missing-binary skip, shell syntax, and exact-main SHA behavior; change only the child SDD-declared test manifest.
wp-edb8ddd6c2d6 | Perform read-only independent scope and security review of issue 302 integrated workflow, hook, and tests; report masking, auto-install, secret, network, and scope findings; change no files.
wp-fafd16e45af6 | Validate issue 302 merged Gitea CI behavior by proving deliberate design-lint failure blocks and clean main passes; record immutable run links and change no repository files.
wp-954db36b1a96 | Make the minimal MultiSelectGrid production edit after accepted RED test so selected ARIA state, disabled hierarchy, unselected-only dimming, and geometry match ChoiceGrid; change only packages/web/src/features/game/components/answers/MultiSelectGrid.tsx.
wp-6dd51fe238c9 | Perform read-only independent review of issue 319 code, tests, and design parity with ChoiceGrid; report exact Critical, Important, and Minor findings; change no files.
wp-55143eec640c | Run issue 319 browser QA for solo and multiplayer MultiSelect, keyboard, submitted and disabled states, and 375x667, 390x844, and 440x956 viewports; record evidence and change no files.
wp-5e3c80e61110 | Validate issue 319 production deployment SHA, healthz, and real solo and multiplayer MultiSelect flow; record evidence and change no repository files.
wp-756582782e29 | Perform read-only independent design review of docs/design/gameui-slider-control.md against master SDD and project governance; report exact Critical, Important, and Minor findings; change no files.
wp-b8a1ad4e4c28 | Create only focused SliderInput RED tests after accepted slider design spec for min, midpoint, max, unit, aria-valuetext, disabled, canonical copy, and clamped output; change no production file.
wp-0750f2440b08 | Edit only packages/web/src/index.css quiz-range block after accepted slider spec so WebKit and Firefox thumbs are at least 32px with mapped focus and disabled tokens; change no component file.
wp-4245abf40d23 | Edit only SliderInput.tsx after accepted RED test and CSS contract so native range remains, output clamps semantically, and unit plus canonical submit copy are correct; change no CSS or locale files.
wp-6a7d21e7606d | Perform read-only six-locale parity check after SliderInput change and verify game submitAnswer exists in de, en, es, fr, it, and zh; edit nothing unless a separate gap WP is approved.
wp-cb630c705425 | Perform read-only independent code, test, and design review of integrated issue 320 slider implementation; report exact Critical, Important, and Minor findings; change no files.
wp-0b49f236836b | Run issue 320 browser QA for solo and multiplayer min, midpoint, max, long unit, keyboard, no CLS, and 375x667, 390x844, and 440x956 viewports; record evidence and change no files.
wp-64880ab01ae2 | Validate issue 320 production deployment SHA, healthz, and real solo and multiplayer slider flows; record evidence and change no repository files.
wp-410ffe91be14 | Read-only jointly review ConfigUsers and ConfigSkeleton child SDDs for node-only Vitest, generator hazards, authentication, decomposition, collision order, and roughly 300-line parent targets; change no files.
wp-990421df98ac | Read-only jointly review socket-role exclusivity security SDD and AGY transition-state design contract for authorization, atomic rollback, every role entry, raw clients, accessibility, and collisions; change no files.
wp-06da92b15523 | Read-only cross-check all four B0 truth documents and every issue #391 matrix row against then-current origin/main; report Critical and Important mismatches; change no files.
wp-cdded99a9afe | Reindex GitNexus after B0 truth PR merge and verify indexed lastCommit equals exact merged origin/main SHA; change no repository files.
wp-57756f2b4ea3 | Post merged B0 full-file links, immutable commit links, review receipt, and GitNexus reindex receipt to Gitea issue #391; keep #391 open; change no repository files.
```

The three final B0 strings plus the `wp-954db36b1a96` MultiSelect string were
reproduced on 2026-07-25 with
`claude-workpackage "<exact string>" --repo agent-claude/Razzoozle`. Generator
output returned `wp-06da92b15523`, `wp-cdded99a9afe`, `wp-57756f2b4ea3`, and
`wp-954db36b1a96` respectively. These prompt strings, including punctuation and
path spelling, are immutable.

## 3. Existing parent issues

All genuine open parent issues already use the detailed contract:

| Issue                                                              | Scope                                            | Required labels                                               | Dispatch state                        |
| ------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------- |
| [#191](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/191) | ConfigUsers and ConfigSkeleton structural trains | `lane/nim-free`                                               | Child SDDs first                      |
| [#281](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/281) | Socket-role exclusivity and same-tab transition  | `lane/codex-orchestrator`, `lane/agy-design`, `lane/nim-free` | Security SDD and AGY states first     |
| [#302](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/302) | Blocking design CI and guarded learning hook     | `lane/nim-free`                                               | Wave 0 ready after plan merge         |
| [#319](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/319) | MultiSelect parity                               | `lane/nim-free`                                               | RED test first                        |
| [#320](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/320) | Slider redesign                                  | `lane/agy-design`, `lane/nim-free`                            | AGY spec first                        |
| [#391](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/391) | Residual SHOULD/NICE B0–B6 program               | `lane/codex-orchestrator`, `lane/agy-design`                  | Umbrella remains open                 |
| [#427](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/427) | Master SDD and WP registry                       | `lane/codex-orchestrator`, `lane/nim-free`                    | Close after plan PR and Wave 0 issues |

Closed issues remain evidence only. No WP may reopen or rebuild #134, #150–155,
#199, #214, #335, #392, #393, or #419–424 without an explicit new issue and
reclassification receipt.

## 4. Wave 0: specs, truth, RED tests, and file-disjoint tooling

Wave 0 starts only after the plan PR merges. Nodes without intersecting files
may run in parallel. Browser profiles, ports, shared contract files, and parent
wiring remain serialized.

### 4.0 Explicit Wave 0 DAG and merge policy

```text
plan PR merged
├─ B0-GAP-TRUTH ───────┐
├─ B0-MATRIX-TRUTH ────┤
├─ B0-ANALYTICS-TRUTH ─┼─> B0-INTEGRATE -> B0-REVIEW -> one B0 truth PR
├─ B0-STUDY-TRUTH ─────┘                                      -> B0-REINDEX
│                                                               -> B0-391-COMMENT
├─ #302 CI ─┐
│           ├─> Wave 0 global review barrier
├─ #302 hook┘
├─ #319 RED ─────────────> Wave 0 global review barrier
├─ #320 AGY spec -> spec review ─> Wave 0 global review barrier
├─ #191 Users SDD ────┐
│                     ├─> joint child-SDD review ─> Wave 0 global review barrier
├─ #191 Skeleton SDD ─┘
└─ #281 security SDD -> #281 AGY states -> joint review
                                               └─> Wave 0 global review barrier

Wave 0 global review barrier = wp-277ec89e54a5
├─ accepted -> #302 test integration -> review -> merge/CI validation
├─ accepted -> #319 implementation chain
├─ accepted -> #320 RED/CSS/component chain
├─ accepted -> Codex derives #191 code WPs
└─ accepted -> Codex derives #281 code WPs
```

At most one discovery SDD from all B2 and B3 trains may join Wave 0. It gets a
separate issue and cannot produce code. Parent #391 remains open through every
B0 merge and receives B0 links and receipts.

B0 writers use separate branches and produce four independent commits. Writer
commits depend only on the merged plan and never on `B0-REVIEW`. Orchestrator
combines all four commits on one B0 integration branch. `B0-REVIEW` then
reviews that integrated four-document diff once. Partial B0 truth PRs do not
merge. A Critical/Important finding goes to a fifth review-fix worker on the
integration branch, then the integrated four-document diff is re-reviewed.
Only an accepted integrated review permits the single B0 truth PR to merge.
B0 reindex and #391 comment are operational WPs after that PR merges.

### 4.1 B0 truth WPs

#### B0 name-to-ID map

This is the only valid B0 name map:

| Stable name          | Stable `wp_id`    |
| -------------------- | ----------------- |
| `B0-GAP-TRUTH`       | `wp-9bc19829c026` |
| `B0-MATRIX-TRUTH`    | `wp-e610f5ee363a` |
| `B0-ANALYTICS-TRUTH` | `wp-eae39b592b0e` |
| `B0-STUDY-TRUTH`     | `wp-477270d4b260` |
| `B0-REVIEW`          | `wp-06da92b15523` |
| `B0-REINDEX`         | `wp-cdded99a9afe` |
| `B0-391-COMMENT`     | `wp-57756f2b4ea3` |

#### `wp-9bc19829c026` — B0 gap truth

- Parent/problem: #391; gap analysis contains stale SHOULD/NICE/SKIP truth.
- Goal: reconcile every row with current `origin/main` and accepted SDD.
- Non-goals: source edits, reclassification, closure, deployment claims.
- Scope:
  `primary_file: docs/gaps/kahoot-gap-analysis-2026-07-23.md`;
  `contract_files: []`; `wiring_files: []`; fewer than 150 changed LOC.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`.
  Active profile `cursor-write`, label
  `lane/cursor-sub`, Cursor Composer 2.5, `subscription`; fallback NIM Kimi
  K2.5 -> Alibaba Qwen3 Coder Plus -> local Qwen3-Coder-30B -> paid Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-b0-truth`; no file
  collision; produces an independent writer commit that the orchestrator
  combines on the B0 integration branch before `wp-06da92b15523`.
- RED/commands: record stale rows before edit; run
  `pnpm prettier --check docs/gaps/kahoot-gap-analysis-2026-07-23.md`,
  `git diff --check`, scoped gitleaks, and common delivery gates.
- Review/rollback: different free reviewer and third review-fix worker; revert
  this document commit.
- Links: governing branch and immutable SDD links in §1; issue must add branch
  and immutable full-file links for the gap document before review.

#### `wp-e610f5ee363a` — B0 matrix truth

- Parent/problem: #391; feature matrix mixes shipped and residual claims.
- Goal: make every matrix row evidence-backed without changing classifications.
- Non-goals: implementation, feature reclassification, issue closure.
- Scope: `primary_file: docs/gaps/kahoot-feature-matrix-2026.md`;
  `contract_files: []`; `wiring_files: []`; fewer than 150 changed LOC.
- Generated route: `agent-or`, `openai/gpt-oss-120b`, free; generated fallback
  `agent-kilo-free -> agent-pollinations-reasoner -> agent-claude`. Active
  profile `nim-write`, label `lane/nim-free`, NVIDIA NIM Kimi K2.5, `free`;
  fallback
  Alibaba Qwen3 Coder Plus -> Cerebras GLM-4.7 -> local Qwen3-Coder-30B ->
  paid Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-b0-truth`; independent
  file; produces an independent writer commit for the B0 integration branch.
- RED/commands: list unsupported matrix claims before edit; run
  `pnpm prettier --check docs/gaps/kahoot-feature-matrix-2026.md`,
  row-completeness comparison against master SDD, diff/gitleaks/common gates.
- Review/rollback/links: independent provider; revert document commit; add
  branch and immutable matrix full-file links before review.

#### `wp-eae39b592b0e` — B0 analytics truth

- Parent/problem: #391; host analytics SDD understates shipped response,
  aggregate, CSV, and streak behavior.
- Goal: correct stale statements only.
- Non-goals: analytics code, new KPIs, schema or UI changes.
- Scope: `primary_file: docs/design/host-analytics-sdd.md`;
  `contract_files: []`; `wiring_files: []`; fewer than 150 changed LOC.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  profile `cursor-write`: `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-b0-truth`; independent
  file; produces an independent writer commit for the B0 integration branch.
- RED/commands: capture each stale claim and source receipt; run
  `pnpm prettier --check docs/design/host-analytics-sdd.md`, diff, gitleaks,
  and common delivery gates.
- Review/rollback/links: reviewer verifies current source and tests; revert
  document commit; add branch and immutable analytics SDD links.

#### `wp-477270d4b260` — B0 study/practice truth

- Parent/problem: #391; study/practice SDD does not match shipped behavior.
- Goal: document shipped Study and Practice modes without new scope.
- Non-goals: mode implementation, copy/UI changes, reopening closed work.
- Scope: `primary_file: docs/design/study-practice-modes-sdd.md`;
  `contract_files: []`; `wiring_files: []`; fewer than 150 changed LOC.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  profile `nim-write`: `lane/nim-free`, NVIDIA NIM Kimi K2.5, `free`; fallback
  Alibaba Qwen3 Coder Plus -> Cerebras GLM-4.7 -> local Qwen3-Coder-30B-A3B ->
  paid OpenRouter Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-b0-truth`; independent
  file; produces an independent writer commit for the B0 integration branch.
- RED/commands: record stale statements; run
  `pnpm prettier --check docs/design/study-practice-modes-sdd.md`, diff,
  gitleaks, and common delivery gates.
- Review/rollback/links: independent provider; revert document commit; add
  branch and immutable study/practice SDD links.

#### `wp-06da92b15523` — B0 independent truth review

- Originating task: “Read-only cross-check all four B0 truth documents and
  every issue #391 matrix row against then-current origin/main; report Critical
  and Important mismatches; change no files.”
- Parent/problem/goal: #391; prevent stale truth from merging; pass/fail each
  document and each matrix row.
- Non-goals/scope: no edits or comments; `primary_file: null`;
  `operational_manifest`: four files above plus #391 and `origin/main`;
  `contract_files: []`; `wiring_files: []`.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free;
  generated fallback `agent-local-ov -> agent-ali-coder ->
agent-cerebras-coder`. Active profile `free-review`, label
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`.
- Dependency/parallel/collision: B0 integration branch containing all four
  independent truth commits; serialized after integration and before the
  single B0 truth PR merge.
- Verification: inspect the integrated immutable four-document diff and current
  main; report exact lines, severity, evidence, and one pass/fail verdict for
  the integrated truth set. Common read-only gates apply.
- Review separation/rollback/links: reviewer differs from all authors; no
  rollback; report contains branch and immutable links for all four files.

#### `wp-cdded99a9afe` — B0 GitNexus reindex

- Originating task: “Reindex GitNexus after B0 truth PR merge and verify indexed
  lastCommit equals exact merged origin/main SHA; change no repository files.”
- Parent/goal/non-goals: #391; establish graph receipt only; no repo or issue
  mutation.
- Scope: `primary_file: null`;
  `operational_manifest: [origin/main, GitNexus index]`;
  `contract_files: []`; `wiring_files: []`.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free;
  generated fallback `agent-local-ov -> agent-ali-coder ->
agent-cerebras-coder`. Active profile `ops-free`: `lane/local-free`, local
  Qwen3-Coder-30B-A3B, `local`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder
  Plus -> paid OpenRouter Kimi K3.
- Dependency/order: accepted B0 review and merged B0 truth PR.
- Commands: fetch `origin/main`, record `git rev-parse origin/main`, run
  GitNexus reindex, query status, compare exact SHA; fail on mismatch.
- Review/rollback/links: orchestrator independently verifies receipt; no
  rollback; attach merged immutable full-file links.

#### `wp-57756f2b4ea3` — B0 #391 evidence comment

- Originating task: “Post merged B0 full-file links, immutable commit links,
  review receipt, and GitNexus reindex receipt to Gitea issue #391; keep #391
  open; change no repository files.”
- Parent/goal/non-goals: #391; publish evidence without closing or changing
  repository state.
- Scope: `primary_file: null`;
  `operational_manifest: [Gitea issue #391, four merged files, review report, GitNexus receipt]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active profile `ops-free`, label
  `lane/local-free`, local Qwen3-Coder-30B-A3B, `local`; fallback NIM ->
  Alibaba -> paid Kimi K3.
- Dependency/order: `wp-cdded99a9afe`; serialized last in B0.
- Verification: read comment back; verify four branch links, four immutable
  full-file links, merge SHA, review and reindex receipts; #391 stays open.
- Review/rollback: orchestrator reviews exact comment before posting; correct
  with follow-up comment, never delete history.

Already-closed #392 and #393 have no closure WP.

### 4.2 #302 blocking CI WPs

#### `wp-51c3dba89a8b` — CI workflow

- Parent/problem: #302; current design-lint shell masks real failures.
- Goal: make design lint fail CI on a real lint failure while a genuinely
  absent optional binary produces an explicit safe skip.
- `primary_file: .gitea/workflows/ci.yml`
- `contract_files: []`
- `wiring_files: []`
- Non-goals: no token baseline edit, no UI edit, no hook installation.
- Limit: fewer than 30 changed LOC.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  profile `cursor-write`, `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-302-writers`; no shared file
  with hook writer; integration serialized afterward.
- RED/verification: prove current command masks a fake nonzero linter exit.
- Commands: parse workflow with existing YAML tool; execute extracted shell
  block with fake missing and failing binaries; `git diff --check`; gitleaks;
  common gates including `claude-wp-verify`.
- Acceptance: no `continue-on-error`, `|| true`, or error-masking `|| echo`.
- Review/delivery/rollback: independent `wp-edb8ddd6c2d6`; third provider fixes
  findings; revert workflow commit; issue includes governing SDD plus workflow
  branch and immutable full-file links; PR/mirror/CI/deploy closeout per §2.4.

#### `wp-77cb237a91e4` — guarded post-merge script

- Parent/problem: #302; learning receipt exists as intent but no safely bounded
  manually installable script.
- Goal: add a manually installable learning recorder that runs only on exact
  `main` and records exact `HEAD`.
- `primary_file: scripts/design-learn-postmerge.sh`
- `contract_files: []`
- `wiring_files: []`
- Non-goals: no automatic hook installation, credentials, network target, or
  other-repo mutation.
- Limit: fewer than 80 LOC.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  profile `local-write`, label `lane/local-free`, OpenVINO
  Qwen3-Coder-30B-A3B-int4, `local`; fallback NVIDIA NIM Kimi K2.5 -> Alibaba
  Qwen3 Coder Plus -> paid OpenRouter Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-302-writers`; independent
  of CI workflow; integration serialized after both.
- RED/verification: harness proves non-main and detached HEAD record nothing.
- Commands: `bash -n scripts/design-learn-postmerge.sh`; temp-repo harness for
  exact main, non-main, detached HEAD, missing recorder, and paths with spaces;
  diff/gitleaks/common gates.
- Acceptance: fake recorder sees exactly current SHA only on main.
- Review/delivery/rollback: `wp-edb8ddd6c2d6`; third provider fixes; revert
  script commit; issue contains branch and immutable script links plus SDD
  links; no automatic installation during deploy.

Both writers run in parallel. Integration waits for `wp-cabdaf0bf64a`.

### 4.3 #319 RED test

#### `wp-809d42ff1e38`

- Parent/problem: #319; MultiSelect lacks explicit selected/disabled hierarchy
  parity and focused coverage.
- Goal: produce focused RED evidence for MultiSelect selected/disabled parity.
- `primary_file: packages/web/src/features/game/components/answers/MultiSelectGrid.test.tsx`
  (repo inspection found no existing MultiSelect test).
- `contract_files: []`
- `wiring_files: []`
- Non-goals: no production component or CSS change.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  profile `cursor-write`, label `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/parallel/collision: plan merge; `wave0-tests`; test file is
  exclusive; blocks implementation.
- RED command: run the focused web Vitest command selected from package scripts
  with this exact file and capture expected failures. If node-only Vitest cannot
  mount required behavior, stop and promote a pure render/helper or Stagehand
  test strategy through an issue comment; do not add unapproved jsdom tooling.
- Acceptance: current main fails for missing explicit selected ARIA state,
  selected emphasis after disable, unselected-only dimming, and stable geometry;
  existing click/submit behavior remains characterized.
- Gates/review/rollback/links: focused RED plus `pnpm verify`, diff, gitleaks,
  GitNexus/common gates; implementation author cannot author this test; revert
  test commit; add branch and immutable test full-file links.

Implementation `wp-954db36b1a96` remains blocked until this RED receipt exists.

### 4.4 #320 design spec

#### `wp-d4213d11d0dd`

- Parent/problem: #320; slider has no accepted semantic, visual, responsive,
  locale, or browser contract.
- Goal: write complete slider design artifact; no production code.
- `primary_file: docs/design/gameui-slider-control.md`
- `contract_files: []`
- `wiring_files: []`
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Required
  active profile `agy-design`, label `lane/agy-design`, AGY Gemini 3.6 Flash,
  `subscription`, only after successful quota preflight.
- Required content: semantic native-range markup, mapped tokens, component and
  consumer inventory, min/mid/max clamp math, 32px minimum thumb, 44px primary
  interaction target, focus/disabled/submitted/reduced-motion/long-unit states,
  `de/en/es/fr/it/zh` copy inventory, test IDs, 375/390/440 wireframes, desktop
  behavior, browser checklist, and forbidden patterns.
- Non-goals: no React, CSS, locale, data-contract, scoring, or protocol edits.
- Exact production predecessor: merged master SDD and parent issue #320 in
  accepted design-ready state, plus successful AGY preflight.
- Exact production successor: independent design review
  `wp-756582782e29`; after that review and global Wave 0 acceptance barrier
  `wp-277ec89e54a5`, RED test `wp-b8a1ad4e4c28`.
- Dependency/parallel/collision: plan merge; exclusive design file; no #320
  production or test implementation starts before both successors accept it.
- Commands: Prettier check, token-name cross-check, `git diff --check`, scoped
  gitleaks, common gates.
- Review/delivery/rollback: independent `wp-756582782e29`; different provider
  fixes; full branch and immutable spec links; revert spec commit.

### 4.5 #191 child SDDs

#### `wp-7d83b3bec100` — Users structural SDD

- Parent/problem/goal: #191; 948-line `ConfigUsers.tsx` mixes API, state,
  filters, rows, dialogs, and security rules; freeze a behavior-preserving,
  collision-safe extraction DAG.
- `primary_file: docs/planning/p6-users-structural-tail-sdd.md`
- Scope: freeze DOM, copy, test IDs, self/last-admin security behavior, exact
  API paths, generator hazards, test strategy, file ownership, and serialized
  parent wiring.
- Required split: API, bulk hook, CRUD hook, filter, row, list, reset dialog,
  form fields, create dialog, parent check, browser, and security review.
- Stop if `ConfigUsers.tsx` cannot reach orchestration-only 250–300 LOC without
  a catch-all extraction or visible change.
- Non-goals: code extraction, visual changes, edits to
  `configurations/index.tsx` or `ConfigDev.tsx`.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  profile `cursor-write`: `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/collision: plan merge; `wave0-191-sdds`; separate file from
  Skeleton; joint review before any code derivation.
- Commands/review/rollback/links: Prettier, repository evidence links, diff,
  gitleaks, common gates; `wp-410ffe91be14`; third worker fixes; revert SDD
  commit; add branch and immutable child-SDD links.

#### `wp-cbb022ccf2d2` — Skeleton structural SDD

- Parent/problem/goal: #191; `ConfigSkeleton.tsx` mixes drafts, transfer, and an
  unresolved client-ID versus Rust DB-session/Bearer contract; freeze safe
  extraction before code.
- `primary_file: docs/planning/p6-skeleton-structural-tail-sdd.md`
- Scope: freeze DOM/copy/test IDs and decide current `getClientId()` versus Rust
  DB-session/Bearer mismatch before extraction.
- Preferred contract: use existing `fetchWithAuth` for import/export unless
  evidence requires a separate bug WP.
- Required split: draft RED/helper/hook, transfer RED/helper/hook, parent check,
  browser, and security review.
- Stop if auth remains ambiguous or `ConfigSkeleton.tsx` cannot reach roughly
  300 orchestration lines without behavior drift.
- Non-goals: implementation, visible change, new auth mechanism.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  profile `nim-write`: `lane/nim-free`, NVIDIA NIM Kimi K2.5, `free`; fallback
  Alibaba Qwen3 Coder Plus -> Cerebras GLM-4.7 -> local Qwen3-Coder-30B-A3B ->
  paid OpenRouter Kimi K3.
- Dependency/collision: plan merge; `wave0-191-sdds`; joint review before code.
- Commands/review/rollback/links: Prettier, source/API contract evidence, diff,
  gitleaks, common gates; `wp-410ffe91be14`; third worker fixes; revert SDD;
  branch and immutable child-SDD links required.

#### `wp-410ffe91be14` — #191 joint child-SDD review

- Parent/problem/goal: #191; ensure both SDDs can be executed by cold agents
  without hidden test, generator, auth, ownership, or collision decisions.
- Non-goals/scope: read-only; `primary_file: null`;
  `operational_manifest: [p6-users-structural-tail-sdd.md, p6-skeleton-structural-tail-sdd.md, relevant source and package scripts]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active profile `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependencies/order: both immutable child SDD commits; serialized before Codex
  derives any implementation WP.
- Verification: resolve node-only Vitest strategy, generator hazards,
  authentication, default exports, excluded parent files, wiring serialization,
  exact child inventory, and roughly 300-line parents; report exact lines and
  Critical/Important/Minor verdicts.
- Separation/rollback/links: different provider from both authors; third
  provider fixes; no rollback; report links both branch and immutable files.

### 4.6 #281 security and visible-state specs

#### `wp-c21a3b35a9be` — socket-role security SDD

- Parent/problem/goal: #281; Socket.IO accepts untrusted role claims across
  multiple entry points; freeze authorization and atomic one-role ownership
  before implementation.
- `primary_file: docs/design/socket-role-exclusivity-sdd.md`
- Scope: claimed versus verified role, manager/player/display authorization,
  atomic transition and rollback, listener/room ownership, raw-client
  compatibility, HandlerCtx policy, every Rust role entry, and MCP/E2E clients.
- Satellite rule: `satellite_manager_control` is capability, not display or
  manager role; display pairing remains independent in `PAIRING_REGISTRY`.
- Security stop: no implementation while authorization, rollback, or raw-client
  migration is ambiguous.
- Non-goals: Rust/web edits, visible design invention, role migration.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  profile `cursor-write`: `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3; Codex accepts architecture.
- Dependency/order: plan merge; precedes AGY state contract; exclusive security
  file; joint review blocks all #281 code.
- Commands/review/rollback/links: Prettier, handler/client matrix completeness,
  GitNexus evidence, diff, gitleaks, common gates; `wp-990421df98ac`; independent
  security review-fix; revert SDD; full branch and immutable links.

#### `wp-4de90a550062` — role-transition design states

- Parent/problem/goal: #281; users need deterministic visible feedback when
  verified role transition succeeds, is denied, reconnects, rolls back, or
  cleanup fails.
- `primary_file: docs/design/socket-role-transition-states.md`
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Required
  active profile `agy-design`: `lane/agy-design`, AGY Gemini 3.6 Flash,
  `subscription`; fallback Cursor Composer 2.5 design-only -> Alibaba Qwen3.6
  Flash design-only -> paid OpenRouter Kimi K3 design-only; dispatch after AGY
  preflight.
- Scope/content: initialize, transition, success, denied, reconnect, rollback,
  and cleanup-failed states; manager/player/display/satellite distinctions;
  purpose and flow; annotated semantic markup; mapped token inventory; exact
  consumers and preserved integration points; generator command; default,
  loading, empty, error, success, disabled, submitted states; 375/390/440 player
  wireframes plus 1920×1080 and 3840×2160 display states; keyboard, focus,
  screen-reader, reduced motion, contrast; 44px targets; six-locale inventory;
  stable test IDs; forbidden patterns; browser checklist.
- Security boundary: consume accepted claimed-versus-verified, atomic rollback,
  satellite capability, and `PAIRING_REGISTRY` policies; invent none.
- Non-goals: production/security code, payload changes, authorization decisions.
- Exact production predecessor: accepted immutable socket-role exclusivity SDD
  `wp-c21a3b35a9be`.
- Exact production successor: joint artifact review `wp-990421df98ac`; only
  that accepted review followed by global Wave 0 acceptance barrier
  `wp-277ec89e54a5` permits Codex to derive #281 production WPs.
- Dependency/collision: exclusive design file; joint review blocks code.
- Commands/review/rollback/links: Prettier, token/consumer cross-check, diff,
  gitleaks, common gates; `wp-990421df98ac`; different provider fixes; revert
  design commit; branch and immutable full-file links required.

#### `wp-990421df98ac` — #281 joint security/design review

- Parent/problem/goal: #281; prove security and visible transition contracts
  agree before shared contracts or handlers change.
- Non-goals/scope: read-only; `primary_file: null`;
  `operational_manifest: [socket-role-exclusivity-sdd.md, socket-role-transition-states.md, Rust role entries, web/MCP/E2E clients]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active profile `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependencies/order: immutable security SDD then AGY spec; serialized before
  any #281 contract, registry, Rust, web, or browser WP.
- Verification: authorization before claim; one role per SocketId; atomic
  rollback; every role entry; satellite and pairing semantics; raw clients;
  accessibility; test IDs; collision ownership; exact line findings.
- Separation/rollback/links: reviewer differs from both authors; third provider
  fixes; no rollback; report contains both branch and immutable full-file links.

### 4.7 Wave 0 independent review

#### `wp-277ec89e54a5`

- Parent/problem/goal: #427 and #391; read-only cross-review of all Wave 0
  specs and truth artifacts so inconsistent scope, collisions, or escaped child
  gates cannot enter implementation.
- Non-goals/scope: no edits or operational mutations; `primary_file: null`;
  `operational_manifest: [all Wave 0 immutable artifacts, master SDD, then-current origin/main]`;
  `contract_files: []`; `wiring_files: []`.
- Reviewer must come from a provider different from each artifact's author.
  Output:

- pass/fail per artifact;
- Critical, Important, and Minor findings with exact lines;
- contract collision and missing-consumer audit;
- confirmation that no code WP escaped a required child-SDD gate.

Generated route: `agent-or-vision-free`,
`nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
`agent-or -> agent-gemini -> agent-agy`. Active profile `free-review`,
`lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
`primary_file: null`; operational manifest is every Wave 0 immutable artifact;
arrays empty. It depends on all Wave 0 artifacts selected for the wave, runs
alone, edits nothing, and publishes line-specific report links. No deploy or
rollback exists. Critical/Important findings route to workers different from
authors and reviewer, then this review reruns.

This WP is the global Wave 0 acceptance barrier. It runs after every selected
artifact-specific review: integrated B0 truth review, #320 design review, #191
joint child-SDD review, #281 joint security/design review, plus accepted #302
writer artifacts and #319 RED evidence. No Wave 1 production or test
implementation starts before this barrier passes. Its exact successors are
`wp-cabdaf0bf64a`, `wp-954db36b1a96`, `wp-b8a1ad4e4c28`, and
`wp-0750f2440b08`; it also unlocks Codex derivation of #191 and #281
implementation WPs.

Verification commands: fetch then-current `origin/main`; inspect every
immutable diff; run Prettier checks for Markdown artifacts, `git diff --check`
and scoped gitleaks for writer branches; compare all contract/wiring arrays and
full-file links; change no files.

## 5. Wave 1: integration and bounded implementation

Wave 1 has one global predecessor: accepted Wave 0 barrier
`wp-277ec89e54a5`. Parent-local ordering still applies after that barrier:
#302 integrates after both writers return, #319 implements after RED, and #320
starts RED/CSS only after AGY spec review.

### 5.1 #302 integration chain

#### `wp-cabdaf0bf64a` — #302 integration tests

Status: **registry stub — not dispatchable**.

- Parent/problem/goal: #302; integrate independent tests for workflow
  failure/skip behavior and exact-main hook behavior.
- Non-goals: production workflow/script edits, hook installation, network.
- Scope: `primary_file: unresolved`; `contract_files: []`;
  `wiring_files: []`; candidate must be an existing test manifest or one new
  focused harness under 150 LOC.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Planned
  active profile `cursor-write`: `lane/cursor-sub`, Cursor Composer 2.5,
  `subscription`; fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependencies/collision: accepted global Wave 0 barrier
  `wp-277ec89e54a5` and both #302 writer commits; serialized with their
  integration branch.
- Promotion gate: inspect accepted writer diffs and package/CI test conventions;
  pin exact test `primary_file`, exact command, branch/full-file links, and
  changed-LOC limit in #302 before dispatch. Orchestrator reruns generator if
  task wording changes.
- Pre-dispatch commands: none. After promotion, issue must name one exact
  harness command plus YAML parse, fake-lint, `bash -n`, diff, gitleaks,
  GitNexus, and `claude-wp-verify` commands before dispatch.
- Required RED/acceptance: fake linter nonzero propagates; missing optional
  binary skips; YAML parses; `bash -n`; exact main records exact SHA; non-main
  and detached record nothing.
- Review/delivery: `wp-edb8ddd6c2d6`; third worker fixes; revert test commit;
  common GitNexus/verify/PR/mirror/deploy closeout after promotion.

#### `wp-edb8ddd6c2d6` — #302 independent review

- Parent/problem/goal: #302; catch failure masking, unsafe installation,
  secrets, network scope, and unrelated edits before merge.
- Non-goals/scope: read-only; `primary_file: null`;
  `operational_manifest: [.gitea/workflows/ci.yml, scripts/design-learn-postmerge.sh, promoted test file]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependencies/order: promoted tests green; serialized before merge.
- Commands/evidence: read immutable diffs; rerun YAML/fake-lint and shell
  harness; report exact line/severity; `git diff --check`; gitleaks.
- Separation/rollback/links: reviewer differs from three authors; third
  provider fixes; no review rollback; report links all branch/immutable files.

#### `wp-fafd16e45af6` — #302 Gitea CI validation

- Parent/problem/goal: #302; prove merged CI blocks a deliberate design-lint
  failure and clean main passes.
- Non-goals/scope: no repository edit; `primary_file: null`;
  `operational_manifest: [merged Gitea workflow, failing fixture run, clean main run]`;
  arrays empty.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  `ops-free`, `lane/local-free`, local Qwen3-Coder-30B-A3B, `local`; fallback
  NVIDIA NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> paid OpenRouter Kimi K3.
- Dependency/order: accepted review and merged PR.
- Commands/evidence: trigger bounded failing fixture without merging it; record
  immutable failed-run URL; revert fixture; run clean main; record pass URL and
  exact SHA; verify `/healthz` if deployment ran.
- Separation/rollback/links: orchestrator verifies both receipts; workflow PR
  revert is rollback; issue links workflow branch/commit, PR, runs, mirror,
  deployed SHA, GitNexus reindex, then closes.

### 5.2 #319 implementation chain

#### `wp-954db36b1a96` — #319 MultiSelect implementation

- Parent/problem/goal: #319; selected tiles lose hierarchy when disabled and do
  not expose explicit selected state; make `MultiSelectGrid` match `ChoiceGrid`
  without geometry change.
- Non-goals: other answer modes, global CSS, data contracts, copy, animation
  redesign.
- Scope:
  `primary_file: packages/web/src/features/game/components/answers/MultiSelectGrid.tsx`;
  `contract_files: []`; `wiring_files: []`; fewer than 60 changed LOC.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `cursor-write`, `lane/cursor-sub`, Cursor Composer 2.5, `subscription`;
  fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependencies/parallel/collision: accepted RED `wp-809d42ff1e38` and accepted
  global Wave 0 barrier `wp-277ec89e54a5`; exclusive component ownership;
  serialized before review.
- RED/commands: rerun exact focused MultiSelect test and preserve pre-fix RED
  receipt; run focused green test, TypeScript/web checks, `pnpm verify`, full UI
  token chain, GitNexus/diff/gitleaks/`claude-wp-verify`.
- Acceptance: explicit selected ARIA state; selected ring/emphasis survives
  disable; only unselected options dim; no tile size/position shift; click and
  submit semantics unchanged.
- Separation/rollback/links: test and implementation authors differ; review
  `wp-6dd51fe238c9`; third worker fixes; revert component commit; branch and
  immutable component/test links plus SDD links required.

#### `wp-6dd51fe238c9` — #319 independent review

- Parent/goal/non-goals: #319; verify ChoiceGrid parity, test validity, tokens,
  accessibility, and no unrelated drift; read-only.
- Scope: `primary_file: null`;
  `operational_manifest: [MultiSelectGrid.tsx, MultiSelectGrid.test.tsx, ChoiceGrid.tsx, diff]`;
  arrays
  empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependency/order: implementation green; serialized before browser QA.
- Commands/evidence: focused test, `pnpm verify`, UI token chain, immutable
  diff; exact findings. Reviewer differs from test and implementation authors;
  third provider fixes; report links all files; no rollback.

#### `wp-55143eec640c` — #319 browser QA

- Parent/problem/goal: #319; prove real solo/multiplayer, keyboard,
  submitted/disabled, and responsive behavior.
- Non-goals/scope: read-only browser run; `primary_file: null`;
  `operational_manifest: [built web app, solo and multiplayer MultiSelect, screenshots, console/network logs]`;
  arrays empty.
- Generated route: `agent-computeruse`, `playwright-chromium-headless`, free;
  generated fallback `agent-or-coder-plus -> agent-codex -> agent-deerflow`.
  Active `browser-qa`, `lane/free-alt`, Stagehand/Mistral free, `free`;
  fallback Cursor Composer 2.5 browser -> NVIDIA NIM Kimi K2.5 -> paid
  OpenRouter Kimi K3.
- Dependencies/collision: accepted review; exclusive browser profile/ports.
- Commands/evidence: project Stagehand command with env-only `E2E_PW`; 375×667,
  390×844, 440×956; keyboard selection and submission; screenshots; zero new
  console errors. Missing credential is blocked.
- Separation/rollback/links: QA differs from authors/reviewer; fixes go to third
  worker; no browser rollback; attach immutable component/test/report links.

#### `wp-5e3c80e61110` — #319 production validation

- Parent/problem/goal: #319; prove reviewed commit is deployed and real
  MultiSelect flow works.
- Non-goals/scope: no repo edit; `primary_file: null`;
  `operational_manifest: [deployment SHA, healthz, solo/MP smoke, logs]`; arrays
  empty.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `ops-free`, `lane/local-free`, local Qwen3-Coder-30B-A3B, `local`, then
  browser profile for UI smoke.
- Dependency/order: merged PR and deploy; serialized production slot.
- Commands/evidence: compare deployed SHA to merge SHA; `/healthz`; env-only
  real solo/MP MultiSelect smoke; logs; GitNexus reindex. Roll back deployment
  to previous SHA on failure; attach full links, PR/mirror/deploy receipts and
  close #319 only after pass.

### 5.3 #320 implementation chain

#### `wp-756582782e29` — #320 AGY design review

- Parent/problem/goal: #320; ensure AGY artifact fully specifies semantic,
  responsive, token, locale, A11y, consumer, and browser contracts.
- Non-goals/scope: read-only; `primary_file: null`;
  `operational_manifest: [gameui-slider-control.md, current SliderInput.tsx, index.css quiz-range block, locale files]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependency/order: immutable AGY spec; blocks RED/CSS/component.
- Commands/evidence: Prettier/token/consumer/locale cross-check and exact line
  findings. Reviewer differs from AGY author; third provider fixes; report
  contains branch and immutable spec links; no rollback.

#### `wp-b8a1ad4e4c28` — #320 SliderInput RED test

- Parent/problem/goal: #320; establish test-first contract for min/mid/max,
  unit, `aria-valuetext`, disabled, canonical copy, and clamped output.
- Non-goals: component, CSS, locale, protocol edits.
- Scope:
  `primary_file: packages/web/src/features/game/components/answers/SliderInput.test.tsx`;
  `contract_files: []`; `wiring_files: []`; fewer than 150 LOC.
- Generated route: `agent-claude`, `claude-sonnet-4-6`, not free; generated
  fallback `agent-or-coder-plus -> agent-codex -> agent-computeruse`. Active
  `cursor-write`, `lane/cursor-sub`, Cursor Composer 2.5, `subscription`;
  fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/collision: accepted spec review and global Wave 0 barrier
  `wp-277ec89e54a5`; exclusive test file; blocks component. CSS may start only
  after the same review and barrier.
- RED/commands: focused web Vitest; if node-only environment cannot render this
  component, stop and promote pure render/helper or Stagehand strategy without
  adding jsdom implicitly; capture RED; run TypeScript/diff/gitleaks/common
  gates.
- Separation/rollback/links: implementation author differs; third reviewer/fix;
  revert test commit; add branch/immutable test and spec links.

#### `wp-0750f2440b08` — #320 slider CSS

- Parent/problem/goal: #320; current native slider thumb/focus/disabled style
  must meet accepted AGY contract across WebKit and Firefox.
- Non-goals: component, locale, protocol, global unrelated selectors.
- Scope: `primary_file: packages/web/src/index.css`; only `.quiz-range` block;
  `contract_files: []`; `wiring_files: []`; fewer than 60 changed LOC.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `nim-write`, `lane/nim-free`, NVIDIA NIM Kimi K2.5, `free`; fallback Alibaba
  Qwen3 Coder Plus -> Cerebras GLM-4.7 -> local Qwen3-Coder-30B-A3B -> paid
  OpenRouter Kimi K3.
- Dependency/collision: accepted spec review and global Wave 0 barrier
  `wp-277ec89e54a5`; exclusive global CSS ownership; must merge before broad B3
  styling and before #320 component integration.
- Commands: CSS parser/build, `pnpm verify`, full token chain, browser static
  inspection, GitNexus/diff/gitleaks/common gates.
- Acceptance/review/rollback/links: 32px minimum thumb, 44px interaction target
  where specified, mapped tokens, focus/disabled/reduced-motion; reviewed in
  `wp-cb630c705425`; third worker fixes; revert CSS commit; branch/immutable CSS
  and spec links.

#### `wp-4245abf40d23` — #320 SliderInput component

- Parent/problem/goal: #320; implement accepted semantic clamping, unit,
  accessible value text, and canonical submit copy while retaining native range.
- Non-goals: CSS, locale, scoring/protocol, other answer components.
- Scope:
  `primary_file: packages/web/src/features/game/components/answers/SliderInput.tsx`;
  `contract_files: []`; `wiring_files: []`; fewer than 90 changed LOC.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `cursor-write`, `lane/cursor-sub`, Cursor Composer 2.5, `subscription`;
  fallback NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> local
  Qwen3-Coder-30B-A3B -> paid OpenRouter Kimi K3.
- Dependency/collision: accepted RED and CSS contract; exclusive component;
  follows CSS integration.
- Commands: focused SliderInput test, TypeScript, `pnpm verify`, full token
  chain, GitNexus/diff/gitleaks/common gates.
- Acceptance/review/rollback/links: native range, clamped min/mid/max output,
  semantic ARIA/unit/copy, no protocol drift; `wp-cb630c705425`; third worker
  fixes; revert component commit; branch/immutable component/test/spec links.

#### `wp-6a7d21e7606d` — #320 locale parity

- Parent/problem/goal: #320; verify canonical `game:submitAnswer` exists in all
  six locales after component integration.
- Non-goals/scope: read-only unless separate real-gap WP is approved;
  `primary_file: null`;
  `operational_manifest: [packages/web/src/locales/{de,en,es,fr,it,zh}/game.json]`;
  arrays empty.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `ops-free`, `lane/local-free`, local Qwen3-Coder-30B-A3B, `local`; fallback
  NVIDIA NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> paid OpenRouter Kimi K3.
- Dependency/order: component commit; serialized before integrated review.
- Commands/evidence: parse all JSON, compare key/value presence, run locale
  parity script. Current inspection shows key present in all six; do not edit
  without contrary evidence. Report immutable locale and component links; no
  rollback.

#### `wp-cb630c705425` — #320 integrated review

- Parent/problem/goal: #320; independently review spec, RED validity, CSS,
  component, locale evidence, accessibility, and scope.
- Non-goals/scope: read-only; `primary_file: null`;
  `operational_manifest: [slider spec, test, index.css block, SliderInput.tsx, locale report]`;
  arrays empty.
- Generated route: `agent-or-vision-free`,
  `nvidia/nemotron-nano-12b-v2-vl:free`, free; generated fallback
  `agent-or -> agent-gemini -> agent-agy`. Active `free-review`,
  `lane/free-alt`, Alibaba Qwen3.6 Flash, `free`; fallback NVIDIA Nemotron Super
  49B -> Cerebras GLM-4.7 -> paid OpenRouter Kimi K3.
- Dependency/order: integrated CSS/component and locale report; blocks browser.
- Commands/evidence: focused tests, `pnpm verify`, full token chain, immutable
  diff, exact line findings. Reviewer differs from all writers; third provider
  fixes; report links all full files; no rollback.

#### `wp-0b49f236836b` — #320 browser QA

- Parent/problem/goal: #320; prove solo and multiplayer slider behavior at
  min/mid/max, long unit, keyboard, no CLS, responsive and desktop states.
- Non-goals/scope: read-only browser run; `primary_file: null`;
  `operational_manifest: [built app, slider flows, screenshots, console/network logs, CLS trace]`;
  arrays empty.
- Generated route: `agent-computeruse`, `playwright-chromium-headless`, free;
  generated fallback `agent-or-coder-plus -> agent-codex -> agent-deerflow`.
  Active `browser-qa`, `lane/free-alt`, Stagehand/Mistral free, `free`;
  fallback Cursor Composer 2.5 browser -> NVIDIA NIM Kimi K2.5 -> paid
  OpenRouter Kimi K3.
- Dependency/collision: accepted integrated review; exclusive browser
  profile/ports.
- Commands/evidence: project Stagehand command using env-only `E2E_PW`;
  375×667, 390×844, 440×956 plus desktop; keyboard and long units; screenshots
  and zero new console errors. Missing credential is blocked.
- Separation/rollback/links: QA differs from writers/reviewer; fixes by third
  worker; attach immutable spec/test/CSS/component/review links; no browser
  rollback.

#### `wp-64880ab01ae2` — #320 production validation

- Parent/problem/goal: #320; prove exact reviewed slider commit in production,
  healthy service, and real solo/multiplayer flows.
- Non-goals/scope: no repository edit; `primary_file: null`;
  `operational_manifest: [deployment SHA, healthz, slider smokes, logs]`; arrays
  empty.
- Generated route: `agent-or-coder-plus`, `qwen/qwen3-coder`, free; generated
  fallback `agent-local-ov -> agent-ali-coder -> agent-cerebras-coder`. Active
  `ops-free`, `lane/local-free`, local Qwen3-Coder-30B-A3B, `local`; fallback
  NVIDIA NIM Kimi K2.5 -> Alibaba Qwen3 Coder Plus -> paid OpenRouter Kimi K3,
  plus `browser-qa` for flow validation.
- Dependency/order: merged reviewed PR and deploy; serialized production slot.
- Commands/evidence: exact deployed/merge SHA comparison; `/healthz`; env-only
  solo/MP min/mid/max smoke; logs; GitNexus reindex.
- Separation/rollback/links: orchestrator verifies; deploy previous SHA on
  failure; attach full files, PR/mirror/deploy receipts; close #320 only after
  pass. This production acceptance is not a global B3 gate. Accepted slider
  design and merged CSS contract are explicit predecessors only where a later
  B3 mode reuses that contract, including Confidence Rating.

## 6. Later derivation gates

Later code WPs are intentionally not generated from the umbrella. Generating
them before contract-first child SDD acceptance would invent payloads, file
ownership, and tests.

### 6.1 B2 bounded trains

Each train gets three deterministic predecessors:

1. architecture SDD;
2. AGY design spec;
3. joint architecture/security/design review.

Only then may Codex derive test, contract, Rust, web, locale, browser, deploy,
and production WPs. Delivery order:

1. participant cap;
2. connected-idle warning/finalization;
3. seeded question shuffle;
4. recovery UX after #281 production acceptance;
5. music presets;
6. PNG/PDF export and separate native-XLSX slice.

Cap, idle, and shuffle are serial because their common validators, persisted
configuration, snapshot, and `ConfigGameMode.tsx` ownership intersect.

### 6.2 B3 live modes

Order: **Word Cloud -> Brainstorm -> Confidence Rating -> Q&A ->
Micro-Lessons**. Each mode must finish contract through production before the
next begins. #320 CSS must merge before broad B3 styling. Confidence Rating
explicitly depends on the accepted slider design and merged CSS contract in
addition to Word Cloud and Brainstorm completion. Word Cloud and Brainstorm do
not depend on #320 production validation, and `wp-64880ab01ae2` is not a global
B3 production gate.

Brainstorm, Q&A, and Micro-Lessons stop at reviewed SDD unless the review proves
a bounded MVP below moderation, abuse, retention, storage, and media-lifecycle
thresholds. Otherwise each becomes a separately budgeted mission.

### 6.3 Version History

After B3, derive only the bounded content-versioning SDD and its independent
review. No production WP exists until immutable revisions, ownership,
retention, storage caps, optimistic concurrency, restore-as-new-version,
migration compatibility, audit receipts, and rollback tests are accepted.

### 6.4 B4–B6 missions

B4, B5, and B6 first produce mission charters with:

- explicit budget and kill switch;
- threat, retention, ownership, migration, and rollback contracts;
- stop conditions;
- rollback-drill WP;
- no overlapping production migration window.

B5 implementation waits for accepted B4 identity/storage contracts. B6 may
research earlier but cannot overlap Version History, B4, or B5 migrations.
Before any B6 parser design or implementation, a dedicated docs WP refreshes
`docs/design/content-import-sdd.md` within fewer than 150 changed LOC or creates
a versioned replacement. A different security/architecture reviewer must accept
that immutable refresh. Both refresh and review are hard predecessors for the
content-import intake/review AGY specs, parser threat model, and every B6 code
WP. Until Codex generates canonical IDs and exact routes for those two nodes,
they are **registry stubs — not dispatchable**.

## 7. AGY design queue

AGY writes specs only. Each file gets its own WP issue, full-file links, and
independent review:

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

Every spec follows the master SDD design contract. #191, #302, and #319 remain
documented exceptions unless their visual scope changes.

## 8. Gates for every implementation train

Focused gates come from the child SDD. Relevant project gates remain:

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

Before commit: GitNexus `detect_changes`, owned-file diff inspection,
`git diff --check`, gitleaks, and `claude-wp-verify`.

UI browser acceptance covers 375×667, 390×844, and 440×956 for player surfaces
plus applicable desktop and kiosk viewports. `E2E_PW` comes from environment;
missing value means blocked.

After review: Gitea PR, sanitized GitHub mirror, deploy, `/healthz`, deployed
SHA, affected API/socket/browser flow, routing outcome, GitNexus reindex, then
issue closure.

## 9. Issue-body template

Future issues use this order:

```markdown
## Status and ownership

canonical WP ID, legacy alias if any, parent, baseline, exact lane label

generated_route: assigned agent, task class, concrete model, free-tier flag

fallback_chain: ordered generated fallbacks

quota_class: subscription | free | local | paid-fallback

active_lane_override: exact lane label, concrete model, reason, checked-at

## Full specification links

For every governed artifact: branch full-file link and immutable commit
full-file link. A branch-name-only or directory link is invalid.

## Problem

Observed or audited gap with repository evidence

## Goal

One testable outcome

## Non-goals

Explicit exclusions

## Owned scope

primary_file or operational/read-only manifest, contract_files array,
wiring_files array, changed-LOC limit

## Dependencies and collision order

Predecessors, parallel group, serialized files, stop conditions

## TDD and acceptance

RED/characterization evidence, exact focused commands, expected behavior

## Review and gates

Independent reviewer, review-fix provider different from author and reviewer,
project/security/design gates, GitNexus impact and detect_changes,
claude-wp-verify command

## Worktree and delivery

Worktree, branch, commit, no shared-main, no direct push to main,
`claude-wp-verify --branch <branch> --base main`, Gitea PR, sanitized GitHub
mirror, deploy, production, routing outcome, GitNexus reindex, issue close

## Rollback

Smallest reversible unit and operational disable path

## Definition of done

Evidence required before issue closure
```

Short title-only issues, branch-name-only issues, and issues without full-file
links or lane metadata are invalid for this program.
