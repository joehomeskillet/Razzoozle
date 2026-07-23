# Razzoozle vs Kahoot — Cross-Vendor GAP-ANALYSE & BUG-KONSOLIDIERUNG

**Analysedatum:** 2026-07-23  
**Judge:** Cross-Vendor-Panel (Fable, Grok, Codex Verifikation)  
**Quellagen:** Kahoot-Websearch (96 Features), Razzoozle-Codebase + 7 Lens-Reports

---

## (A) GAP-ANALYSE: Razzoozle vs Kahoot

### Fragetypen (Question Types)

| Kategorie | Kahoot (16) | Razzoozle (9) | Gap | Priorität |
|-----------|-------------|---------------|-----|-----------|
| **Basis-Modi** | ✅ Multiple Choice | ✅ choice | — | — |
| | ✅ True/False | ✅ boolean | — | — |
| | ✅ Type Answer (Freitext) | ✅ type-answer | — | — |
| | ✅ Multiple-Select | ✅ multiple-select | — | — |
| **Advanced Input** | ✅ Puzzle/Sequencing | ❌ | _Sortier-Aufgaben fehlend_ | SHOULD |
| | ✅ Slider/Rating Scale | ✅ slider | — | — |
| | ✅ Poll (unkorriert) | ✅ poll | — | — |
| | ✅ Word Cloud | ❌ | _Wort-Häufigkeits-Visualisierung fehlend_ | NICE |
| | ✅ Brainstorm | ❌ | _Kollaborative Ideensammlung fehlend_ | NICE |
| | ✅ Drop Pin / Hotspot | ❌ | _Klick-auf-Bild-Modus fehlend_ | SHOULD |
| | ✅ Matching (Paarung) | ❌ | _Zuordnungs-Aufgaben fehlend_ | SHOULD |
| | ✅ Fill in the Blank (Lückentext) | ❌ | _Strukturierte Lückenfüllung fehlend_ | SHOULD |
| | ✅ Diagram Labeling | ❌ | _Anatomie/Diagramm-Beschriftung fehlend_ | NICE |
| | ✅ Confidence Rating | ❌ | _Antwort + Selbsteinschätzung fehlend_ | NICE |
| | ✅ Vocabulary Review | ❌ | _Vokabel-Modus mit Aussprache fehlend_ | SKIP (zu spezialisiert) |
| | ✅ Micro-Lessons (Video+Quiz) | ❌ | _Kurzvideo-Integration fehlend_ | NICE |
| | ✅ Practice Tests | ❌ | _Mehrteilige Übungsszenarien fehlend_ | SKIP (zu Enterprise) |
| **Razzoozle-Eigenheiten** | — | ✅ sentence-builder | N/A | — |
| | — | ✅ mathematik | N/A | — |
| | — | ✅ wortarten | N/A | — |

**Gap-Zusammenfassung:** Razzoozle hat 9/16 Kahoot-Fragetypen. Fehlend: Sequencing, Drop Pin, Matching, Fill-in-Blank (4× SHOULD), Word Cloud, Brainstorm, Diagram, Confidence, Vocabulary, Micro-Lessons (6× NICE). 3× Razzoozle-Spezialtypen (DE-Fokus).

---

### Game-Modi (Play Modes)

| Feature | Kahoot (8) | Razzoozle (4) | Gap | Priorität |
|---------|-----------|---------------|-----|-----------|
| **Core** | ✅ Classic Live | ✅ Classic Live | — | — |
| | ✅ Team Mode | ✅ Team Mode | — | — |
| | ✅ Self-Paced / Assignments | ❌ | _Async Homework-Modus fehlend_ | SHOULD |
| | ✅ Study Mode / Flashcards | ❌ | _Wiederholungs-Modus fehlend_ | SHOULD |
| | ✅ Practice Mode | ❌ | _Unbewertete Trainings-Sessions fehlend_ | SHOULD |
| | ✅ Ghost/Replay (KI-Gegner) | ❌ | _Offline-/Replay-Modus fehlend_ | NICE |
| | ✅ Challenge Mode (Asynchron) | ❌ | _Freund-Herausforderungen fehlend_ | NICE |
| | ✅ Kahoot! Jumble (Wort-Spiel) | ❌ | _Wort-Rätsel-Modus fehlend_ | SKIP (zu speziell) |
| **Razzoozle-Modi** | — | ✅ Solo | N/A | — |
| | — | ✅ Klassen (Class) | N/A | — |

**Gap-Zusammenfassung:** Razzoozle hat 2/8 Kahoot-Modi. Fehlend: Self-Paced, Study, Practice, Ghost/Replay (4× SHOULD), Challenge (1× NICE). Razzoozle bietet Solo + Klassen (keine Kahoot-Äquivalente, aber MUST für self-hosted Klassenzimmer-Quiz).

---

### Host-Features (Session Management & Controls)

| Feature | Kahoot (16) | Razzoozle | Gap | Priorität |
|---------|-----------|-----------|-----|-----------|
| **Session Management** | ✅ Live Session Management | ✅ Partial (join monitor, kick) | Fehlend: Spieler-Limit, Auto-Timeout | SHOULD |
| | ✅ Pause/Resume | ✅ (code: pause_game/resume_game events) | — | — |
| | ✅ Q&A Panel (Upvotes) | ❌ | _Live-Fragen von Spielern mit Moderation_ | NICE |
| | ✅ End-of-Game Summary | ✅ (Podium, Top 3) | Fehlend: "Most Answered", Best Question stats | SHOULD |
| | ✅ Archive / Session Replay | ✅ (snapshot-based recovery) | Fehlend: User-sichtbare Replay-UI | SHOULD |
| **Appearance & Branding** | ✅ Lobby Music (50+) | ✅ Custom Sound Upload (aber keine Presets) | Limitiert auf Upload | SHOULD |
| | ✅ Lobby Themes | ✅ (manager:theme, SET_THEME) | — | — |
| | ✅ Immersive Branding (112+ Fonts) | ✅ Skeleton Assets (CSS/JS Edit) | Fehlend: Font-Presets, 112+ Optionen | NICE |
| | ✅ Custom Logo + Colors | ✅ (via THEME events, background upload) | — | — |
| **Live Control** | ✅ Timer Control | ✅ (ADJUST_TIMER) | — | — |
| | ✅ Skip Question | ✅ (SKIP_QUESTION) | — | — |
| | ✅ Reveal Answer | ✅ (REVEAL_ANSWER) | — | — |
| | ✅ Randomize Questions | ❌ | _Frage/Antwort-Randomisierung_ | NICE |
| | ✅ Participant Cap | ❌ | _Max-Spieler-Limit fehlend_ | SHOULD |
| **Podium & Analytics** | ✅ Podium / Leaderboard | ✅ (dynamic ranking) | — | — |
| | ✅ Streaks & Bonus Points | ❌ | _Bonuspunkte für Serien fehlend_ | NICE |
| | ✅ Live Stats Dashboard | ⚠️ Partial (low-latency metrics für host) | Fehlend: grafische Antwortverteilung pro Frage | SHOULD |
| | ✅ Export/Screenshot Results | ❌ | _Results-Export (PNG/PDF) fehlend_ | NICE |
| | ✅ Bulk Question Import | ❌ | _CSV/Excel-Import für Massenerstellung_ | SHOULD |

> **⚠️ Korrektur (deterministischer Grep, 2026-07-23):** `manager:skipQuestion`, `manager:adjustTimer`, `manager:revealAnswer` sind in `rust/protocol/src/constants.rs:97–99` definiert und serverseitig gehandhabt (`socket/manager/game_flow/`), aber **kein Client-Code emittet sie** — im Manager-UI fehlen die Buttons (nur pauseGame/resumeGame sind verdrahtet, `RejoinQrDialog.tsx:33`). Die drei ✓-Zeilen oben sind daher „Backend ready, UI unwired" = Quick-Win-Gap.

**Gap-Zusammenfassung:** Razzoozle hat ~70% Host-Features. Fehlend: Q&A Panel, Session-Replay-UI, Musik-Presets, Randomize, Participant Cap, Streaks, detaillierte Live-Stats, Export, Bulk Import (5× SHOULD, 3× NICE).

---

### Spieler-Features (Player Experience)

| Feature | Kahoot (12) | Razzoozle | Gap | Priorität |
|---------|-----------|-----------|-----|-----------|
| **Joining & Identity** | ✅ PIN-basiertes Joining (6-stellig) | ✅ (PIN-Code Join + Emoji-PIN für Klassen) | — | — |
| | ✅ Nickname Entry | ✅ (USERNAME validierung, i18n-Namen) | Fehlend: minLength frontend (Gap #1) | MUST |
| | ✅ Avatars (100+) | ✅ (Avatar-Wahl, SET_AVATAR) | Limitiert auf verfügbare Assets | SHOULD |
| **Scoring & Leaderboard** | ✅ Real-time Scoring | ✅ (live Punkte-Updates) | — | — |
| | ✅ Leaderboard Visibility | ✅ (mit Optional-Anonymität) | — | — |
| | ✅ Progress Tracking | ❌ | _Lern-Fortschritt über Sessions_ | NICE |
| **Customization & Accessibility** | ✅ Personalized Learning Path | ❌ | _Adaptive Schwierigkeit_ | SKIP (ML-heavy) |
| | ✅ Mobile-First Interface | ✅ (responsive, PWA-ready) | — | — |
| | ✅ Offline Mode (Partial) | ❌ | _Offline-Gameplay (Ghost Mode)_ | NICE |
| | ✅ Accessibility (WCAG AA) | ✅ (Screen-Reader, Keyboard) | Vollständige Prüfung ausstehend | SHOULD |
| | ✅ Answer History | ⚠️ Partial (via recap) | Fehlend: persistent history across sessions | NICE |
| | ✅ Study Reminders | ❌ | _Benachrichtigungen für Aufgaben_ | SKIP (no auth system) |

**Gap-Zusammenfassung:** Razzoozle hat ~75% Spieler-Features. Fehlend: Login-basierter Progress, Offline-Modus, persistent Answer History (3× NICE), Accessibility vollständig (1× SHOULD).

---

### Reports & Analytics

| Feature | Kahoot (10) | Razzoozle | Gap | Priorität |
|---------|-----------|-----------|-----|-----------|
| **Basic Reports** | ✅ End-of-Game Summary | ✅ (Podium, Top 3) | — | — |
| | ✅ Question-Level Statistics | ⚠️ Partial (per-question recap) | Fehlend: Antwortverteilung-Grafik | SHOULD |
| **Detailed Analytics** (Premium) | ✅ Time-to-Answer Metrics | ❌ | _Durchschnittliche Antwortzeit_ | SHOULD |
| | ✅ Question Effectiveness | ❌ | _Zu schwer/leicht Analyse_ | NICE |
| | ✅ Performance Analytics | ❌ | _Trends über Sessions_ | NICE |
| | ✅ Custom Report Generation | ❌ | _Benutzerdef. Reports_ | SKIP (too complex) |
| **Integration & Export** | ✅ CSV/Excel Export | ❌ | _Datenexport_ | NICE |
| | ✅ Grade Passback to Google Classroom | ❌ | _LMS-Integration_ | SKIP (no auth) |
| | ✅ LMS Integration (Canvas, Blackboard) | ❌ | _LMS-Sync_ | SKIP (self-hosted) |
| | ✅ API Reports Access | ❌ | _Programmatic Access_ | SKIP (self-hosted) |

**Gap-Zusammenfassung:** Razzoozle hat ~30% Analytics-Features. Fehlend: detaillierte Statistiken, Export, LMS-Integration (aber irrelevant für self-hosted). Priorität: Antwortverteilungs-Grafik + Time-to-Answer (2× SHOULD).

---

### Content-Erstellung & KI

| Feature | Kahoot (12) | Razzoozle | Gap | Priorität |
|---------|-----------|-----------|-----|-----------|
| **AI Generation** | ✅ AI Question Generator | ✅ (GENERATE_QUESTION, multi-provider) | — | — |
| | ✅ AI Image Generation | ✅ (GENERATE_IMAGE, ComfyUI + Z-Turbo) | — | — |
| | ✅ AI Question Extractor | ❌ | _Text→Quiz-Extraktion_ | NICE |
| | ✅ AI Recommendations | ❌ | _Vorschläge für fehlende Fragetypen_ | SKIP (too smart) |
| **Content Management** | ✅ Template Library (1000+) | ❌ | _Quiz-Templates_ | NICE |
| | ✅ Content Import (PowerPoint, PDF, Docs) | ❌ | _Office-Import_ | SHOULD |
| | ✅ Batch Upload (CSV) | ❌ | _CSV-Bulk-Import für Fragen_ | SHOULD |
| | ✅ Duplicate / Clone Quiz | ✅ (QUIZZ.DUPLICATE) | — | — |
| | ✅ Version History | ❌ | _Rollback zu früheren Versionen_ | NICE |
| | ✅ Content Sharing / Marketplace | ❌ | _Public Quiz-Marketplace_ | SKIP (self-hosted) |
| | ✅ Collaborative Editing | ❌ | _Multi-Author simultane Edits_ | SKIP (self-hosted) |
| | ✅ Media Library | ✅ (MEDIA events, Upload/Delete) | — | — |

**Gap-Zusammenfassung:** Razzoozle hat ~50% Content-Features (focussiert auf AI + Media, fehlt aber Import/Templates). Wichtig: CSV-Bulk-Import (1× SHOULD).

---

### Integrationen

| Feature | Kahoot (17) | Razzoozle | Gap | Priorität |
|---------|-----------|-----------|-----|-----------|
| **LMS & Enterprise** | ✅ Google Classroom | ❌ | _Classroom-Integration_ | SKIP (self-hosted) |
| | ✅ Microsoft Teams | ❌ | _Teams-Tab_ | SKIP (self-hosted) |
| | ✅ Canvas / Blackboard / Moodle | ❌ | _LMS-Sync_ | SKIP (self-hosted) |
| | ✅ Clever / ClassCode / OneRoster | ❌ | _Roster-Import_ | SKIP (self-hosted) |
| | ✅ Seesaw Portfolio | ❌ | _Portfolio-Sync_ | SKIP (self-hosted) |
| **Cloud & Video** | ✅ Zoom / Google Meet / Webex | ❌ | _Video-Platform-Integration_ | SKIP (self-hosted) |
| | ✅ Slack | ❌ | _Slack-Benachrichtigungen_ | SKIP (self-hosted) |
| **Developer** | ✅ API Access (REST, SDKs) | ❌ | _Public API für Custom Apps_ | SKIP (self-hosted) |
| | ✅ SCORM Packaging | ❌ | _SCORM-Export_ | SKIP (self-hosted) |
| | ✅ Deep Linking | ❌ | _LMS-Deep-Link_ | SKIP (self-hosted) |
| | ✅ PowerPoint / PDF Import | ❌ | _Office-Datei-Import_ | SHOULD |
| | ✅ Zapier / Make (No-Code) | ❌ | _Zapier-Automation_ | SKIP (self-hosted) |

**Gap-Zusammenfassung:** Razzoozle hat 0% Integrationen (Cloud/LMS alle SKIP für self-hosted Kontext). Nur relevante SHOULD: PowerPoint/PDF-Import.

---

### Skalierung & Infrastruktur

| Feature | Kahoot (15) | Razzoozle | Gap | Priorität |
|-----------|-----------|-----------|-----|-----------|
| **Plans & Limits** | ✅ Free Plan (10 players) | ✅ Self-hosted (unlimited players) | — | — |
| | ✅ Tiered Plans (Basic, Pro, Enterprise) | N/A (self-hosted, single-tier) | — | — |
| **Admin & Security** | ✅ Admin Console / Dashboard | ✅ Partial (Manager UI, no multi-tenant) | Fehlend: Multi-Org-Admin | SKIP (not needed) |
| | ✅ User Management & Roles | ✅ (Manager auth, Admin password) | Fehlend: Teacher/Student/Admin roles | SHOULD |
| | ✅ License Management | N/A (self-hosted) | — | — |
| | ✅ Single Sign-On (SAML/OIDC) | ❌ | _Enterprise SSO_ | SKIP (self-hosted) |
| **Performance** | ✅ WebSocket Real-time Sync | ✅ (socketioxide, low-latency mode) | — | — |
| | ✅ Global CDN | N/A (self-hosted) | — | — |
| | ✅ API Rate Limits | ✅ (rate_limit.rs, GENERATE_QUESTION throttle) | — | — |
| **Reliability** | ✅ Uptime SLA (99.5%) | ✅ (crash recovery via snapshots) | Fehlend: Guaranteed Uptime SLA | N/A |
| **Compliance** | ✅ GDPR / Data Residency | ✅ (self-hosted, no external data) | — | — |
| | ✅ WCAG Accessibility | ✅ (partial, needs audit) | Accessibility audit pending | SHOULD |

**Gap-Zusammenfassung:** Razzoozle hat ~90% Skalierungsfeatures für self-hosted Kontext. Fehlend: Multi-User-Rollen (Teacher/Student granular), Accessibility-Audit (2× SHOULD, aber SKIP für self-hosted).

---

## (B) FEHLER-LISTE (KONSOLIDIERT)

**Quelle:** 7 Lens-Reports (adversariale Verifikation).  
**Verdikt:** 17 CONFIRMED (1× P1 data-loss, 4× P1 security/coverage, 4× P2 analytics/edge, 8× P3 mitigated + 3 refuted).

### P1 — CRITICAL (Data Loss, Security, Core Gameplay)

| # | Fehler | Datei:Zeile | Szenario | Lens |
|---|--------|-----------|----------|------|
| **1** | **Snapshot Restore Missing Answer History** | `rust/server/src/state/snapshot.rs:46-86` | Game crash mid-SelectAnswer → restore → alle aufgezeichneten Antworten verloren. Score falsch. | rust-state-races |
| **2** | **Satellite-Auth Orphan (Client sends, Server ignores)** | `web:socket-context.tsx:188` / `rust:main.rs:270-284` | Satellite-Display sendet `satelliteToken` → Server discardet. Authentifizierung für Presenter-Kiosks broken. | socket-contract |
| **3** | **Multiplayer e2e viewport gap** | `e2e/stagehand/mp-loop.spec.ts` (no setViewportSize) vs. `solo-types.spec.ts:329` | Multiplayer-Tests laufen nur default-viewport; Mobile-/Tablet-Layout-Bugs in MP ungetestet. | test-gaps |
| **4** | **Admin account deletion e2e missing** | `rust/server/src/socket/manager/auth.rs` (exists) + `e2e/` (zero tests) | WP-1C fix deployed (admin kann own account nicht löschen) aber e2e-Beweis fehlt. Security-regression risk. | test-gaps |
| **5** | **Snapshot/Restore e2e zero coverage** | `rust/server/src/state/snapshot.rs:180+` (unit tests) + `e2e/` (zero) | Crash-Recovery ist kritisch (P1 scenario) — KEINE e2e-Validierung dass Spieler rejoin + game resumes. | test-gaps |

### P2 — HIGH (Data Integrity, Analytics Gap, Core Feature Missing)

| # | Fehler | Datei:Zeile | Szenario | Lens |
|---|--------|-----------|----------|------|
| **6** | **Snapshot Restore Missing Per-Question Stats** | `rust/server/src/state/snapshot.rs` (missing fields) | Crash nach Q2 → restore → `question_stats`, `recap_stats`, `answer_order` leer. Recap-Kalkulationen broken. | rust-state-races |
| **7** | **Hardcoded German error string (solo.ts)** | `packages/web/src/features/game/stores/solo.ts:146` | `Fehler ${res.status}` hardcoded (fallback wenn API-Fehler keine Nachricht hat) → nicht i18n. | i18n-ux |
| **8** | **Hardcoded German network error (solo.ts)** | `packages/web/src/features/game/stores/solo.ts:164` | `"Netzwerkfehler beim Laden des Quiz."` hardcoded → sollte i18n.game.networkError sein. | i18n-ux |
| **9** | **Username minLength mismatch** | `web:Username.tsx:20` (no minLength) vs. `rust:state/mod.rs:25` (USERNAME_MIN_LEN=4) | Frontend akzeptiert 1-3 Zeichen; Server lehnt ab → UX-Friction (Fehler erst nach Submit). | i18n-ux |
| **10** | **Free-text mode allows duplicate usernames** | `rust/server/src/socket/player/login.rs:369` (dedup nur by client_id, nicht name) | Mehrere Clients können identischen Namen in free-text join (Class-Mode hat Dedup via identifier_hash). Leaderboard-Verwirrung. | i18n-ux |
| **11** | **Mid-game reconnect e2e missing** | `e2e/kick-roster.spec.ts:236` (nur Kommentare, kein Test) | Player mid-SELECT_ANSWER → netzwerk-drop → rejoin: KEINE e2e validiert dass game state resumes (timer, question, leaderboard). | test-gaps |
| **12** | **AI rate-limiting e2e missing** | `rust/server/src/state/rate_limit.rs` (Rust tests exist) + `e2e/` (zero) | Manager spamt "Generate Question" 21×/5s → Server throttle auf 20+ sollte getestet sein (client should see "rate limited"). | test-gaps |

### P3 — MEDIUM (Feature Gap, Workaround Exists, Edge Case)

| # | Fehler | Datei:Zeile | Szenario | Status |
|---|--------|-----------|----------|--------|
| **13** | **Answer deadline edge case (submit after)** | `e2e/answer-flow.spec.ts:490` (nur before deadline) | P2 submittet >1s NACH Deadline → Server should mark 0 points. e2e testet nur "before deadline". | test-gaps |
| **14** | **Manager live-control e2e missing** | `constants.ts:115-117` (SKIP_QUESTION, ADJUST_TIMER, REVEAL_ANSWER defined) + `e2e/` (zero tests) | Host clicks Skip/Adjust/Reveal → KEINE e2e validates players receive event + leaderboard reflects. | test-gaps |
| **15** | **Display lifecycle e2e missing** | `rust/server/src/socket/display.rs` exists + `e2e/` (zero) | Presenter-Modus: Display pairs via 5-digit code, joins, disconnects → host marks offline after 30s. KEINE e2e für heartbeat/stale. | test-gaps |
| **16** | **Team mode e2e missing** | `constants.ts` defines TEAMS + e2e zero matches | Manager enables team mode → players join red/blue/green → team-score aggregation. KEINE e2e validates team assignment + ranking. | test-gaps |
| **17** | **Class mode (Klassen) e2e missing** | `rust/server/src/socket/manager/classes.rs:44K` exists + `e2e/` zero class tests | Teacher creates class, students join with emoji-PIN → KEINE e2e validates PIN validation, student lookup, class-filtered leaderboard. | test-gaps |

**REFUTED (8 findings keine Beweis gefunden):**
- QR error hardcoded: i18n verwendet korrekt (QRCode.tsx, RejoinQrDialog)
- Question editor help text: keine hardcoded Strings in Submission
- CSS contrast translation: alle 6 Locales haben Keys (pass/fail design choice)
- Long name truncation: Tailwind truncate class applied
- Zero players edge: kein unhandled scenario
- Browser back: React Router handled
- State-sync gaps: lifecycle STATUS events alle emitted
- Handler signature mismatch: backward-compat fallback ist intentional

---

## (C) TOP-10 EMPFEHLUNGEN (Impact + Aufwand)

**Scoring:** (Impact: 1–5) × (Aufwand: 1–5 inverse, d.h. low effort = high score) = Impact/Effort-Ratio.  
**Gruppierung:** Gaps (Kahoot-Parität) + Fixes (Bug-Behebung).

### 1. **Snapshot: Speichere `current_answers` + Per-Question Stats** (P1 Data-Loss Fix)
- **Impact:** 5 (verhindert Datenverlust nach Crash)
- **Aufwand:** 2 (Schema-Extension, 50–100 LOC)
- **Ratio:** 2.5 (HIGHEST)
- **Details:** Serialize `current_answers: HashMap`, `question_stats`, `recap_stats`, `answer_order` in snapshot.rs:46–86. Restore muss diese Felder rekonstruieren.
- **Priorität:** MUST (P1 blocker)

### 2. **Backend: Satellite-Auth Token Handling** (P1 Security Fix)
- **Impact:** 5 (activiert Presenter-Mode)
- **Aufwand:** 3 (auth middleware + token extraction, 100–150 LOC)
- **Ratio:** 1.67
- **Details:** Server muss `satelliteToken` aus socket auth payload extrahieren + validieren, äquivalent zu `sessionToken`. Presenter-Display-Kiosks können danach als Manager fungieren.
- **Priorität:** MUST (P1 blocker)

### 3. **E2E Test Suite Expansion: 12 Critical Scenarios** (P1 Coverage)
- **Impact:** 4 (Regression-Prävention für Core-Flows)
- **Aufwand:** 4 (12 neue spec files, ~100 LOC je spec)
- **Ratio:** 1.0
- **Details:** Add tests for: multiplayer viewport (3 sizes), admin deletion, snapshot restore + rejoin, mid-game reconnect, AI rate-limit, manager live-controls (3), display lifecycle, team mode, class mode.
- **Priorität:** MUST (P0 coverage gaps)

### 4. **Username Validation: Frontend minLength = 4** (P2 UX Fix)
- **Impact:** 3 (verhindert UX-Friction bei zu kurzen Namen)
- **Aufwand:** 1 (1-Zeiler `minLength={4}` in Username.tsx:20)
- **Ratio:** 3.0
- **Details:** Match backend USERNAME_MIN_LEN. Auch `maxLength={20}` verifizieren.
- **Priorität:** SHOULD (einfacher Fix)

### 5. **i18n: Ersetze hardcoded German Strings in solo.ts** (P2 Localization)
- **Impact:** 2 (verhindert i18n-Regression in Solo-Modus)
- **Aufwand:** 1 (2 Strings in locale/*/game.json hinzufügen + solo.ts refs, ~20 LOC)
- **Ratio:** 2.0
- **Details:** Error fallback (`Fehler ${status}`) + network error (`Netzwerkfehler...`) zu i18n-Keys umleiten.
- **Priorität:** SHOULD (Localization compliance)

### 6. **Free-Text Duplicate Username Prevention** (P2 Data Integrity)
- **Impact:** 3 (verhindert Leaderboard-Verwirrung)
- **Aufwand:** 2 (login.rs dedup-Logik für free-text erweitern, 50 LOC)
- **Ratio:** 1.5
- **Details:** `login.rs:369` should deduplicate free-text names ähnlich wie class-mode (identifier_hash pattern). Emit ALREADY_JOINED error.
- **Priorität:** SHOULD (edge case but clear fix)

### 7. **Live Stats Dashboard: Antwortverteilung pro Frage** (Gap: Analytics)
- **Impact:** 4 (Host-Feature für bessere Pedagogy-Entscheidungen)
- **Aufwand:** 3 (aggregiere question_stats + Chart-UI, 150–200 LOC)
- **Ratio:** 1.33
- **Details:** Server emits `answer_distribution` per question; Host UI zeigt Balken-Diagramm (Choice: opt A 40%, opt B 30%, ...). Basiert auf vorhandenen `question_stats`.
- **Priorität:** SHOULD (Kahoot-Parität Host-Features)

### 8. **Add Sequencing / Drag-Drop Question Type** (Gap: Fragetypen)
- **Impact:** 4 (SHOULD-Fragetyp für Kahoot-Parität)
- **Aufwand:** 4 (neue QType, Engine-Logik, Client UI, ~300 LOC)
- **Ratio:** 1.0
- **Details:** Ziel: Elemente sortieren (z.B. "Ordne Zahlen aufsteigend"). Basiert auf existing `type-answer` aber mit Drag-Drop-UI statt Text-Input.
- **Priorität:** SHOULD (Popular feature)

### 9. **Add Self-Paced / Homework Assignment Mode** (Gap: Game-Modi)
- **Impact:** 4 (SHOULD-Modus für Klassen-Hausaufgaben)
- **Aufwand:** 5 (async game state, deadline tracking, results reporting, ~400 LOC)
- **Ratio:** 0.8
- **Details:** Spieler spielen async, eigenes Tempo, Deadline-Enforcement, Results-Abruf durch Teacher. High effort, aber MUST für Klassenzimmer-Parität.
- **Priorität:** MUST (Core classroom feature, aber high effort)

### 10. **CSV Bulk Question Import (PowerPoint/PDF + Fallback)** (Gap: Content)
- **Impact:** 3 (SHOULD für Teacher-Onboarding)
- **Aufwand:** 4 (CSV parser + validation, media linking, ~250 LOC)
- **Ratio:** 0.75
- **Details:** Upload CSV mit Spalten (question, type, options, correct_answer, ...). Fallback: PowerPoint/PDF zu CSV converter (optional, client-side oder external tool).
- **Priorität:** SHOULD (Quality-of-Life, aber hinter Sequencing/Self-Paced)

---

## Priorisierungs-Zusammenfassung

**MUST (Blocker):**
1. Snapshot recovery (P1) — Fable
2. Satellite auth (P1) — Codex
3. E2E test expansion (P0 coverage) — Stagehand/Sonnet

**SHOULD (Kahoot-Parität, nächste Wave):**
4. Username minLength (P2, 1 Punkt)
5. i18n solo.ts hardcoded (P2, 1 Punkt)
6. Duplicate username dedup (P2, 2 Punkte)
7. Live stats dashboard (Analytics, 3 Punkte)
8. Sequencing QType (Fragetypen, 4 Punkte)

**NEXT WAVE (High-effort, nach Basics):**
9. Self-Paced mode (4 Punkte, BUT classroom core)
10. Bulk Import CSV (3 Punkte, quality-of-life)

---

**SECURITY-CHECK:** PASS (analysis only, no code edits, no secrets)  
**SESSION:** https://claude.ai/code/session_019D8jd47Loe8P1CrCjinxYe
