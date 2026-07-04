# Razzoozle ↔ Kahoot — Gap-Verifikation (Code-Grundwahrheit)

**Datum:** 2026-06-20
**Methode:** Read-only Multi-Agent-Verifikation der Gap-Analyse (`docs/KAHOOT-GAP-ANALYSIS-v2.md`) gegen den **echten** Code (`packages/{common,socket,web,mcp}`) + 3-Modell-Fusion-Panel (`opus4.8-gpt5.5-gemini3.1pro`) für die Strategie.
**Scope:** Verifikation + korrigierte Roadmap. Keine Code-Änderungen, kein `design.md` angefasst.
**Verdikt in einem Satz:** Die Gap-Analyse **überschätzt die Lücken massiv** — der gesamte vorgeschlagene **P0 (Reports v1 + Fragetypen true/false/multi-select/poll) ist bereits end-to-end geshippt.** Die echten Lücken liegen woanders.

---

## 1. Kurzfazit

Eine Read-only-Welle aus 6 Inventory-Agenten + 3 Adversarial-Verifizierern hat jede Behauptung der Gap-Analyse gegen die Quelle geprüft (file:line-Belege). Ergebnis:

- **Der komplette P0 existiert schon.** Razzoozle hat ein geschlossenes **6-Typen-Fragesystem** und **persistente Live-Reports inkl. Manager-Tab + Viewer + CSV + öffentlicher Share-Page**. Die Doc-Annahme „mostly single multiple-choice, keine Reports" ist falsch.
- **Auch viel P1/P2 ist bereits da:** open-ended + slider (Fragetypen), kick, reconnect, ghost-cleanup, **host-leave teardown** (die Doc-Notiz zu „Ghost-Lobbies" ist **veraltet**), ownership-auth, der zweistufige Join-Flow, die `/r/:id`-Share-Page.
- **Die echten, verifiziert-fehlenden Lücken:** Assignment-Modus (Wrapper um das vorhandene Solo), Player-Identifier (spielübergreifend), Accuracy-Scoring-Modus, Creator-Preview, der Grossteil der Live-Settings-Matrix (lock-lobby, randomize, …), Report-**Tiefe** (Antwortzeit pro Antwort + Export pro Frage), Word-Cloud/Puzzle/Confidence/OG-Image/Nickname-Tools.
- **Plugin-Realität (vom Opus-Panelist aufgedeckt):** Das v1-Plugin-System ist **Manager-UI-only** — es kann **keine** Fragetypen, Lifecycle-Hooks, Player-UI oder HTTP-Routes hosten. „Word-Cloud/Confidence einfach als Plugin" geht erst nach einem **v2-Plugin-Seam** (eigenes Core-Item).

**Konsequenz:** Die nächste Welle sollte **nicht** der Doc-P0 sein, sondern **Reports-Tiefe** (das echte Fundament), gefolgt von Assignment + Identifier.

---

## 2. Methodik

| Schritt | Wie |
|---|---|
| Code-Verifikation | Dynamischer Workflow, 6 Inventory-Slices (A–F) + 3 Adversarial-Checks (V1–V3), strikt read-only, Antwort nur als strukturierte JSON mit file:line-Evidence. Wegen eines transienten Server-Rate-Limits auf max. 2 parallele Agenten gedrosselt. |
| Strategie | Fusion-Panel `opus4.8-gpt5.5-gemini3.1pro` — dieselbe Frage blind & parallel an 3 Frontier-Modelle, Opus 4.8 als Judge (Track B). GPT-5.5 und Opus haben dabei **unabhängig** den Code gescannt und die Reports-Realität bestätigt. |

Provenienz des Panels: `~/.claude/fusion-runs/2026-06-20_154006_opus4.8-gpt5.5-gemini3.1pro.md`.

---

## 3. Verifizierte Gap-Matrix

Buckets: ✅ existiert · 🟡 teilweise · ❌ fehlt · 🔵 bewusst out-of-scope / Plugin · 🟣 Design-Entscheidung nötig

| GAP | Doc-Behauptung | Verdikt | Belege (file:line) | Restarbeit |
|---|---|---|---|---|
| **GAP-002** Fragetypen true/false, multi-select, poll | P0 fehlt | ✅ **existiert** | `common/src/constants.ts:305-312` `QUESTION_TYPES` = `[choice, boolean, slider, poll, multiple-select, type-answer]`; Editor `web/.../QuestionEditor/QuestionEditorType.tsx` (alle 6 Karten); Scoring `socket/.../game/round-manager.ts:1124,1169-1188`; Validator `common/src/validators/quizz.ts:25,60-111` | — (true/false = `boolean`, open-ended = `type-answer`, nur Namen anders) |
| **GAP-009** open-ended + slider | P2 fehlt | ✅ **existiert** | `type-answer` mit Fuzzy-Match + Anti-Cheat: `socket/.../game/text-match.ts`, Test `socket/src/__tests__/type-answer.test.ts`; `slider` Proximity-Scoring `round-manager.ts:1150-1164` | — |
| **GAP-001** Reports v1 (Live) | P0 fehlt | ✅ **existiert** | Persist: `round-manager.ts:2531-2553` → `saveResult` `game/index.ts:277` → `config.ts:852` (`config/results/<id>.json`); Manager-Tab `ConfigResults.tsx`; Viewer `ResultModal` (Frage-%, Verteilung, Spielertabelle, Anonymisieren); CSV `web/.../manager/utils/resultExport.ts:48` | siehe GAP-001b |
| **GAP-001b** Report-**Tiefe** | (Teil von P0) | 🟡 **teilweise** | `PlayerAnswerRecord` (`common/.../game/index.ts:77-84`) speichert Antwortwahl/-text, **aber keine Antwortzeit**; CSV ist **nur Ranking** (rank/player/points) | responseMs erfassen + per-Frage CSV/JSON-Export |
| **GAP-007** Moderation | P2 | ✅ **grösstenteils** | kick `player-manager.ts:100-121`; reconnect `game/index.ts:576-676`; ghost-cleanup `index.ts:709-745` + `registry.ts:351,482`; **teardown** `handlers/game.ts:30-51,486-517` (Test `manager-leave-teardown.test.ts`); auth `player-manager.ts:101-103` | nur: lock-lobby, Nickname-Generator (für Menschen), Nickname-Moderation |
| **GAP-007b** 2-step join (Flow) | (Teil) | ✅ **existiert** (Flow) | Code→`SUCCESS_ROOM`→Name→`SUCCESS_JOIN`: `join/Room.tsx:55,68`, `join/Username.tsx:50,59` | Kahoots Anti-Bot-„2-Step" (Symbolauswahl) als *Toggle* fehlt |
| **GAP-011** Result-Share / OG | P3 | 🟡 **teilweise** | Share-Page `web/src/pages/r/$id.tsx` + OG-**Text** `http-routes.ts:658-704` | OG-**Image** (PNG/Canvas-Renderer) fehlt |
| **GAP-005** Live-Settings-Matrix | P1 fehlt | 🟡 **grösstenteils fehlt** | Game-Config = nur `teamMode`+`lowLatencyMode` (`validators/game-config.ts:35-41`, `config.ts:636-664`, UI `ConfigGameMode.tsx`); von 11 Items existiert **nur kick** | show-Q/A-on-device, randomize-Q/A, lock-join, 2-step-toggle, nickname-gen, reactions, unlimited-time (hart 5–120s `quizz.ts:47`), increase-contrast, team-talk-duration |
| **GAP-004** Assignment-Modus | P1 fehlt | ❌ **fehlt** (Solo-Core ✅) | Solo-Endpoints `http-routes.ts:385-507,742-768` verdrahtet; `deadline/maxAttempts/assignment-entity/requireIdentifier/showCorrectAnswers` = 0 rg-Treffer | komplette Assignment-Hülle |
| **GAP-003** Player-Identifier | P1 fehlt | ❌ **fehlt** | `Player` (`common/.../game/index.ts:15-32`) = username+avatar+clientId; clientId = per-Connection-Dedup, **keine** cross-game identity | identifierHash + Capture + Linkage |
| **GAP-006** Creator-Preview | P1 fehlt | ❌ **fehlt** | nur statische **Theme**-Preview (`theme-preview/index.tsx`, `ThemePreviewPanel.tsx`, MOCK_QUESTION-Swatches) | echtes Host+Player-Game-Preview |
| **GAP-008** Accuracy-Modus | P2 fehlt | ❌ **fehlt** | Scoring fest speed-gewichtet `utils/game.ts:58-68` `timeToPoint`; kein `GameScoringMode`; low-latency = nur Timing/Transport | scoring-mode-aware engine + report-Feld |
| **GAP-010** Word-Cloud (+ puzzle_order) | P3 | ❌ **fehlt** | 0 rg-Treffer für `word.?cloud` / `puzzle|reorder|ordering` in allen Packages | siehe Plugin-Track |
| **GAP-012** Confidence-Modus | P3 fehlt | ❌ **fehlt** | kein `confidence`-Feld in Schema/Types/Handlers/UI | hängt an Report-Tiefe |
| **Solo-Reports** | (Teil P1) | 🟡 **teilweise** | Solo persistiert nur `{playerName, score, answeredAt}` (`config.ts:2820-2882`); die optionale per-Frage-Korrektheit (`validators/solo.ts:23-30`) wird **verworfen** | per-Assignment-Analytics |

---

## 4. Adversarial-Verifizierer

| Check | Assertion | Verdikt | Kern-Beleg |
|---|---|---|---|
| **V1-reports** | „Keine persistenten Live-Reports" | **refuted_false** (high) | `config.ts:852` fs-write + `RESULTS.GET` auth-gated + `ConfigResults.tsx` Tab |
| **V2-qtypes** | „Nur single-MC, keine tf/ms/poll/open" | **refuted_false** (high) | `constants.ts:305` 6 Typen, jeder mit Validator+Scoring+UI (live **und** solo separate Pfade) |
| **V3-moderation** | „lock-lobby, kick, 2-step join — keiner da" | **partly_true** (high) | kick ✅ + 2-step-flow ✅; **nur** lock-lobby fehlt (`player-manager.join` ohne `started`-Gate) |

---

## 5. Fusion-Strategie (Judge-Synthese, Track B)

**Konsens (alle 3 Panelisten, unabhängig):** Reports sind das Fundament/Bottleneck (Assignment, Accuracy, Identifier, Confidence hängen daran). Fragetypen sind billig/quasi gelöst. Assignment soll Solo **wiederverwenden**. Identifier = privacy-first, opt-in, pseudonym, Gast-Default, **nie** in `/r/:id`. Creator-Preview ist überskaliert → **„Test-Play"-Button** statt Side-by-Side. Live-Settings → 2–3 Toggles cherry-picken, nicht die Voll-Matrix.

**Widersprüche (aufgelöst):** Welle-1 = Reports (codex/gemini) vs. Editor-Parität (opus) → durch Verifikation aufgelöst: Fragetypen+Editor sind da ⇒ echte Welle 1 ist Reports-**Tiefe**, nicht net-new Reports. Accuracy = Core-Flag (Leaderboard/Report-Konsistenz), nicht Plugin.

**Einzigartige Einsichten:** *opus* — v1-Plugin = nur Manager-Tooling; ein tieferer Reports-/Export-Tab ist ein v1-Plugin-Kandidat **und** Daten-Eigentum-Differenzierer (prototype-as-plugin → promote-to-core). *gemini* — „Abhängigkeits-Illusion": fast alles hängt an Reports; Live(transient)→Async(persistent)-State-Bruch beim Assignment wird unterschätzt; DSGVO-Gast-Modus ist Pflicht. *codex* — wenn prod == lokaler Stand, ist das Reports **v1.1-Härtung**, nicht v1.

**Blind Spots:** Das Panel nahm Reports+Fragetypen als fehlend an — die Verifikation widerlegt beides ⇒ der Doc-P0 entfällt komplett; echte Fundamentarbeit = Report-Anreicherung. Identifier = DSGVO-Mine (salted hash, opt-in, löschbar, nie in `/r/:id`). Der **v2-Plugin-Seam** ist eine ungeplante Voraussetzung.

### Korrigierte Wellen-Roadmap

- **Welle 0 — bereits geshippt (verifiziert):** 6 Fragetypen, Reports v1, Moderation-Core, Solo, Share. → Doc-P0 hinfällig.
- **Welle 1 — Reports-Tiefe (echtes Fundament):** Antwortzeit pro Antwort + per-Frage CSV/JSON-Export. Entsperrt Accuracy + Assignment-Analytics.
- **Welle 2 — Assignment (Solo-Wrapper) + Player-Identifier (privacy-first).**
- **Welle 3 — Accuracy-Modus (Core-Flag) + Live-Settings-Subset (lock-lobby + randomize-answers) + „Test-Play"-Button.**
- **Plugin-Track (parallel):** zuerst **v2-Plugin-Lifecycle/Render-Seam** als eigenes Core-Item; erst danach word-cloud/confidence als Plugins. v1-Plugins heute = Operator-Tooling (Reports-Export-Tab, webhook-on-finish).

---

## 6. File-disjunkte WP-Plan (echte P0/P1)

> **Contract-Kopplung beachten** (Projekt-Lesson): `game-config.ts`, `common/.../game/index.ts`, `socket.ts` und `round-manager.ts` sind geteilte Verträge. Pro Welle landet die Vertrags-Änderung in **einem** WP zuerst; Feature-WPs bauen danach auf disjunkten Dateien. Worker editieren nur, Orchestrator committet zentral.

### Welle 1 — Reports-Tiefe (P0)
| WP | Dateien | Disjunkt? |
|---|---|---|
| **R1** responseMs erfassen | `common/.../game/index.ts` (`PlayerAnswerRecord.responseMs`), `socket/.../validators.ts` (`gameResultValidator`), `socket/.../game/round-manager.ts` (Populate bei eval) | Vertrags-WP (zuerst) |
| **R2** per-Frage Export | `web/.../manager/utils/resultExport.ts` (+Fn), `web/.../manager/components/ResultModal/*` (Button) | ✅ disjunkt zu R1 |

### Welle 2 — Assignment + Identifier (P1)
| WP | Dateien | Disjunkt? |
|---|---|---|
| **C2** Vertrag | `common/src/validators/assignment.ts` (neu), `common/.../game/index.ts` (`Assignment`-Type + `Player.identifierHash?`), `common/validators/game-config.ts` (`requireIdentifier?`) | Vertrags-WP (zuerst, nach R1) |
| **A2a** Assignment-Server | `socket/.../config.ts` (Persistenz `config/assignments/<id>.json`), `socket/.../http-routes.ts` (Endpoints + deadline/attempts-Gate um Solo) | ✅ |
| **A2b** Assignment-Web | `web/src/pages/quizz/$id/` (+Assignment-Route/UI), neues `web/src/features/assignment/` | ✅ |
| **I2** Identifier | `socket/.../game/player-manager.ts` (Capture + salted hash), `web/.../game/components/join/Username.tsx` (opt-in Gate, Gast-Default) | ✅ (Vertrag aus C2) |

### Welle 3 — Accuracy + Settings + Preview-Ersatz (P1)
| WP | Dateien | Disjunkt? |
|---|---|---|
| **C3** Vertrag | `common/validators/game-config.ts` (`scoringMode`, `joinLocked`, `randomizeAnswers`), `common/.../game/socket.ts` (`LOCK_LOBBY`-Event) | Vertrags-WP (zuerst) |
| **M3** Accuracy-Scoring | `socket/.../utils/game.ts` + `socket/.../game/round-manager.ts` (mode-branch), `web/.../ConfigGameMode.tsx` (Selector) | ⚠ teilt round-manager — nach R1 sequenzieren |
| **S3a** lock-lobby | `socket/.../game/player-manager.ts` (`join` Gate auf `started`/`joinLocked`), `web/.../manager` (Toggle) | ⚠ teilt player-manager mit I2 — sequenzieren |
| **S3b** randomize-answers | `socket/.../game/round-manager.ts` (per-Spieler-Shuffle + Index-Remap im Result) | ⚠ teilt round-manager — sequenzieren |
| **P3** „Test-Play"-Button | `web/.../features/quizz/` Editor (öffnet `/quizz/$id/solo` in neuem Tab) | ✅ vollständig disjunkt, tiny |

### Plugin-Track (eigenständig)
| WP | Inhalt |
|---|---|
| **PS-v2** | v2-Plugin-Lifecycle/Render-Seam (game-result-Event + sanktionierter Player/Big-Screen-Render-Slot). **Voraussetzung** für word-cloud/confidence-als-Plugin. Eigenes Core-Investment, nicht „gratis". |

---

## 7. Anti-Ziele (bewusst NICHT bauen)

- **Fragetypen neu bauen** — existieren bereits (alle 6, end-to-end).
- **Reports v1 net-new** — existiert; nur Tiefe/Export nachziehen.
- **Voll-Creator-Preview** (Host+Player synchron) → durch „Test-Play"-Button ersetzen.
- **Voll-Live-Settings-Matrix** → nur lock-lobby + randomize jetzt.
- **„Word-Cloud/Confidence ist nur ein Plugin"** — im v1-Plugin-System **nicht** hostbar; erst v2-Seam.
- **Player-Identifier ohne Gast-Modus** — DSGVO-Mine.

---

## 8. Offene Design-Entscheidungen (🟣)

1. **Accuracy-Default:** speed bleibt Default, accuracy als opt-in Game-Flag? (Empfehlung: ja, Core-Flag.)
2. **Player-Identifier-Form:** externalId vs. salted-hash-only; Anzeige nie im Live-Spiel/`/r/:id`; Retention/Löschung. (Empfehlung: pseudonym, salted, opt-in, löschbar.)
3. **v2-Plugin-Seam jetzt oder später?** Bestimmt, ob word-cloud/confidence je Plugin werden oder im Core landen.
4. **Reports-Export als v1-Plugin prototypen** (Dogfooding + Differenzierer) und später in Core promoten?

---

## 9. Provenienz

- Code-Verifikation: 6 Inventory + 3 Adversarial-Agenten, read-only, file:line-Evidence (Workflow `wf_0ca8f4ae-220`).
- Fusion-Panel: `opus4.8-gpt5.5-gemini3.1pro`, Judge = Opus 4.8 → `~/.claude/fusion-runs/2026-06-20_154006_opus4.8-gpt5.5-gemini3.1pro.md`.
- Cross-Check: GPT-5.5 und Opus scannten den Code unabhängig und bestätigten dieselbe Reports-/Fragetypen-Realität (`config.ts:852`, `constants.ts:305`).
