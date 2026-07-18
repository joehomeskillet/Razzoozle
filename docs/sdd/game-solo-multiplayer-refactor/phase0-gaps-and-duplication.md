# Phase-0 — Consolidated Gaps & Duplication

**Owner:** phase0-synthesis · **Status:** done · **Scope:** merges and dedupes
the gap/dup/risk findings from all 8 phase-0 inventory docs (`02`, `05`,
`06`, `07`, `08`, `09`, `19`, `20`, `25`) into one ranked list per category.
Feeds `05-class-mode-join-spec.md`, `21-game-modularization-plan.md`, and
`24-game-visual-consistency-spec.md`.

---

## 1. Consolidated gap list (ranked)

### [BLOCKER]

**G1 — Class-mode join has zero player-facing consumption path.**
The host-side switch (`ConfigSelectQuizz.tsx:29,90-93,254-265`) and the
teacher-side roster/PIN CRUD (`socket/manager/classes.rs`, `db/pins.rs`,
`db/classes.rs`) are fully built and correctly wired. But no client
component anywhere under `pages/(auth)/*` or `features/game/components/
join/*` presents a class-roster name picker or an emoji-PIN entry —
`EmojiPinInput` and `PlayerNameSelect` (2 of the 16 target UI primitives)
have **zero** client-side implementation. Every join today, in both live
multiplayer and solo/assignment play, is anonymous free-text. This is the
charter's headline feature (item 4), currently 0% built on the
consumption side. Sources: `02` §4, `05` §1–4, `19` gaps, `25` gaps
(unanimous across every reader that touched the join surface).

**G2 — Server does not enforce Klassenmodus anywhere.**
`selectedModes.klassen` is read in exactly two places server-side
(`socket/game.rs:72-77`, `state/snapshot.rs:82`), both at
`GAME.CREATE`-time only, and never again. `requireIdentifier` is hardcoded
`Some(false)` (`login.rs:34`), and the `identifier` field the client can
already send is parsed and discarded (`login.rs:81-84`, `let _identifier`).
Even if G1 is closed on the client, nothing server-side would gate
`player:login`/`player:join` on it today. The charter explicitly names this
exact bypass risk ("freie Namenseingabe darf den Modus nicht umgehen").
Sources: `02` §4, `06` §1, `07` gaps, `20` §7 (unanimous).

### [HIGH]

**G3 — The one class-mode verification scaffold that exists is fully
orphaned end-to-end.**
`POST /api/assignment/:id/validate-pin` (`http/assignments.rs:178-228`) is
built, real, and rate-limited (3 fails/60s), mints a `studentToken`, and
`INSERT`s into `solo_sessions`. Grep-verified: zero client references to
`validate-pin`/`studentToken` anywhere in `packages/web/src`; zero reads of
`solo_sessions` anywhere in `rust/server/src`. Must be explicitly decided
(resurrect vs. rebuild) before `05`/`23` design on top of it — the charter's
reuse mandate assumes this scaffold works, and it has never been exercised.
Sources: `05` §5, `08` gaps, `06`.

**G4 — No student-role session/identity type exists anywhere.**
Auth today only distinguishes admin/lehrkraft/user roles. A validated
emoji-PIN produces nothing — no session, no token type, no scoped
permission. Target design needs to invent this from scratch. Source: `05`
gaps.

**G5 — `Assignment` has no `class_id`; no schema linkage from an
assignment to a roster.** `http/assignments.rs` `Assignment` struct has no
field tying it to a class. A class-mode-join design needs to decide how an
assignment ties to a specific class roster before enforcement can exist.
Source: `05` gaps, `08`.

**G6 — Two central join/reconnect payloads bypass their typed protocol
structs.** `player:reconnect` (`session.rs:170-178`) and
`manager:successReconnect` both parse/construct ad-hoc `serde_json::Value`
instead of the typed `PlayerReconnect`/`ManagerSuccessReconnect` structs —
the same drift pattern `player:selectedAnswer` already got frozen against
under SEC-00. Class-mode-join will add fields to exactly these payloads;
building on an untyped foundation compounds drift risk. Sources: `20` §6
(D1), `09`.

**G7 — 35 events (`class:*` ×23, `label:*` ×7, `user:*` ×5) have zero typed
protocol struct.** Every handler in `manager/classes.rs`/`labels.rs` parses
ad-hoc JSON. The join-time roster read a class-mode flow needs is exactly
in this untyped surface. Source: `20` §4, open question.

**G8 — `manager:auth` has no server handler; `/satellite/$gameId`'s entire
auth mechanism appears unconsumed.** Grep confirms zero occurrences of a
`manager:auth` handler or `satellite`-related logic under
`rust/server/src`. Needs an implement-vs-delete decision — relevant because
satellite's token-in-URL/handshake-auth pattern is a plausible precedent
for a PIN-bearing join link, and building on a possibly-dead pattern is
risky. Source: `20` §7 (D8), `09`.

### [MED]

**G9 — No `usePlayerGameSession` hook; player-side socket wiring is
unextracted.** Host reconnect logic is properly shared via
`useManagerGameSession.ts` across 3 routes; the structurally equivalent
player-side logic (~150 lines) is inline in `pages/party/$gameId.tsx`.
Blocks reuse if class-mode-join needs a second player-facing entry route.
Sources: `02` dup_candidates, `20` §6 (D6).

**G10 — Solo has zero server-side phase machine.** No `Game`/
`GameRegistry` entry, no phase tracking of any kind exists for solo play.
If class-mode needs server-verified progress on assignment/solo play, there
is currently no state to hook into — this is new architecture, not a
wire-up. Sources: `07` gaps, `01` §4.

**G11 — Three independently hand-maintained phase/status taxonomies.**
`GamePhase` (8 variants, engine), `Status` (12 variants, protocol wire
superset), `SoloPhase` (7 variants, client Zustand) — plus a hand-written
`Game::phase_wire_name` mapping function rather than one source of truth.
Relevant if class-mode introduces a 4th "verified/pending" join state.
Source: `07` dup_candidates, gaps.

**G12 — Two silent-degrade error paths exist in Solo, absent from MP.**
Failed `check-answer` → silently becomes a wrong answer (`solo.ts:259-276`,
no toast, no retry); failed `solo-score` submit → swallowed entirely
(`solo.ts:329-331`). A PIN-verification failure in the new class-mode flow
must **not** inherit this pattern — MP's always-toast convention is the
correct model. Source: `02` §4, `07`.

**G13 — Unknown `GAME.STATUS` silently no-ops on the player route.**
`pages/party/$gameId.tsx:175-178` has no `console.warn` fallback, unlike
`useManagerGameSession.ts:45-55` which does warn. Diagnosability asymmetry
between player and host/display routes. Source: `02`.

**G14 — No cross-device/duplicate-identity dedup anywhere.** Two browsers
= two fully independent, uncapped MP players (dedup is `client_id`-only,
`state/game.rs:352-354`); solo has no `student_id` FK at all. Emoji-PIN is
the natural fix point but scope must be explicitly bounded by adjudication,
not assumed. Sources: `09` gaps/open_questions, `05`.

**G15 — Concurrency: `version` optimistic-locking column exists on every
table but is referenced by zero `UPDATE` statements.** Last-write-wins in
practice today. Relevant because class-mode-join adds concurrent
teacher+student writes to related rows (roster, PINs, assignments).
Source: `08` gaps.

**G16 — No in-game inline `ConnectionIndicator`/`LoadingState`/
`ErrorState` primitives.** Mid-game failures (join timeout, submit-answer
failure, reconnect timeout) fall back to ad-hoc `toast.error()`. A new
class-mode join flow with a PIN-rejection path needs a real inline error
affordance, not another one-off toast. Source: `19` gaps.

### [LOW]

**G17 — Dead OpenAPI route + unused ts-rs codegen pipeline.** Client
fetches `/api/openapi.json`; no Rust route serves it; `buildOpenApiDoc()`
is never invoked. `rust/protocol/bindings/*.ts` (~140 ts-rs-generated
files) has zero consumers under `packages/`. Unrelated to class-mode;
real dead weight worth a keep-or-delete decision before `21` touches these
types. Source: `08` gaps.

**G18 — Username length validated in bytes (server) vs. chars (client).**
`state/registry.rs:107-115` (UTF-8 bytes, min 4/max 20) vs.
`Username.tsx:17,106` (JS `.length`, max 20) — edge-case mismatch on
multi-byte names. Source: `09`.

**G19 — No client-side error UI for a rejected satellite token.**
`pages/satellite/$gameId.tsx:19-61` relies entirely on server-side
behavior with no visible failure state. Source: `02`, `09`.

**G20 — Stale/orphaned validators.** `soloScoreSubmitValidator`
(`packages/common/src/validators/solo.ts`) doesn't match the post-SEC-05
wire shape; `assignmentValidator` is never imported anywhere outside its
own file. Both only referenced by the (also-dead) OpenAPI generator.
Source: `08`.

---

## 2. Consolidated duplication table

`id | area | files | duplication | likely target module | risk`

| id | area | files | duplication | likely target module | risk |
|---|---|---|---|---|---|
| D01 | Game-loop orchestration shell (Solo vs MP) | `states/Answers.tsx` (724L, socket) vs. `solo/SoloAnswers.tsx` (431L, REST) | Self-documented **intentional** split by transport ("mirrors Answers.tsx but uses REST"); leaf answer-type components already correctly shared | `21` — do not merge, only clean up shell-local logic | LOW (intentional) |
| D02 | Phase/status taxonomy | `GamePhase` (`engine/src/state/mod.rs:20-29`, 8v) vs. `Status` (`protocol/src/status.rs:46-71`, 12v) vs. `SoloPhase` (`stores/solo.ts:46-53`, 7v) | 3 independently hand-maintained enums; hand-written `phase_wire_name` mapping (`state/game.rs:212-224`) instead of one source of truth | `21` | MED |
| D03 | `GameWrapper` (MP) vs. `SoloShell` (Solo) | `GameWrapper/GameWrapper.tsx` (343L, boolean-prop god-component: `manager?`/`controls?` gate 9 conditional blocks) vs. `solo/SoloShell.tsx` | **NOT a duplicate** — `SoloShell.tsx:6-13` explicitly documents itself as an intentional split to avoid socket coupling; flagged only to prevent a false-positive merge in `21` | `21` — exclude from merge; extract `GameWrapper`'s host-control region as its own `HostControlBar` instead | LOW (false-positive guard) |
| D04 | Join/name-entry primitives | `join/Username.tsx` (MP, uses shared `Input`/`Button`/`Card`) vs. `solo/SoloNameScreen.tsx` (Solo, 67L raw hand-styled `<input>`/`<button>`) | Same concept, zero primitive reuse on the Solo side | `21` / `22-game-component-api-guidelines.md` | MED |
| D05 | Score/points pill | `SoloShell.tsx`, `states/Paused.tsx`, `states/Responses.tsx`, `states/Result.tsx` (via `RewardStack`), `SoloLeaderboard.tsx` | 5+ independent ad-hoc implementations, no shared `ScoreBadge` primitive (confirmed missing from the 16-primitive target list) | `19`/`21` — build `ScoreBadge` | MED |
| D06 | Leaderboard/result row | `Leaderboard.tsx`, `SoloLeaderboard.tsx`, `TeamLeaderboard.tsx`, `SharePage.tsx`, `ResultModalTable.tsx` | 4 unreconciled row implementations + 1 wholly different `<table>` DOM shape; different `Avatar` sizes; hardcoded vs. token-bound medal colors | `21` — `LeaderboardRow` primitive (open question: does `SharePage`'s standalone/no-store context justify staying separate?) | MED |
| D07 | Podium/medal rank badge | `states/Podium.tsx:106-146` (token-bound, `size-20/26`) vs. `features/results/SharePage.tsx:28-58` (hardcoded Tailwind colors, `size-14/20`, verbatim sheen-overlay markup copy-pasted) | Same component re-implemented with hardcoded literal colors instead of `--tier-*` tokens — not theme-able on the share page | `24-game-visual-consistency-spec.md` / `21` | HIGH (token drift, visible on a public page) |
| D08 | Dialog shell | `components/AlertDialog.tsx` (canonical, 14 consumers) vs. `components/manager/DialogPanel.tsx` vs. `GameWrapper/RejoinQrDialog.tsx` (`bg-black/70`) vs. `states/Room.tsx` ×2 (pairing input, hardcoded `text-black`; kick-confirm, uses `--state-wrong` instead of `Button`'s `--danger-bg`) | 5 independently-geometried Radix dialog shells; 3 game-surface files bypass the shared `Dialog` primitive entirely | `21` + `24` | HIGH (a11y consistency + visual drift) |
| D09 | `StatusBadge` "online" token pair | `components/StatusBadge.tsx`, `manager/.../submissions/StatusBadge.tsx`, `ConfigUsers.tsx` (all `--status-online-bg/text`) vs. `manager/components/DisplayStatusCard.tsx` (`--state-correct`/`--surface-4`) | 2 different token pairs for the identical "online" semantic across 4 files | `24` | MED |
| D10 | Switch/toggle track size | `ToggleField.tsx` (canonical, `h-7 w-12`) vs. `AnimatedBackgroundControls.tsx` (`h-6 w-11`) vs. `BadgeRow.tsx` (`h-6 w-11`) vs. `ResultModalTable.tsx` (`h-5 w-9`) | 3 hand-rolled `role=switch` markups, 3 different track sizes, all bypassing the canonical `ToggleField` | `24` | MED |
| D11 | `Select` element | `Select.tsx` (token-bound canonical) vs. 4 raw `<select>` elements (`SubmitPage.tsx:330`, `QuestionEditorAcceptedAnswers.tsx:96`, `QuestionEditorWortarten.tsx:196`, `QuizzEditorHeader.tsx:241`) | Hardcoded gray/white Tailwind literals bypassing the token-bound primitive | `24` | LOW |
| D12 | Game-code/PIN entry widgets | `PinInput.tsx` (canonical) vs. `states/Room.tsx:144` (giant read-only PIN text) vs. `states/Room.tsx:222-227` (raw satellite-pairing `<input>`, hardcoded `text-black`) vs. `states/Room.tsx:230` (bare `bg-primary` instead of `Button`'s token class) | 3–4 unrelated widgets for the game-PIN concept inside one file; satellite-pairing input may not even belong in the same taxonomy (different code, pairs a display, doesn't join a game) | `19`/`24` — clarify `GameCodeInput` scope before extracting | MED |
| D13 | `ConnectionIndicator` | `GameWrapper.tsx` (2 inline `isConnected` renderings) + `join/Room.tsx` (3rd inline `Loader` usage) | No shared primitive; mid-game failures fall back to ad-hoc `toast.error()` (= G16) | `19`/`21` | LOW |
| D14 | Player vs. host socket-session wiring | `useManagerGameSession.ts` (extracted, 3 consumers) vs. `pages/party/$gameId.tsx` (player route, ~150-line inline equivalent) | Host/player asymmetry — good precedent exists, not mirrored for player (= G9) | `21` | MED |
| D15 | `sound.ts` vs. `haptics.ts` stores | `features/game/stores/sound.ts` vs. `haptics.ts` | Byte-for-byte structural twin (boolean + toggle + localStorage read/write) | `21` | LOW |
| D16 | `Question`/`Quizz`/`CatalogEntry` type definitions | `packages/common/src/validators/quizz.ts` (zod, actually enforced) vs. `rust/protocol/src/quizz.rs` (Rust struct, wire truth) vs. `rust/protocol/bindings/*.ts` (ts-rs generated, 0 consumers) | 3 independent definitions; (1)/(2) synced by hand + tests only, (3) fully orphaned output (= G17) | `21` — decide wire-up-ts-rs vs. delete-bindings | MED |
| D17 | `authorize_dev_request` | `http/mod.rs:152-179` vs. `observability.rs:484-544` | Same name/purpose, two independent implementations, different precedence/signature | `21` (backend) | MED (security-adjacent — precedence divergence) |
| D18 | Owner-scope SQL filter | Raw string `($1::bigint IS NULL OR owner_id = $1)` hand-repeated across `classes.rs`, `quizz.rs`, `catalog.rs`, `results.rs`, `submissions.rs`, `media.rs`, `labels.rs` | No shared helper/view | `21` (backend) | LOW |
| D19 | `player:updateLeaderboard` vs. `game:status` leaderboard data | `player/mod.rs:32-55` (avatar/team-sync side-channel, consumed only by `Wait.tsx:58`) vs. `status.rs:330-342` (actual leaderboard screen data) | Naming/purpose overlap, not true code duplication but a confusing shared name | `21` | LOW |
| D20 | `player:reconnect`/`manager:successReconnect` ad-hoc JSON | `session.rs:170-178`, `manager/auth.rs` | Same drift pattern `player:selectedAnswer` already got fixed for (SEC-00); not yet applied here (= G6) | `06`/`21` | HIGH (security/type-safety prerequisite for class-mode) |

---

## 3. Top cross-cutting risks for the coming refactor

1. **Shipping class-mode-join without first closing the identity/session
   gaps (G2, G4, G6, G7) risks "PIN theater"** — a client that looks
   verified but a server that still accepts any free-text name, exactly the
   bypass the charter warns about. G1/G2 cannot be closed by client work
   alone.
2. **The untyped protocol surface compounds under new fields.** 35
   `class:*`/`label:*`/`user:*` events plus the 2 central reconnect
   payloads (D20/G6) are already on `serde_json::Value`; class-mode-join
   will naturally want to add fields to exactly these payloads, deepening
   drift unless typed first.
3. **Solo's REST-statelessness is architecturally incompatible with
   server-verified progress** (G10). If class-mode's server verification
   needs to track anything about an in-progress solo/assignment run beyond
   a single request/response, this is new architecture, not a wire-up —
   likely to be underestimated in scoping.
4. **The three SDD strands (class-mode, modularization, visual-consistency)
   converge on the same handful of large, high-traffic files** —
   `Room.tsx`, `GameWrapper.tsx`, `Answers.tsx`/`SoloAnswers.tsx`,
   `Username.tsx`/`SoloNameScreen.tsx` are exactly where join UI, component
   extraction, and token/dialog cleanup all land. Sequencing per the
   charter (Klassenmodus → Modularisierung → Migration → visuelle
   Konsistenz → Cleanup) matters — doing visual cleanup on files before
   class-mode extends them, or vice versa, risks redundant rework or
   conflicting diffs.
5. **Dead/orphaned mechanisms create reuse ambiguity.** `validate-pin`/
   `solo_sessions` (G3), the ts-rs bindings pipeline (G17/D16), and the
   OpenAPI route are all things the charter's "reuse, don't rebuild"
   mandate implicitly assumes work — none of them have ever been exercised
   end-to-end. Treat "exists in the codebase" and "verified working" as
   separate claims when scoping `05`/`23`.
6. **The two-tier secret model (argon2+hashed sessions for teachers vs.
   plaintext PIN + unhashed dead token for students) is a deliberate
   design choice, not an oversight** (`06` §1) — any new class-mode session
   artifact must explicitly pick a tier via adjudication rather than
   silently inheriting the weaker pattern by accident during
   implementation.
7. **No dedup mechanism exists for player identity anywhere in the system**
   (G14) — MP allows unlimited same-person multi-join across browsers,
   solo has no student FK at all. Emoji-PIN is the obvious fix point; if
   `05`/`23` doesn't explicitly bound this, dedup work can silently balloon
   scope beyond "add a join screen."
