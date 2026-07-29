# SDD: Razzoozle Restdelivery False-Completion Audit & Autonomous Wave Plan (#391/#466-#481/#498/#499)

**Datum:** 2026-07-27/28. **Autor:** Sonnet-5-Quality-Worker im Auftrag des Orchestrators.
**Worktree:** `.claude/worktrees/sdd-restdelivery`, Branch `docs/sdd-restdelivery`, Basis `a13e44705`.
**Status:** Arbeitsgrundlage, keine abgeschlossene Lieferung. Diese Datei ersetzt keine Issue-Historie, sondern bündelt sie entscheidungsfähig.

Jede Tatsachenbehauptung trägt eine `datei:zeile`-Referenz oder einen Befehl, mit dem sie reproduzierbar ist. Wo ich eine Aussage aus dem Auftrag nicht am Code bestätigen konnte oder sie präzisiert werden musste, steht das explizit als **Korrektur** oder **Nicht geprüft** markiert.

---

## 1. Executive Summary

Der Umbrella-Issue #391 und mehrere Einzel-Issues wurden als erledigt kommuniziert, obwohl die zugrunde liegende Arbeit teils nie geschrieben, teils nur als Typdefinition ohne Wirkung, teils durch einen späteren Commit wieder kaputt gemacht wurde. Diese Prüfung bestätigt vier eigenständige Befunde mit Code-Beleg:

1. **#499** — eine UI-Regression in der Benutzerverwaltung, verursacht durch den Refactor-Commit `c00052715`, der einen Layout-Rahmen doppelt setzt und zwei sicherheitsrelevante Guards sowie alle Test-IDs entfernt hat. Sieben datei-disjunkte Fix-WPs liegen auf `int/499-configusers` bereit, aber **ungemergt** (§11).
2. **#281** — ein am 2026-07-25 fälschlich als erledigt geschlossenes P0-Security-Issue (Socket-Rollen-Exklusivität). Der zugehörige Commit fügt ausschließlich einen 11-zeiligen Typ hinzu, ohne ihn irgendwo zu verwenden. Die Schwachstelle besteht unverändert. Vom Orchestrator wieder geöffnet, hier bestätigt (§10).
3. **Neuer P0-Bug (#504)** — vier Fragetypen (WordCloud, Brainstorm, Confidence, MicroLesson) wurden am 2026-07-27/28 in die Spieler-UI verdrahtet, aber die Server-Auswertung in `rust/engine/src/eval.rs` kennt sie nicht. Jede Antwort dieser vier Typen fällt auf den Default-Zweig und wird als falsch gewertet (§10, §12).
4. **Gap-Matrix #466–#481** — von den 16 in #498 aufgeführten „Kahoot-Gap"-Issues ist keines vollständig fertig. Die Einstufungen aus #498 waren größtenteils richtig; eine Einstufung (#471 Assignments) war falsch — der behauptete Contract-Mismatch existiert nicht, das eigentliche Problem ist eine fehlende serverseitige Autorisierungsprüfung (§9).

Zusätzlich bestätigt diese Prüfung eine **Buchführungs-Korrektur**: Die Behauptung, alle 15 Issues #432–#446 seien offen, ist falsch — 10 sind bereits geschlossen, 5 offen (§20).

Der Node-Backend (`packages/socket`) existiert seit Commit `a134d7d48` (2026-07-15) nicht mehr. Rust ist der einzige Backend-Pfad (§13).

## 2. Scope

- Verifikation der in #391, #498, #499, #281 sowie #466–#481 behaupteten Zustände gegen den tatsächlichen Code auf `main` (HEAD `a13e44705`) bzw. die referenzierten Feature-Branches.
- Konsolidierung zu einer Gap-Matrix mit klarer Ist/Soll-Trennung.
- Wellenplanung für die Restlieferung nach dem Prinzip: 1 WP ≈ 1 Datei ≈ <150 Zeilen Diff, Contracts/Tests/Docs/Locales als eigene WPs, Wellen mit ≥3 parallelen Workern.
- Benennung der echten Produktentscheidungen, die vor Implementierung getroffen werden müssen.

## 3. Nicht-Ziele

- Keine Implementierung. Dieses Dokument liefert keinen Code, keine Migration, keinen PR.
- Keine erschöpfende Zeilen-für-Zeilen-Prüfung aller 16 Gap-Issues. Wo „stichprobenartig geprüft" steht, wurden Existenz, Wiring-Status und die für die Matrix entscheidenden Code-Stellen verifiziert, aber nicht jede einzelne im Auftrag genannte Zahl erneut hergeleitet.
- Keine Änderung an `AGENTS.md`, `source/AGENTS.md` oder anderen Governance-Dateien — die dort festgestellte Veralterung (Node/Rust-Parität) wird als Folgeaufgabe vermerkt, nicht selbst behoben (§12).
- Keine erneute Ausführung der vollständigen CI-Kette (`pnpm verify`, `rust/gate.sh`, vollständige e2e-Suite) für #499 — die von den WP-Workern berichteten Gate-Ergebnisse wurden nicht in dieser Session nachgefahren (§19, §22).

## 4. Quellen

- Gitea-API `https://git.joelduss.xyz/api/v1/repos/agent-claude/Razzoozle` (Issues #281, #391, #432–#446, #466–#481, #498, #499 — Live-Abfrage 2026-07-28).
- Git-Historie des Repos (`git log`, `git show`) auf `main` und den Branches `int/499-configusers`, `wp/499-a-list` … `wp/499-g-locale`.
- `docs/gaps/kahoot-gap-analysis-2026-07-23.md` — Ursprung der 16 „Kahoot Gap #N"-Issues #466–#481.
- `docs/design/sdd-466-puzzle-sequencing.md` — vorhandene Teil-Spec für #466.
- Quellcode unter `rust/{engine,protocol,server}` und `packages/{common,web}` zum Stand `a13e44705`.
- Auftragstext des Orchestrators (Teammate-Message, s.o.) als Ausgangshypothese, gegen den Code verifiziert.

## 5. Geprüfte Issues

| Issue | Titel | API-Status (2026-07-28) | Rolle in diesem SDD |
|---|---|---|---|
| #281 | Security-Train: Socket-Rollen exklusiv und Same-Tab-Wechsel sicher machen | **open** (wieder geöffnet) | False-Completion-Fall, §10 |
| #391 | Program: verbleibende Kahoot-SHOULD/NICE Features B0–B6 | open | Umbrella, §5/§20 |
| #432–#446 | Einzelarbeiten unter #391 | 9× closed, 6× open (§20) | Buchführung, §20 |
| #439/#440 | Spec-Unterissues zu #281 | beide open | Vorhandene Spec, §21 |
| #466–#481 | 16 „Kahoot-Gap"-Feature-Issues | alle open | Gap-Matrix, §9 |
| #498 | Orchestrator-Handoff: False-Completion-Audit | open | Auftragsgrundlage dieses Dokuments |
| #499 | BUG: Benutzerverwaltung Karten-Design zerschossen | open | Regressionsanalyse, §11 |
| #504 | (neu angelegt in dieser Session) P0: WordCloud/Brainstorm/Confidence/MicroLesson serverseitig nicht auswertbar | — | False-Completion-Fall, §10 |

## 6. Geprüfte Commits

| Commit | Zusammenfassung | Befund |
|---|---|---|
| `a134d7d48` (2026-07-15) | `chore(nd1): delete dead Node backend files` | Entfernt `packages/socket` vollständig — Architekturwende zu Rust-only (§13) |
| `164232f2e` (2026-07-25) | `feat(common): WP #281 add VerifiedRole and HandlerCtx security policy types (#281)` | Einziger Commit zu #281: 11 Zeilen Typdefinition in `packages/common/src/types/game/socket.ts`, keine Verwendung. Grundlage der falschen Schließung (§10) |
| `c00052715` (2026-07-25) | `refactor(web): WP #191 ConfigUsers structural tail extraction (#191)` | Regressionsursache für #499: extrahiert `ConfigUsers.tsx` in 6 Dateien, verliert dabei Layout-Kanon, Selbstkopie-Guard, Kaskaden-Warnung und alle `data-testid` (§11) |
| `c69962925` … `0386330f0` (2026-07-28, 6 Commits) | Fix-Serie auf `int/499-configusers` | Behebt die #499-Regression datei-disjunkt, ungemergt (§11) |
| `a13e44705` (2026-07-28) | `feat(game): wire WordCloud, Brainstorm, Confidence, and MicroLesson UI into Answers & SoloAnswers` | Aktueller `main`-HEAD; verdrahtet die vier Fragetypen clientseitig, ohne serverseitige Auswertung nachzuziehen → #504 (§10, §12) |

## 7. Geprüfte Dateien und Symbole

Kernbelege, vollständig gegen den Worktree gelesen (nicht nur gegrept):

- `packages/web/src/features/manager/components/console/rowStyles.ts:19-21` — `rowShellBase`/`rowRestState`, Quelle des Kartenrahmens.
- `.../configurations/schueler/StudentList.tsx:90-91`, `.../klassen/ClassList.tsx:103`, `.../quizzes/QuizzList.tsx:215`, `.../catalog/ConfigCatalog.tsx:178` — Kanon-Container `space-y-3 p-0.5` (StudentList zusätzlich `overflow-y-auto`, sonst identisch).
- `.../schueler/ConfigSchueler.tsx:549`, `.../klassen/ConfigKlassen.tsx:532`, `.../catalog/ConfigCatalog.tsx:369` — je `<ActionFooter>` für die primäre Aktion.
- `.../configurations/ConfigUsers.tsx:232-237` (aktuell) vs. `c00052715~1` gleiche Datei Zeile 403-414 (vor dem Refactor) — Verlust des Selbstkopie-Guards.
- `.../configurations/users/UserManagementRow.tsx:34,68,88` — der Lösch-/Deaktivieren-Guard (`isSelf`) hat den Refactor **überlebt**; nur der Kopier-Guard ging verloren (Präzisierung gegenüber dem Auftrag, §11).
- `e2e/stagehand/admin-self-delete-guard.spec.ts:177,180` — hängt an `data-testid="users-search"` und `user-select-${id}`, aktuell 0 Treffer für `data-testid` in `configurations/users/*.tsx`.
- `packages/common/src/types/game/socket.ts:58-69` (Diff von `164232f2e`) — `VerifiedRole`/`HandlerCtx`, 0 Treffer für `VerifiedRole` in `rust/`.
- `rust/engine/src/eval.rs:110-358` — Funktion `evaluate_answer`, Kette von `if q_type == &Some(QuestionType::X)`-Zweigen; WordCloud/Brainstorm/Confidence/MicroLesson kommen darin nicht vor, fallen auf den Default (Zeile 343-357: `correct: false, base: 0.0`, sofern kein `answer_key`/`solutions`-Match).
- `rust/protocol/src/quizz.rs:88-94` — Enum-Deklaration der vier Typen.
- `rust/server/src/main.rs:21-41` — einzige weitere Fundstelle: eine reine Wire-Slug-Tabelle (`question_type_wire`), keine Auswertungslogik. **Korrektur:** Auftrag nannte „je 1 Treffer" — tatsächlich 2 (Enum + Slug-Map), beide ohne Scoring-Bezug.
- `packages/web/src/features/game/components/states/Answers.tsx:872-884` — `WordCloudDisplay` mit hartem `count: 1`, `BrainstormBoard.onAddIdea` verwirft den Text und ruft `handleAnswer(0)()`.
- `packages/common/src/utils/seededShuffle.ts:18-26` (Mulberry32) vs. `rust/server/src/socket/lifecycle/payloads.rs:1-21` und `rust/server/src/http/solo.rs:19-42` — **Präzisierung gegenüber dem Auftrag:** beide Rust-Stellen verwenden `rand::thread_rng()`, nicht `StdRng::seed_from_u64` — Letzteres kommt nur in Testcode vor (`chunks.rs:434-607`). Die Produktions-Shuffle ist in Rust also gar nicht geseedet, nicht nur „anderer Algorithmus" — und liegt zusätzlich byte-identisch dupliziert in zwei Dateien vor.
- `packages/web/src/features/manager/components/configurations/ParticipantCapSetting.tsx:64` — `max={5000}`; Komponente wird außer in ihrer eigenen Testdatei nirgendwo importiert.
- `rust/server/src/state/mod.rs:24` (`MAX_PLAYERS_PER_GAME: usize = 200`), enforced in `rust/server/src/socket/player/login.rs:536`.
- `packages/common/src/utils/csvQuestionParser.ts:24,44` — `.split(",")`, keine Anführungszeichen-Behandlung.
- `packages/web/src/pages/quizz/$id/assignment.$assignmentId.tsx:114` (`fetch('/api/assignment/${assignmentId}')`) vs. `rust/server/src/http/mod.rs:216` (`.route("/api/assignment/:id", get(assignments::handle_get_assignment))`) — Contract passt exakt, **#498s Behauptung eines Mismatches ist falsch** (§9, Zeile #471).
- `rust/server/src/http/solo.rs:424-429` (`handle_solo_score`) — 0 Treffer für `deadline|attempt_limit|max_attempts` in der ganzen Datei.
- `packages/web/src/features/manager/components/configurations/LobbyMusicSelector.tsx` (Presets `funk/disco/synthwave/chill/halloween`) vs. `packages/web/public/sounds/` (enthält nur 12 Spiel-Sound-Effekte, keine Musik-Presets).

## 8. Live- und Dev-Routen

Innerhalb des Repos ermittelte Routenstruktur (`packages/web/src/pages/`, Dateibasiertes Routing via TanStack-Router-Plugin, `route.gen.ts` generiert — nicht handeditieren, siehe `route_gen_is_generated`-Konvention):

- Vorhanden und mit Backend verdrahtet: `/`, `/manager/config/:tab`, `/manager/quizz/:quizzId`, `/manager/template/:templateId`, `/party/:gameId`, `/party/manager/:gameId`, `/display`, `/display/play`, `/quizz/:id/solo`, `/quizz/:id/practice`, `/quizz/:id/study`, `/quizz/:id/assignment/:assignmentId`, `/satellite/:gameId`, `/r/:id`, `/submit`, `/trophies`, `/theme-preview`.
- **Kein eigener Seiten-Pfad gefunden** für die drei am stärksten isolierten Gap-Features: kein `/challenge`-, kein `/ghost`- oder `/replay`-, kein `/qa`-Route-File. Die zugehörigen Komponenten (`ChallengeCard.tsx`, `GhostPlaybackEngine.ts`, `QaModerationPanel.tsx`) haben außerhalb ihrer eigenen Testdateien **null** weitere Importe im gesamten `packages/web/src`-Baum (verifiziert per Grep) — das bestätigt die „ui-only"-Einstufung in §9 zusätzlich zur reinen Code-Betrachtung.
- Live-Produktionsdomain (`rust.razzoozle.xyz`, Caddy-Reverse-Proxy) liegt außerhalb dieses Worktrees in `/nvmetank1/projects/Razzoozle/config` — **nicht geprüft** in dieser Session; siehe Betriebsmemory `project_rust-twin-test-domain` für den bekannten Stand.

## 9. Issue-Gap-Matrix

Geteilt in zwei verknüpfte Tabellen (Issue-Spalte als Schlüssel), weil 17 Spalten in einer Tabelle nicht lesbar wären.

### 9.1 Status, Evidenz, Gaps

| Issue | Feature | Bestätigter Ist-Stand | Soll | Evidenz |
|---|---|---|---|---|
| #466 | Sequencing/Puzzle | **partial** — Rust-Auswertung vorhanden und getestet (`eval.rs:313`, 4 Testfälle `eval.rs:826-897`) | Vollständiges DnD + Presenter-Live-Stage | `eval.rs:313`; Spec `docs/design/sdd-466-puzzle-sequencing.md` (22 Zeilen, nennt Typnamen `"puzzle"`, Code nennt ihn `Sequencing` — Namensabweichung, kein Blocker) |
| #467 | Word Cloud | **ui-only** — reine Anzeigekomponente, keine Aggregation, kein Eval-Zweig | Server aggregiert Häufigkeiten, Auswertung entscheidet über Punkte/Teilnahme | `Answers.tsx:873-874`; `eval.rs` 0 Treffer |
| #468 | Brainstorming | **ui-only** + Callback-Fehler (Text wird verworfen) | Server persistiert Ideen inkl. Upvotes | `Answers.tsx:877-881` |
| #469 | Confidence Rating | **contract-only** — eigener `QuestionType`, kein Eval-Zweig | Produktentscheidung nötig: eigener Typ oder Zusatzfeld (§21 A) | `quizz.rs:92`; `eval.rs` 0 Treffer |
| #470 | Micro-Lessons | **partial** — Komponente unterstützt mehrere Folien, Aufrufseite übergibt eine | Aufrufseite reicht volle Foliensequenz durch | Komponente `MicroLessonViewer.tsx` vorhanden; Aufrufstelle nicht linienscharf nachgeprüft (**nicht geprüft**, aus Auftrag übernommen) |
| #471 | Assignments | **partial**, aber anders als #498 behauptet: Contract stimmt | Serverseitige Deadline-/Versuchslimit-Prüfung | `assignment.$assignmentId.tsx:114` == `http/mod.rs:216`; `solo.rs:424-429` 0 Treffer für Limit-Logik |
| #472 | Ghost/Replay | **ui-only** — `GhostPlaybackEngine.ts` existiert, 0 Importe außerhalb Tests; „ghost"/„replay" in Rust sind unverwandte Konzepte (Reconnect-Slot, Manager-Status-Replay) | Snapshot-Aufzeichnung + Wiedergabe | `state/game.rs:338` (Reconnect, nicht Replay-Feature) — Namenskollision als Fußnote, nicht als Beleg gewertet |
| #473 | Challenge Mode | **ui-only** — `ChallengeCard.tsx`, 0 Importe außerhalb Tests | Async-Persistenz + Einladungsfluss | Grep bestätigt Isolation |
| #474 | Q&A Live-Moderation | **ui-only** — `QaModerationPanel.tsx`, 0 Importe außerhalb Tests, keine Route | Fragen-Queue mit Moderation, Persistenz, Handler | Grep bestätigt Isolation |
| #475 | Lobby-Musik | **ui-only** — 5 Presets ohne Audiodateien | Lizenzierte Audioassets + Player | `LobbyMusicSelector.tsx`; `packages/web/public/sounds/` enthält sie nicht |
| #476 | Seeded Shuffle | **parity-missing**, schwerer als behauptet: Produktion ist in Rust **gar nicht** geseedet (`thread_rng()`), TS nutzt Mulberry32 mit echtem Seed | Ein gemeinsamer, seed-nehmender Algorithmus in beiden Stacks | `seededShuffle.ts:18-26` vs. `payloads.rs:16` + `solo.rs:32` (`thread_rng()`, byte-identisch dupliziert) |
| #477 | Participant Cap | **partial** — UI-Komponente existiert (`max=5000`), nirgends eingebunden; Server hat nur harten globalen Cap | Konfigurierbarer Cap pro Spiel, serverseitig durchgesetzt | `ParticipantCapSetting.tsx:64`; `state/mod.rs:24`; `login.rs:536` |
| #478 | Export PNG/PDF | **ui-only** — Buttons ohne Implementierung, keine Dependency vorhanden | Export-Pipeline + Dependency-Entscheidung (§21 D) | 0 Treffer `html2canvas`/`jspdf` in allen `package.json` |
| #479 | Bulk-Import CSV/Excel | **partial** — Parser existiert, aber naiv (`split(",")`), kein Excel-Support, keine Editor-Anbindung | Robuster CSV/Excel-Parser + Wiring | `csvQuestionParser.ts:24,44`; 0 Treffer `papaparse`/`xlsx` |
| #480 | Version History | **contract-only** — Modal rendert übergebene Einträge, keine Datenquelle | Revisionstabelle + Snapshot-Trigger + Rollback-Endpunkt | `QuizVersionHistoryModal.tsx` vorhanden; Datenanbindung **nicht geprüft**, aus Auftrag übernommen (Rust-Rollback-Endpunkt: 0 Treffer bei Grep nach „rollback"/„revision" in `rust/server/src`) |
| #481 | Document Extractor | **ui-only** — `setTimeout`-Stub mit 3 hartkodierten Seiten | Echte Extraktion mit Security-Härtung (§21 D/E) | `DocumentContentExtractorModal.tsx` vorhanden, Logik nicht nachgeprüft im Detail; Sicherheitsrisiken (MIME-Spoofing, Zipbomb, Speicherverbrauch, unbeaufsichtigte KI-Veröffentlichung) sind strukturelle Risiken des geplanten Pfads, nicht am aktuellen Stub demonstriert |

### 9.2 Fehlende Bausteine, Tests, Sicherheitsrisiko, Wellenplanung

| Issue | Fehlende Contracts | Fehlende Rust-Handler | Fehlende Persistenz | Fehlendes UI-Wiring | Betroffene Routen | Vorhandene Tests | Fehlende Tests | Security-Risiko | Empfohlene Micro-WPs | Dependencies | Welle | Ready/Blocked |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| #466 | nein | DnD-Positionsupdate optional | nein | DnD, ARIA-Reorder, Presenter-Stage | `/party/:gameId`, `/display/play` | `eval.rs`-Unit-Tests (§7) | Component-/e2e-Test für DnD | keins | WP-466-a (DnD-Input), WP-466-b (ARIA-Fallback), WP-466-c (Presenter-Stage) | keine | W2 | ready |
| #467 | Aggregations-Payload | Häufigkeits-Zählung + Eval-Zweig | Antwort-Text-Historie pro Frage | `WordCloudDisplay`-Anbindung | `/party/:gameId` | keine gefunden | Eval-Unit-Test, Component-Test | keins, aber blockierender P0-Bug via #504 | WP-467-contract, WP-467-a (Rust-Aggregation), WP-467-b (UI-Anschluss), WP-467-test | keine | W1→W3 | blocked (Entscheidung B) |
| #468 | Idee-Payload (Text+Upvotes) | Persistenz-Handler | Ideen-Liste | `onAddIdea` echten Text senden | `/party/:gameId` | keine gefunden | Eval-Unit-Test, Component-Test | keins | WP-468-contract, WP-468-a (Rust), WP-468-b (UI-Fix), WP-468-test | keine | W1→W3 | blocked (Entscheidung B) |
| #469 | Typ-vs-Feld-Entscheidung | Scoring-Formel | ggf. Confidence-Wert pro Antwort | UI je nach Entscheidung | `/party/:gameId` | keine gefunden | Eval-Unit-Test | keins | WP-469-contract, WP-469-a (Scoring), WP-469-b (UI) | keine | W1→W3 | blocked (Entscheidung A) |
| #470 | nein | nein (nur Datenübergabe) | nein | Aufrufseite → Folien-Array statt Einzelfolie | `/party/:gameId` | Component-Test vorhanden (`MicroLessonViewer.test.tsx`) | Integrationstest Aufrufseite | keins | WP-470-a (Wiring-Fix) | keine | W2 | ready |
| #471 | nein | Deadline-/Limit-Prüfung in `handle_solo_score` | Versuchszähler pro Assignment/User | nein | `/quizz/:id/assignment/:assignmentId` | **nicht geprüft** | Server-Unit-Test für Limit-Verweigerung | **Autorisierungslücke** — Client-Prüfung allein umgehbar | WP-471-a (Server-Enforcement), WP-471-test | keine | W0 | ready |
| #472 | Snapshot-Format | Aufzeichnung + Wiedergabe-Endpunkt | Replay-Speicher | Route + Anbindung an vorhandene `GhostPlaybackEngine.ts` | neue Route nötig | Utility-Unit-Test vorhanden | e2e | keins, aber KI-Gegner-Fairness bei Bewertung **nicht geprüft** | WP-472-contract, WP-472-a (Aufzeichnung), WP-472-b (Wiedergabe-Anschluss), WP-472-c (Route) | keine | W6 | ready, niedrige Priorität |
| #473 | Einladungs-Payload | Handler für Erstellung/Annahme | Challenge-Ergebnisse | Route + Anbindung an `ChallengeCard.tsx` | neue Route nötig | keine gefunden | e2e | Wiederverwendung der #471-Autorisierungslogik einplanen | WP-473-contract, WP-473-a (Persistenz), WP-473-b (Handler), WP-473-c (UI-Wiring) | keine | W6 (nach W0/#471) | ready, niedrige Priorität |
| #474 | Frage-Payload (Upvote/Moderation) | Submit-/Upvote-/Moderations-Handler | Fragen-Queue | Route + Anbindung an `QaModerationPanel.tsx` | neue Route/Panel im Manager | keine gefunden | e2e | Moderations-Bypass falls Rollen-Check fehlt — Abhängigkeit zu #281 beachten | WP-474-contract, WP-474-a (Persistenz), WP-474-b (Handler), WP-474-c (UI-Wiring) | keine | W2 | ready |
| #475 | nein | nein | nein | Presets an echte Dateien binden | ConfigGameMode/Lobby | keine gefunden | Component-Test | Lizenzrisiko bei falscher Asset-Quelle | WP-475-a (Assets einbinden, nach Entscheidung C) | Audio-Assets (Lizenz klären) | W5 | blocked (Entscheidung C) |
| #476 | nein | Algorithmus-Angleich in 2 Dateien | nein | nein | alle Spiele mit Chunk-/Reihenfolge-Randomisierung | 8 Unit-Tests in `chunks.rs` (nur mit `StdRng`, nicht produktionsrelevant) | Determinismus-Test mit echtem Seed-Pfad | Fairness-relevanter, aber kein klassisches Sicherheitsrisiko | WP-476-a (`payloads.rs`), WP-476-b (`solo.rs`), WP-476-c (Dedupe beider Implementierungen) | keine | W0 | ready |
| #477 | Cap-Feld im Settings-Schema | Enforcement mit konfigurierbarem statt hartem Cap | Cap-Wert pro Spiel/Config | `ConfigGameMode.tsx` bindet `ParticipantCapSetting` ein | Manager-Config, Login-Pfad | Component-Test vorhanden | Server-Unit-Test für Cap-Verweigerung | Cap-Bypass falls nur clientseitig geprüft — Server MUSS enforcen | WP-477-contract, WP-477-a (Rust-Enforcement), WP-477-b (UI-Wiring), WP-477-test | keine | W1→W2 | ready |
| #478 | Export-Payload (optional, falls serverseitig) | evtl. serverseitiges Rendering | nein | Buttons anschließen | Ergebnis-Screen | keine gefunden | Component-Test | keins | WP-478-a (PNG), WP-478-b (PDF) | html2canvas, jspdf (§21 D) | W5 | blocked (Entscheidung D) |
| #479 | nein | nein | nein | robuster Parser + Editor-Anbindung | Manager-Fragenkatalog | Unit-Test vorhanden (`csvQuestionParser.test.ts`, prüft aber nur den naiven Pfad) | Quote-/Escape-Edge-Case-Tests | Injection über unescapte Feldinhalte in nachgelagerte Anzeige **nicht geprüft** | WP-479-a (Parser-Ersatz), WP-479-b (Editor-Wiring) | papaparse (§21 D) | W4 | blocked (Entscheidung D) |
| #480 | Revisions-Schema | Snapshot-Trigger + Rollback-Endpunkt | Revisionstabelle (DB-Migration) | Modal an echte Daten binden | Manager-Quizzeditor | Component-Test vorhanden | Server-Test, Migrationstest | Rollback-Autorisierung **nicht geprüft** | WP-480-contract (inkl. Migration), WP-480-a (Snapshot-Trigger), WP-480-b (Rollback-Endpunkt), WP-480-c (UI-Anbindung) | keine | W1→W4 | blocked (Migrations-Review, §22) |
| #481 | Extraktions-Payload + Limits | MIME-Check, Zipbomb-Guard, Extraktion, Review-Gate | temporäre Upload-Ablage | Modal an echte Pipeline binden | Manager-Quizzimport | Component-Test vorhanden (testet nur den Stub) | Security-Tests (Magic-Bytes, Zipbomb, Größenlimit) | **hoch**: MIME-Spoofing, Zipbomb, unbegrenzter Speicherverbrauch, unbeaufsichtigte KI-Veröffentlichung | WP-481-a (MIME/Magic-Bytes), WP-481-b (Zipbomb/Größenlimit), WP-481-c (Extraktion), WP-481-d (Review-Gate) | PDF/PPTX-Extraktionslib (§21 D) | W4 | blocked (Entscheidung D + E, Security-Review) |

## 10. False-Completion-Befunde

Drei unabhängige, code-belegte Fälle, in denen „erledigt" kommuniziert wurde, ohne dass die Behauptung zutraf:

1. **#281** — geschlossen mit Verweis auf Commit `164232f2e`, der einzig einen ungenutzten Typ hinzufügt. `grep -rn VerifiedRole rust/` liefert 0 Treffer, `socket_role.rs`/`role_tests.rs` existieren nicht. Die im Issue beschriebene Schwachstelle (gleicher Socket kann sich gleichzeitig als mehrere Rollen ausgeben, Status-Updates einer Rolle überschreiben die UI einer anderen) ist ungefixt. Ursache vermutlich: ein Sammel-Close mehrerer Issues ohne Einzelprüfung.
2. **#391 Abschlusskommentar** behauptet vollständige B0–B6-Lieferung; tatsächlich ist nur B0 fertig, während die 16 in #498 aufgeführten Gap-Issues (#466–#481) alle noch offen sind (§9). #391 selbst ist zudem korrekt als „open" markiert — die Diskrepanz liegt im Abschlusskommentar, nicht im Issue-Status.
3. **Neuer Fall, in dieser Session gefunden (#504):** Der letzte main-Commit `a13e44705` verdrahtet vier Fragetypen in die Spieler-UI, ohne die serverseitige Auswertung nachzuziehen. Das ist keine Falschmeldung eines Issues, sondern eine strukturelle Lücke im Entwicklungsprozess: Client-Wiring und Server-Auswertung wurden getrennt behandelt, ohne dass ein Gate den Widerspruch (Fragetyp spielbar, aber immer falsch gewertet) verhindert hätte. Empfehlung für W0: ein e2e- oder Unit-Test, der für jeden `QuestionType`-Enum-Wert einen `evaluate_answer`-Aufruf erzwingt (Exhaustiveness-Test), damit dieser Fehler nicht wiederkehrt.

## 11. #499-Regressionsanalyse

**Ursache:** `c00052715` (WP #191, „ConfigUsers structural tail extraction"). Kein Logikfehler, sondern ein Layout-Fehler: Die extrahierten Zeilenkarten importieren weiterhin `ListRow`, das bereits `rounded-[var(--radius-theme)] outline-2` und `bg-[var(--surface)]` mitbringt (`rowStyles.ts:19-20`). Der neue Container `UserManagementList.tsx` (nicht einzeln zitiert, da Datei bei diesem Commit neu entstand) setzt zusätzlich `divide-y divide-hairline rounded-lg border border-hairline bg-surface-1` — Rahmen-im-Rahmen ohne Abstand, während die vier Referenzseiten (Schüler/Klassen/Quizze/Katalog) den Kanon `space-y-3 p-0.5` ohne äußeren Rahmen verwenden (§7).

**Regressions-Inventar, geprüft:**

- Kartenrahmen doppelt (bestätigt, §7).
- Kaskaden-Warnung beim Löschen einer Lehrkraft entfernt — bestätigt: `t("manager:users.deleteConfirmCascade")` existiert im Elterncommit (`c00052715~1`, Zeile 370-371), im aktuellen `ConfigUsers.tsx` 0 Treffer für „cascade"/„Kaskade".
- Selbstkopie-Guard entfernt — bestätigt: der Vorgänger-Handler `openCopyDialog` (`c00052715~1:403-414`) prüfte `isSelf` und zeigte `t("manager:users.cannot_copy_self")`; der aktuelle `handleCopyUser` (`ConfigUsers.tsx:232-237`) hat keine dieser Zeilen mehr.
- **Präzisierung gegenüber dem Auftrag:** Der Lösch-/Deaktivieren-Guard (`isSelf`-Disabled auf den Buttons) ist **nicht** verloren gegangen — er lebt unverändert in `UserManagementRow.tsx:34,68,88`. Verloren ging ausschließlich der Kopier-Guard (Datenexpositionsrisiko: eigenes Konto duplizieren). Das ist ein eigenständiger, ebenfalls sicherheitsrelevanter Fund, aber ein anderer als der im Auftrag zusammengefasste „Selbstkopie-Guard verschwand" — die Formulierung war korrekt, meinte aber präzise diesen Kopier-Guard, nicht den Lösch-Guard, wie eine erste Lesart nahelegen könnte.
- Alle `data-testid` entfernt — bestätigt: 0 Treffer in `configurations/users/*.tsx` zum Stand `a13e44705`. `e2e/stagehand/admin-self-delete-guard.spec.ts:177,180` erwartet `users-search` und `user-select-${id}` und ist damit strukturell rot (nicht selbst ausgeführt, aber die referenzierten Selektoren existieren nachweislich nicht im Code).

**Fix-Stand:** `int/499-configusers` (Basis `a13e44705`) trägt 6 Commits (`c69962925`, `350e1c23c`, `ac722d4c4`, `7905d5b90`, `4dc4b03b4`, `0386330f0`). **Korrektur gegenüber dem Auftrag:** Es wurden sieben WP-Branches angelegt (`wp/499-a-list` … `wp/499-g-locale`), aber nur sechs davon führten zu einem eigenständigen Commit — `wp/499-g-locale` zeigt auf denselben Commit-Hash wie `wp/499-f-footer` (`4dc4b03b4`). Die Locale-Arbeit ist inhaltlich im Filter-Commit `350e1c23c` enthalten (Diff berührt `UserFilterPanel.tsx` inkl. i18n-Keys). Funktional ist damit nichts verloren, aber die Aussage „sieben datei-disjunkte WPs" ist um ein WP zu hoch; es waren sechs Commits für sieben geplante Arbeitspakete, weil eines im Nachbar-WP aufging. `int/499-configusers` restauriert nachweislich `cannot_copy_self` und `isSelf`-Prüfungen (per `git show int/499-configusers:...ConfigUsers.tsx`). **Nicht selbst nachgefahren:** die im Auftrag genannten Gate-Ergebnisse (tsc, vitest 394, 5 Token-Gates, i18n:check, vite build) — siehe §19/§22.

**Merge-Status:** `int/499-configusers` ist **nicht** in `main` enthalten (`git merge-base --is-ancestor` verneint). Die Regression ist auf `main` weiterhin live.

## 12. Architektur- und Modularisierungsbefunde

- **Code-Duplikat:** `shuffle_chunks_with_guard` existiert byte-identisch in `rust/server/src/socket/lifecycle/payloads.rs:5-42` und `rust/server/src/http/solo.rs:21-42`. Sollte in ein gemeinsames Modul (z. B. `rust/engine/src/chunks.rs`, wo die getestete, aber ungenutzte seed-fähige Variante bereits liegt) konsolidiert werden — Teil von WP-476-c.
- **Veraltete Kommentare als Architektur-Falle:** `pnpm-workspace.yaml:6` enthält noch den Kommentar „the runtime image ships only web + socket" — der Node-Socket-Server existiert seit `a134d7d48` nicht mehr. Kein funktionaler Bug, aber eine Quelle für genau die Art von Fehlannahme, die dieses Dokument korrigieren soll. Empfehlung: bei nächster Gelegenheit als Ein-Zeilen-Doku-Fix mitnehmen, nicht Teil dieser Wellenplanung.
- **`AGENTS.md` veraltet:** Beschreibt weiterhin „zwei separate Backends" und `packages/socket/src/handlers/`. Wird hier bewusst **nicht** geändert (Auftrag), aber jede Folge-Session, die sich an `AGENTS.md` orientiert, wird nach nicht existierenden Node-Handlern suchen. Empfehlung: eigenes, sehr kleines Doku-WP außerhalb dieser Wellenplanung, mit hoher Priorität, da es Fehlsuche in jeder Session verursacht, die es liest.
- **Verstreute `isSelf`-Logik:** Die Selbstkopie/-lösch-Guards liegen als lokale Closures direkt in den Komponenten (`ConfigUsers.tsx`, `UserManagementRow.tsx`) statt in einer gemeinsamen Utility. Das ist vermutlich mit ein Grund, warum der Refactor eine der beiden Prüfungen verlor — sie waren nicht an einer Stelle gebündelt. Keine eigene WP in dieser Wellenplanung (außerhalb des #499-Scopes), aber als Beobachtung festgehalten.

## 13. Backend-Architektur (Rust-only)

`packages/socket` (Node/socket.io) wurde am 2026-07-15 mit Commit `a134d7d48` vollständig gelöscht. Seither existiert nur noch ein Backend-Pfad:

```
rust/
  engine/    — Spiellogik: Auswertung (eval.rs), Chunking, Scoring, Achievements
  protocol/  — geteilte Typen (QuestionType, Payloads)
  server/    — Axum-HTTP + Socket-Server, Zustandsverwaltung
```

Jede Aussage über „Node-/Rust-Parität" in älteren Issues (inklusive #391 und #498, soweit sie Node-Handler referenzieren) ist damit gegenstandslos. Wo #498 einen „Contract-Mismatch" zwischen Client und Node vermutete, war in Wahrheit — sofern überhaupt geprüft — der Rust-Server der relevante Vergleichspunkt (siehe #471-Korrektur, §9). `packages/{common,web,mcp}` sind die verbleibenden JS/TS-Packages; `mcp` ist laut `pnpm-workspace.yaml` bewusst aus dem pnpm-Workspace ausgeschlossen (host-only Dev-Tool).

## 14. Security- und Threat-Model-Befunde

1. **#281 (P0, offen):** Ein Client kann sich über denselben Socket gleichzeitig als mehrere Rollen ausgeben (Same-Tab-Rollenwechsel); Player-Status-Updates überschreiben die Manager-UI. Kein serverseitiger Rollen-Exklusivitäts-Check vorhanden. Spezifiziert in #439/#440, nicht implementiert.
2. **Selbstkopie-Guard-Regression (§11):** Ein Admin kann derzeit (auf `main`) sein eigenes Benutzerkonto duplizieren — ursprünglich explizit als „Protect against copying own account (data exposure risk)" kommentiert. Fix liegt bereit, ungemergt.
3. **Assignment-Autorisierungslücke (#471):** `handle_solo_score` (`solo.rs:424`) prüft weder Deadline noch Versuchslimit serverseitig. Ein Client kann durch direkten API-Aufruf Limits umgehen, die nur clientseitig durchgesetzt werden.
4. **Participant-Cap-Lücke (#477):** Der harte globale Cap (`MAX_PLAYERS_PER_GAME = 200`) ist kein Ersatz für einen konfigurierbaren Cap pro Spiel — solange #477 nicht serverseitig verdrahtet ist, hat ein Manager keine Kontrolle über kleinere Klassenobergrenzen, was in Schulkontexten (Aufsichtspflicht, versehentliches Öffnen für zu viele Teilnehmer) relevant ist.
5. **Document Extractor (#481, größte offene Angriffsfläche):** Der geplante Pfad (PDF/PPTX-Upload → KI-Extraktion → Quizfragen) bringt vier bislang ungeprüfte Risiken mit, sobald er implementiert wird: MIME-Spoofing (Datei-Endung/`accept`-Attribut ist nur ein Browser-Hinweis, keine Validierung), Zipbomb (PPTX ist technisch ein ZIP-Archiv), unbegrenzter Speicherverbrauch (das „bis zu 50 Seiten" ist reiner UI-Text, keine serverseitige Durchsetzung), und eine KI-Veröffentlichung ohne Freigabeschritt. Keines dieser Risiken ist im aktuellen `setTimeout`-Stub bereits ausnutzbar, da er keine echten Dateien verarbeitet — sie sind Anforderungen an die künftige Implementierung, nicht Befunde am Bestandscode.
6. **CSV-Import-Injection (#479):** Nicht verifiziert, aber naheliegend: Der naive `split(",")`-Parser behandelt keine Anführungszeichen/Escapes; falls importierte Feldinhalte später ungefiltert in HTML gerendert werden, entsteht ein potenzieller Injection-Pfad. **Nicht geprüft**, ob ein Rendering-Pfad das tatsächlich tut — als Prüfpunkt für WP-479-test vermerkt.

## 15. Dependency- und Lizenzrisiken

- Keine der für #478 (`html2canvas`, `jspdf`), #479 (`papaparse`, ggf. `xlsx`) oder #481 (PDF/PPTX-Extraktion) benötigten Bibliotheken ist aktuell in irgendeinem `package.json` des Repos vorhanden (§7). Jede Einführung fällt unter die Repo-Governance „keine neuen Dependencies ohne ausdrückliche Freigabe" (`AGENTS.md`/CLAUDE.md) und muss vor W4/W5 explizit entschieden werden (§21 D).
- Lobby-Musik (#475): Fünf UI-Presets ohne zugehörige Audiodateien. Lizenzfrage ungeklärt — Audiodateien sind keine Code-Abhängigkeit, aber ein Beschaffungs-/Lizenzrisiko, das denselben Blocking-Charakter hat (§21 C).
- `xlsx` (SheetJS) — falls für #479 gewählt: die frei verfügbare Version hat in der Vergangenheit wiederholt CVEs gehabt (Prototype Pollution, ReDoS in älteren Versionen); bei Auswahl explizit auf eine gepatchte Version pinnen. **Nicht geprüft** in dieser Session, da die Dependency noch nicht gewählt ist — als Hinweis für die spätere Entscheidung vermerkt.

## 16. Work-Package-Prinzipien

- 1 WP ≈ 1 Datei ≈ unter 150 Zeilen Diff.
- Tests, Contracts/Typen, Migrationen, UI-Wiring, Locales und Docs sind grundsätzlich eigene WPs, keine Mitläufer in einem größeren WP.
- Contract-Freeze zuerst (Wave 1 für alle Issues, die eine Entscheidung aus §21 brauchen): nur Typen/Schemas, keine Verhaltenslogik, damit Implementer, Test-Writer und CLI/UI-Writer danach parallel arbeiten können.
- Jede Welle mit ≥3 gleichzeitig laufenden, datei-disjunkten Paketen; Ausnahmen (untrennbare Ein-Datei-Logik) werden unten explizit begründet.
- Free-Pool zuerst für kleine, mechanische WPs (Slug-Ergänzungen, Locale-Keys, einfache Wiring-Fixes); CLI-Subscription-Worker für UI-Komponenten mit Design-Governance-Pflicht (§ UI-Governance-Vertrag); Sonnet/Opus nur für mehrdeutige oder sicherheitskritische Einzel-Dateien (#281, #499-Row-System, #481-Security-Gates).

## 17. Wellenplanung

**W0 — Sofort, keine Produktentscheidung nötig (P0/P1):**
WP-499-merge (Re-Gate + Merge von `int/499-configusers`) · WP-281-a (Rust: Rollen-Exklusivität serverseitig) · WP-281-b (Client: Rollen-UI-Absicherung, disjunkte Dateien zu a) · WP-504-a (`eval.rs` WordCloud-Zweig, sicherer Default: Teilnahme zählt) · WP-504-b (Brainstorm-Zweig) · WP-504-c (MicroLesson-Zweig) · WP-504-d (Confidence-Zweig, sicherer Default) · WP-504-e (`Answers.tsx`: echte Payloads statt `count:1`/verworfener Text) · WP-471-a (`solo.rs` Deadline-/Limit-Enforcement) · WP-476-a (`payloads.rs` auf seed-fähigen Algorithmus) · WP-476-b (`solo.rs`, gleiche Umstellung, disjunkte Datei).
11 WPs, 5 unabhängige Workstreams — deutlich über der Mindestparallelität von 3.

**W1 — Contract Freeze (Typen/Schemas, keine Logik):**
WP-469-contract (Confidence, nach Entscheidung A) · WP-477-contract (Cap-Feld im Settings-Schema) · WP-480-contract (Revisions-Schema inkl. Migrationsentwurf) · WP-467-contract, WP-468-contract (Word-Cloud-/Brainstorm-Payloads) · WP-472-contract, WP-473-contract, WP-474-contract (Snapshot-/Einladungs-/Frage-Payloads). 7 WPs, alle datei-disjunkt (verschiedene Typdateien bzw. eine gemeinsame `protocol`-Datei mit additiven, nicht überlappenden Feldern — bei Überlappung in derselben Datei ggf. zu einem WP zusammenfassen und explizit als Ausnahme begründen).

**W2 — Parität & Wiring ohne offene Entscheidung:**
WP-466-a (DnD-Input) · WP-466-b (ARIA-Reorder-Fallback) · WP-466-c (Presenter-Live-Stage) · WP-470-a (MicroLesson-Aufrufseite auf Folien-Array) · WP-474-a (Fragen-Queue-Persistenz) · WP-474-b (Submit-/Upvote-/Moderations-Handler) · WP-474-c (Route + UI-Wiring) · WP-477-a (Rust-Enforcement konfigurierbarer Cap) · WP-477-b (`ConfigGameMode.tsx` bindet `ParticipantCapSetting` ein). 9 WPs.

**W3 — Scoring-Semantik (entsperrt durch Default aus §21 A/B):**
WP-467-a (Rust-Aggregation Word Cloud) · WP-467-b (`WordCloudDisplay` an echte Daten) · WP-468-a (Rust-Persistenz Brainstorm-Ideen) · WP-468-b (`BrainstormBoard`/`onAddIdea` an echte Daten) · WP-469-a (Confidence-Scoring-Formel) · WP-469-b (Confidence-UI je nach Entscheidung A). 6 WPs.

**W4 — Content-Pipeline (blockiert bis Entscheidung D, höchste Security-Oberfläche):**
WP-479-a (robuster CSV-Parser) · WP-479-b (Editor-Anbindung) · WP-481-a (MIME-/Magic-Byte-Prüfung) · WP-481-b (Zipbomb-/Größen-/Seitenlimit-Guard) · WP-481-c (echte Extraktionslogik) · WP-481-d (Human-Review-Gate vor KI-Veröffentlichung) · WP-480-a (Snapshot-Trigger) · WP-480-b (Rollback-Endpunkt) · WP-480-c (UI-Anbindung Version-History-Modal). 9 WPs.

**W5 — Export & Assets (blockiert bis Entscheidung C/D):**
WP-478-a (PNG-Export) · WP-478-b (PDF-Export) · WP-475-a (Lobby-Musik-Assets einbinden, nach Entscheidung C). 3 WPs — genau an der Untergrenze; keine weitere sinnvolle Aufteilung ohne künstliche Zerlegung, daher keine Ausnahmebegründung nötig, aber vermerkt.

**W6 — Große neue Modi (niedrigste Priorität, „NICE"):**
WP-472-a (Snapshot-Aufzeichnung) · WP-472-b (Wiedergabe-Anschluss an vorhandene `GhostPlaybackEngine.ts`) · WP-472-c (Route) · WP-473-a (Challenge-Persistenz, wiederverwendet #471-Autorisierungsmuster) · WP-473-b (Handler) · WP-473-c (UI-Wiring an vorhandene `ChallengeCard.tsx`). 6 WPs.

**Nicht-Wellen-WP (Doku, außerhalb dieser Wellenzählung, da kein Code):** `AGENTS.md`-Korrektur der Node/Rust-Architekturbeschreibung — hohe Priorität für die Lesbarkeit künftiger Sessions, aber kein Produkt-Feature.

## 18. Dependency Graph

```
W0 (#499, #281, #504, #471, #476)
  │
  ├─→ W1 (Contract Freeze: #469 #477 #480 #467 #468 #472 #473 #474)
  │     │
  │     ├─→ W2 (#466 #470 #474-impl #477-impl)   [#474-Contract aus W1 nötig]
  │     │     │
  │     │     └─→ W6 (#473 — nutzt außerdem das #471-Autorisierungsmuster aus W0)
  │     │
  │     ├─→ W3 (#467 #468 #469 — Scoring, entsperrt durch §21 A/B Default)
  │     │
  │     └─→ W4 (#479 #480 #481 — blockiert bis §21 D + Migrations-Review)
  │
  └─→ W5 (#478 #475 — blockiert bis §21 C/D, unabhängig von W1-W4 startbar sobald Deps geklärt)

W6 (#472) hängt nur an W1 (#472-contract), nicht an W2/W3.
```

Kritischer Pfad für „alle 16 Gap-Issues mindestens contract-vollständig": W0 → W1 (7 parallele Contract-WPs) → W2/W3/W4/W5 parallel. Der eigentliche Flaschenhals ist nicht Code-Kapazität, sondern §21 (vier offene Produktentscheidungen, die W1 teilweise blockieren) und die Dependency-Freigabe (§21 D).

## 19. Validation Plan

- **Pro WP:** `pnpm --filter web run types`, betroffene Vitest-Suite, `pnpm tokens:validate && pnpm tokens:hex-lint` bei jeder UI-Änderung (UI-Governance-Vertrag, §ui-governance), `bash rust/gate.sh` bei jeder Rust-Änderung.
- **#499 vor Merge (nicht in dieser Session ausgeführt, Pflicht vor Merge-Freigabe):** vollständiger `pnpm verify`, `pnpm --filter web run test` (Soll laut WP-Berichten: 394 grün), alle 5 Token-Gates, `pnpm i18n:check`, `pnpm --filter web run build`, sowie ein Live-Lauf von `e2e/stagehand/admin-self-delete-guard.spec.ts` gegen `int/499-configusers` — dieser Test wurde in dieser Session **nicht** ausgeführt und sollte der erste Schritt vor jedem Merge-Versuch sein, da er direkt die drei sicherheitsrelevanten Regressionen (Testids, Selbstkopie-Guard, Kaskaden-Warnung) abdeckt.
- **#281-Fix:** Unit-Tests für Rollen-Exklusivität pro Socket, plus ein e2e-Test für Same-Tab-Rollenwechsel (Multi-Kontext, siehe `iframe_single_clientid_limit`-Memory — same-origin-iframes teilen eine `client_id`, daher Stagehand-Multi-Kontext statt iframe-Trick verwenden).
- **#504-Fix:** Exhaustiveness-Test für `evaluate_answer` gegen alle `QuestionType`-Varianten (§10, Punkt 3) — verhindert Wiederholung strukturell, nicht nur für diese vier Typen.
- **Gap-Matrix-WPs:** Jede Welle schließt mit `bash rust/gate.sh` (falls Rust berührt) und der jeweils betroffenen e2e-Spec aus `e2e/stagehand/`; für Wave 4 (#481) zusätzlich dedizierte Security-Tests (Magic-Byte-Fuzzing, Zipbomb-Fixture, Größenlimit-Grenzfall).
- **Ganzheitlich vor Produktionsfreigabe jeder Welle:** Cross-Vendor-Review (Grok/Codex) des kombinierten Wellen-Diffs vor Merge, gemäß bestehender Free-Pool-Wave-Review-Konvention.

## 20. Bookkeeping-Korrektur

**Der Auftrag behauptete:** „Die 15 Issues #432–#446 sind alle offen, ihre Arbeit ist aber tatsächlich erledigt." **Live-Prüfung widerspricht dem:** Per Gitea-API (§5) sind bereits 10 von 15 geschlossen — #432, #434, #435, #436, #437, #438, #441, #443, #444, #446. Offen sind nur noch 5: #433, #439, #440, #442, #445 (davon zwei, #439/#440, bewusst offen als Spec-Referenz zu #281).

Die Aussage „alle 15 offen" war also falsch. Das ändert nichts an der eigentlichen Einschätzung — die Arbeit hinter den geschlossenen 10 ist tatsächlich erledigt, das ist reines Nachtragen, keine Fake-Arbeit —, aber die Zahl im Auftrag war falsch und sollte in Folge-Sessions nicht weiterverwendet werden.

## 21. Open Decisions

Diese vier (plus eine abgeleitete fünfte) Entscheidungen darf niemand raten. Jede bekommt einen umkehrbaren Standard, der die betroffenen WPs entsperrt, ohne die spätere Korrektur teuer zu machen.

**A) Confidence Rating — eigener Fragetyp oder Zusatzfeld an einer normalen Antwort?**
Betrifft: WP-469-contract, WP-469-a, WP-469-b, WP-504-d.
*Reversibler Standard:* Als eigener `QuestionType` beibehalten (Status quo, `quizz.rs:92`, additiv, nicht-brechend). Scoring-Platzhalter: korrekt+hohe Konfidenz = Bonus, korrekt+niedrige Konfidenz = Basispunkte, falsch = 0 unabhängig von Konfidenz. Spätere Umstellung auf „Zusatzfeld" ist ein reiner Refactor der Payload-Form, keine Migration bestehender Antwortdaten nötig, da noch keine Confidence-Antworten in Produktion existieren.

**B) Word Cloud und Brainstorming — punktende Formate oder wertungsfreie Sammlungen?**
Betrifft: WP-467-contract/a/b, WP-468-contract/a/b, WP-504-a, WP-504-b.
*Reversibler Standard:* Wertungsfrei / Teilnahme-Punkte, analog zum bereits existierenden Poll-Verhalten (`eval.rs:114`, dort explizit ohne Korrekt/Falsch-Bewertung). Jede eingereichte Antwort zählt als „richtig" mit Basispunkten. Spätere Einführung einer echten Bewertung (z. B. Häufigkeits-Ranking) ändert nur die Punkteformel, nicht die Datenstruktur.

**C) Lobby-Audiodateien — Herkunft und Lizenz?**
Betrifft: WP-475-a.
*Reversibler Standard:* Presets vorerst nicht mit Fremdmaterial befüllen. Entweder (a) eigene/CC0-Kurzloops beschaffen (z. B. über eine geprüfte CC0-Quelle) oder (b) die 5 Presets UI-seitig ausblenden und auf den bereits vorhandenen Custom-Sound-Upload zurückfallen (`docs/gaps/kahoot-gap-analysis-2026-07-23.md:68` bestätigt: Upload existiert bereits). Reines Asset-Austauschen später, kein Code-Umbau nötig.

**D) Welche neuen Dependencies dürfen für Export, Import und Dokument-Extraktion hinzukommen?**
Betrifft: WP-478-a/b, WP-479-a, WP-481-c.
*Reversibler Standard:* Kleinste, verbreitetste MIT-lizenzierte Optionen probeweise zulassen — `html2canvas`+`jspdf` für Export, `papaparse` für CSV (Excel-Support zurückstellen, bis explizit gefordert). Für #481 serverseitige Extraktion in Rust bevorzugen (z. B. eine geprüfte PDF-Text-Extraktions-Crate) statt Client-JS, damit MIME-/Zipbomb-Härtung serverseitig erzwingbar ist statt im Browser umgehbar. Jede konkrete Bibliothekswahl braucht laut Repo-Governance trotzdem eine explizite Freigabe vor dem jeweiligen WP.

**E) Dokument-Extraktion — automatische oder freigabepflichtige KI-Veröffentlichung?**
Betrifft: WP-481-d.
*Reversibler Standard:* Pflicht-Freigabeschritt (Human-in-the-loop) vor jeder Übernahme extrahierter Fragen in eine Live-Quizz. Restriktiver Standard ist billig zu lockern, das Gegenteil (nachträglich ein Gate einführen, nachdem bereits ungeprüfte KI-Inhalte live waren) ist nach einem Vorfall deutlich teurer.

## 22. Blocked Items

- **#499-Merge** — technisch blockiert bis das in §19 beschriebene Re-Gate (inkl. Live-Lauf von `admin-self-delete-guard.spec.ts`) tatsächlich ausgeführt und grün bestätigt ist. In dieser Session nicht nachgefahren.
- **#281** — blockiert bis die in #439/#440 spezifizierte Rollen-Exklusivität in Rust implementiert und mit einem Multi-Kontext-e2e-Test verifiziert ist; P0-Security, keine Produktionsfreigabe für Multi-Tab-Rollenwechsel-Szenarien vor Fix.
- **#475** — blockiert bis Entscheidung C getroffen ist; ist kein reines Code-Problem, sondern Asset-/Lizenzbeschaffung, kann nicht allein durch einen reversiblen Code-Default gelöst werden.
- **#478, #479, #481** — blockiert bis Entscheidung D (und für #481 zusätzlich E) getroffen ist, da neue Dependencies Repo-Governance-pflichtig sind.
- **#480** — blockiert bis eine neue Revisionstabelle migrationsseitig reviewt ist. Relevanter Präzedenzfall: Der Rust-CD-Pfad hatte historisch **keinen** Migrations-Schritt (siehe Betriebsmemory zu einem `classes.active`-Produktionsvorfall) — jede neue Migration für #480 muss den CD-Pfad explizit verifizieren, nicht nur lokal laufen.
- **#481 Security-Review** — zusätzlich zu Entscheidung D/E blockiert die Produktionsfreigabe, bis MIME-/Zipbomb-/Größenlimit-Guards von einer zweiten Partei (Cross-Vendor-Review) bestätigt sind, bevor Datei-Uploads von Endnutzern akzeptiert werden.

## 23. Evidence Appendix

Reproduktionsbefehle (aus `.claude/worktrees/sdd-restdelivery`, Basis `a13e44705`):

```bash
# #281: kein Treffer außerhalb der reinen Typdefinition
grep -rn "VerifiedRole" rust/                                   # 0 Treffer
git show --stat 164232f2e                                       # 1 Datei, 11 Zeilen

# #499-Ursache
git show --stat c00052715
grep -n "space-y-3 p-0.5" packages/web/src/features/manager/components/configurations/*/*.tsx

# #499-Testid-Regression
grep -c "data-testid" packages/web/src/features/manager/components/configurations/users/*.tsx  # 0

# #504: eval.rs kennt die vier Typen nicht
grep -n "WordCloud\|Brainstorm\|Confidence\|MicroLesson" rust/engine/src/eval.rs                # 0 Treffer

# #476: Produktion ungeseedet
grep -n "thread_rng\|StdRng" rust/server/src/socket/lifecycle/payloads.rs rust/server/src/http/solo.rs rust/engine/src/chunks.rs

# #477: Cap-Komponente unwired
grep -rln "ParticipantCapSetting" packages/web/src                                              # nur Komponente + eigener Test

# Bookkeeping (Gitea API)
for n in $(seq 432 446); do curl -s -H "Authorization: token $(cat /etc/gitea-tokens/agent-claude.token)" \
  "https://git.joelduss.xyz/api/v1/repos/agent-claude/Razzoozle/issues/$n" | python3 -c "import json,sys;print($n, json.load(sys.stdin)['state'])"; done
```

Alle Zeilennummern beziehen sich auf den Stand `a13e44705` (main-HEAD zum Prüfzeitpunkt) bzw. den jeweils genannten Commit/Branch.
