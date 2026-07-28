# Rezept: einen neuen Fragetyp hinzufügen

Stand: 2026-07-28, `main` auf `2f795ff0b`. Ergänzt
[`docs/design/question-type-contract.md`](design/question-type-contract.md): das
Contract-Dokument sagt *wo* die Pflichtplätze liegen, dieses Rezept sagt *in
welcher Reihenfolge*, *was schiefgeht wenn man einen vergisst* und *woran man
merkt, dass man fertig ist*.

> **Achtung, das Contract-Dokument ist teilweise stale.** Verifiziert am
> 2026-07-28: die dort genannten Testpfade
> `packages/common/src/validators/__tests__/quizz.test.ts` und
> `packages/web/e2e/answer-flow.spec.ts` existieren beide nicht. Real sind
> `packages/common/src/validators/quizz.new-types.test.ts` und
> `e2e/answer-flow.spec.ts` (Repo-Wurzel, nicht unter `packages/web`). Wer die
> Checkliste dort abarbeitet, greppt ins Leere und hält den Punkt für erledigt.

---

## 1. Kurz vorweg

Ein Fragetyp ist kein Feature an einer Stelle. Er ist eine Entscheidung, die an
**rund 140 Stellen in etwa 60 Dateien** wiederholt werden muss — in TypeScript,
in Rust, in sechs Sprachdateien und in fünf e2e-Suiten.

Die Zahl, auf die es ankommt, ist nicht 140. Es ist die Aufteilung:

| | Anzahl | Verhalten beim Vergessen |
|---|---|---|
| Der Compiler bricht | **knapp 20** | Build rot, sofort, unübersehbar |
| Ein Gate meldet es | eine Handvoll | nur wenn jemand das Gate von Hand startet |
| **Nichts passiert** | **der ganze Rest** | Der Typ verhält sich still wie `choice` |

Und der Compiler-Anteil ist schwächer, als er aussieht. Die beiden echten
Rust-Tripwires — der Exhaustiveness-Guard in `rust/engine/src/eval.rs:1177` und
das `match` ohne `_`-Arm in `rust/server/src/main.rs:21` — laufen **in der
Pipeline überhaupt nicht**: der `rust`-Job in `.gitea/workflows/ci.yml` trägt
`if: ${{ false }}` (Zeile 61, verifiziert). Ein Pull Request mit fehlender
`QuestionType`-Variante wird von Gitea grün gemeldet. Die Tripwires greifen nur
lokal, wenn jemand `bash rust/gate.sh` fährt.

Ein `pnpm test`-Schritt existiert in `ci.yml` gar nicht. Die gesamte
Vitest-Abdeckung ist Selbstdisziplin.

Das ist der eigentliche Befund: **der Standardfall beim Vergessen ist nicht
"Fehler", sondern "der neue Typ verhält sich wie Multiple Choice".** Und zwar
plausibel genug, dass es beim Durchklicken nicht auffällt.

### Das Grundmuster hinter allen stillen Stellen

Der Code entscheidet an über hundert Stellen per `if type === "..."` bzw.
`match ... { _ => }`, was ein Fragetyp ist. Fast jede dieser Ketten endet in
einem Default, der **fachlich falsch, aber syntaktisch einwandfrei** ist:

- `rust/engine/src/eval.rs:379` — `solutions.contains(&answer_key)`: jede
  Antwort des neuen Typs zählt als falsch.
- `rust/server/src/socket/validation.rs:269` — `_ =>` mit den Choice-Regeln:
  die Frage lässt sich nicht speichern.
- `packages/web/src/features/game/components/states/Answers.tsx:951` — `: null`:
  der Spieler sieht kein Eingabefeld.
- `packages/web/src/features/game/components/states/SoloAnswers.tsx:563` —
  `<ChoiceGrid answers={question.answers} />`: der Spieler sieht ein
  **falsches** Eingabefeld, was schlimmer ist als gar keins.

---

## 2. Die Reihenfolge

Nicht verhandelbar, weil jede Ebene gegen die vorige baut. Wer in der Mitte
anfängt, baut gegen halbfertige Verträge und muss zweimal ran.

**Schritt 0 — Entscheiden, bevor irgendwo Code steht.** Drei Fragen, deren
Antworten den gesamten Rest bestimmen:

1. **Wird der Typ gewertet?** Wenn nein, gehört er in
   `UNSCORED_QUESTION_TYPES` — und die Wertungsfreiheit muss in Rust an
   *mehreren* Stellen wiederholt werden (siehe § 4.2).
2. **Wie kommt die Antwort über die Leitung?** Diskreter Index
   (`answerKey: n`), Index-Menge (`answerKeys`) oder JSON in `answerText` mit
   Sentinel `answerKey: -1`. Es gibt keinen vierten Weg.
3. **Welches Feld verrät die Lösung?** Das muss aus dem Spielzeit-Payload
   heraus. Ein falsch geratenes Feld ist ein Security-Bug, kein Schönheitsfehler.

**Schritt 1 — Geteilter Typ.** `packages/common/src/constants.ts`:
Slug in `QUESTION_TYPES` (heute 17 Einträge, Zeile 467-487), bei
Wertungsfreiheit zusätzlich in `UNSCORED_QUESTION_TYPES` (Zeile 495).
Erst danach kompiliert überhaupt ein `q.type === "<neu>"`-Vergleich.

**Schritt 2 — Vertrag.** Zod-Payloadfelder und `superRefine`-Zweig in
`packages/common/src/validators/quizz.ts`, Wire-Typen in
`packages/common/src/types/game/status.ts`. Das ist der Vertrag, gegen den
Client *und* Server bauen. Er muss stehen, bevor eine der beiden Seiten anfängt.

**Schritt 3 — Rust-Protokoll.** `rust/protocol/src/quizz.rs`: Enum-Variante,
`#[serde(rename = "...")]`, Konfigurationsfelder am `Question`-Struct;
`rust/protocol/src/status.rs`: Play- und Reveal-Felder. Ab hier meldet sich
zum ersten Mal der Compiler.

**Schritt 4 — Rust-Auswertung und -Server.** `eval.rs`-Zweig, Wire-Mapping in
`main.rs`, Validierung in `socket/validation.rs`, Reveal in
`socket/reveal_helpers.rs`, Spielzeit-Payload in
`socket/lifecycle/payloads.rs`, **und der komplett getrennte Solo-Pfad**
`http/solo.rs`.

**Schritt 5 — Editor.** Typauswahl, Seed-Zweig, eigene Eingabemaske,
Folienvorschau. Erst jetzt, weil der Editor gegen den Validator aus Schritt 2
speichert.

**Schritt 6 — Spiel.** Antwort-Leaf, Mehrspieler-Ansicht, Solo-Ansicht,
Ergebnis, Präsentator-Auswertung. Vier bis fünf Flächen, alle handgepflegt,
keine gemeinsame Quelle.

**Schritt 7 — Test und Übersetzung.** Fixture, fünf e2e-Switches,
Validator-Tests, Rust-Unit-Tests, sechs Sprachdateien.

Zwischen Schritt 4 und 5 lohnt ein Zwischenstopp: `bash rust/gate.sh` muss grün
sein, bevor jemand Editor-Code schreibt. Sonst debuggt man im Browser einen
Fehler, der im Server sitzt.

---

## 3. Tabelle je Ebene

Legende der Spalte *Compiler*: **ja** = Build bricht. **teilw.** = bricht nur
unter Bedingungen (Test-Crate, ein bestimmtes Feld). **nein** = still.

### 3.1 Geteilter Vertrag — `packages/common/src`

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `constants.ts:467` | Slug in `QUESTION_TYPES` | **ja** | `updateQuestion({type:"neu"})` ist kein `QuestionType`. Vorsicht Schlupfloch: `QuestionEditorType.tsx:436` umgeht das heute per `"vokabelliste" as QuestionType` — wer den Cast kopiert, verliert den Schutz und scheitert später still an `z.enum(QUESTION_TYPES)`. |
| `constants.ts:495` | Bei Wertungsfreiheit in `UNSCORED_QUESTION_TYPES` | nein | Roter Falsch-Screen, Streak bricht, Punktabzug — bei einer Frage, die kein Richtig kennt. An vielen Stellen gleichzeitig sichtbar. |
| `validators/quizz.ts:48-110` | Optionale Payloadfelder deklarieren | **ja** | zod `z.object` strippt unbekannte Keys **lautlos**. Die vom Editor gesendete Konfiguration verschwindet beim Speichern; die Frage landet leer auf der Platte. |
| `validators/quizz.ts:22-46` | Eigener Item-Validator (Muster: `slotValidator`, `hotspotValidator`) | nein | Kaputte Autoren-Payloads passieren den Save. Der Fehler taucht erst auf dem Beamer auf. |
| `validators/quizz.ts:259` | Eigener `else if`-Zweig in `superRefine`, **vor** dem terminalen `else` | nein | Der Typ fällt in den Choice-Default und braucht ≥2 `answers` **und** ≥1 `solutions`. Speichern schlägt fehl mit zwei Toasts: *zu wenige Antworten* und *keine Lösung* — an einer inhaltlich korrekten Frage. Der Autor sucht den Fehler im Editor. |
| `types/game/index.ts:19-28` | Item-Typ re-exportieren | nein | Web/MCP schreiben die Shape von Hand nach und driften still auseinander. |
| `types/game/index.ts:53` | Antwort-Transport im `Answer`-Interface festlegen | nein | Ohne Entscheid kommt nur der `answerId`-Sentinel an: **jede** Antwort des Typs zählt als falsch, 0 Punkte, keine Fehlermeldung. |
| `types/game/index.ts:101` | `PlayerAnswerRecord` prüfen | nein | Die gespeicherte Ergebnisdatei hält `answerId: null`. Ergebnisseite, Export und öffentlicher Share-Replay zeigen die Runde als *keine Antwort*. |
| `types/game/index.ts:140` | `SoloQuestion`-Omit gegen die Rust-Allowlist abgleichen | nein | **Heute schon kaputt (verifiziert):** `hotspots` wird nicht ge-omit-tet, existiert aber im Rust-`SoloQuestion` gar nicht — `rust/server/src/http/solo.rs:45` führt kein `hotspots`-Feld, der einzige Treffer im File ist eine Test-Fixture in Zeile 866. Drop-Pin im Solo-Modus bekommt nie Hotspots und rendert leer. |
| `types/game/status.ts:52` | Play-Feld in `SELECT_ANSWER` (anti-cheat-gestrippt) | **ja** | Die State-Komponenten typisieren ihre Props exakt über diesen Map. Wer stattdessen die rohe Frage durchreicht, leakt die Lösung. |
| `types/game/status.ts:89` | Reveal-Feld in `SHOW_RESULT` | **ja** | Wer ersatzweise `correctAnswer?: string` missbraucht, zeigt auf dem Falsch-Screen `[object Object]` oder nichts — ohne dass etwas bricht. |
| `types/game/status.ts:165` | Statistikfeld in `ManagerExtraStatus.SHOW_RESPONSES` | **ja** | `responses: Record<number, number>` zählt nur Antwort-Indizes: jeder Typ mit `answerText`-Transport erscheint als leeres Balkendiagramm. |
| `validators/solo.ts:4` + `:12` | Transportfeld in beiden Solo-Validatoren | nein | Speist nur die OpenAPI-Spec, parst nichts. Fremd-Clients können den Typ solo nicht beantworten. Divergiert heute schon: `answerOrder` fehlt hier, das TS-Interface führt es. |
| `openapi/doc.ts:42` | `soloResponseSchema` erweitern | nein | `.loose()` lässt alles durch — nichts bricht, die Doku ist nur unvollständig. |
| `utils/dropEmptyAnswers.ts:17` | Prüfen, ob der Typ ein `answers`-Array führt | nein | Läuft typ-blind vor jeder Validierung: trimmt leere Einträge und reindiziert `solutions`. Ein Typ, der `answers` als etwas anderes benutzt (micro-lesson tut das), verliert beim Speichern still Zeilen. |
| `utils/csvQuestionParser.ts:70` | Entscheiden, ob CSV-Import gelten soll | nein | Stiller `"choice"`-Default; ein vertippter Typ-String passiert den Parser und scheitert erst an `z.enum` — mit einer Zod-Meldung **ohne Zeilennummer**, während der Parser sonst `{line, message}` liefert. |

### 3.2 Rust-Protokoll und -Engine

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `protocol/src/quizz.rs:60` | Enum-Variante | nein¹ | Kein `#[serde(other)]`. Jede Deserialisierung eines Quiz-JSON mit dem neuen `type` scheitert mit *unknown variant* — **das ganze Quiz** lädt nicht mehr, nicht nur die eine Frage. |
| `protocol/src/quizz.rs:79` | `#[serde(rename = "...")]`, kebab-case | nein¹ | Serde nimmt den Rust-Bezeichner wörtlich: Wire-Name `"DragDrop"` statt `"drag-drop"`. Gleiche Sackgasse, schwerer zu sehen, weil die Variante ja da ist. |
| `protocol/src/quizz.rs:170` | Konfigurationsfelder am `Question`-Struct | **ja** | Das Struct wird an sieben Stellen als vollständiges Literal gebaut (`scoring.rs:108`, `eval.rs:528`, `achievement_awards.rs:280`/`:346`, `bot/manager.rs:423`, `http/solo.rs:866`) — ein neues Feld bricht alle sieben. Aber: **ohne** Feld gibt es keinen Ort, an dem die Konfiguration ankommt; serde ignoriert unbekannte Keys still. |
| `protocol/src/status.rs:169` | Play-Feld in `SelectAnswerData` | **ja** | Wird als vollständiges Literal gebaut (`lifecycle/payloads.rs:44`, `state/tests.rs:473`). Ohne Feld: leerer Antwortbereich. Mit ungestripptem Feld: die Lösung geht an den Spieler. |
| `protocol/src/status.rs:259` | Reveal-Feld in `ShowResultData` | **ja** | Drei vollständige Literale: `engine/state/results.rs:34`, `server/socket/manager/game_flow/mod.rs:659`, `.../game_flow/pacing.rs:555`. Wer nur eins pflegt, hat zwei Reveal-Pfade ohne Lösung. |
| `protocol/src/status.rs:356` | Dasselbe nochmal in `ShowResponsesData` | **ja** | Zwei Structs, keine gemeinsame Quelle. Client zeigt die Lösung, der Präsentator nicht — oder umgekehrt. |
| `protocol/src/status.rs:152` | — | nein | `question_type` ist `Option<String>`, kein `Option<QuestionType>`. Ein Tippfehler im Mapping ergibt einen Namen, den der Client nicht kennt → Fallback auf Choice-Ansicht. Reiner Stringvergleich. |
| `engine/src/eval.rs:110-379` | Eigener `if`-Zweig **vor** dem Default-Tail | nein | `evaluate_answer` ist eine reine if-Kette, kein `match`. Der Typ fällt in `solutions.contains(&answer_key)`: konstant 0 Punkte und *falsch*, ohne jede Meldung. So sind WordCloud/Brainstorm/Confidence/MicroLesson ursprünglich durchgerutscht. |
| `engine/src/eval.rs:369` + `:402` | Slot-Dispatch **und** Slot-Quelle | nein | Zwei getrennte Stellen für eine Entscheidung. Nur eine gepflegt → entweder kein Routing oder Routing in den falschen Config-Zweig (`left_items` statt eigener Quelle) → `correct=false, base=0.0` für alle. |
| `engine/src/eval.rs:1154` | Variante ins `all_types`-Array | nein | Gewöhnliches Array-Literal. Der Guard-Test läuft, ruft `evaluate_answer` für den neuen Typ aber nie auf. |
| `engine/src/eval.rs:1177` | Variante ins `match` ohne `_`-Arm | **ja** | Die einzige echte Tripwire des Systems. Bricht `cargo test` mit E0004. **Aber:** sie erzwingt nur, dass die Variante *gelistet* ist, nicht dass `evaluate_answer` einen Zweig hat. Grüner Guard plus stiller Default ist möglich. |
| `engine/src/state/mod.rs:255` | Payload-Shape-Guard in `record_answer` | nein | Neuer Mehrfachauswahl-Typ → jede Antwort mit `InvalidAnswerShape` abgelehnt, der Spieler kann nicht antworten. Neuer Text-Typ nicht in `is_text_answer` → leere Strings zählen als abgegebene Antwort. |
| `engine/src/state/mod.rs:316` | Wertungsfreiheit in `is_scored_question` | nein | Prüft **nur** `Poll`. Der Typ gilt als gewertete Runde: `player.streak` wird auf 0 gesetzt, die Runde zählt in `total_scored`, der Achievement-Fold feuert. Ein Mitmachformat mitten im Quiz zerreißt jede Serie. |
| `engine/src/state/mod.rs:581`+`:584` | Zweite und dritte Kopie derselben Regel | nein | `total_scored` zu hoch, `is_last_scored` zeigt auf die falsche Frage → *participation* und *perfect_game* feuern nie oder auf der falschen Runde. |
| `engine/src/state/mod.rs:195` | Reihenfolge-abhängige Typen vom Shuffle ausnehmen | nein | Prüft nur `Slider`. Bei aktivem `randomize_answers` werden die Optionen gemischt und ein positions- oder koordinatenabhängiges Format zerstört. Nur bei eingeschaltetem Randomisieren sichtbar, also sporadisch. |
| `engine/src/scoring.rs:36` | **Nichts** — Falle | nein | `is_correct(question, answer_key)` ignoriert den Fragetyp und wird außerhalb der eigenen Tests nirgends aufgerufen. Wer sie wegen ihres Namens benutzt, bekommt für jeden nicht-index-basierten Typ dauerhaft `false`. Wahrheit ist `eval::evaluate_answer`. |
| `protocol/bindings/QuestionType.ts` | ts-rs-Generat neu erzeugen und committen | nein | Folgenlos zur Laufzeit — **kein** TS-Paket importiert daraus. Genau deshalb gibt es keine Compiler-Brücke zwischen Rust-Enum und TS-Union; die beiden können beliebig auseinanderlaufen, gemerkt wird es erst, wenn serde einen unbekannten String ablehnt. |

¹ Indirekt gefangen: `main.rs:21` (siehe unten) bricht bei fehlender Variante
sofort. Das falsche `rename` fängt niemand.

### 3.3 Rust-Server

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `server/src/main.rs:21` | Arm in `question_type_wire` | **ja** | Bricht `cargo build -p razzoozle-server` mit *non-exhaustive patterns*. Die früheste und lauteste Rückmeldung im ganzen Rollout — sofern jemand baut (§ 1). |
| `server/src/socket/validation.rs:94` | Eigener `match`-Arm | nein | Fällt in `_ =>` (Zeile 269): Speichern wird mit `errors:quizz.tooFewAnswers` abgelehnt. Betrifft Editor-Save, Fixture-Upsert **und** Katalog-Import. Genau die Sequencing-Regression, die der Kommentar bei Zeile 188 dokumentiert. |
| `server/src/socket/reveal_helpers.rs:26` | Wertungsfreie Typen vom Reveal ausnehmen | nein | `is_poll` ist der einzige Diskriminator. Der Default-Arm (Zeile 100) mappt `solutions` auf `answers` und zeigt eine *richtige Antwort*, die es nicht gibt. **Heute offen (#532).** |
| `server/src/socket/reveal_helpers.rs:32` | Formatierung der Lösungsanzeige | nein | `_ => None` bei einem Typ ohne `answers` → Reveal-Panel ohne Lösung, ohne Fehler. |
| `.../reveal_helpers.rs:120/138/156/173` | `correctOptions` / `correctMatches` / `correctHotspotIndex` / `correctTokenPos` | nein | Jeweils `_ => None`: das Feld fehlt im Payload, der Client rendert leere Lösungs-Chips bzw. neutrale Tokens. |
| `server/src/socket/reveal_helpers.rs:213` | Fünf bool-Flags in `build_manager_show_responses` | nein | Präsentator-Antwortübersicht bleibt leer: `acceptedAnswers`/`matchMode`/`chunks`/`correctOrder`/`items` auf `None`, Freitext wird nicht gezählt. Kein Fehler, nur ein leeres Panel. |
| `server/src/socket/reveal_helpers.rs:437` | `is_poll` steuert `poll`-Flag und Ergebnis-Message | nein | Spieler sehen *Falsch* (`game:wrong`) statt `game:pollThanks`. Betrifft heute schon vier Typen. |
| `server/src/socket/reveal_helpers.rs:443` + `:483` | `correctChunks`-Kette, `correctOrder`/`items` | nein | Reveal-Panel ohne Lösungs-Chips bzw. ohne die richtige Reihenfolge. |
| `server/src/socket/lifecycle/payloads.rs:44` | Play-Felder befüllen, Lösung strippen | teilw. | Nur ein **neues** Feld in `SelectAnswerData` erzwingt hier eine Änderung. Ein vergessenes Gate kompiliert still: leerer Fragebildschirm — oder, schlimmer, ein ungestripptes Feld leakt die Lösung. |
| `server/src/socket/lifecycle/mod.rs:156` + `:169` | Shuffle-Gates, **String**-Vergleich | nein | `== Some("sentence-builder")` bzw. `== Some("sequencing")`. Ohne Zweig: der Client bekommt die Bausteine in Lösungsreihenfolge, die Aufgabe ist trivial. Ein Tippfehler im Slug fällt nicht auf — es ist ein String, kein Enum. |
| `server/src/state/game.rs:109` | Abgeleiteter Shuffle-State pro Frage | nein | Der Server hat kein Gedächtnis der Mischung: Reconnect, Resync und Reveal liefern eine andere Reihenfolge als das, was der Spieler sieht. |
| `server/src/state/snapshot.rs:359` | Neues `Game`-Feld im Restore-Literal befüllen | **ja** | Der Build bricht, solange das Feld fehlt. Die Falle kommt danach: `None` eintragen kompiliert, und der Restore verliert die Mischung — nach Crash-Recovery sieht der Spieler eine andere Reihenfolge. |
| `.../manager/game_flow/pacing.rs:141` | `adjustTimer`-Resync reicht Shuffle-State durch | teilw. | Nach jedem Timer-Nudge bekommt der Spieler eine andere Reihenfolge als vorher — die Antwort, die er gerade zusammenbaut, passt nicht mehr. |
| `server/src/http/solo.rs:45` | **Eigene** Wire-Struct `SoloQuestion` | nein | Nicht `SelectAnswerData`. Jedes Play-Feld muss hier zusätzlich existieren und im Mapping ab Zeile 216 befüllt werden, inklusive Stripping (`correctIndex: 0`). Fehlt es: Typ im Solo-Modus unspielbar. |
| `server/src/http/solo.rs:198` + `:205` | Solo-Shuffle, **zweite** Kopie | nein | Steht in keinem Zusammenhang mit `lifecycle/mod.rs:156`. Beide Pfade getrennt pflegen. |
| `server/src/http/solo.rs:315` | `is_poll` in check-answer | nein | Neuer wertungsfreier Typ wird solo als falsch gewertet statt neutral — inkonsistent zum Mehrspieler. |
| `server/src/http/solo.rs:329` | Genauigkeit/Achievement, harter Slider-Vergleich | nein | Neuer Schätz-Typ liefert `accuracy: None` und vergibt nie *sharpshooter*. |
| `server/src/http/solo.rs:547` | `theoretical_max` schließt nur Poll aus | nein | Punkte-Deckel zu hoch: der Score-Cap greift nicht mehr (Anti-Cheat-Guard weicher) und die Prozentanzeige ist dauerhaft zu niedrig. |
| `server/src/http/solo.rs:129` | `SoloScoreSubmitAnswer` für den Endabgleich | nein | Zweite Wire-Struct im Solo-Pfad. Fehlt das Transportfeld, re-evaluiert `/solo-score` mit leerem Input: `verified_score` fällt auf 0 und überschreibt die live berechneten Punkte. |
| `server/src/bot/manager.rs:114` | Arm in `pick_answer` + eigene `pick_*`-Funktion | nein | `_ => (Some(pick_choice(question)), None, None)` (Zeile 125, verifiziert). Bots schicken einen Choice-Index. Bei einem Typ ohne `answers` liefert `pick_choice` 0 → alle Bots antworten identisch und ungültig, `record_answer` nimmt es an, Statistik und Reveal sind Müll. Kein Log, kein Fehler. **Heute offen.** |
| `server/src/socket/ai_validate.rs:246` | Slug in `ALLOWED_TYPES` | nein | **Heute schon unvollständig:** 13 Slugs, es fehlen `word-cloud`, `brainstorm`, `confidence`, `micro-lesson`. Manager-UI bietet den Typ an, der Server antwortet *type must be one of: …*. |
| `server/src/socket/ai_provider.rs:127` + `:197` | Shape-Hinweis und LLM-Mapping | nein | Der Default-Arm (Zeile 365) setzt aktiv `built["type"] = "choice"` und erfindet `["A","B","C","D"]`. Der Nutzer bestellt den neuen Typ und bekommt still eine Dummy-Choice-Frage. Kein Log. |

### 3.4 Editor — `packages/web/src/features/quizz`

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `QuestionEditor/QuestionEditorType.tsx:30` | Eintrag im `TYPES`-Array | nein | Reines Array-Literal, kein `Record<QuestionType, …>`. Der Typ existiert im Backend, ist im Editor aber nicht anwählbar. Auch die Pfeiltasten-Navigation überspringt ihn. |
| `.../QuestionEditorType.tsx:449` | Eigener `else if`-Zweig in `setType()` | nein | Klick auf die Kachel schreibt still `type: "choice"` samt `answers`/`solutions`. Die UI springt sichtbar auf Multiple Choice zurück, ohne Fehlermeldung. Der Autor erlebt das als *die Auswahl funktioniert nicht*. |
| `.../QuestionEditorType.tsx:179` | Neues Payloadfeld in **jedem** der 17 anderen Zweige auf `undefined` | nein | Es gibt nur zwei Sammel-Konstanten (`SLIDER_CLEAR`, `CHOICE_CLEAR`), der Rest ist handverdrahtet. Beim Umschalten bleibt das Feld am Objekt kleben, wandert in die `quizz.json`, taucht in keiner Maske mehr auf und ist damit nicht mehr korrigierbar. |
| `.../QuestionEditorType.tsx:169` | Bei Fachbezug in die `klassenEnabled`-Negativliste | nein | Falsche Sichtbarkeit. Kein Fehler. |
| `QuestionEditor/index.tsx:67` | `is<Neu>`-Flag | nein | Ohne Flag greifen beide Render-Gates nicht; der Typ verhält sich exakt wie `choice`. Vorsicht: `currentQuestion.type` ist bei neuen Fragen `undefined` (`defaultQuestion()` setzt kein `type`), alle `===`-Vergleiche sind dann `false`. |
| `QuestionEditor/index.tsx:93` | In die Ausschlusskette vor `<QuestionEditorAnswers />` | nein | Ausschlussliste aus 10 `!`-Flags, keine Whitelist. Der Typ bekommt still den generischen A-D-Editor **zusätzlich** zu seiner eigenen Maske. |
| `QuestionEditor/index.tsx:107` | Eigene Maske einhängen | nein | Neun parallele `&&`-Zweige, kein `switch`. Ohne Zweig zeigt die Canvas zwischen Titel und Typraster **gar nichts** — leerer Bereich, keine Konsolenausgabe. |
| `QuestionEditorAnswers.tsx:15` | Bei Mitbenutzung `answers` **und** `solutions` seeden | nein | Der Early-Return prüft beide: die Komponente rendert `null`. Der Bereich bleibt kommentarlos leer, obwohl `index.tsx` sie eingehängt hat. |
| `QuestionEditorAnswers.tsx:32` | Prüfen, ob 2-4 Antworten reichen | nein | Hart limitiert, Beschriftung über `ANSWERS_LABELS = ["A","B","C","D"]`. Ab Index 4 ist `label` `undefined`: leere Badge, aria-label *Antwort undefined als richtig markieren*. Serverseitig kappt `.max(4)`. |
| `QuestionPreview.tsx:262` | Eigener Block für die Folienminiatur | nein | Fällt in den Choice-Fallback: 2-spaltiges Raster über `question.answers`, bei `undefined` ein leeres Raster. Der Lehrer kann Folien nicht mehr nach Typ unterscheiden. Driftet heute schon — der JSDoc spricht von *13 Fragetypen*, es sind 17. |
| `CatalogPickerModal.tsx:20` | `TYPE_LABEL_KEY`-Map | nein | Fallback etikettiert die Katalogfrage als *Auswahl*. **Heute schon stale: 6 von 17 Typen.** Und es gibt drei Kopien dieser Map (zusätzlich `manager/.../catalog/constants.ts:1` und `manager/.../submissions/QuestionPreview.tsx:14`). |
| `SubmitPage/SubmitPage.tsx:269` | Maske ergänzen **oder** per `excludeTypes` aussperren | nein | Die öffentliche Einreichungsseite rendert `<QuestionEditorType />` **ohne** `excludeTypes`, hat aber nur drei Masken. Ein Schüler wählt den neuen Typ und bekommt den generischen A-D-Editor oder gar nichts. Heute für 13 Typen offen. |

### 3.5 Spiel — `packages/web/src/features/game`

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `components/answers/types.ts:17` | Neue Leaf gegen `AnswerViewProps<V>` bauen | nein | Deklariert die Komponente stattdessen ein eigenes Props-Interface ohne `onChange`/`onSubmit`, kompiliert alles — und der Typ ist nicht beantwortbar. **Genau so entstand #533.** Mit `AnswerViewProps<V>` wird die fehlende Verdrahtung zum Build-Fehler. |
| `components/answers/WordCloudDisplay.tsx` | Negativbeispiel, nicht kopieren | nein | Props sind rein darstellend (`words`, `maxWords`, `testIdPrefix`, `className` — verifiziert): kein `onChange`, kein `onSubmit`, kein `disabled`. Vorlage ist `BrainstormBoard.tsx` (Formular + `onAddIdea`-Callback). |
| `states/Answers.tsx:106` | `is<Neu>`-Flag (ggf. mit Payload-Guard) | nein | Alle folgenden Zweige sehen den Typ nie. |
| `states/Answers.tsx:62` | Payloadfelder destrukturieren | nein | Die Leaf bekommt `undefined` statt Optionen: leeres Board, leere Dropdowns. |
| `states/Answers.tsx:212` | Mount-/Reset-Effekt für Board-State | nein | Board bleibt bei Frage n mit den Chips der **vorherigen** Frage bestehen. Antwort-Leak über Fragegrenzen. |
| `states/Answers.tsx:270` | Neues Reveal-Feld im Reset-Effekt mitlöschen | nein | Die Antwort der vorherigen Frage erscheint im `SHOW_RESULT` der nächsten. |
| `states/Answers.tsx:379` | Eigene Submit-Funktion nach Muster | nein | Je nach vergessenem Teil: kein Ton/keine Vibration (der Typ fühlt sich *tot* an), fehlender `playerToken` (Rejoin bricht), fehlendes `armAckPending` (der *wird gesendet…*-Hinweis hängt), fehlendes `setSubmitted*` (Result zeigt *deine Antwort* nicht). |
| `states/Answers.tsx:316` | Emit-Contract: `answerKey: n` **oder** Sentinel `-1` + `answerKeys`/`answerText` | nein | Der Server verwirft die Antwort still oder wertet sie als falsch. Kein Client-Fehler, keine Konsolenausgabe. |
| `states/Answers.tsx:951` | Render-Zweig **vor** dem `: null` | nein | Frage und Timer erscheinen, aber **kein Eingabefeld**. Der Spieler kann nicht antworten, der Timer läuft ab, die Antwort ist leer. Exakt das Symptom von #533. |
| `states/SoloAnswers.tsx:109` | Zweiter, unabhängiger Flag-Block | nein | Der Typ funktioniert im Mehrspieler und ist solo tot. |
| `states/SoloAnswers.tsx:143` | Solo-State über lazy `useState`-Initializer | nein | Anders als im Mehrspieler (Effekte). Das Board startet leer und bleibt es. |
| `states/SoloAnswers.tsx:234` | Zweig in `handleAutoSubmit()` | nein | Bei Zeitablauf fällt der Typ in `submitAnswer(quizzId, {})`: die bereits eingegebene Antwort wird verworfen und als leer gewertet. |
| `states/SoloAnswers.tsx:277` | Eigene Solo-Submit-Funktion | nein | Ohne `clearInterval` läuft der Solo-Timer nach dem Absenden weiter und schickt die Antwort ein zweites Mal — leer. |
| `states/SoloAnswers.tsx:563` | Render-Zweig **vor** dem `else` | nein | **Gefährlicher als der Mehrspieler-Fall:** hier steht kein `: null`, sondern `<ChoiceGrid answers={question.answers} />` (verifiziert). Der Spieler sieht eine plausibel aussehende, falsche UI und beantwortet die Frage mit einem bedeutungslosen Index. |
| `stores/answer.ts:16` | Reveal-Feld + Setter + `reset()` | nein | `Result.tsx` kann *deine Antwort* nicht anzeigen; der Vergleich eingereicht-gegen-korrekt fällt aus. |
| `stores/solo.ts:77` | Transport an **drei** Deklarationsorten + zwei Rebuild-Stellen | teilw. | Die drei Inline-Typen sind manuell synchron zu halten. Ein Feld nur an einer Stelle: die Antwort kommt bei `/check-answer` an, fehlt aber beim Endabgleich `/solo-score` → Server re-evaluiert leer und kappt den Score auf 0. |
| `states/Result.tsx:278` | Zweig an der richtigen Position der Reveal-Kette | nein | Der Spieler sieht die Lösung nicht — oder, schlimmer, den Zweig eines **fremden** Typs mit falschem Titel. Die Kommentare ab Zeile 269 dokumentieren genau diesen Präzedenzfall (fill-blank leakte in den sentence-builder-Zweig). |
| `states/Result.tsx:152` + `:202` | Wertungsfreiheit | nein | Ton, Vibration und Verdikt-Icon hängen **nur** am Payload-Flag `poll`, nicht an `isUnscoredQuestionType`. Ein wertungsfreier Typ zeigt das rote X, spielt `sfxWrong()` und vibriert mit `hapticError()`. Solo macht es an derselben Stelle richtig, der Mehrspieler nicht. **Heute offen (#532).** |
| `states/Responses.tsx:48` | Flag-Block und Render-Kette | nein | Der Beamer zeigt das generische Balkendiagramm über `answers` — bei Freitextformaten Nullbalken; die Lösung wird nie eingeblendet. |
| `states/Responses.tsx:394` | Zusätzlich negieren | nein | Unter der neuen Auswertung erscheint **zusätzlich** ein sinnloses Kachelraster. Doppelte, widersprüchliche Anzeige auf dem Beamer. |
| `states/Responses.tsx:411` | — | nein | Die einzige Stelle dieser Ebene, die sich automatisch anpasst: `isUnscoredQuestionType(type)`. Eintrag in `UNSCORED_QUESTION_TYPES` genügt. |
| `states/Prepared.tsx:16` | `TILE_TYPES` oder eigene Miniatur | nein | Zwischen den Fragen zeigt der Beamer eine falsche Vorschau (Kacheln oder Slider). Rein kosmetisch, fällt bei QA leicht durch. |
| `components/stage/AnswerRevealPanel.tsx:8` | Variante wählen oder ergänzen | nein | Fixe Menge `"text" \| "number" \| "chips" \| "tokenPos"`. Eine **unbekannte** Variante wäre ein Build-Fehler — der Fehler entsteht durch Nichtbenutzen: wer `variant="text"` mit einem `JSON.stringify`-String benutzt, zeigt dem Spieler Rohdaten. |
| `states/Answers.tsx:799` / `SoloAnswers.tsx:417` | `testIdPrefix` durchreichen (`""` bzw. `"solo-"`) | nein | Die e2e- und Stagehand-Tests können den Typ nicht ansteuern. Er bleibt dauerhaft ungetestet, während die Suite grün meldet. |
| `states/Answers.tsx:753` | `submitted` setzen | nein | Keine Bestätigung, dass die Antwort angekommen ist; mehrfaches Absenden möglich. |

### 3.6 Manager-Auswertung, MCP, Übersetzung, Test

| Datei | Was zu tun ist | Compiler | Wenn vergessen |
|---|---|:---:|---|
| `manager/utils/answerCorrectness.ts:20` | Zweig für strukturierte Antworten | nein | Der Doc-Kommentar behauptet *Mirrors server-side scoring logic exactly*. Der Fallback ist `solutions.includes(pa.answerId)`: die Manager-Ergebnisansicht markiert richtige Antworten als falsch, während Rust korrekt rechnet. Stille Divergenz. |
| `manager/utils/resultExport.ts:142` | Antwortspalte aufbereiten | nein | Der CSV-/JSON-Export enthält leere Zellen oder rohes JSON. |
| `manager/components/ResultModal/ResultModalAnswers.tsx:66` | Vierte Flag-Ebene | nein | Das Result-Modal zeigt die Antworten als rohen JSON-String oder gar nicht. |
| `packages/mcp/src/tools/ai.ts:26` | `z.enum` — vierte Kopie der Typliste | nein | Kommentiert als `/* all QUESTION_TYPES */`, enthält aber nur 13. **Und `packages/mcp` ist per `pnpm-workspace.yaml` (`!packages/mcp`) aus dem Workspace ausgeschlossen — `pnpm -r run types` erreicht die Datei nie.** |
| `packages/mcp/src/question-builder.ts:184` | `case` + Seed | nein | `case "choice": default:` baut `["A","B","C","D"]` mit `solutions: [0]`. Entweder scheitert der Validator danach — oder es passiert, weil die Choice-Regeln erfüllt sind, und eine strukturell falsche Frage entsteht. |
| `packages/mcp/src/ai-provider.ts:278` + `:384` | Zweite, eigenständige Kopie der AI-Prompt-Maschinerie | nein | Neben `rust/server/src/socket/ai_provider.rs`. Der MCP-AI-Pfad erzeugt still falsche Payloads. |
| `locales/{de,en,es,fr,it,zh}/quizz.json` | `type.<camelCase>` + `type.<camelCase>Desc` ×6 | nein | Die Kachel zeigt den rohen Key `quizz:type.puzzle`. **Kein Gate blockt das:** `check-locales.sh` prüft nur JSON-Parsebarkeit, `locale-sync.mjs check` gibt WARN aus und beendet mit Exit 0. `pnpm i18n:check` hängt nicht an `pnpm verify`. |
| `locales/*/errors.json` ×6 | Die im `superRefine` genannten `errors:quizz.*`-Keys | nein | Validierungsfehler erscheinen im Editor als roher Key-String, in allen sechs Sprachen. |
| `locales/*/game.json` ×6 | Spiel-/Reveal-Strings des Typs | nein | Antwortboard, Submit-Button, aria-labels und Reveal-Titel zeigen rohe Keys im laufenden Spiel. |
| `e2e/fixtures/all-types-quiz.json` | Eine Frage des Typs | nein | Gemeinsame Quelle für fünf Suiten. Fehlt sie, wird der Typ von **keinem** e2e-Test je gespielt. |
| `e2e/answer-flow.spec.ts:232` + `:300` | `case` in beiden Antwort-Plänen | nein | Laufzeit-Throw *Unknown question type*. Der `never`-Guard dort ist wirkungslos: `q as never` castet explizit, und `q.type` ist nach JSON-Import ohnehin nur `string`. |
| `e2e/answer-flow.spec.ts:436` | Ternary-Kette in `advanceToNextQuestion` | nein | **Still falsch:** wartet auf `answer-btn-0`, läuft 6×2 s leer und fällt kommentarlos durch. Der Fehler taucht später als 45-s-Timeout an einer irreführenden Stelle auf. |
| `e2e/answer-flow.spec.ts:33` + `:688` | `UNSCORED_IN_SUITE` **und** die Punkte-Delta-Assertion | nein | Zwei getrennte Listen. Ohne die erste: 20-s-Timeout auf `correct-answer-highlight`. Ohne die zweite: der Typ wird nicht darauf geprüft, ob er heimlich Punkte vergibt — grün, obwohl genau dieser Bug (#504) der Anlass war. |
| `e2e/stagehand/{solo-types,mp-loop,sequencing-live,fill-blank-matching-droppin}.spec.ts` | Je zwei Switches | nein | Vier weitere Dateien mit demselben Doppelmuster. Der Antwort-Switch wirft laut; `answerControlTestId` liefert dagegen still `'solo-choice-tile-0'` bzw. `'answer-btn-0'` — Timeout an der falschen Stelle, oder ein kaputter Zustand wird grün getestet. |
| `e2e/fixtures/validate.mjs:24` | Falle | nein | Führt eine eigene, veraltete 7er-Liste und ist in keinem Gate verdrahtet. Ein Lauf meldet für jede Frage ab `mathematik` *Invalid type* — ein Fehlalarm, der eine echte Fixture-Änderung als kaputt aussehen lässt. |
| `packages/common/src/validators/quizz.new-types.test.ts` | `describe`-Block | nein | Es gibt **keinen** Exhaustiveness-Test über `QUESTION_TYPES` in `packages/common`. |
| `rust/engine/src/eval.rs:497` | `#[test]` pro Typ | nein | Die Scoring-Semantik des Typs ist schlicht unbelegt. |
| `packages/web/.../ChoiceGrid.test.tsx:68` | Harte 5er-Liste im Test | nein | Der Test bleibt grün und behauptet weiter *all 5 unscored types*, obwohl der neue nie geprüft wurde. |

---

## 4. Die Fallgruben

Alles in § 3 mit *Compiler: nein* ist eine Fallgrube. Diese hier haben
tatsächlich zugeschlagen — dreimal allein in der Session vom 2026-07-27/28.

### 4.1 Die drei realen Vorfälle

**Vorfall 1 — `socket/validation.rs`, Speichern unmöglich. Behoben, PR #534.**
`validate_question` ist ein `match` mit `_ =>`-Catch-all (Zeile 269, Kommentar
*choice / boolean / None → default*). Die vier neuen wertungsfreien Typen hatten
dort keinen Arm und wurden folglich gegen die Choice-Regeln validiert: ≥2
`answers`, ≥1 `solutions`. Der Autor legte im Editor eine Wortwolke an, drückte
Speichern und bekam einen Toast *zu wenige Antworten*. Der Typname kam in der
Fehlermeldung nicht vor. Der Kommentar bei Zeile 188 dokumentiert denselben
Fehlermodus für Sequencing — dieselbe Grube, zweimal.

Der Fix (Arme bei Zeile 257 und 264) beseitigt den Symptomfall. **Der `_`-Arm
steht weiterhin.** Der nächste Typ fällt genauso hinein.

**Vorfall 2 — `socket/reveal_helpers.rs`, rotes Kreuz für Meinungsfragen.
Offen, Issue #532.** `let is_poll = matches!(question.r#type.as_ref(),
Some(QuestionType::Poll))` (Zeile 26, verifiziert) ist der einzige Kanal, über
den der Client erfährt, dass eine Frage kein Richtig/Falsch kennt. Das Flag
speist Zeile 591 (`show_result_data.poll`) und Zeile 594 (die Nachricht:
`game:pollThanks` statt `game:correct`/`game:wrong`).

`word-cloud`, `brainstorm`, `confidence` und `micro-lesson` sind in
`eval.rs` korrekt wertungsfrei (`base = 0.0`), stehen hier aber nicht drin.
Ergebnis im Mehrspieler: rotes X, Falsch-Ton, Fehler-Vibration, gebrochene
Streak — für eine Frage, die serverseitig nie ein Urteil bildet. Der Solo-Modus
macht es an derselben Stelle richtig, weil `SoloAnswers.tsx:127` die zentrale
Liste `isUnscoredQuestionType` benutzt. Die beiden Flächen widersprechen sich.

Das Muster: **die Wertungsfreiheit ist an mindestens acht Stellen in Rust
einzeln als `matches!(…, Poll)` kodiert** — `state/mod.rs:316`, `:581`, `:584`,
`reveal_helpers.rs:26`, `:213`, `:437`, `solo.rs:315`, `:547`. Jede einzeln
vergessbar. Der Kommentar in `constants.ts:492` sagt ausdrücklich
*APPEND-ONLY: add a new member here (not a per-callsite `type === "..."`
check)* — die TS-Seite hält sich daran, die Rust-Seite nicht.

**Vorfall 3 — Bot-Antwortwahl. Offen.** `rust/server/src/bot/manager.rs:114`,
`pick_answer`, endet auf `_ => (Some(pick_choice(question)), None, None)`
(Zeile 125, verifiziert). Bots antworten auf jeden nicht gelisteten Typ mit
einem Choice-Index. Bei einem Typ ohne `answers` liefert `pick_choice` 0. Die
Antwort hat die falsche Payload-Form, aber `record_answer`
(`engine/src/state/mod.rs:255`) prüft die Shape nur für `multiple-select`,
`type-answer` und `sentence-builder` — sie wird angenommen. Statistik und
Reveal zeigen Müll. Kein Log, kein Fehler.

*(Der Auftragstext nannte die Datei als `socket/manager.rs ~125`. Der reale Pfad
ist `rust/server/src/bot/manager.rs`, Zeile 125 — verifiziert per grep.)*

### 4.2 Was diese drei gemeinsam haben

Alle drei sind derselbe Fehler: **eine Entscheidung, die an *n* Stellen
wiederholt wird, wobei jede Stelle einen syntaktisch gültigen Default hat.**

Die Wertungsfreiheit ist das Musterbeispiel. Sie steht heute an mindestens
15 Orten getrennt:

- TS-Quelle: `constants.ts:495` (`UNSCORED_QUESTION_TYPES`)
- TS-Konsumenten: `answerCorrectness.ts`, `resultExport.ts:165`,
  `ResultModalTable.tsx:79`, `ResultModalAnswers.tsx:65`, `Responses.tsx:411`,
  `SoloAnswers.tsx:127`
- TS-Abweichler, die stattdessen `poll` prüfen: `Result.tsx:152`/`:202`,
  `QuestionEditorAnswers.tsx:22`, `submissions/QuestionPreview.tsx:29`
- Rust, je einzeln: `eval.rs` (die `base = 0.0`-Zweige),
  `state/mod.rs:316`/`:581`/`:584`, `reveal_helpers.rs:26`/`:213`/`:437`,
  `solo.rs:315`/`:547`
- e2e, handkopiert: `answer-flow.spec.ts:33` und `:688`
- Tests, hart verdrahtet: `ChoiceGrid.test.tsx:68`

Es gibt zwischen diesen Listen **keinen automatischen Abgleich**. Der Kommentar
in `constants.ts` behauptet, die Liste spiegele die Rust-Zweige. Sie tut es
heute nicht.

### 4.3 Die vier teuersten Einzelfallen

Nach Schaden sortiert, nicht nach Aufwand.

1. **`eval.rs:379`.** Der Typ wird index-basiert bewertet. Jeder Spieler bekommt
   0 Punkte und *falsch*. Nichts meldet sich. Der Guard-Test bei `:1177` fängt
   das **nicht** — er prüft nur, dass die Variante gelistet ist und
   `evaluate_answer` nicht panickt.
2. **`SoloAnswers.tsx:563`.** Der Solo-Fallback ist `ChoiceGrid`, nicht `null`.
   Die UI sieht richtig aus und ist falsch. Genau deshalb steht in den
   Projektregeln, dass e2e-Spieltests **jeden Typ auch solo** abdecken müssen.
3. **`lifecycle/payloads.rs:44` und `http/solo.rs:45`.** Zwei getrennte
   Spielzeit-Payloads mit zwei getrennten Anti-Cheat-Strippings. Ein vergessenes
   Stripping ist ein Security-Bug, kein Anzeigefehler.
4. **`ai_provider.rs:197` (Default ab `:365`) und `question-builder.ts:184`.**
   Beide überschreiben den bestellten Typ aktiv mit `"choice"` und erfinden
   Platzhalter-Antworten. Der Nutzer sieht ein Ergebnis, nur das falsche.

### 4.4 Zwei Fallen, die niemand erwartet

**`dropEmptyAnswers.ts:17`** läuft typ-blind über jede Frage mit `answers`,
**bevor** validiert wird, trimmt leere Einträge und reindiziert `solutions`.
Der Doc-Kommentar dort ist bereits stale (nennt nur choice/poll/multiple-select,
obwohl word-cloud und brainstorm ebenfalls `answers` führen). Wer `answers` als
etwas anderes benutzt — `micro-lesson` benutzt es als Zeilen des Lerninhalts —
verliert beim Speichern still Zeilen.

**`scoring.rs:36`, `is_correct(question, answer_key)`** ignoriert den Fragetyp
komplett und wird im gesamten Workspace außerhalb der eigenen Tests nirgends
aufgerufen. Der Name lädt zur Benutzung ein. Wer sie benutzt, bekommt für jeden
nicht-index-basierten Typ dauerhaft `false`.

---

## 5. Automatisierung

### 5.1 Was heute existiert — und was es taugt

| Werkzeug | Verdrahtet? | Taugt |
|---|---|---|
| `rust/engine/src/eval.rs:1177` (Guard-`match` ohne `_`) | nur `rust/gate.sh`, **CI dormant** | Die eine echte Tripwire. Erzwingt aber nur die Listung, nicht den Zweig. |
| `rust/server/src/main.rs:21` (`question_type_wire`) | nur `rust/gate.sh`, **CI dormant** | Bricht `cargo build` sofort. Lauteste Rückmeldung — wenn jemand baut. |
| `scripts/check-question-types.sh` | **nirgends** | Existiert, deckt 5 Berührungspunkte ab, ist heute **rot** (`FAIL 6`, verifiziert). Läuft nur, wenn jemand daran denkt. |
| `scripts/check-locales.sh` | `rust/gate.sh:79` (also auch dormant in CI) | Prüft nur JSON-Parsebarkeit. Fehlende Übersetzungen sind grün. |
| `scripts/locale-sync.mjs check` | über `check-locales.sh` | Reiner Warn-Report, Exit 0. Blockt nichts. |
| `scripts/check-key-refs.sh` | nirgends | Prüft nur den `manager:`-Namespace. Für Fragetypen (`quizz:`, `game:`) existiert kein Key-Referenz-Gate. |
| `.gitea/workflows/ci.yml` | — | Läuft: Typecheck, Token-Gates, Lint (warn-only). Läuft **nicht**: `rust/gate.sh` (Job `if: ${{ false }}`), `pnpm test` (existiert nicht als Schritt), `packages/mcp` (per `!packages/mcp` aus dem Workspace ausgeschlossen). |

Nüchtern: von den 140 Stellen sichert die Pipeline heute den TypeScript-Teil
der Struct- und Map-Typen. Alles Rust-seitige und alles Testbezogene hängt
daran, dass jemand lokal `bash rust/gate.sh` fährt.

### 5.2 Was gebaut werden sollte, nach Nutzen sortiert

**1. Bindings-Gleichstand (Aufwand: klein).** `rust/protocol/bindings/QuestionType.ts`
wird von ts-rs bereits erzeugt und enthält exakt die 17 Wire-Slugs. Heute liest
sie niemand. Ein ~20-Zeilen-Node-Skript, das diese Union gegen `QUESTION_TYPES`
in `constants.ts` diffed, schließt die **einzige fehlende Brücke** zwischen
Rust-Enum und TS-Union — und fängt nebenbei ein falsches `#[serde(rename)]`,
das sonst niemand fängt. Verdrahten im Job `lint-typecheck` (nicht im
dormanten `rust`-Job). Bedingung: die bindings müssen nach Enum-Änderungen per
`cargo test` neu geschrieben und committet sein; das Skript sollte das per
mtime-Vergleich mitmelden.

**2. Rust-Registry `question_type_traits()` (Aufwand: mittel).** Eine `const fn`
mit `match` **ohne** `_`-Arm, die pro Variante `{ scored, shuffles_chunks,
shuffles_items }` liefert. Ersetzt zwölf verstreute Einzelprüfungen
(`state/mod.rs:316`/`:581`/`:584`, `reveal_helpers.rs:26`/`:213`/`:437`,
`solo.rs:315`/`:547`, `lifecycle/mod.rs:156`/`:169`, `solo.rs:198`/`:205`) durch
eine compilergeprüfte. Behebt nebenbei #532 und den Streak-Bug.

Warnung: das ist ein **Verhaltens-Change**, kein Refactoring. `streak`,
`total_scored`, `theoretical_max` und das `poll`-Flag ändern sich für vier
Typen. Eigener Branch, `rust/gate.sh`, `e2e/answer-flow.spec.ts:688` und ein
Solo-Durchlauf. Und: `scored` in der Registry muss per Unit-Test gegen die
`base == 0.0`-Zweige in `eval.rs` abgesichert werden — sonst ist die Registry
nur eine zweite Wahrheit neben der ersten.

**3. `scripts/check-question-types.mjs` statt der Bash-Version
(Aufwand: mittel).** Der breiteste Einzelhebel. Node statt grep, damit:
Slug → PascalCase ableitbar ist (`word-cloud` → `WordCloud`, die heutige
Bash-Version greppt den Slug und ist deshalb bei `eval.rs` strukturell blind);
der Editor-Check **beide** Dateien fordert statt eines ODER; die
Unscored-Ausnahme aus `UNSCORED_QUESTION_TYPES` gelesen wird statt `poll`
hartzukodieren; Locales, Fixture und die fünf e2e-Switches mitgeprüft werden.
Bei leerem Parse von `QUESTION_TYPES` **hart abbrechen** — die heutige Version
fällt auf eine stale 13er-Liste zurück und meldet OK.

Weil das Repo heute rot ist (`FAIL 6`), braucht es eine eingecheckte Baseline:
Exit 1 nur bei **neuen** Einträgen, plus Hinweis, wenn ein Baseline-Eintrag
behoben wurde. Sonst wird das Gate nach dem ersten roten Merge deaktiviert und
ist tot.

**4. `never`-Erschöpfungsprüfung an drei TS-Stellen (Aufwand: klein).**
In `validators/quizz.ts` den terminalen `else` aufteilen in einen expliziten
`choice|boolean|multiple-select|undefined`-Zweig plus
`else { const _exhaustive: never = q.type }`. Analog `TYPES` in
`QuestionEditorType.tsx` per `as const satisfies` und einer
`Exclude<QuestionType, …>`-Assertion, sowie `next` in der `setType`-Kette. Damit
bricht `pnpm -r run types` — und das **läuft in CI**. Drei der teuersten
Fehlermodi werden zu Build-Fehlern.

**5. `_`-Arme entfernen, wo der Default falsch ist (Aufwand: mittel).**
Gezielt vier: `validation.rs:269`, `reveal_helpers.rs:100`,
`bot/manager.rs:125` (dort mit `warn!` statt geratenem Index), und — als
eigenes Work-Package mit Quality-Worker — die if-Kette in `eval.rs:110-379` in
ein `match` ohne `_` umbauen. Letzteres ist der riskanteste Punkt der Liste: die
Kette ist reihenfolgeabhängig (`:369` routet zwei Typen in eine geteilte
Slot-Funktion), der Umbau muss die Reihenfolge exakt erhalten und braucht die
Per-Typ-Tests ab `eval.rs:497` als grünen Beleg vorher **und** nachher.

**Nicht** anfassen: `reveal_helpers.rs:120`/`:138`/`:156`/`:173`. Dort ist
`_ => None` für 15 von 17 Typen fachlich richtig; eine Vollaufzählung erzeugt
4×17 mechanische `=> None`-Zeilen ohne Informationsgewinn.

**6. TS-Registry `Record<QuestionType, QuestionTypeMeta>` (Aufwand: mittel).**
Ersetzt die drei stale `TYPE_LABEL_KEY`-Maps (je 6 von 17 Typen), `TILE_TYPES`,
`isChoiceLike` und die `isPoll`-Flags durch eine vollständigkeitsgeprüfte
Tabelle. Pro Call-Site ein eigenes kleines Paket, jeweils mit identischem
Boolean-Ergebnis für die heutigen 17 Typen. Die negativen Ausschlussketten
(`Responses.tsx:394`, `QuestionEditor/index.tsx:93`) sind **kein** mechanischer
Swap — dort steckt eine Layout-Entscheidung drin; zuletzt und nur mit
Browser-Smoke.

**7. Stale Duplikatlisten ableiten (Aufwand: klein).**
`packages/mcp/src/tools/ai.ts:26` → `z.enum(QUESTION_TYPES)` (das Paket
importiert `@razzoozle/common/constants` bereits). `ai_validate.rs:246`
`ALLOWED_TYPES` → gegen das Enum prüfen statt gegen ein String-Array; damit
fällt auch das Test-Duplikat bei `:373` samt falschem Namen
`..._all_thirteen_types` weg. Dazu einen CI-Schritt `pnpm --dir packages/mcp
run types` — sonst fängt die erste Änderung niemand. Vorher lokal laufen
lassen: das Paket war nie im CI, der Typecheck kann heute schon rot sein.

**8. Locale-Gate — eng, nicht global (Aufwand: klein).** Der Typ-Key-Check aus
Punkt 3 prüft gezielt `type.<camel>` und `type.<camel>Desc` in allen sechs
Sprachen und blockt. Ein globales `locale-sync check --strict` erst
**nachdem** die bestehenden WARNs abgearbeitet sind (aktuell z. B.
`manager [zh] missing: templates.questionCount_one`) — ein globales Gate auf
einem Repo mit bestehenden Lücken wird nach dem ersten roten Merge deaktiviert.

### 5.3 Was ein Generator nicht kann

Ein `pnpm g:questiontype`-Scaffold ist verlockend und steht bewusst **nicht**
oben auf der Liste. Ein Generator, der in 20+ Dateien per Anker schreibt,
veraltet mit jedem Refactoring, und das Einfügen ist ohnehin der leichte Teil —
das Prüfskript aus Punkt 3 liefert dieselbe Sicherheit ohne Schreibrisiko.

Falls doch gebaut: er muss `todo!()` und `throw` hinterlassen, keine plausiblen
Defaults. Ein Generator, der eine funktionierend **aussehende**
Choice-Fallback-Maske erzeugt, ist schädlicher als gar keiner — genau dieser
Fehlermodus steckt heute in `ai_provider.rs:365` und `question-builder.ts:184`.

Diese acht Punkte bleiben Handarbeit, egal wie viel Tooling darum steht:

1. Die **Eingabemaske im Editor** — Layout und Feldsemantik sind eine
   Design-Entscheidung.
2. Die **Spielansicht** und die Antwort-Leaf — ein Generator kann das
   `AnswerViewProps`-Gerüst legen, nicht die Interaktion.
3. Die **Scoring-Semantik** — was *richtig* heißt, ist die Fachfrage des Typs.
4. Der **Play-Payload samt Anti-Cheat-Stripping** — welches Feld die Lösung
   verrät, weiß nur ein Mensch. Ein falsch geratenes Feld ist ein Security-Bug.
5. Die **Reveal-Darstellung**.
6. Die **e2e-Antwortstrategie** — *wie beantwortet man diesen Typ richtig bzw.
   absichtlich falsch* ist die Testidee selbst.
7. Die **Bot-Strategie**.
8. Die **Übersetzungen**. `[TODO]`-Platzhalter sind ehrlicher als maschinelle
   Füllwörter, die dann als übersetzt gelten.

### 5.4 Realistische Bilanz

Nach den Punkten 1-7 wäre etwa die Hälfte der Stellen compiler-erzwungen
(Rust-Enum, Wire-Mapping, Registry-Entscheidungen, Struct-Literale,
Validator-Zweige, Editor-Kachel), ein weiteres gutes Viertel per Gate
**sichtbar** (Locales, e2e-Cases, Render-Zweige), der Rest bliebe Handarbeit.

Das Risiko liegt danach im Gegenteil: es fühlt sich sicher an, weil alle Gates
grün sind. Grüne Gates bedeuten hier nur, dass der Typ überall **erwähnt**
wird — nicht, dass er spielbar ist.

---

## 6. Abnahme

*Tests grün* ist keine Abnahme. In diesem Repo laufen die relevanten Tests in
CI gar nicht (§ 5.1), und die Gates prüfen Anwesenheit, nicht Funktion.

Abnahme ist der Durchstich. Vollständig, in dieser Reihenfolge, im Browser.

### 6.1 Editor

1. Neue Frage anlegen, den neuen Typ in der Kachelauswahl finden und anklicken.
   **Der Typ muss ausgewählt bleiben.** Springt die UI auf Multiple Choice
   zurück, fehlt der `setType`-Zweig (`QuestionEditorType.tsx:449`).
2. Die typ-eigene Maske muss erscheinen — und der generische A-D-Antworteneditor
   **nicht** zusätzlich darunter (`QuestionEditor/index.tsx:93`).
3. Alle Felder ausfüllen. Speichern. **Kein Toast.** Kommt *zu wenige
   Antworten* oder *keine Lösung*, fehlt ein `superRefine`- oder ein
   `validation.rs`-Zweig.
4. **Seite hart neu laden** (nicht in-app navigieren). Alle Felder müssen
   unverändert dastehen. Fehlt etwas, hat zod es beim Parsen gestrippt
   (`quizz.ts:48-110`) oder `dropEmptyAnswers` hat es getrimmt.
5. Typ auf `choice` umschalten und zurück. Es dürfen keine Reste des
   Fremdtyps am Objekt hängen (`QuestionEditorType.tsx:179`).
6. Die Folienminiatur in der Leiste muss den Typ erkennbar machen, nicht das
   Choice-Raster (`QuestionPreview.tsx:262`).

Vorlage für die automatisierte Fassung von 1-4:
[`e2e/verify-525-unscored-types.spec.ts`](../e2e/verify-525-unscored-types.spec.ts)
(218 Zeilen). Es fährt genau diesen Zyklus — anlegen, speichern, neu laden,
Persistenz prüfen — pro Typ. Ein `TypeSpec` ergänzen; `typeLabel` ist der
**wörtliche** deutsche Label-String aus `quizz.json`.

### 6.2 Mehrspieler

7. Spiel starten, mit zwei echten Browser-Kontexten beitreten (nicht zwei
   same-origin-iframes — die teilen eine `client_id`).
8. Zur neuen Frage vorrücken. **Beide Spieler müssen ein Eingabefeld sehen.**
   Leerer Bereich = fehlender Zweig vor `Answers.tsx:951`.
9. Spieler 1 antwortet richtig, Spieler 2 falsch bzw. abweichend. Beim Absenden:
   Ton, Vibration, *Antwort gespeichert*-Bestätigung.
10. Ergebnis-Screen: die **richtige** Lösung, in lesbarer Form, unter dem
    richtigen Titel. Kein `[object Object]`, kein leeres Panel, nicht der
    Reveal-Block eines fremden Typs.
11. Punkte prüfen: Spieler 1 hat welche, Spieler 2 nicht. Beide bei 0 heißt
    `eval.rs`-Default (`:379`).
12. **Bei wertungsfreiem Typ:** kein rotes X, kein Falsch-Ton, keine
    Fehler-Vibration, Streak intact, die Frage zählt nicht ins
    Punkte-Maximum. (Das ist heute für vier Typen kaputt — #532.)
13. Präsentator-/Beamer-Ansicht: die Antwortstatistik zeigt die Antworten des
    Typs, nicht ein leeres Balkendiagramm — und **kein** zusätzliches
    Kachelraster darunter (`Responses.tsx:394`).
14. Wenn der Typ serverseitig mischt: Timer-Nudge über die Manager-Steuerung
    auslösen. Die Reihenfolge beim Spieler darf sich **nicht** ändern
    (`pacing.rs:141`).

### 6.3 Solo

Eigener Durchstich, nicht ableitbar — der Solo-Pfad ist in Rust *und* in React
getrennt implementiert.

15. Solo starten, zur neuen Frage. Eingabefeld prüfen. Ein **Choice-Raster** an
    dieser Stelle ist der Fehler, nicht das Fehlen eines Feldes
    (`SoloAnswers.tsx:563`).
16. Richtig antworten → Punkte und Chime. Falsch → korrektes Feedback.
17. Eine Frage **auslaufen lassen**, ohne zu antworten, dann eine mit
    eingegebener, aber nicht abgeschickter Antwort. Die eingegebene Antwort darf
    nicht verworfen werden (`SoloAnswers.tsx:234`).
18. Nach dem Absenden darf der Solo-Timer nicht weiterlaufen und die Antwort
    kein zweites Mal senden (`clearInterval` in der Submit-Funktion).
19. Quiz zu Ende spielen. Der Prozentwert am Ende muss 100 % erreichen können —
    tut er es nicht, zählt ein wertungsfreier Typ ins `theoretical_max`
    (`solo.rs:547`). Und der Endscore darf nicht auf 0 einbrechen; passiert das,
    fehlt das Transportfeld in `SoloScoreSubmitAnswer` (`solo.rs:129`).
20. Drei Viewports: Desktop, Tablet, Mobil.

### 6.4 Randflächen

21. **Bots:** ein Spiel mit Bots starten. Sie dürfen nicht alle identisch
    antworten (`bot/manager.rs:114` — heute offen).
22. **Manager-Ergebnis:** Result-Modal und CSV-Export müssen die Antworten
    lesbar zeigen und die Korrektheit genauso beurteilen wie der Server
    (`answerCorrectness.ts`, `resultExport.ts`).
23. **Katalog und Einreichung:** das Typ-Badge darf nicht *Auswahl* sagen (drei
    `TYPE_LABEL_KEY`-Maps). Auf `/submit` muss der Typ entweder eine Maske
    haben oder ausgesperrt sein.
24. **Snapshot:** Server neu starten, während das Spiel auf der neuen Frage
    steht. Nach dem Restore muss die Reihenfolge dieselbe sein
    (`snapshot.rs:359`).
25. **Übersetzung:** die Sprache umschalten. Nirgends ein roher Key
    (`quizz:type.…`, `game:…`, `errors:quizz.…`). In allen sechs Sprachen —
    kein Gate prüft das.

### 6.5 Gates, von Hand

```bash
bash rust/gate.sh                    # läuft NICHT in CI (Job if: false)
bash scripts/check-question-types.sh # nirgends verdrahtet, heute FAIL 6
corepack pnpm -r run types
corepack pnpm test                   # kein CI-Schritt
```

Und die e2e-Suite `e2e/answer-flow.spec.ts` mit dem neuen Typ in
`e2e/fixtures/all-types-quiz.json`. `E2E_BASE_URL` muss der öffentliche Name
sein, nie `127.0.0.1:3012`.

### 6.6 Die eine Frage

Wenn ein Punkt aus § 6.1-6.4 nicht geprüft wurde, ist der Typ nicht fertig —
egal, was die Gates melden. Grün heißt hier: *der Typ wird überall erwähnt.*
Fertig heißt: *ein Lehrer kann ihn anlegen und eine Klasse kann ihn spielen.*

---

## Siehe auch

- [`docs/design/question-type-contract.md`](design/question-type-contract.md) —
  Pflichtenheft der Berührungspunkte (teilweise stale, siehe Kopf dieses
  Dokuments)
- [`e2e/verify-525-unscored-types.spec.ts`](../e2e/verify-525-unscored-types.spec.ts) —
  Vorlage für den Editor-Persistenz-Durchstich
- `scripts/check-question-types.sh` — das unverdrahtete Anti-Wildwuchs-Gate
- Issue #532 (Reveal wertungsfreier Typen), Issue #533 (word-cloud nicht
  beantwortbar), PR #534 (Validator-Zweige, behoben)
