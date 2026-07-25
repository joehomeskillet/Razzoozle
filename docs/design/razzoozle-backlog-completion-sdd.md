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
| #191 | structural extraction only: `ConfigUsers` and `ConfigSkeleton`; SHIPPED & CLOSED |
| #281 | socket identity/role exclusivity across manager, player, and display; SHIPPED & CLOSED |
| #302 | make design CI gate truly blocking; add guarded post-merge learning script; SHIPPED & CLOSED |
| #319 | MultiSelect spacing, disabled hierarchy, ARIA state, focused tests; SHIPPED & CLOSED |
| #320 | slider interaction redesign, focused tests, CSS and component alignment; SHIPPED & CLOSED |
| #391 | umbrella for residual SHOULD/NICE program B0–B6; CLOSED |
| #466 | Puzzle / Sequencing Fragetyp (Kahoot Gap #1) |
| #467 | Word Cloud Fragetyp (Kahoot Gap #2) |
| #468 | Brainstorming Fragetyp (Kahoot Gap #3) |
| #469 | Confidence Rating Fragetyp (Kahoot Gap #4) |
| #470 | Micro-Lessons Fragetyp (Kahoot Gap #5) |
| #471 | Self-Paced / Assignments Play Mode (Kahoot Gap #6) |
| #472 | Ghost / Replay Mode (Kahoot Gap #7) |
| #473 | Challenge Mode (Kahoot Gap #8) |
| #474 | Q&A Live Moderation Panel (Kahoot Gap #9) |
| #475 | Lobby Music Presets (Kahoot Gap #10) |
| #476 | Seeded Question Order Randomization (Kahoot Gap #11) |
| #477 | Manager Configurable Participant Cap (Kahoot Gap #12) |
| #478 | Results Export PNG/PDF (Kahoot Gap #13) |
| #479 | Bulk Question Import CSV/Excel (Kahoot Gap #14) |
| #480 | Quiz Version History & Rollback (Kahoot Gap #15) |
| #481 | Document Content Extractor PDF/PowerPoint (Kahoot Gap #16) |

### 2.3 Complete #391 truth matrix

The following matrix is the audited line-item truth from
`audit-reliability-391-393`. `B0-REVIEW` must cross-check every row against the
then-current `origin/main`; a later status change requires a production receipt
or an explicit reclassification receipt.

#### SHOULD

| Item | Audited disposition | Owner/evidence requirement |
| --- | --- | --- |
| Drop Pin / Hotspot | SHIPPED | No WP; retain merge and production receipt |
| Matching | SHIPPED | No WP; retain merge and production receipt |
| Fill in the Blank | SHIPPED | No WP; retain merge and production receipt |
| Study / Flashcards | SHIPPED | `B0-STUDY-TRUTH`; no reimplementation |
| Practice Mode | SHIPPED | `B0-STUDY-TRUTH`; no reimplementation |
| Session Management | PARTIAL | B2 connected-idle warning/finalization |
| Music Presets | PENDING | Issue #475 (B2 music-preset train) |
| Participant Cap | PARTIAL | Issue #477 (B2 persisted manager-configurable cap; hard 200 cap already shipped) |
| Time-to-Answer Metrics | SHIPPED MVP | Existing `responseMs` and aggregate/CSV receipts; B4 may consume longitudinally |
| PowerPoint/PDF Import | PENDING | Issue #481 (B6 bounded sandboxed-ingestion mission) |
| User-visible Replay/Recovery UI | PARTIAL | B2 recovery UX, then B5 deterministic replay viewer |
| Teacher/Student/Admin | PARTIAL | B4 authenticated learner identity/capability mission |
| Puzzle / Sequencing | PENDING | Issue #466 (Puzzle/Sequencing question type) |
| Self-Paced / Assignments | PENDING | Issue #471 (Async homework assignment play mode) |
| Bulk Question Import | PENDING | Issue #479 (CSV/Excel batch question parser) |

#### NICE

| Item | Audited disposition | Owner/evidence requirement |
| --- | --- | --- |
| Word Cloud | PENDING | Issue #467 (B3 mode train) |
| Brainstorm | PENDING | Issue #468 (B3 bounded mission unless reviewed SDD proves a small MVP) |
| Diagram Labeling | SUPERSEDED by Drop Pin | No second hotspot engine; only a separately approved multi-label preset SDD may reopen scope |
| Confidence Rating | PENDING | Issue #469 (B3 mode train; may depend on #320) |
| Micro-Lessons | PENDING | Issue #470 (B3 bounded mission unless reviewed SDD proves a small MVP) |
| Ghost/Replay | PENDING | Issue #472 (B5 after deterministic replay) |
| Async Challenge | PENDING | Issue #473 (B4 identity/storage, then B5 sync/replay integration) |
| Q&A Live Moderation | PENDING | Issue #474 (B3 bounded mission unless reviewed SDD proves bounded moderation/retention) |
| Streaks & Bonus | SHIPPED | `STREAK_STEP`, hard cap 200; `B0-ANALYTICS-TRUTH` corrects stale docs |
| Randomize Questions/Answers | PARTIAL | Issue #476 (Answer order shipped and reconnect-stable; B2 seeded question order) |
| PNG/PDF Result Export | PENDING | Issue #478 (B2 sanitized deterministic export train) |
| Template Library | SHIPPED MVP | File-backed CRUD/picker/editor; never merge stale `wp/tpl1-crud` |
| Version History & Rollback | PENDING | Issue #480 (Dedicated versioned-content SDD/mission after B3) |
| Cross-Session Progress | PENDING | B4 after identity and history |
| Offline Partial | PENDING | B5 after event-log and conflict policy |
| Persistent Answer History | PARTIAL backend | B4 after identity/ownership |
| CSV/Excel Export | CSV SHIPPED; native XLSX ACCEPTED | Preserve CSV; separate bounded sanitized native-XLSX B2 slice |
| AI Question Extractor | PENDING | B6 after parser and review UI; never auto-publish |
| Question Effectiveness | PARTIAL raw stats | B4 longitudinal aggregation/UI |
| Performance Analytics/Trends | PARTIAL raw stats | B4 longitudinal aggregation/UI |

#### SKIP

These 19 consolidated rows name every deliberately excluded item from the gap
audit. They have no delivery owner:

| # | Excluded item(s) | Disposition |
| ---: | --- | --- |
| 1 | Vocabulary Review | SKIP — specialized product |
| 2 | Practice Tests | SKIP — enterprise scenario |
| 3 | Kahoot Jumble | SKIP — specialized game |
| 4 | Personalized Learning Path | SKIP — ML-heavy |
| 5 | Study Reminders | SKIP — notification/account expansion |
| 6 | Custom Report Generation | SKIP — open-ended report platform |
| 7 | Google Classroom and grade passback | SKIP — external classroom integration |
| 8 | Canvas, Blackboard, and Moodle LMS sync | SKIP — external LMS integration |
| 9 | API Reports Access and public REST/SDK access | SKIP — public platform surface |
| 10 | AI-Powered Recommendations | SKIP — speculative recommender |
| 11 | Content Sharing / Marketplace | SKIP — public marketplace |
| 12 | Collaborative Editing | SKIP — multi-author realtime platform |
| 13 | Microsoft Teams | SKIP — external collaboration integration |
| 14 | Clever, ClassCode, OneRoster, and Seesaw | SKIP — external roster/portfolio integrations |
| 15 | Zoom, Google Meet, Webex, and Slack | SKIP — external meeting/messaging integrations |
| 16 | SCORM Packaging and LMS Deep Linking | SKIP — enterprise packaging/integration |
| 17 | Zapier / Make | SKIP — external automation platform |
| 18 | Multi-organization Admin | SKIP — multi-tenant enterprise surface |
| 19 | Enterprise SSO (SAML/OIDC) | SKIP — enterprise identity integration |

### 2.4 B0 truth WPs

B0 is truth-only. Already-closed issues remain evidence rows, not scheduled
closure nodes. These exact WPs remain file-bounded and must not be combined:

| WP | Exact scope |
| --- | --- |
| `B0-GAP-TRUTH` | Update only `docs/gaps/kahoot-gap-analysis-2026-07-23.md` |
| `B0-MATRIX-TRUTH` | Update only `docs/gaps/kahoot-feature-matrix-2026.md` |
| `B0-ANALYTICS-TRUTH` | Correct only `docs/design/host-analytics-sdd.md`; `<150` changed LOC |
| `B0-STUDY-TRUTH` | Correct only `docs/design/study-practice-modes-sdd.md` to shipped truth |
| `B0-REVIEW` | Independent read-only cross-check of all four docs and every matrix row against main |
| `B0-REINDEX` | GitNexus reindex plus exact `origin/main` SHA verification |
| `B0-391-COMMENT` | Post merged truth and receipts to #391; keep it open while residual work exists |

### 2.5 Reclassification rule

“Implement everything” activates genuine SHOULD/NICE residue; it does not
silently reverse the exclusions above.

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
 ├─ bounded content Version History and Rollback train
 ├─ B4 learner identity and longitudinal data mission
 ├─ B5 deterministic replay and offline mission
 └─ B6 sandboxed document ingestion and AI extraction mission
```

### 4.1 Audited Wave 0–6 order

| Wave | Allowed work and hard ordering |
| --- | --- |
| 0 | Parallel docs/tests only: four B0 truth docs; #191 Users/Skeleton SDDs; #281 exclusivity SDD, then AGY transition-state spec, then one joint artifact security/architecture review per §5.4; #320 AGY spec; #319 RED test; #302 CI/hook; at most one B2/B3 discovery SDD |
| 1 | Gate/merge #302; implement file-disjoint #319/#320 slices; accept #191 artifact reviews; browser profiles/ports remain serialized |
| 2 | #281 common contract, registry, and role RED tests; #191 Users and Skeleton may run in parallel with their own internal wiring serialization |
| 3 | #281 Rust/web handlers, implementation security review, same-tab Stagehand, merge and deploy; B1 production acceptance is a hard predecessor for recovery and any B2 registry/login/snapshot slice |
| 4 | B2 config trains strictly `participant cap -> idle timeout -> question shuffle`; recovery only after B1; music/export code may use disjoint lanes but browser/token gates serialize |
| 5 | B3 modes one complete end-to-end train at a time |
| 6 | Accept the bounded Version History SDD; launch B4 mission; launch B5 only after B4 identity/storage contracts; B6 is separately budgeted and may discover earlier, but Version History/B4/B5/B6 production migrations cannot overlap |

Every merged train then runs independent review, project gates, PR merge,
deploy, production health/deployed-SHA/browser verification, GitNexus reindex,
and issue closure as separate operational stages.

### 4.2 Collision and mission rules

- All #191 Users WPs that wire `ConfigUsers.tsx` are sequential; both Skeleton
  hooks that wire `ConfigSkeleton.tsx` are sequential.
- #281 contract/registry precede auth/login/disconnect handlers. Web factory and
  provider precede its serialized routes/hook.
- B1 must merge and deploy before recovery UX and before affected B2
  registry/login/snapshot work.
- B2 cap, idle, and shuffle are serialized because they share validators, DB
  config, game/snapshot, and `ConfigGameMode.tsx`.
- #320 global CSS lands before broad B3 styling.
- B3 trains share unions, validators, protocol/reveal, editor, answer rendering,
  snapshot and six locale files; they run end-to-end one at a time.
- Finish #191 Users before B4, or approve a file-specific rebase plan for
  `ConfigUsers.tsx`.
- B5 depends on B4 identity/storage. Version History, B4, B5, and B6 production
  migrations never overlap.

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
- Treat the handshake `SocketRole` only as an untrusted **claimed role**. It is
  never sufficient for authorization or registry ownership.
- A manager claim becomes verified only after manager/session-token
  authentication. A player claim becomes verified only after an authorized
  game join/rejoin. A display claim becomes verified only through
  `DISPLAY.REGISTER` followed by authorized `DISPLAY.PAIR`; pairing ownership
  remains in `PAIRING_REGISTRY`.
- Model `satellite_manager_control` as a verified capability, not a
  `SocketRole`. A valid `satelliteToken` grants only the existing allowlisted
  manager-display controls (`skipQuestion`, `adjustTimer`, and `revealAnswer`);
  it does not create manager ownership, display ownership, or a
  `PAIRING_REGISTRY` record.
- A satellite kiosk may render manager presentation chrome while holding no
  role ownership. If the same socket also needs display pairing, it must
  complete the display register/pair flow independently; the capability and
  display role are then authorized and revoked independently.
- Validate every presented role credential and `satelliteToken` independently
  before mutating role ownership. Failed satellite authentication grants no
  capability and changes no registry; a failed role transition removes its
  tentative state and restores the still-valid prior role without revoking an
  independently verified capability.
- Carry the verified role and verified registry ownership in Rust handler
  context, and carry verified capabilities separately. Reject all role-specific
  events before verification and whenever verified role or ownership mismatches
  the handler. Capability-gated events require the named verified capability
  even when the socket also owns a role.
- Add an atomic registry transition/exclusivity API. It authorizes first, then
  releases the prior claim and commits the new claim as one transition; an
  unverified claim never mutates role indexes.
- Update manager auth, player login, display join, eviction, and cleanup paths.
- On failed authentication, denied join, disconnect during transition, or
  registry-commit failure, roll back the tentative claim, restore the still
  valid prior claim where safe, remove listeners/index entries created by the
  failed attempt, and return one explicit denial/error state.
- Remove listeners explicitly on route/provider teardown.
- Never fix conflict by deleting an unrelated player slot.

Required transition matrix:

| From | Claimed destination | Authorization | Atomic result |
| --- | --- | --- | --- |
| unverified | manager | Valid manager/session token | Verified manager ownership |
| unverified | player | Valid game plus join/rejoin credential | Verified player ownership |
| unverified | display | `DISPLAY.REGISTER` plus authorized `DISPLAY.PAIR` | Verified display ownership in `PAIRING_REGISTRY` |
| any verified role | another role | Fresh destination authorization | Old claim removed and new claim committed atomically |
| any | any | Missing/invalid credential or failed commit | No new ownership; rollback/cleanup is complete |

Compatibility for raw Socket.IO clients is frozen:

| Raw-client handshake/event path | Compatibility behavior |
| --- | --- |
| No `role` field, then existing authenticated manager login/reconnect/create | Infer an untrusted manager claim from that event; authenticate before atomic manager ownership |
| No `role` field, then existing player join/rejoin | Infer an untrusted player claim from that event; authorize before atomic player ownership |
| No `role` field, then existing `DISPLAY.REGISTER`/`DISPLAY.PAIR` | Infer an untrusted display claim from that flow; pair before display ownership |
| `satelliteToken`, with or without `role` | Validate token before granting only `satellite_manager_control`; never infer manager or display ownership from token |
| Explicit `role` from web, MCP, Stagehand, golden-frame, or other raw client | Treat as an untrusted claim and apply the same event-specific authorization and rollback rules |

### 5.3 Required tests

- Same `SocketId` cannot occupy two roles.
- Role transition removes old indexes atomically.
- Manager reconnect after same-tab player use succeeds.
- Unrelated player remains connected.
- Role-mismatched events are rejected.
- A self-asserted manager/display role without its required token/join
  authorization is rejected before registry mutation.
- A valid satellite token grants only allowlisted manager-display controls and
  never inserts manager/display ownership; revoking or rejecting that token
  leaves any separately paired display role unchanged.
- Legacy raw clients without a role field retain event-driven manager, player,
  and display compatibility while still authenticating before registry claim.
- Failed authorization and forced registry failure leave no dual, orphan, or
  leaked listener state and preserve an independently valid prior session.
- Web role switch creates fresh handshake and no listener leak.
- Stagehand: create game → same-tab player join → leave → manager takeover;
  manager controls visible and stale player avatar absent.

### 5.4 Ordering

```text
socket-role-exclusivity-sdd.md
  -> socket-role-transition-states.md
  -> joint independent artifact security/architecture review of both documents
  -> shared role contract
  -> registry and handler RED tests
  -> Rust implementation
  -> web provider RED tests
  -> web provider implementation
  -> route/session wiring
  -> implementation security review
  -> Stagehand and full gates
```

`docs/design/socket-role-transition-states.md` is the canonical UI artifact.
The earlier proposed alias `same-tab-role-switch-states.md` is superseded and
must not be created. The distinct backend/security predecessor is
`docs/design/socket-role-exclusivity-sdd.md`; implementation WPs are generated
only after AGY finishes the transition-state artifact and an independent joint
artifact security/architecture review accepts both documents, including handshake,
capability, transition, rollback, listener-ownership, raw-client compatibility,
and abuse contracts.

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

### 6.6 PNG/PDF and native XLSX result export

- Build deterministic sanitized export document from existing result model.
- Prevent formula/markup injection and external-resource loading.
- Keep CSV export unchanged. Native XLSX is accepted as a separate bounded
  implementation slice with cell-type/formula-injection, sheet-name, size, and
  deterministic serialization tests.
- PNG/PDF generation must be reproducible in browser and production runtime.

### 6.7 Shared configuration contract

Configuration additions must align:

- common manager types and validators;
- Rust configuration persistence;
- engine/game state and snapshot compatibility;
- join/eviction behavior;
- manager UI and six locales.

One writer per shared contract file per wave.

The participant-cap, idle-timeout, and question-shuffle trains run strictly in
that order. Each gets its own architecture SDD, AGY UI-state spec, independent
review, and file-declared implementation graph; freezing a shared convention
does not authorize their parallel implementation.

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

Before any implementation graph is derived, each mode gets its own
contract-first SDD, AGY artifact, an independent artifact security/architecture
review, and a design review. Word Cloud and Confidence Rating may continue as bounded feature trains
only after acceptance. Brainstorm, Q&A, and Micro-Lessons **must stop and
escalate to separately budgeted missions** unless their reviewed SDD proves a
small MVP below the applicable moderation, abuse, retention, storage, media
hosting, and media-lifecycle thresholds and explicitly lists every deferred
behavior. Accepted conventions do not waive this stop.

Because all five modes share question unions/validators, protocol/reveal,
editor switches, player/manager answer rendering, snapshots, and six locales,
only one mode runs from contract through production at a time.

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

B4 must provide a mission disable/read-only switch for new longitudinal writes
and challenge creation while retaining authorized export/delete and existing
gameplay. Before enablement, a separate rollback-drill WP exercises the switch,
migration down/forward or documented forward-fix path, authorization after
rollback, and row-count/ownership/deletion integrity checks.

Stop mission if identity, ownership, deletion, or retention semantics remain
ambiguous.

#191 Users must finish before B4 changes `ConfigUsers.tsx`. If that cannot
happen, B4's charter must name an explicit base SHA, rebase owner, conflict
files, characterization gates, and merge order before any overlapping WP is
issued.

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

B5 cannot begin implementation before B4 has accepted and merged learner
identity, ownership, storage, retention, and deletion contracts. B5 may not
deploy a schema/storage migration concurrently with Version History, B4, or B6.

Required testable controls:

- a persisted event/replay storage cap that rejects or evicts only according to
  the accepted retention contract;
- fail-closed replay-version rejection for unsupported schema versions;
- an operational offline-sync disable switch that leaves online play intact;
- server-enforced rate limits for replay, challenge, and sync endpoints.

Before enabling each B5 slice in production, a separate rollback-drill WP must
exercise its switch, verify no new incompatible writes occur while disabled,
verify the prior online/read path remains healthy, and record restore commands,
deployed SHA, health evidence, and data-integrity checks.

## 11. B6 — document ingestion and AI extraction mission

Only PPTX and PDF are in the parser mission scope. Refresh
`docs/design/content-import-sdd.md` before parser design or implementation in a
dedicated docs WP. The existing file is about 285 LOC; the refresh must remain
`<150` changed LOC or be replaced by a new versioned SDD, followed by an
independent artifact security/architecture review.

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

B6 receives its own parser/AI disable switch, upload and job rate limits, and
resource caps. A separate production rollback-drill WP must prove that disabling
ingestion stops new parse/extract jobs, cleans or safely preserves in-flight
temporary data per contract, leaves existing quiz editing healthy, and supports
re-enable without duplicate publication. Its migration/deployment window may
not overlap Version History, B4, or B5.

## 12. Version History and Rollback train

Version History is pending, not silently dropped and not part of B5 replay. It
gets a dedicated bounded content-versioning SDD and independent review after B3
and before migration-heavy B4/B5 deployment. The SDD must define immutable quiz
revisions, ownership/authorization, retention and storage caps, optimistic
concurrency, restore-as-a-new-version, migration compatibility, audit receipts,
and rollback tests. No direct implementation WP may be derived from this
umbrella before that SDD is accepted.

## 13. AGY design-spec contract

AGY Gemini 3.6 Flash is design-spec author, not production implementer.

Every non-exempt UI slice gets `docs/design/<slug>.md` containing:

- purpose and user flow;
- annotated semantic markup and wireframes;
- mapped token inventory;
- exact production consumers and preserved integration points;
- exact dependencies, production predecessor, and production successor;
- existing component inventory and exact generator command
  (`pnpm g:console|menu|question|display|player`);
- default, loading, empty, error, success, disabled, and submitted states;
- responsive wireframes for 375×667, 390×844, and 440×956 where player-facing;
- desktop behavior for manager/editor/results surfaces and display behavior for
  every kiosk consumer, including acceptance at 1920×1080 and 3840×2160;
- keyboard, focus, screen-reader, reduced-motion, and contrast behavior;
- minimum 44px primary interaction targets and no state conveyed by color alone;
- locale/copy inventory for `de`, `en`, `es`, `fr`, `it`, and `zh`;
- proposed and preserved stable test IDs;
- explicit forbidden patterns;
- browser acceptance checklist.

Production coding begins only after AGY artifact passes design review.

### 13.1 Design artifact queue

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

## 14. Worker-derived micro-WP contract

Workers derive WPs from this SDD. Orchestrator reviews split quality before
dispatch.

Each WP must include:

- stable `wp_id`, task class, assigned lane, model, and fallback chain;
- exactly one declared `primary_file` for a normal implementation WP;
- explicit predeclared `contract_files` and `wiring_files` arrays, including
  empty arrays when none apply;
- `<150` changed LOC for new files and focused behavioral diffs to existing
  large files;
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

Only two exceptions exist:

1. A predeclared contract/wiring carve-out may add at most two `wiring_files`
   and `<30` changed wiring LOC. Wiring may register/import/connect the primary
   change but may not contain independent behavior, UI, tests, locale copy, or
   refactoring. Exceeding either bound creates another WP.
2. A project-generator scaffold WP may own only the generated component and its
   generated test scaffold. Test hardening and implementation remain later WPs.

Any two WPs whose `contract_files` arrays intersect or whose `wiring_files`
arrays intersect are serialized even when their `primary_file` values differ.
In serialized WP JSON/YAML, the keys are exactly `contract_files` and
`wiring_files`, and both values are arrays; singular aliases are invalid.
Tests, locales, docs, review, integration, deployment, and production
validation remain separate WPs.

B4–B6 must first yield mission SDDs. Workers must not flatten them into giant
implementation WPs.

## 15. Dispatch and fallback policy

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

## 16. Mandatory engineering gates

### 16.1 Before editing

- Read project `AGENTS.md`.
- Run GitNexus impact analysis for touched symbols.
- Warn before HIGH/CRITICAL blast radius.
- Confirm isolated worktree and clean owned scope.

### 16.2 Focused gates

- RED test captured before implementation.
- Targeted TypeScript/Vitest or Rust tests.
- Contract and locale parity.
- YAML/shell/JSON validation for tooling WPs.
- Security cases for auth, parser, free text, export, and identity changes.

### 16.3 Project gates

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

### 16.4 Browser gates

- Stagehand Solo and multiplayer suites.
- New feature-specific Stagehand spec.
- Player portrait viewports: 375×667, 390×844, 440×956.
- Keyboard, focus, reduced motion, disabled/submitted states, console errors,
  layout shift, reconnect, and reload.
- `E2E_PW` must come from environment. Missing value means blocked, never pass.

### 16.5 Before commit and merge

- GitNexus `detect_changes`.
- Diff and owned-file inspection by orchestrator.
- `gitleaks`/secret scan.
- Independent code, test, product/design, and implementation security review as
  applicable.
- `claude-wp-verify --branch <branch> --base main`.

## 17. Integration, mirror, deploy, and production

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

## 18. Rollback

- Prefer reverting one merged slice over cross-feature rollback.
- Keep migrations backward-compatible until production validation completes.
- Feature/config additions need safe defaults preserving current behavior.
- Disable new UI entry points before destructive data rollback.
- B4 requires a longitudinal-write/challenge-create disable or read-only switch.
- B5 requires event-storage caps, replay-version rejection, offline-sync
  disable, and replay/challenge/sync rate limits.
- B6 requires parser and AI-extractor disable switches plus upload/job rate and
  resource limits.
- Each mission needs a pre-enable production rollback-drill WP with recorded
  commands, deployed SHA, health checks, integrity assertions, switch-off
  behavior, and successful safe re-enable or forward-fix evidence.
- Never delete worktrees/branches until PR, deployment, and evidence are
  complete.

## 19. Definition of done

Program is complete when:

- stale work is closed with receipts and never rebuilt;
- #191, #281, #302, #319, and #320 are merged, deployed, verified, and closed;
- every row of the #391 SHOULD/NICE/SKIP matrix carries either production
  evidence or an explicit accepted reclassification/supersession receipt, and
  B0's four truth docs plus #391 comment match those receipts;
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
