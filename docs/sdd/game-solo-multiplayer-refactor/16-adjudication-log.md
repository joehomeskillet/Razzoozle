# 16 — Adjudication Log + Frozen Contracts

**Status:** FROZEN (SDD-Freigabe) · **Adjudicator:** Claude · **Date:** 2026-07-18
**Inputs:** Phase-0 (01/02/05/06/07/08/09/19/20/25 + phase0-gaps), Grok primary (03/04/10/13), Codex primary (06-TARGET/14/21), cross-review (15).
**Both cross-review verdicts:** GO-WITH-CHANGES (no NO-GO).

> **NOTE:** This supersedes an earlier auto-generated draft of this file that incorrectly claimed "0 conflicts detected". The cross-review DID surface conflicts (GameTransport scope, `emoji_pin` wire shape, already-joined privacy, 264-emoji entry UX, roster timing, error-shape); they are resolved below. Where this doc conflicts with 06/13/14/21, **this wins**.

---

## A. Adjudication Matrix (cross-review conflicts → decisions)

| # | Topic | Grok (UX) | Codex (arch/sec) | **DECISION** | Rationale |
|---|---|---|---|---|---|
| A1 | Live class-mode join transport | validate via `POST validate-pin` *or* socket (waffled) | socket `player:join`/`login`, HTTP endpoint is dead | **Socket path.** `player:join`(game PIN) → `game:successRoom{klassen,roster}`; `player:login`(name+emojiPin) → server verifies → `game:successJoin` \| `INVALID_CREDENTIALS`. HTTP `validate-pin` stays no-op, removed Phase 2. | Live MP games join by socket; roster+PIN belong on login. Orphaned HTTP endpoint is for solo (Wave 2). |
| A2 | `emoji_pin` wire shape | assumes a field exists | `emoji_pin: String` ("🍕📚🎮🌸"), round-trip VS16 test | **`emojiPin: string[]`** — client sends the 4 chosen emoji **copied verbatim from the server-provided set** (never client-split/-constructed). Server joins + compares to plaintext `students.pin` (constant-error-shape). | Eliminates VS16/grapheme round-trip risk: bytes copied from the canonical set, client never splits. Aligns with memory `auto_emoji_grapheme_vs16` (symbols[] over wire, client never splits). |
| A3 | Emoji entry UX | 4 slots + arrow-cycle 264 emoji | 264-arrow-cycle unusable on mobile | **Searchable picker.** `EmojiPinInput` = 4 slots; tapping a slot opens a picker over the curated `EMOJI_PIN_SET` (emoji + German label), searchable by label. No 264-arrow-cycle. Keyboard: Tab between slots, Enter opens picker, type-to-filter, arrows within picker. | Curated set has German labels → searchable+accessible+mobile-friendly; arrow-cycling 264 is a usability blocker. |
| A4 | Emoji set delivery to client | (unspecified) | (flagged need) | **`GET /api/emoji-pin-set`** → cached `[{emoji,label}]` from `EMOJI_PIN_SET`. Client fetches once for the picker. Single source of truth = `emoji_pin.rs`; no client duplication of the set. | Prevents set drift between Rust and TS. |
| A5 | Already-joined badge | show on all roster rows | privacy leak (who's playing) | **Show `alreadyJoined: bool` per roster row (grey/disable the row).** Roster carries only `{studentId, displayName, alreadyJoined}` — never PINs, never extra PII. UX nicety (prevents a doomed pick), NOT a security control (server enforces one-session-per-student, A6). | Classroom presence is low-sensitivity same-room info; names already visible (pick-your-name is charter-mandated). Minimal exposure. |
| A6 | Duplicate identity / dedup | (implicit) | bound the scope explicitly | **One active session per (game, studentId).** On `player:login`, if that studentId already has a live player in the game → reject with `ALREADY_JOINED` (distinct from `INVALID_CREDENTIALS`, safe to reveal since caller proved PIN). Reconnect of the *same* client_id to *its own* session is unaffected. No cross-game dedup (out of scope). | Emoji-PIN is the natural dedup key; bounded per-game to avoid scope balloon (G14). |
| A7 | Error shape vs feedback | keep name after wrong PIN | constant-error-shape (no enumeration) | **Both.** Pre-login verification failures collapse to one non-specific message: *"Name oder PIN stimmen nicht mit der Klasse überein. Versuch es nochmal."* Client keeps **both** name and emoji-PIN prefilled on retry. `ALREADY_JOINED` (post-PIN) may be specific. | Oracle-prevention preserved; UX affordance preserved; non-specific wording reconciles them. |
| A8 | Roster delivery timing | assumes roster in Stage 3 | must be post-join only | **Roster only in `game:successRoom`** (response to a valid `player:join` with the game PIN). Never in any pre-join/discovery payload. | A joiner must prove knowledge of the game PIN before seeing the roster. |
| A9 | Rate limiting | cites 3/60s per assignment | dual throttle | **Both throttles.** Per-(game,client_ip) 5 fails/5min AND reuse the existing `RATE_LIMITER` 3/60s helper for the PIN-verify call. Constant-error-shape on lockout. | Reuse `assignments.rs:184-213`; add game-scoped bound. |
| A10 | Host class selection | (badge only) | pseudocode uses `game.class_id` | **Host selects a class when enabling Klassenmodus** (charter Part 3: class-select in the toggle group). Game stores `class_id` (+ `owner_id` = class.owner). Roster scoped to that class. Switch OFF ⇒ no class, normal join. | Charter: "Namensauswahl aus der **gewählten Klasse**"; roster must be a specific class. |
| A11 | Styling scope in Wave 1 | full visual rules | isolate to avoid stale tokens | **Wave 1 keeps new components token-bound but does NOT do modal-wide token consolidation.** The cross-cutting primitive/visual unification (ScoreBadge, dialog, switch geometry) is **Wave 4**. | Prevents redundant rework on hot files across waves. |
| A12 | GameTransport (Solo↔MP unify) | "sound, GO-with-changes" | CRITICAL: unify Answers/SoloAnswers | **DEFER to Wave 3, evidence-gated — NOT a blind merge.** Phase-0 flagged D01/D03 as *intentional* self-documented splits. Extract only what is genuinely shared (leaf answer components already shared; extract `HostControlBar`, `ScoreBadge`, `LeaderboardRow`, `useAnswerSubmission`, `usePlayerGameSession`), guard the intentional shell split against false-merge. A full `GameTransport` abstraction is adopted **only if** a concrete diff shows it removes ≥ the complexity it adds. | YAGNI / anti-God-abstraction (host CLAUDE.md + charter "nicht künstlich zusammenführen"). Not on the class-mode critical path. |

---

## B. Frozen Wave-1 Contracts (class-mode LIVE join)

**Server authority (never trust client for identity/membership/PIN):**

1. **Game ownership:** add `owner_id: i64` and `class_id: Option<i64>` to the `Game` struct (`state/game.rs`) + wire type (`protocol/game.rs`); set at `game:create` from the authenticated host + selected class. `klassen_mode := class_id.is_some()` (a klassen game must have a class).
2. **Join (step 1):** `player:join{ gameId | inviteCode }` → if `klassen_mode`, `game:successRoom` includes `klassen: true` + `roster: [{ studentId, displayName, alreadyJoined }]` (from `db::classes::students_for_class(class_id)`), **no PINs**. Non-klassen games: unchanged.
3. **Login (step 2):** `player:login{ gameId, studentId, emojiPin: string[4] }` (klassen). Server, in order:
   - throttle check (A9); on lockout → `INVALID_CREDENTIALS`.
   - resolve student by `studentId` **within the game's class roster** (reject if not a member).
   - `displayName` is display-only; identity = `studentId ∈ roster` (do not trust a client-sent name for identity).
   - verify `emojiPin` join == `students.pin` (plaintext, reuse `db::pins::validate`).
   - dedup (A6): if studentId already active in game → `ALREADY_JOINED`.
   - success → mint `player_token`, bind `client_id`, admit → `game:successJoin`.
   - any pre-dedup failure → single `INVALID_CREDENTIALS` (constant shape, A7).
4. **PIN never leaves the server** toward players/other clients/logs (preserve invariant; add security comment; verify no `studentId`/PIN in `tracing`).
5. **Reconnect:** unchanged (06 §5 sound). Class-verified player reconnects by `player_token`+`client_id`; no PIN re-check.
6. **Emoji set:** `GET /api/emoji-pin-set` → `[{emoji,label}]` from `EMOJI_PIN_SET` (single source `emoji_pin.rs`).
7. **PIN storage:** UNCHANGED (plaintext `students.pin`, teacher-visible by design). No hashing migration.

**Client (single modal, cream, `design.md` tokens):** 5-stage flow (doc 13 §A) mapped to the 2-step socket join — game-code(join) → PlayerNameSelect(roster from successRoom) → EmojiPinInput(picker) → submit(login) → lobby. Reuse `splitGraphemes` + emoji-tile style extracted from `PinDialog.tsx`. Non-specific error + keep both fields on retry (A7). Reconnect mid-form: persist entered name+PIN in component state across a transient socket drop; restore on `game:successRoom` re-arrival. a11y per doc 10 (slot aria-labels, ≥44px, focus, live-region on error). Wire into the **actual** klassen-gated player-join surface — confirm `join/Room.tsx` vs `join/Username.tsx` at implementation (grep the live component, per memory `payload-wp-grep-verify-emit-sites`).

---

## C. Deferrals (explicit, not dropped)

- **Bearer-auth consolidation** (06 §6) → Phase 2, post-MVP (non-blocking, YAGNI for class-mode).
- **`solo_sessions` table + dead HTTP `validate-pin` cleanup** → Phase 2 cleanup.
- **`identifier` half-wired field** → delete in Phase 2 cleanup (use studentId as tracking key).
- **GameTransport / Solo↔MP orchestration unify** → Wave 3, evidence-gated (A12).
- **Modal-wide token/primitive unification** (ScoreBadge, dialog shells, switch geometry, medal token drift D07/D08) → Wave 4.
- **Satellite auth (D8/C5)** → separate SDD, out of scope.

---

## D. Wave plan (charter order) — WP detail in 11-implementation-plan.md

1. **Wave 1 — Klassenmodus LIVE join** (this freeze): contract → server enforcement ∥ host class-select → client join UI → i18n → e2e. Ship as ONE vertical slice (avoids a broken intermediate where the server enforces a PIN clients can't yet send).
2. **Wave 2 — Solo/assignment class-mode security** (Codex Wave 2): `assignments.class_id`, PIN-gate on `check-answer`.
3. **Wave 3 — Modularization** (21, per A12): extract shared primitives/patterns, guard intentional splits, type the untyped payloads (G6/G7/D20).
4. **Wave 4 — Visual consistency** (24/25/27): token/geometry unification + contact sheets/diffs; also the a11y geometry fixes (ToggleField 28→44, PinInput 40→44) and the design-guardrail fixes (VIS-001/002/003).
5. **Wave 5 — Cleanup + Phase-2 deferrals + endreview** (18). Also the solo silent-error + SR-announce a11y CRITICALs (SOLO-001/002, ACCESS-001) — pulled EARLY as a small standalone sub-wave if cheap, else here.

Every wave: worktree WPs → free-pool-wave-review (grok) if ≥2 free writers → cross-vendor review → gate (pnpm verify + rust gate + isolated cargo test + e2e + design-validator on UI) → merge → auto-deploy `rust.razzoozle.xyz` → smoke → `routing-outcome record`.

**Note on a11y CRITICALs:** Grok's SOLO-001/002 (silent solo errors) + ACCESS-001 (no SR announce on reveal) are data-integrity/WCAG blockers independent of class-mode. They are small; scheduled as an early standalone sub-wave (Wave 1b) right after the class-mode slice, not left to the end.
