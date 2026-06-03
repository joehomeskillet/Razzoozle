# Kahoot Gap-Analyse v2 — Razzia (dieser Fork)

_Erzeugt 2026-06-03 via 12-Dimensionen Multi-Agent-Analyse + Synthese (13 Agenten)._

## Executive Summary

Razzia is already a feature-complete live-quiz engine for its real use-case (internal events/clinic quizzes, self-hosted, no LMS/classroom). Core loop, three question types (choice/boolean/slider), speed scoring, streaks, podium, reconnection (player + manager), live theming, JSON authoring, and persisted results all exist and are solid. The 12 analyses correctly enumerate the Kahoot delta, but a large share of those gaps are LMS/EdTech features (assignments, ghost mode, LTI/gradebook, per-student longitudinal profiles, age-gating, 75-language RTL) that have near-zero value for a self-hosted clinic/event tool and should be explicitly dropped. The highest ROI is a cluster of genuinely cheap wins that exploit infrastructure that is ALREADY in place: the streak field is tracked but never multiplied into points (one line at round-manager.ts:217); full GameResult is already loaded client-side in ResultModal so CSV export is pure frontend; the validator already coerces solutions[] to an array so a poll type and multi-select are mostly UI; ConfigManageQuizz already holds socket+quizz so duplicate/export buttons are trivial; the manager password defaults to plaintext "PASSWORD" which is a real exposure for any non-localhost deploy. The strategic tier worth funding is narrow: team mode (the one big-event feature that actually fits), multi-select + free-text/type-answer question variety, a basic accessibility + reduced-motion pass (clinics have a duty-of-care/contrast obligation), and pragmatic ops hardening (rate-limiting on join/answer, health endpoint, non-default password enforcement). Everything heavier than that is over-engineering for this deployment. Roadmap below sequences cheap engagement+authoring wins first, then the team-mode + question-variety strategic block, then targeted a11y and ops hardening, and discards the EdTech/hyperscale tail.

## Priorisierte Roadmap

1. **Apply streak as a points multiplier (round-manager.ts:217)** — One-line change against already-tracked state; immediately fixes a half-built mechanic and restores competitive tension. Highest ROI item in the entire analysis.
2. **CSV export of results from ResultModal** — Top record-keeping need for event/clinic organizers; full GameResult is already client-side, so it is pure frontend with no backend or schema work.
3. **Enforce/warn on non-default manager password** — Real security exposure (plaintext 'PASSWORD' default) for any non-localhost deploy; cheap to gate at boot and a prerequisite before recommending wider hosting.
4. **Quiz JSON export + duplicate-quiz buttons** — Trivial additions to ConfigManageQuizz that unlock backup, sharing, and fast authoring iteration; compounds the value of the editor that already exists.
5. **Poll question type (unscored vote)** — Reuses the practice=0-points path and existing response display; small enum + validator tweak adds warm-up/sentiment questions that fit the use-case.
6. **prefers-reduced-motion + audio/motion toggle** — Cheapest, highest-impact accessibility fix for a clinical/mixed-age audience; a single media query plus a hook covers the dominant complaint.
7. **Focus rings, ARIA labels, aria-live HUD** — Mechanical keyboard + screen-reader improvements with no architectural risk; pairs naturally with item 6 as one accessibility mini-wave.
8. **Health endpoint + join/answer rate limiting + username hardening** — Right-sized ops/safety hardening for self-hosted (no Redis/DB); stops spam and gives basic observability for public-facing event screens.
9. **Team mode** — The flagship strategic feature that actually fits internal events; high effort across types/scoring/UI but bounded and the biggest engagement lift available. Schedule after the quick-win wave lands.
10. **Multiple-select question type** — Backend (solutions[] array) already supports it; only the player UI and single-answerId path block it. Best variety-per-effort question gap to close.
11. **Free-text / type-answer question type** — Adds meaningful quiz variety for knowledge checks; self-contained text-input + fuzzy-match work that reuses the existing scoring pipeline.
12. **Host runtime controls (pause/resume, extend time, repeat)** — Improves facilitated-session control; medium socket+timer work, valuable but secondary to scoring, exports, team mode, and question variety.
13. **WCAG AA theme contrast validation + form labels** — Closes the duty-of-care accessibility gap (default theme fails AA; editor ships inaccessible palettes unchecked); larger cross-cutting effort, so it lands after the cheap a11y pass and the headline features.

## Quick Wins (billig, hoher Hebel)

| Feature | Dimension | Aufwand | Impact | Warum |
|---|---|---|---|---|
| Apply streak as a points multiplier | Engagement & Gamification | ~0.5 day | high | streak is already tracked and reset correctly at round-manager.ts:220 but line 217 only awards raw points, so streaks are purely cosmetic (Fire badge). One change — points = practice ? 0 : Math.round(rawPoints * (1 + 0.1*Math.min(player.streak,5))) computed before the streak increment, plus surfacing the bonus in SHOW_RESULT — restores comeback dynamics and replay tension. Zero schema/socket changes. |
| CSV export of game results | Analytics / Integrations | ~0.5 day | high | ResultModal already receives the full GameResult client-side via EVENTS.RESULTS.GET (ConfigResults.tsx:37), so export needs no backend: iterate result.players and result.questions[].playerAnswers, build CSV, trigger a Blob download from the modal header. This is the single most-requested record-keeping feature for clinic/event organizers and is the cheapest analytics gap to close. |
| Export quiz JSON + duplicate quiz buttons | Content authoring | ~0.5 day | medium | ConfigManageQuizz.tsx already has socket + quizz in scope and an import handler. Add a Download icon (JSON.stringify(quizz)->Blob) and a clone button (saveQuizz with subject + ' (Copy)') next to the existing edit/delete. Enables backup, sharing between instances, and fast quiz iteration with a few lines each. |
| Poll question type (unscored opinion vote) | Question types | ~0.5-1 day | medium | practice=true already zeroes points (round-manager.ts:217). Add 'poll' to the QuestionType enum and relax the validator superRefine so poll needs answers but not solutions[]. Reuse the existing response-bar display on the host. Gives icebreaker/sentiment questions that fit clinic and event warm-ups, with trivial backend impact. |
| Enforce non-default manager password on boot | Security / Infra | ~0.5 day | high | config.ts:39 seeds managerPassword:'PASSWORD' and it never expires. For any deployment beyond localhost this is a real takeover risk. Cheap fix: warn loudly (or refuse to start in production mode) when the password is still 'PASSWORD', and document a required override. No architecture change. |
| prefers-reduced-motion support + audio/motion off toggle | Accessibility | ~1-2 days | medium | index.css has 8+ always-on animations and Leaderboard/Podium use spring physics with no guard; SFX.pop fires on every answer. A single @media (prefers-reduced-motion: reduce){ animation:none } block plus a useMotionPreference() hook gating motion library and sound covers the most common accessibility complaint in clinical/older-audience settings at low cost. |
| Focus rings + ARIA labels + aria-live on the game HUD | Accessibility | ~1-2 days | medium | AnswerButton has no visible focus ring and the time/answers HUD in Answers.tsx is not announced. Adding focus-visible:ring to AnswerButton/Button, aria-label on icon buttons, and aria-live='polite' on the HUD counters is mechanical and materially improves keyboard + screen-reader usability without a full audit. |
| Username length-only validation hardening + optional random-name fallback | Moderation / Onboarding | ~1 day | medium | usernameValidator (auth.ts) checks only 4-20 chars. A small bundled wordlist profanity check at join plus an optional 'suggest random name' button (unique-names-generator) reduces moderation friction for public-facing event screens. Lightweight; no persistence needed since sessions are ephemeral. |
| Health endpoint + per-IP join/answer rate limiting | Infra / Safety | ~1-2 days | medium | No /health route and no socket rate limiting; nginx proxy_read_timeout 3600 masks hangs. A small Express /health ({games,players,uptime}) and a socket.io middleware capping join (e.g. 10/min/IP) and one-answer-per-question stops reconnect/answer spam. Right-sized hardening for self-hosted without adding Redis or a DB. |

## Strategische Lücken (höherer Aufwand, lohnt sich)

| Feature | Dimension | Aufwand | Impact | Warum |
|---|---|---|---|---|
| Team mode (grouped players, cumulative team scoring, team leaderboard) | Game Modes / Engagement | high (~15-25 dev-days across layers) | high | The one large-event/corporate-clinic feature that genuinely fits this tool. Requires a Team concept on Player (teamId), team-aware aggregation in RoundManager.showResults (currently per-player at round-manager.ts:188-226), a team join/assignment flow in the join Room, and a team leaderboard/podium variant. Touches common types, socket scoring, and several React views — real architecture, but bounded and high-value for group events. |
| Multiple-select question type (mark ALL correct) | Question types | medium (~2-3 dev-days) | medium | Backend already stores solutions[] as an array (validator coerces single->array) and showResults checks solutions.includes(). The blocker is purely the player UI: Answers.tsx renders a single-tap AnswerButton grid with no multi-pick/confirm and selectAnswer accepts one answerId. Add a multiSelect flag, checkbox-style selection + submit, and all-or-nothing scoring. High variety payoff relative to effort. |
| Free-text / type-answer question type with fuzzy matching | Question types | medium (~3-4 dev-days) | medium | Adds genuine quiz variety beyond multiple choice. Needs a text-input player UI, an accepted-answers list + match mode (exact/fuzzy via edit distance) on the question, and matching logic in selectAnswer/showResults. Self-contained and reuses the existing per-question scoring path; good differentiator for knowledge-check style clinic quizzes. |
| Targeted accessibility pass to WCAG AA (contrast validation in theme editor + form labels) | Accessibility | medium-high (~4-6 dev-days) | medium | Default theme (orange on brown ~3.8:1) fails AA and the theme editor lets users ship inaccessible custom palettes with no warning. Add a contrast check (chroma.js) in themeValidator/ConfigTheme surfacing the ratio, plus proper <label>/htmlFor on PinInput/Input and the slider. For a clinic context this is closer to a duty-of-care obligation than a nice-to-have, but it is real cross-cutting work, so it sits in the strategic tier. |
| Host runtime controls: pause/resume timer + extend time + repeat question | Host & presentation | medium (~3-5 dev-days combined) | medium | Today the host can only skip or abort. CooldownTimer is interval-based; adding pause()/resume() and an add-time delta plus a repeat-question handler (reset playersAnswers, rebroadcast SHOW_QUESTION) gives presenters discussion-friendly control that matters for facilitated clinic sessions. Bounded socket+timer state work, lower priority than team mode/variety. |

## Bewusst NICHT bauen (Over-Engineering für diesen Einsatz)

- Assignments/Homework and async/practice session modes — deadline-based, multi-session, role-based-auth EdTech machinery with no value for live internal events/clinics
- Ghost mode + full session-timeline recording/playback — requires per-action timestamps and a playback engine for a feature nobody in this use-case will use
- LMS integration (LTI 1.3, Canvas, Google Classroom, Moodle, gradebook passback) — explicitly out of scope; there is no classroom/LMS need
- Per-student longitudinal performance profiles, 'needs help' flagging, cohort comparison — depend on a persistent student-identity/account system that contradicts the ephemeral free-text-username design and the self-hosted, no-accounts use-case
- Horizontal scaling: Redis socket.io adapter, sticky sessions, multi-instance coordination, blue-green/canary deploys — single Node instance comfortably covers clinic/event audiences; this is hyperscale engineering for a ~tens-of-players reality
- Database migration with ACID transactions for game state — live games are transient and results already persist to JSON on disk; a DB adds operational burden without solving a real failure mode here
- 75+ languages and full RTL (Arabic/Hebrew/Persian) mirroring — the existing 5 EU languages match the audience; RTL is a large layout effort with no demand
- Drop-pin, word-cloud, puzzle/ordering, image-answer, and image-annotation question types — high-effort specialized interactions that exceed the variety a clinic/event quiz needs; multi-select and type-answer already cover the meaningful gap
- Power-ups (double points, 50/50, time freeze) and reactions/emotes — fun for K-12 entertainment but add inventory state and netcode complexity disproportionate to internal-event value
- Avatars/nickname-generator as a full system, AI question generation, media library/CDN integration, GDPR retention/age-gating/COPPA workflows, white-label/branding-removal, webhooks/REST API, per-quiz themes and font customization — each is either policy work the host already owns, or polish that does not move the needle for this deployment

## Anhang: grösste Lücke pro Dimension

### Question types & interaction modes
- Puzzle/Ordering questions (major UX complexity; drag-reorder component needed)
- Drop Pin questions (coordinates + mobile UX; specialized image interaction)
- Multiple-select interaction (backend exists but player UI forces single-select only)

### Game Modes
- Team Mode — players cannot be grouped with cumulative team scores; architectural change to Player model needed
- Assignments/Homework (Async) — no deadline-based assignment system, no progress persistence across sessions, no per-student async access; requires multi-session state management and role-based auth
- Ghost Mode — no recording of session timeline with timestamps, no playback replay engine, no 'ghost player' render

### Host & presentation controls
- Pause/Resume during question answering — currently only abort (abort entire round); no freeze/extend on-the-fly for classroom discussion
- Question timer override/extension — quiz-level cooldown fixed at edit time; no host runtime control to extend by N seconds mid-question
- Second-screen presenter mode — host sees same view as players; lacks dedicated presenter display with answer distributions, live leaderboard, and extended controls

### Player experience & onboarding
- Avatar system — Kahoot's visual player distinction (avatars + colors) is missing entirely in Razzia, limiting social presence and on-screen player recognition, especially on mobile where names are small. Moderate-to-high impact on player experience.
- Onboarding & tutorial — New players see no instructions on how to join, answer, or score; no practice mode. Kahoot's guided flow reduces friction and confusion for first-time users.
- Mobile answer UX — Text and button labels are too small (12-14px on mobile); no haptic feedback; no optimized layout for phones <400px width. Answer readability and tap-target comfort suffer.

### Content authoring & question management
- Question bank / reusable pool: Kahoot has 1000s of searchable, reusable questions by topic/grade; Razzia has zero—every question is custom-authored in-line. Eliminates the ability to build quizzes fast from existing content.
- AI-assisted question generation: Kahoot can auto-generate 5-10 questions from a topic via LLM; Razzia requires manual authoring of every single question.
- Media library: Kahoot includes 10k+ free images/videos/audio clips searchable by keyword; Razzia requires users to find external URLs. Huge friction for teachers without media procurement expertise.

### Analytics, Reports & Learning Insights
- No student/player identity system: free-text usernames are ephemeral and cannot be linked across multiple games to build performance history or per-student insights
- No CSV/XLSX export: results are stored as JSON files but there is no UI button to download results in standard office formats for record-keeping or external analysis
- No per-student detailed reports or 'needs help' flagging: managers see aggregate question data but cannot quickly identify which students are struggling or need intervention

### Accessibility & Internationalization
- WCAG/APCA Color Contrast Validation & Enforcement — Theme editor allows custom colors with NO contrast checking; default theme fails WCAG AA (3.8:1 ratio); users can unknowingly create inaccessible quizzes
- Screen Reader & ARIA Support is Nearly Non-Existent — Only 2 aria-hidden; NO aria-live regions for status updates, NO aria-labels on buttons, NO skip-to-content links; screen reader users hear barely any context during game play
- RTL Language Support Completely Absent — No HTML dir attribute, no CSS logical properties, no Arabic/Hebrew/Persian support; critical blocker for any Middle Eastern deployment

### Theming, branding & customization
- Per-quiz themes (only global theme supported; new quiz inherits the organization-wide design)
- Logo/branding replacement (logo.svg hardcoded in Background component, no UI to upload custom logo)
- Font customization (Rubik Variable locked in CSS; no font family selector in Design tab)

### Engagement & Gamification
- No streak point multiplier: Streaks visible but provide zero scoring advantage. This kills momentum-based comebacks and reduces replayability. FIX: Apply 1.1x-1.5x multiplier to points when streak>=2. Effort: LOW.
- Missing power-ups entirely: No double points, 50/50, time freeze, or skip mechanics. Kahoot's power-ups drive unpredictability, tactical play, and social drama. Major engagement differentiator. FIX: Design 3-4 core power-ups, add inventory to Player model, emit consumables during answer phase. Effort: HIGH. Timeline: post-MVP.
- No team mode: Only individual play; large classroom/corporate events lose collaborative energy. Team mode amplifies social bonding and creates sub-group competition. FIX: Add Team entity, group scoring logic, team leaderboard. Effort: HIGH. Timeline: post-MVP.

### Scalability, reliability &amp; infrastructure
- No horizontal scaling: Single socket.io instance with in-memory registry. No Redis adapter, no sticky sessions, no multi-instance coordination. Ceiling ~500 concurrent players (Node.js single thread). Comparison: Kahoot handles 5,000+ per instance via clustering and distributed session store.
- No persistent storage: All games and results lost on container restart. File-system JSON writes are non-atomic and errors are swallowed. No database transactions. Comparison: Kahoot persists all state to relational DB with ACID guarantees.
- Missing observability + rate limiting: console.log only, no metrics/traces, no correlation IDs. No rate limiting on socket events or API. Manager password plaintext + never expires. Vulnerable to reconnect spam and event flooding. Comparison: Kahoot has Prometheus metrics, structured logging, per-socket rate limits, token-based auth.

### Integrations, sharing & embedding
- Quiz and result export/download: Razzia lacks export UI (no CSV/JSON download buttons), though data is stored internally as JSON files. Kahoot offers multiple export formats; Razzia has no user-facing export.
- Public API and webhooks: Razzia uses Socket.io only (no REST endpoints, no webhook support). Kahoot has full HTTP REST API and event webhooks for third-party integrations.
- LMS integrations (LTI, Google Classroom, Canvas, Moodle): Completely absent. Kahoot seamlessly integrates with major LMS platforms for roster sync and grade passback. Razzia is standalone self-hosted only.

### Moderation, Safety & Privacy
- No content/profanity filtering for usernames — free-text names allow offensive terms without detection
- No reporting mechanism for players to flag inappropriate content or other players; no moderation queue
- No GDPR/data retention policy; results stored indefinitely with personally identifiable player names; no automated purging or anonymization

