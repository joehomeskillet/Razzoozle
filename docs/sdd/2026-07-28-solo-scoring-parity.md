# SDD: Solo-Scoring-Parität mit dem Multiplayer-Kern

Datum: 2026-07-28 · Branch: docs/scoring-parity · Status: Review eingearbeitet
(2 unabhängige Gutachten, siehe "Was die Prüfung geändert hat"), zur Freigabe

Auftrag: Die Solo-Punkteberechnung soll denselben Kern nutzen wie Multiplayer —
Punkte, Streak-Multiplikator, Zeitbonus, Badges/Achievements. Keine zweite, nur
für Solo gebaute Fachlogik. Reuse first, kleine Module, eine Verantwortung pro
Datei. Multiplayer-Verhalten bleibt unverändert.

Alle Bestandsaussagen sind gegen den Stand des Branches docs/scoring-parity
(basierend auf origin/main) verifiziert, Format `datei:zeile`. Ungeprüfte
Punkte sind als "nicht geprüft" markiert.

---

## 1. Aktueller Solo-Scoring-Flow

Solo läuft rein über zustandslose HTTP-Handler, ohne Server-Session:

1. `GET /api/quizz/:id/solo` — `handle_get_quiz_solo` (rust/server/src/http/solo.rs:173)
   liefert ALLE Fragen in einer Antwort (`SoloResponse{questions}`, solo.rs:90-94).
   Das Wire-Format `SoloQuestion` (solo.rs:44-88) trägt `time`/`cooldown`
   (solo.rs:86-87), aber KEINE `bonus`/`practice`-Felder.
2. Pro Frage: Client `submitAnswer()` → `POST /check-answer`
   (packages/web/src/features/game/stores/solo.ts:289, Handler
   `handle_check_answer` solo.rs:276-339). Der Server bewertet via
   `evaluate_answer` (solo.rs:312) und rechnet `points = (base * 1000.0).round()`
   (solo.rs:318) — nur UI-Feedback, nichts wird persistiert. Für Slider-Fragen
   wird inline ein hartcodiertes `sharpshooter` vergeben (`base*100.0 >= 95.0`,
   solo.rs:332-335).
3. Der Client akkumuliert `totalPoints` und einen rein clientseitigen `streak`
   (solo.ts:83, Inkrement/Reset solo.ts:338) und schaltet Streak-Badges lokal
   frei (`streakBadges()`, solo.ts:37-44).
4. Am Ende: `finishGame()` → `POST /solo-score` (solo.ts:406, Handler
   `handle_solo_score` solo.rs:444-655). Der Server ignoriert `payload.score`
   und jedes `answer.correct` und berechnet den Score aus den Roh-Antworten neu:
   `compute_solo_score(&quiz, payload.answers)` (solo.rs:556), Cap gegen
   `theoretical_max = non_poll_count * 1000` (solo.rs:546-549, 559), INSERT in
   `solo_results` (solo.rs:619-631), Leaderboard-Antwort (solo.rs:634-654).

`compute_solo_score` (solo.rs:347-379): fail-closed bei fehlenden/leeren
Antworten (solo.rs:348-351), Index-Guards (negativ/out-of-range übersprungen,
solo.rs:357-363), Duplikat-Dedupe first-wins (HashSet, solo.rs:353,364), pro
Antwort `evaluate_answer` → `score += (base * 1000.0).round()` (solo.rs:374-375).
Kein Aufruf von `scoring::calculate_points`, keine Zeit, kein Streak, kein
Bonus-/Practice-Flag.

Reload-Resume: der komplette Fortschritt wird in sessionStorage gespiegelt
(`persistSoloProgress` solo.ts:188, subscribe solo.ts:475) und beim nächsten
`loadQuiz()` ohne Server-Rückfrage wiederhergestellt (`loadSoloProgress`
solo.ts:157, Resume-Pfad solo.ts:227).

## 2. Aktueller Multiplayer-Scoring-Flow

Ein Kern, eine Produktions-Call-Site:

- `time_to_point` (rust/engine/src/scoring.rs:12-33): `seconds = question_time_s.max(1)`,
  `elapsed_s = response_time_ms.max(0)/1000.0`; Überzeit → 0 (scoring.rs:20-22);
  Accuracy = flach `MAX_POINTS=1000` im Fenster, Speed = linearer Abfall
  (scoring.rs:24-29); `.round()` (scoring.rs:32).
- `calculate_points` (scoring.rs:44-77): practice-Gate → 0 (scoring.rs:53-55);
  Basis nur bei `base_factor > 0.0` (scoring.rs:59-63); `raw = base_factor * base`
  (scoring.rs:65); Streak-Multiplikator `1.0 + 0.1 * min(streak_before, 5)` nur
  bei `correct` (scoring.rs:68-72, Konstanten scoring.rs:8-9); Bonusfrage ×2
  (scoring.rs:74); Endrundung (scoring.rs:76).
- `apply_first_correct_bonus` (scoring.rs:80-82): `points + round(100 * base_factor)`.
- Einzige Produktions-Call-Site: `GameState::reveal()` Per-Spieler-Loop
  (rust/engine/src/state/mod.rs:348-402, Aufruf mod.rs:360-368). `correct`/`base`
  aus `eval::evaluate_answer` (mod.rs:350-354), `streak_before = player.streak`
  (mod.rs:357), First-Correct-Bonus gated (mod.rs:373-376), Streak-Mutation
  `if correct { streak_before + 1 } else { 0 }` nur bei `is_scored_question`
  (weder practice noch poll, mod.rs:315-316, 382-389).
- Zeitmessung 100% serverautoritativ: `open_answers()`-Zeitpunkt via
  `timing::now_ms()` + `set_clock_ms` (rust/server/src/socket/lifecycle/mod.rs:134-135,
  deadline mod.rs:139), Antwort-Empfang via `SystemTime::now()` + `set_clock_ms`
  (rust/server/src/socket/player/answer.rs:86, 108), Differenz in der Engine
  (rust/engine/src/state/mod.rs:278). Kein Client-Zeitfeld im Payload.
- `ScoringMode` (rust/protocol/src/status.rs:292-298): Speed/Accuracy, per
  Manager-Config gesetzt und beim `reveal(scoring_mode)`-Aufruf 1:1
  zurückgespielt (rust/server/src/socket/reveal_helpers.rs:416-417 laut
  Ist-Analyse; Handler-Zeile in dieser Session nicht erneut geprüft).
- `scoring::is_correct` (scoring.rs:36-41) hat keinen Produktions-Aufrufer
  (nur eigene Tests scoring.rs:187-191) — toter Code.

## 3. Aktueller Badge-/Achievement-Flow

- Registry: 14 Achievements, 4 Tiers (rust/engine/src/achievements.rs:37-56;
  `sharpshooter` threshold 95.0 in achievements.rs:45).
- Award-Logik: `compute_achievement_awards` (rust/engine/src/state/achievement_awards.rs:23-33)
  mit `AwardRow` (achievement_awards.rs:11-21: scored, is_correct, base_factor,
  streak_after, response_time_ms, points_before/after), `GameCounter`
  (rust/engine/src/state/accum.rs:4-9), rank_before-Map, first_correct_id.
  Underdog-Precompute achievement_awards.rs:40-65.
- Einzige Call-Site: `GameState::reveal()` (mod.rs:592-602 laut Ist-Analyse) —
  Solo ruft die Pipeline nirgends auf (grep über solo.rs: 0 Treffer für
  GameState/achievement_awards/calculate_points).
- Solo hat stattdessen ZWEI Parallel-Systeme: (a) serverseitig hartcodiertes
  `sharpshooter` im check-answer-Handler (solo.rs:332-335), (b) clientseitige
  Streak-Badge-Vergabe (solo.ts:22-44, getrieben vom Client-Streak solo.ts:338).
  Dokumentiert als bewusster Kompromiss "BOUNDED solo badges only"
  (packages/common/src/types/game/index.ts:156ff).

### Ist-Matrix (Pflichtformat)

| Bereich | Solo heute | Multiplayer heute | Ziel |
|---|---|---|---|
| Basispunkte | `base * 1000` flach, zweimal wortgleich (solo.rs:318, solo.rs:375) | `calculate_points` = time_to_point × base_factor × Streak × Bonus (scoring.rs:44-77, Call-Site mod.rs:360-368) | Eine Formel: `scoring::calculate_points` auch für Solo; `compute_solo_score` nur noch dünner Adapter |
| Zeitbonus | Existiert nicht; kein Zeitfeld auf keiner Ebene (solo.rs:96-106, 121-134; solo.ts vollständig ohne Zeiterfassung) | Serverautoritativ: Server-Wallclock beim Öffnen und beim Antwort-Empfang (lifecycle/mod.rs:134-135, answer.rs:86+108, mod.rs:278) | Entscheid des Projektinhabers: WP04-Session-Design (Kosten in §6/§12) oder bewusster Verzicht (Solo fest `ScoringMode::Accuracy`, `response_time_ms=0`) — Empfehlung in §6 |
| Streak/Strike | Rein clientseitig, nur für Badge-Anzeige, nie Punkte (solo.ts:80-83, 338); Server: 0 Treffer für "streak" in solo.rs | `Player.streak` (rust/protocol/src/player.rs:25 laut Ist-Analyse), gepflegt in reveal() (mod.rs:357, 382-389), Multiplikator scoring.rs:68-72 | Serverseitige Rekonstruktion aus den Roh-Antworten in Fragen-Reihenfolge (deterministisch, kein Session-State nötig); Client-Streak nur noch Anzeige-Hint |
| Achievements | Zwei Parallel-Systeme: hartcodiertes sharpshooter (solo.rs:332-335) + Client-streakBadges (solo.ts:37-44); Award-Pipeline unberührt | `compute_achievement_awards`, 14 Trigger, Registry-Config (achievement_awards.rs:23-239, achievements.rs:37-56) | Eine Award-Quelle: Engine-Pipeline mit Solo-Preset (first_responder deaktiviert); beide Solo-Parallel-Systeme abgebaut |
| Security | SEC-05: correct-Feld tot (solo.rs:125-127), fail-closed (solo.rs:348-351), Server-Re-Evaluation (solo.rs:374), Dedupe first-wins (solo.rs:353,364), Cap (solo.rs:559); Tests solo.rs:908-1014 | Serverautoritative Uhr, kein Client-Timestamp im Payload (answer.rs:37-82 laut Ist-Analyse, 86-108) | Alle fünf SEC-05-Guards bleiben wörtlich erhalten; jeder neue Client-Input (streakBefore-Hint) ist untrusted und beeinflusst nie den persistierten Score |

## 4. Identifizierte gemeinsame Komponenten

Bereits heute geteilt oder ohne Änderung teilbar:

- `eval::evaluate_answer` (rust/engine/src/eval.rs) — von beiden Pfaden genutzt
  (solo.rs:312, 374; mod.rs:328, 350-352). Bleibt unverändert.
- `scoring::calculate_points` + `apply_first_correct_bonus` + `time_to_point`
  (scoring.rs:12-82) — reine Funktionen, Signatur nur Primitives + `&Question` +
  `ScoringMode` (scoring.rs:44-52). Der engine-Crate hat keine
  Transport-/DB-Dependencies (rust/engine/Cargo.toml laut Ist-Analyse: rand,
  razzoozle-protocol, unicode-normalization, serde_json). solo.rs bindet
  `razzoozle_engine` bereits ein — kein neuer Crate-Link nötig.
- `ScoringMode` (status.rs:292-298) — fertiges Enum.
- Achievement-Registry + Helfer (achievements.rs) und
  `compute_achievement_awards` + `AwardRow` + `GameCounter`
  (achievement_awards.rs, accum.rs) — bei Einzelspieler-Input schließen sich
  climber und underdog NICHT nur über Zahlengrenzen, sondern über EXPLIZITE
  Guards aus (Review-verifiziert): climber setzt `has_prior` voraus
  (`climbed_from = if has_prior ...` + `climbed_from.is_some()`,
  achievement_awards.rs:151-158); underdog hat den harten Guard
  `max_before_strictly_below[index] > i32::MIN` (achievement_awards.rs:184),
  der bei Länge-1-Input nie erfüllt ist (Precompute achievement_awards.rs:40-65).
  Die drei Zeit-Trigger tragen alle `rt.is_some()`-Guards
  (lucky_guess achievement_awards.rs:114-116, speed_demon :131,
  speedy_gonzales :198) über `AwardRow.response_time_ms: Option<i64>`
  (achievement_awards.rs:18). Nur `first_responder` hat KEINEN strukturellen
  Selbstausschluss — muss per Config deaktiviert werden.

## 5. Identifizierte Duplikationen

Abzubauen in diesem Vorhaben:

1. Punkteformel: `compute_solo_score` (solo.rs:347-379) und der Live-Pfad
   (solo.rs:318) rechnen `base*1000` an der Engine vorbei — die Kernformel
   existiert damit fachlich zweimal.
2. `(eval_result.base * 1000.0).round()` wortgleich an zwei Stellen
   (solo.rs:318 und solo.rs:375).
3. sharpshooter-Schwelle 95.0 hartcodiert (solo.rs:333) statt aus der Registry
   (achievements.rs:45) gelesen; kein enabled()-Check, keine Bonus-Faltung.
4. Streak-Badge-Vergabe clientseitig in TS (solo.ts:37-44) parallel zur
   Server-Logik (achievement_awards.rs, streak-Trigger) — das "zweite
   Solo-Badge-System" aus dem Auftrag.

Vorbestehend, NICHT Scope dieses Vorhabens (nur festgehalten): die
Registry-Metadaten existieren dreifach wortgleich (packages/common/src/achievements.ts,
rust/engine/src/achievements.rs:37-56, rust/server/src/http/achievements.rs:39-58
laut Ist-Analyse) — Bereinigung wäre ein eigenes Vorhaben.

## 6. Zielarchitektur

### 6.1 Kernidee: ein Fold in der Engine, Solo-Handler werden dünn

Neues kleines Engine-Modul `rust/engine/src/solo_run.rs` (eine Verantwortung,
Ziel < 150 LOC) mit einer reinen Funktion:

```
pub fn score_solo_run(
    quiz: &Quizz,
    answers: &[SoloAnswerInput],        // (question_index, AnswerInput, Option<response_time_ms>)
    mode: ScoringMode,
    cfg: &HashMap<String, MergedAchievement>,
) -> SoloRunOutcome                     // { total, per_question: Vec<...>, achievements }
```

Ablauf im Fold, in Fragen-Reihenfolge (0..questions.len()), NICHT in
Array-Reihenfolge des Payloads:

1. Antworten vorab nach `question_index` indizieren; Guards von heute
   unverändert übernehmen (negativ/out-of-range skip, Duplikat first-wins —
   Semantik von solo.rs:353-366).
2. Pro Frage `evaluate_answer` (wie heute solo.rs:374).
3. Poll-Gate wie im Multiplayer AUSSERHALB von `calculate_points` nachbilden:
   `is_scored_question = !practice && !poll` (Vorbild mod.rs:315-316) — Polls
   geben 0 Punkte und lassen den Streak unangetastet (heutiges Solo-Verhalten
   durch Test solo.rs:948 abgesichert; `calculate_points` kennt nur das
   practice-Gate, scoring.rs:53-55).
4. Punkte via `scoring::calculate_points(correct, base, response_time_ms,
   question.time, streak_before, question, mode)` — keine eigene Formel.
   Ohne Zeitdaten (Phase 1): `mode = Accuracy`, `response_time_ms = 0` — in
   diesem Fall ist `time_to_point` konstant 1000 (scoring.rs:24-25), das
   Ergebnis für den Degenerationsfall (streak_before=0, kein Bonus, kein
   practice) bleibt byte-identisch zu `base*1000` (Belege: Test
   solo.rs:926-938 = 667 vs. scoring.rs:157-165 = 667).
   KLARSTELLUNG (Review-Befund): byte-identisch gilt NUR für diesen
   Degenerationsfall. Sobald Streak (>0) oder `question.bonus` greifen,
   scoren neue Läufe GEWOLLT höher als `base*1000`; sobald
   `question.practice` greift, scoren sie 0 statt `base*1000` — heute kennt
   `compute_solo_score` KEIN practice-Gate (solo.rs:347-379 wertet jede
   Antwort). Beides ist der Kern der Parität, keine Regression — und beides
   ist die Ursache der Leaderboard-Mischung alt/neu (§9).
5. Streak-Fortschreibung nach Multiplayer-Regel: bei scored-Frage
   `streak = if correct { streak_before + 1 } else { 0 }` — auch eine
   fehlende Antwort auf eine scored-Frage bricht den Streak (Parität zu
   mod.rs:353 + 382-389). Der Streak ist damit VOLLSTÄNDIG serverseitig aus
   den Roh-Antworten ableitbar — er braucht keinen Session-State und keinen
   Client-Wert. Scope-Klarstellung (Review-Befund): das gilt LAUF-lokal —
   jeder `score_solo_run`-Aufruf rekonstruiert den Streak ab 0; Solo-Läufe
   sind lauf-atomar, ein Streak transferiert nie zwischen Läufen, Sessions
   oder Tagen. Das ist gewollt (Solo ist ephemer, es gibt keinen
   Spieler-Persistenz-Anker) und spiegelt Multiplayer, wo der Streak
   ebenfalls pro Spiel bei 0 beginnt.
6. Achievements: pro Frage eine `AwardRow` der Länge 1 bauen und
   `compute_achievement_awards` mit einem Solo-Config-Preset aufrufen
   (first_responder `enabled=false`). Zeit-Trigger: im Review GEGEN DEN CODE
   VERIFIZIERT — alle drei steigen bei `response_time_ms=None` sauber aus,
   weil lucky_guess/speed_demon/speedy_gonzales explizite `rt.is_some()`-
   Guards tragen (achievement_awards.rs:114-116, :131, :198;
   `AwardRow.response_time_ms: Option<i64>` achievement_awards.rs:18).
   Das frühere "nicht geprüft" ist damit aufgelöst; WP07 behält nur noch
   einen Regressionstest darauf. `GameCounter` wird im Fold lokal geführt
   (accum.rs-Struct wiederverwendet) — first_correct/participation/
   perfect_game werden damit auswertbar, ebenfalls ohne Session-State.
7. First-Correct-Bonus: entfällt in Solo NICHT über eine Sonderregel, sondern
   strukturell — `apply_first_correct_bonus` wird im Fold nicht aufgerufen,
   weil "Erster im Raum" in einem Ein-Personen-Lauf jede Antwort wäre
   (gleiches Argument wie first_responder). Das ist eine dokumentierte
   Nicht-Übernahme, keine zweite Formel.

`compute_solo_score` (solo.rs:347) wird zum dünnen Adapter: Payload →
`SoloAnswerInput`-Mapping → `score_solo_run(...)` → `outcome.total`. Die
`base*1000`-Zeile (solo.rs:375) und die Formel in check-answer (solo.rs:318)
verschwinden; check-answer ruft für das Live-Feedback dieselbe
`calculate_points` (mit untrusted streak-Hint, §8) auf.

### 6.2 Entscheidungsvorlage: Zeitbonus in Solo (Variante A oder B)

Der Projektinhaber hat den Zeitbonus verlangt. Beide Gutachter bestätigen:
der hier entworfene serverautoritative Weg ist sauber und nicht per Dev-Tools
manipulierbar — aber er ist der teuerste Teil des Vorhabens und trägt einen
Fairness-Zielkonflikt, den Code nicht auflösen kann. Deshalb hier als
explizite Vorlage: Variante A (mit Zeitbonus) und Variante B (ohne), je mit
Kosten und Empfehlung. Der Entscheid soll bewusst fallen, nicht überraschen.

**Annahmen-Check (Review-Befund):** Die Empfehlung unten (B zuerst) ruht auf
der Annahme, dass Solo als asynchrone Einzelarbeit genutzt wird (Hausaufgabe,
eigenes Tempo, Reload-tolerant — der heutige Resume-Pfad solo.ts:157-244 ist
genau dafür gebaut). Diese Annahme ist NICHT aus dem Produkt verifiziert.
Wenn Solo auch kompetitives Echtzeit-Ranking im Klassenzimmer ist oder der
Zeitbonus harte Produktanforderung bleibt, ist Variante A die richtige Wahl —
sie ist vollständig spezifiziert und nachschaltbar.

Gemeinsame Ausgangslage beider Varianten: Serverautoritative Antwortzeit
verlangt, dass mindestens ein Server-Zeitstempel pro Frage zwischen zwei
HTTP-Requests überlebt. Heute existiert dafür nichts:
`handle_get_quiz_solo` liefert alle Fragen auf einmal (solo.rs:173-274), der
Server beobachtet das Pacing nicht, `AppState`/`GameRegistry` halten keine
Solo-Session (rust/server/src/http/mod.rs:42-46, rust/server/src/state/registry.rs:20-34
laut Ist-Analyse), und die `solo_sessions`-Tabelle ist nur ein
Einmal-PIN-Auth-Token (rust/server/src/db/pins.rs:44).

#### Variante A — Zeitbonus bauen (= WP04)

- In-Memory `SoloRunSession` nach dem Vorbild des Game-Containers
  (rust/server/src/state/game.rs:19 laut Ist-Analyse), gehalten in einer
  eigenen Map neben der GameRegistry, TTL-Cleanup nach dem Muster von
  eviction.rs/empty_grace.rs. Felder: `run_token` (server-generiert, opaque),
  `quiz_id`, `opened_at_ms: Vec<Option<i64>>`, `answered_at_ms: Vec<Option<i64>>`.
- Neues Signal "Frage N jetzt sichtbar": `POST /api/quizz/:id/solo-run/open`
  `{runToken, questionIndex}` → Server stempelt `opened_at_ms[N] = now_ms()`
  genau einmal ("first timestamp wins", kein Reissue). `GET .../solo` gibt
  zusätzlich den `runToken` aus.
- `POST /check-answer` (mit runToken) stempelt `answered_at_ms[N]` beim
  Empfang — exakt das Multiplayer-Muster answer.rs:86+108, nur pro Run statt
  pro Raum. `response_time_ms = answered - opened`, geklemmt wie in
  time_to_point (scoring.rs:17-22).
- `POST /solo-score` liest die Zeiten aus der Session; fehlt die Session
  (Server-Neustart, TTL abgelaufen), wird OHNE Zeitbonus gewertet
  (Accuracy-Fallback) statt den Lauf zu verwerfen.

Ehrliche Kostenrechnung Variante A:

1. Neuer Server-Zustand inkl. TTL/Cleanup (neues Modul, Locking, Tests).
2. Protokolländerung: neuer Endpoint + runToken in drei bestehenden
   Requests/Responses; Client-Store muss den open-Call in den Phasenwechsel
   einbauen (solo.ts) — der Solo-Client hat heute nicht einmal einen Timer/
   Countdown (0 Treffer für Timer/question.time in der Spielseite laut
   Ist-Analyse), d.h. auch UI-Arbeit, damit ein Zeitbonus für Spieler
   überhaupt sichtbar/fair ist.
3. Nicht restart-fest (Deploy während eines Laufs verliert die Zeiten;
   Fallback nötig). Restart-feste Variante = DB-Zeile pro Lauf mit Write pro
   Fragenwechsel + Migration; Redis wäre eine neue Abhängigkeit und ist
   ausgeschlossen.
4. Unauflösbarer Resume-Zielkonflikt: Reload-Resume ist heute bewusst tolerant
   (solo.ts:157-244). Mit Zeitstempel gilt entweder "first timestamp wins"
   (legitimer Reload verliert Zeitbonus-Anteil der verstrichenen Zeit) oder
   Reissue (Uhr per Reload beliebig zurücksetzbar = Exploit). Beides ist vom
   Server nicht unterscheidbar; Multiplayer hat das Problem nicht, weil
   deadline_ms ein geteilter Raum-Anker ist (lifecycle/mod.rs:139).

**UX-Warnung zu Variante A (Review-Befund, prominenter als zuvor):** Mit
"first timestamp wins" verliert ein EHRLICHER Spieler bei jedem legitimen
Reload (Seite aktualisieren, Netzwerk-Reconnect, Tab-Wechsel mit Neustart)
die verstrichene Zeit unwiderruflich — Beispiel: Frage geöffnet, 5 Minuten
Pause, Reload, sofort richtig geantwortet → gewertet werden 5 Minuten, im
Speed-Modus also 0 Zeitanteil (scoring.rs:20-22). Das ist kein Bug, sondern
die einzige exploitfreie Semantik. Wer Variante A wählt, akzeptiert diese
Härte für ehrliche Reloads ausdrücklich.

Aufwandsklasse A: 3-4 zusätzliche WPs (Session-Modul, Endpoint+Client-Wiring,
Uhr-/Reload-Tests, Timer-UI), inkl. neuem dauerhaften Betriebsrisiko R5.

**Empfehlung zu A:** nur nach explizitem Owner-Go, als Phase 2 NACH der
Paritäts-Phase — nie im selben Wurf.

#### Variante B — Zeitbonus bewusst auslassen

Solo läuft fest auf `ScoringMode::Accuracy` mit `response_time_ms = 0` — das
ist KEINE Sonderlogik, sondern ein regulärer, existierender Modus des
gemeinsamen Kerns (scoring.rs:24-25); auch Multiplayer-Räume können heute
Accuracy fahren. Basispunkte, Streak-Multiplikator, Bonusfrage ×2,
practice-Gate und Achievements (ohne die drei Zeit-Trigger, die sich per
`rt.is_some()`-Guard selbst deaktivieren, §6.1.6) werden trotzdem
vollständig angeglichen — der gesamte Paritäts-Gewinn außer dem Zeit-Decay.

Kosten Variante B: null zusätzlicher Server-Zustand, null neue Endpoints,
kein Resume-Konflikt. Preis: das Wort "Zeitbonus" aus dem Auftrag ist in
Solo nicht erfüllt, sondern per ADR als bewusster Verzicht dokumentiert
(DoD Punkt 6).

#### Empfehlung

Phase 1 = Variante B bauen (WP03/05/06/07), WP04 als getrennten,
nachschaltbaren Entscheid des Projektinhabers führen. Begründung:
(a) der gesamte Paritäts-Gewinn außer dem Zeit-Decay ist ohne jeden
Session-State erreichbar, weil Streak und Counter deterministisch aus den
Roh-Antworten rekonstruierbar sind; (b) der Resume-Zielkonflikt ist ein
UX-/Fairness-Entscheid, den Code nicht auflösen kann (beide Gutachter
bestätigen das unabhängig); (c) die Architektur lässt den Zeitbonus später
zuschalten, ohne Phase-1-Code anzufassen — `score_solo_run` nimmt
`Option<response_time_ms>` und `mode` von Anfang an als Parameter. Wenn der
Projektinhaber den Zeitbonus trotz Kosten und UX-Warnung will: Variante A
wie oben spezifiziert (In-Memory + "first timestamp wins" +
Accuracy-Fallback bei Session-Verlust), als eigene Phase mit eigener
Fairness-Abnahme.

## 7. Datenfluss Solo und Multiplayer (Ziel)

Multiplayer (unverändert):

```
Socket selectedAnswer → answer.rs:86/108 set_clock_ms → record_answer (mod.rs:278)
  → reveal() (mod.rs:294) → evaluate_answer → calculate_points (mod.rs:360-368)
  → apply_first_correct_bonus (mod.rs:373-376) → Streak-Mutation (mod.rs:382-389)
  → compute_achievement_awards → Broadcast
```

Solo (Ziel, Phase 1):

```
GET /solo (alle Fragen, unverändert)
POST /check-answer  → evaluate_answer → calculate_points(Accuracy, rt=0,
                      streak_hint untrusted) → Live-Anzeige (nie persistiert)
POST /solo-score    → compute_solo_score (dünner Adapter)
                      → engine::score_solo_run: Fold in Fragen-Reihenfolge
                        [Guards → evaluate_answer → Poll-Gate → calculate_points
                         → Streak-Fold → AwardRow → compute_achievement_awards]
                      → Cap → INSERT solo_results → Leaderboard + Achievements
```

Mit WP04 käme zwischen GET und check-answer der open-Stempel-Fluss hinzu
(§6.2); `mode` würde Speed, `response_time_ms` käme aus der SoloRunSession.

## 8. Security-Trust-Boundaries

Grundsatz unverändert: der persistierte Score entsteht ausschließlich aus
serverseitig geladenen Fragen (solo.rs:500-503) plus Roh-Antwort-Selektionen.

SEC-05 überlebt die Umstellung so — alle fünf Guards hängen am Umgang mit den
Rohdaten, nicht an der Formel, und werden 1:1 in den Adapter/Fold übernommen:

1. `SoloScoreSubmitAnswer.correct` bleibt deserialisiert-aber-nie-gelesen
   (solo.rs:125-127); der Fold liest nur question_index + AnswerInput.
2. Fail-closed bei fehlenden/leeren Antworten (heute solo.rs:348-351) bleibt
   als erste Zeile des Adapters.
3. Server-Re-Evaluation jeder Antwort via `evaluate_answer` (heute solo.rs:374)
   bleibt der einzige correct/base-Lieferant.
4. Dedupe first-wins + Index-Guards (solo.rs:353-366) wandern semantisch
   unverändert in den Fold (Regressionstests solo.rs:960-985 bleiben grün).
5. Cap gegen theoretical_max (solo.rs:559) bleibt — die Formel des Max wird
   angepasst (§9), der Mechanismus nicht. Test solo.rs:988-1014 wird auf das
   neue Max nachgezogen.

Neue Grenze: der `streakBefore`-Hint an check-answer (für konsistentes
Live-Feedback) ist per Definition untrusted und DISPLAY-ONLY — er fließt nie
in `/solo-score` ein, weil der finale Streak dort aus den Roh-Antworten
rekonstruiert wird. Ein manipulierter Hint verfälscht also höchstens die
eigene Live-Anzeige, nie Leaderboard/Persistenz. Serverseitig wird er auf
`0..=question_index` geklemmt. Das ist dieselbe Vertrauensklasse wie das
bereits ignorierte `payload.score`.

**Implementier-Invariante (Review-Befund, im Code-Review von WP05 hart zu
prüfen):** Der `streakBefore`-Hint darf AUSSCHLIESSLICH im
check-answer-Handler gelesen werden — im gesamten `/solo-score`-Pfad
(Adapter + `score_solo_run`) existiert keine Lesestelle. Grep-beweisbar
(`streakBefore`/`streak_before`-Hint-Feld hat genau eine Read-Site in
solo.rs), zusätzlich erzwungen durch den WP10-Test "manipulierter Hint
ändert den persistierten Score nicht" (§11.3).

Zusätzlich unverändert: Rate-Limiting pro IP (solo.rs:288, 456-460),
Payload-Größen-Guards (solo.rs:466-543), Deadline-/Attempt-Enforcement
(solo.rs:577-612), Anti-Cheat im Wire-Format (correctIndex forced 0,
solo.rs:80-85).

## 9. Persistenz- und API-Auswirkungen

- DB: Phase 1 braucht KEINE Migration. `solo_results` (Schema laut INSERT
  solo.rs:619-631: id, quiz_id, player_name, score, answered_at, assignment_id)
  bleibt unverändert; Achievements werden in der Response geliefert, nicht
  persistiert. Das frühere "nicht geprüft, ob Multiplayer persistiert" ist im
  Review aufgelöst: Multiplayer PERSISTIERT Awards — als Teil des
  players-JSON-Blobs in `game_results` (`Player.achievements: Option<Vec<String>>`,
  rust/protocol/src/player.rs:37; INSERT rust/server/src/db/results.rs:104-105)
  und indirekt im recap-Blob (`most_achievements`-Superlativ,
  rust/engine/src/state/recap.rs:163). Solo-Nicht-Persistierung ist damit eine
  BEWUSSTE Divergenz: `solo_results` hat keinen JSON-Blob, Persistierung wäre
  eine Schema-Erweiterung (Migration) für ein Feature ohne heutigen Konsumenten
  — YAGNI. Sie wird in WP07 als ADR festgehalten; falls der Projektinhaber
  Persistierung will, ist das ein eigenes Folge-WP (additive Spalte), kein
  Blocker dieses Vorhabens.
- `theoretical_max` — PRÄZISE DEFINITION (Review-Befund, beide Gutachter;
  Widerspruch zwischen den Gutachten hier entschieden, siehe unten):
  heute `non_poll_count * 1000` (solo.rs:545-548, filtert NUR Polls;
  practice-Fragen zählen heute ins Max UND scoren heute, da
  `compute_solo_score` kein practice-Gate kennt). Neu, statisch über ALLE
  `quiz.questions` — unabhängig davon, ob und wie viele Antworten eingereicht
  wurden (das Cap ist eine Eigenschaft des Quiz, nicht des Payloads):

  ```
  Sei S = Folge der scored Fragen (weder Poll noch practice=Some(true);
          Polls: 0, practice: 0 via Gate scoring.rs:53-55) in Quiz-Reihenfolge.
  theoretical_max = Σ über S, k = 0-basierter Index innerhalb S:
      round(1000 × (1.0 + 0.1 × min(k, 5)) × (q.bonus == Some(true) ? 2 : 1))
      (Rundung zuletzt, wie im Kern: Bonus scoring.rs:74 VOR Endrundung :76)
  ```

  Das ist der Score eines fehlerfreien Laufs: die k-te scored Frage wird mit
  `streak_before = k` gewertet (Streak-Fold §6.1.5; Polls/practice lassen den
  Streak unangetastet, mod.rs:315-316 + 382-389), Multiplikator-Cap bei 5
  (scoring.rs:8-9, 68-72), Bonus ×2 nach dem Streak-Faktor (scoring.rs:74).
  Feldquellen `practice`/`bonus`: rust/protocol/src/quizz.rs:137, 140.
  Summierung saturierend wie heute (solo.rs:548, #49-Guard 3).

  Entscheid zum Gutachter-Widerspruch: Gutachten 2 schlug eine flache
  Obergrenze `1000 × 1.5 × (bonus?2:1)` pro scored Frage vor; Gutachten 1
  verlangt den Testvektor "Maximal-Lauf erreicht EXAKT das Max". Beides
  zusammen geht nicht — der Multiplikator erreicht 1.5 erst ab der sechsten
  scored Frage, ein perfekter Lauf bleibt also immer unter der flachen
  Summe. Gewählt: die EXAKTE Formel oben, denn (a) sie macht den
  Exakt-Testvektor möglich (R2-Gate), (b) sie ist das engere Cap
  (Defense-in-depth), (c) sie dupliziert keine Fachlogik, wenn sie als
  `pub fn solo_theoretical_max(quiz) -> i32` NEBEN dem Fold in
  `rust/engine/src/solo_run.rs` liegt und die Konstanten aus scoring.rs:8-9
  nutzt (WP03 liefert sie, WP05 ruft sie statt der Inline-Rechnung
  solo.rs:545-548 auf). Ein zu kleines Max würde legitime Scores kappen
  (R2); WP09-Pflichtvektor: "fehlerfreier Lauf (alle korrekt, Bonusfragen
  enthalten) erreicht EXAKT das Max, wird nicht gekappt."
- API additiv, abwärtskompatibel: `CheckAnswerRequest` + optionales
  `streakBefore` (solo.rs:96-106); `CheckAnswerResponse` nutzt das bestehende
  `achievements`-Feld (solo.rs:116) weiter; `SoloScoreResponse` + optionales
  `achievements`-Feld. Alte Clients ohne `streakBefore` bekommen Live-Punkte
  ohne Streak-Anteil — der finale Score ist davon unabhängig korrekt.
- Wire-Format `SoloQuestion` bleibt ohne bonus/practice-Flags (Anti-Leak);
  der Server kennt sie aus der Registry-Frage. Ob die UI Bonusfragen künftig
  kennzeichnen soll, ist eine offene Produktfrage außerhalb dieses Scopes.
- Leaderboard-Vergleichbarkeit: Alt-Ergebnisse in `solo_results` wurden mit
  `base*1000` berechnet, neue Läufe scoren mit Streak-/Bonus-Multiplikator
  höher — gemischte Leaderboards pro Quiz sind die Folge. Optionen: hinnehmen
  (Empfehlung, kein Schema-Touch) oder Versions-Spalte (Migration). Entscheid
  des Projektinhabers vor WP05-Merge.

## 10. Kompatibilitätsstrategie

- Multiplayer-Pfad: null Änderungen an scoring.rs, mod.rs (reveal),
  achievement_awards.rs-Verhalten. Neue Engine-Teile kommen ausschließlich als
  neues Modul (`solo_run.rs`) + optional-Parameter-freie Wiederverwendung
  dazu. Bestehende Testvektoren (scoring.rs:124-191, Reveal-/Award-Tests)
  müssen byte-identisch grün bleiben — das ist das harte Regressionskriterium.
- Solo-API: nur additive optionale Felder; kein Feld wird entfernt oder
  umgedeutet. `correct` bleibt aus Kompatibilität deserialisierbar
  (solo.rs:125-127).
- Client: alte sessionStorage-Fortschritte (solo.ts:157) bleiben ladbar —
  der Resume-Pfad hängt nicht an neuen Feldern; fehlt `streakBefore`-Wissen,
  degradiert nur die Live-Anzeige.
- Rollout: eine Wave = deploy + voller Browser-Smoke des Solo-Loops (stehende
  Regel; Lobby erreichen ist kein Pass).

## 11. Teststrategie

1. Unit (Engine, neu): `solo_run.rs`-Tests — Fragen-Reihenfolge vs.
   Payload-Reihenfolge, Streak-Fold inkl. Lücken (unbeantwortete scored-Frage
   bricht Streak), Poll lässt Streak unangetastet (Parität zu mod.rs:315-316),
   practice → 0 via calculate_points (scoring.rs:53-55), Bonusfrage ×2,
   Accuracy/rt=0-Degeneration byte-identisch zu `base*1000` für die
   bestehenden Vektoren (667-Fall, solo.rs:926-938 vs. scoring.rs:157-165).
2. Paritätsvektoren (Kernforderung): tabellengetriebene Tests, die dieselben
   Eingaben (correct, base, rt, time, streak, bonus/practice, mode) einmal
   durch die Multiplayer-Call-Site-Semantik und einmal durch den Solo-Fold
   schicken und identische Per-Frage-Punkte verlangen. Multiplayer-Seite nutzt
   die UNVERÄNDERTEN bestehenden Vektoren (scoring.rs:126-129, 142-147,
   157-165, 168-177) als Anker.
3. SEC-05-Regression: alle bestehenden Tests (solo.rs:908, 917, 926, 941, 948,
   960, 967, 977, 988) bleiben bzw. werden nur in Erwartungswerten ans neue
   Max angepasst; NEU: manipulierter `streakBefore`-Hint ändert den
   persistierten Score nicht; Antworten in verwürfelter Array-Reihenfolge
   ergeben denselben Score wie sortiert.
4. Achievements: Solo-Preset-Tests — first_responder feuert nie; Zeit-Trigger
   feuern ohne response_time_ms nie; sharpshooter kommt aus Registry-Schwelle
   (Änderung an achievements.rs:45 muss den Solo-Wert mitbewegen);
   climber/underdog-Selbstausschluss bei Länge-1-Row abgesichert.
5. e2e (stagehand): voller Solo-Loop pro Fragetyp auf 3 Viewports (stehende
   Regel), inkl. Badge-Anzeige aus Server-Response statt Client-Ableitung und
   Reload-Resume mitten im Lauf. Multiplayer-Smoke unverändert mitfahren.
6. Gates: `bash rust/gate.sh` + bestehende answer-flow-Suite vor jedem Merge;
   Flaky-Kandidaten (test_within_rate, snapshot-invite-code) isoliert rerunnen.

## 12. Micro-Work-Packages (WP01-WP12, vorgegebene Nummerierung)

Abhängigkeiten: WP02 → WP03 → {WP05, WP06, WP07} → WP08 → WP11; WP09/WP10
begleitend ab WP03; WP04 = Entscheidungs-Gate, optional vor WP05; WP12 zuletzt.
WP-Größenregel gilt (1 WP ≈ 1 Datei ≈ <150 LOC Diff; Tests eigene WPs).

- **WP01 Flows erfassen** — GEGENSTANDSLOS als eigenes Implementierungspaket:
  die Erfassung liegt mit der verifizierten Ist-Analyse und §§1-5 dieses SDD
  vor. Akzeptanz: dieses Dokument gemerged.
- **WP02 Contract** — Interface einfrieren (Wave-0): Signatur
  `score_solo_run`/`SoloAnswerInput`/`SoloRunOutcome` als Stub in
  `rust/engine/src/solo_run.rs` + additive optionale Felder in
  packages/common/src/types/game/index.ts (streakBefore, achievements in
  SoloScoreResponse). Kein Verhalten. Akzeptanz: cargo check + tsc grün,
  keine VERHALTENSÄNDERUNG (Review-Präzisierung: neue Typen/Stubs im Binary
  sind zulässig und unvermeidlich; das Kriterium ist "alle bestehenden
  Tests byte-identisch grün", nicht "identisches Binary").
- **WP03 MP-Kern nutzbar machen** — für `calculate_points` selbst
  GEGENSTANDSLOS (bereits transport-/session-frei aufrufbar, §4); Restinhalt:
  `solo_run.rs`-Fold implementieren (Guards, Poll-Gate, calculate_points-Aufruf,
  Streak-Fold, GameCounter) + `solo_theoretical_max` (§9). Datei:
  rust/engine/src/solo_run.rs. Akzeptanz: Unit-Tests aus §11.1 grün, keine
  Änderung an scoring.rs/mod.rs. Zum Review-Hinweis "WP03 sei ohne WP05
  nicht testbar": teilweise zurückgewiesen — `score_solo_run` ist eine reine
  Funktion und mit konstruierten Quizz-Fixtures VOLL unit-testbar (genau
  §11.1); was ohne WP05 offen bleibt, ist nur die HTTP-Verdrahtung, und die
  gehört zu WP05/WP09/WP11.
- **WP04 Solo-Zeitdaten serverautoritativ** — ENTSCHEIDUNGS-GATE (§6.2):
  nur nach explizitem Owner-Go. Inhalt: SoloRunSession-Modul
  (rust/server/src/state/solo_run_session.rs), open-Endpoint, runToken in
  solo.rs, Stempel-Logik, TTL. Akzeptanz: "first timestamp wins" per Test
  bewiesen (Reload setzt Uhr nicht zurück), Accuracy-Fallback bei
  Session-Verlust, Multiplayer-Timing unberührt. Ohne Go: dokumentierter
  Verzicht, Solo fest Accuracy/rt=0.
- **WP05 Solo umstellen** — `compute_solo_score` → dünner Adapter auf
  `score_solo_run`; check-answer:318 auf calculate_points (untrusted Hint);
  theoretical_max auf `solo_theoretical_max` umstellen (§9). Datei:
  rust/server/src/http/solo.rs. Akzeptanz: kein `* 1000.0` mehr im
  Scoring-Pfad von solo.rs, SEC-05-Suite grün, Poll-/Cap-Tests grün.
  **MERGE-BLOCKER für WP05 (Review-Konsens beider Gutachter, vor dem Merge
  verbatim nachzuweisen):**
  1. WP09-Paritätsvektoren grün (MP-Anker byte-identisch, §11.2);
  2. Exakt-Max-Vektor grün ("fehlerfreier Lauf erreicht exakt das Max", §9);
  3. Streak-Lücken-Vektor grün ("unbeantwortete scored-Frage bricht Streak",
     Parität zu mod.rs:353+382-389) + Zeit-Trigger-None-Regressionstest;
  4. Owner-Entscheide dokumentiert: Leaderboard-Mischung (§9) UND
     Zeitbonus-Variante (§6.2).
- **WP06 Streak anbinden** — Client: streakBefore-Hint senden, Anzeige auf
  Server-Antwort umstellen, `streak`-Feld nur noch UI-State. Datei:
  packages/web/src/features/game/stores/solo.ts. Akzeptanz: Live-Summe ==
  finaler Server-Score für ehrlichen Client (e2e-Assertion).
- **WP07 Achievements aktivieren** — Solo-Config-Preset (first_responder aus),
  sharpshooter aus Registry statt 95.0-Literal (solo.rs:333), finale Awards
  aus dem Fold in die solo-score-Response; Client-`streakBadges` (solo.ts:37-44)
  löschen, Anzeige speist sich aus Server-Feldern (SoloRewardToast bleibt
  unverändert, ist props-getrieben). Dateien: solo.rs + solo.ts — zwei
  WP-Hälften, ABER (Review-Befund) NICHT parallel an verschiedene Worker:
  die ts-Hälfte konsumiert die Server-Felder der rs-Hälfte; ohne sie zeigt
  der Client nichts an. Dispatch-Regel: rs-Hälfte zuerst mergen (oder beide
  beim selben Worker), ts-Hälfte dagegen bauen. Akzeptanz: grep findet weder
  `95.0` im Handler noch `streakBadges` im Store; Badge-e2e grün.
- **WP08 API/Persistenz/UI** — Response-Erweiterungen verdrahten (achievements
  im Finish-Screen, Leaderboard unverändert), Doku der additiven Felder;
  Entscheid Leaderboard-Mischung (§9) einholen und umsetzen (Empfehlung: keine
  Migration). Akzeptanz: alte Clients (ohne neue Felder) funktionieren
  unverändert gegen den neuen Server.
- **WP09 Paritätstests** — eigene Test-WPs: Engine-Paritätsvektoren (§11.2)
  + angepasste solo.rs-Erwartungswerte. Akzeptanz: MP-Vektoren byte-identisch
  unangetastet, Parität tabellarisch bewiesen.
- **WP10 Security-Tests** — SEC-05-Erweiterungen (§11.3): streakBefore-Manipulation,
  Reihenfolge-Invarianz, Max-Cap neu; falls WP04 gebaut: Reload-/Replay-Uhrtests.
  Akzeptanz: alle neuen Angriffs-Vektoren mit beweisendem Test.
- **WP11 Integration** — Merge-Reihenfolge WP03→05→06→07→08 über
  Integrations-Worktree, kombiniertes Gate (rust/gate.sh + check-locales +
  e2e-Solo-Suite 3 Viewports), Deploy + voller Browser-Smoke des Game-Loops.
  Akzeptanz: Wave-Gate verbatim im Report.
- **WP12 Cleanup** — `(base*1000)`-Reste, tote Kommentare, ggf.
  `scoring::is_correct` entfernen (toter Code, §2 — separater Mini-Diff, da
  außerhalb des Solo-Pfads); Memory-/AGENTS-Notizen nachziehen; die
  Dreifach-Registry (§5) als Folge-Issue loggen, NICHT hier bauen.
  Akzeptanz: Modularisierungs-Audit + Security-Audit am Session-Ende.

## 13. Risiken und Rollback-Punkte

- R1 Formel-Umstellung ändert Solo-Scores sichtbar (Streak/Bonus wirken neu):
  gewollt, aber Leaderboard-Mischung (§9) muss vor WP05-Merge entschieden
  sein. Rollback: WP05 ist ein einzelner Adapter-Commit — Revert stellt
  `base*1000` wieder her, ohne Engine-Modul anzufassen.
- R2 theoretical_max falsch nachgezogen → legitime Scores gekappt. Gegenmaßnahme:
  eigener Testvektor "Maximal-Lauf mit Streak+Bonus erreicht exakt das Max"
  (WP09). Rollback: Cap-Formel isoliert revertierbar.
- R3 Streak-Fold-Semantik weicht von reveal() ab (Lücken/Polls/practice):
  Paritätsvektoren (§11.2) sind das Gate; bei Befund blockt WP11.
- R4 (HERABGESTUFT nach Review): Achievement-Zeit-Trigger bei
  `response_time_ms=None` — im Review gegen den Code verifiziert, alle drei
  tragen `rt.is_some()`-Guards (achievement_awards.rs:114-116, :131, :198,
  §6.1 Punkt 6). Restrisiko nur noch künftige Regression; abgedeckt durch
  den WP07-Regressionstest "Zeit-Trigger feuern ohne response_time_ms nie".
- R5 WP04-Session (falls gebaut) leakt Speicher ohne TTL oder verliert Läufe
  beim Deploy: TTL-Test + Accuracy-Fallback sind Pflichtakzeptanz; Rollback:
  Feature ist endpoint-additiv, Abschalten = Client ruft open nicht mehr.
- R6 e2e-Badge-Erwartungen brechen (Badges kommen jetzt vom Server):
  bestehende Solo-e2e-Suite in WP11 mitziehen; Achievement-Sichtbarkeits-
  Bedingungen beachten.
- Rollback-Anker: nach WP03 (Engine-Modul ungenutzt im Server = jederzeit
  totlegbar), nach WP05 (Adapter-Revert), nach WP07 (Badge-Quellen-Revert
  client- und serverseitig unabhängig).

## 14. Definition of Done

1. `compute_solo_score` enthält keine eigene Punkteformel mehr — nur noch
   Mapping + `score_solo_run`-Aufruf; beweisbar per `grep -n "1000.0"
   rust/server/src/http/solo.rs` = 0 Treffer im Scoring-Pfad (theoretical_max
   nutzt die neue Max-Formel).
2. Jeder Solo-Punkt entsteht über `scoring::calculate_points`; Streak- und
   Award-Entscheidungen kommen ausschließlich aus Engine-Code (solo_run.rs +
   achievement_awards.rs + achievements.rs-Registry).
3. Es existiert genau EIN Solo-Badge-System: `streakBadges` (solo.ts:37-44)
   und das 95.0-Literal (solo.rs:333) sind gelöscht, grep-beweisbar.
4. SEC-05: alle fünf Guards nachweislich erhalten (Testliste §11.3 grün),
   inkl. neuer Untrusted-Input-Tests für streakBefore.
5. Multiplayer unverändert: scoring.rs/mod.rs/achievement_awards.rs ohne
   Verhaltensdiff, bestehende Testvektoren byte-identisch grün
   (`cargo test` im Rust-Workspace, verbatim im Report).
6. Zeitbonus-Entscheid dokumentiert: entweder WP04 mit Akzeptanztests
   umgesetzt oder der Verzicht (Accuracy/rt=0) als ADR festgehalten.
7. Gates verbatim im Abschlussreport: `bash rust/gate.sh`, Locale-Gate,
   e2e-Solo-Suite pro Fragetyp auf 3 Viewports, Deploy + Browser-Smoke des
   vollen Game-Loops.

## Offene Fragen (gesammelt, Stand nach Review)

Nur noch ZWEI Fragen brauchen einen Owner-Entscheid VOR dem WP05-Merge
(= Merge-Blocker 4 in WP05):

1. Zeitbonus: Variante A (WP04 bauen) oder Variante B (Verzicht per ADR)?
   Entscheidungsvorlage mit Kosten, UX-Warnung und Annahmen-Check: §6.2.
   Empfehlung: Phase 1 = B, A als nachgelagerte eigene Phase.
2. Leaderboard-Mischung alt/neu in `solo_results` hinnehmen oder
   Versions-Spalte? (§9, Empfehlung: hinnehmen, keine Migration.)

Im Review GESCHLOSSEN:

3. Achievements aus Solo-Läufen persistieren? — Geklärt: Multiplayer
   persistiert Awards im players-Blob von `game_results` (player.rs:37,
   db/results.rs:104-105); Solo-Nicht-Persistierung ist dokumentierte,
   bewusste Divergenz (YAGNI, kein Konsument), ADR in WP07, optionales
   Folge-WP falls gewünscht (§9).
4. Zeit-Trigger bei `response_time_ms=None` — Geklärt: explizite
   `rt.is_some()`-Guards verifiziert (achievement_awards.rs:114-116, :131,
   :198); nur noch Regressionstest in WP07 (§6.1 Punkt 6, R4).

Unverändert außerhalb des Scopes:

5. UI-Kennzeichnung von Bonusfragen im Solo-Wire-Format — Produktfrage,
   außerhalb dieses Scopes.
6. Dreifache Registry-Duplikation (common/engine/http) — Folge-Issue,
   nicht dieser Scope.

## Was die Prüfung geändert hat

Zwei unabhängige Gutachten (Gutachten 1: CLEAN mit Merge-Gates; Gutachten 2:
FINDINGS(8)) wurden eingearbeitet. Jeder Befund wurde gegen den Code
nachgeprüft, bevor er übernommen wurde.

Übernommen (mit eigener Code-Verifikation):

1. `theoretical_max` präzise definiert (beide Gutachter) — §9: exakte
   Formel über die scored-Folge statt Prosa; zusätzlich eigener Befund
   dokumentiert, dass heute practice-Fragen sowohl ins Max zählen als auch
   scoren (solo.rs:545-548 filtert nur Polls; compute_solo_score hat kein
   practice-Gate) — das neue practice-Gate ist damit eine ausgewiesene,
   gewollte Score-Änderung.
2. Streak-Scope klargestellt (Gutachten 2) — §6.1 Punkt 5: lauf-atomar,
   kein Streak-Transfer zwischen Läufen/Sessions.
3. Zeit-Trigger-Frage geschlossen (beide) — §6.1 Punkt 6, R4 herabgestuft:
   `rt.is_some()`-Guards selbst verifiziert (achievement_awards.rs:114-116,
   :131, :198); "nicht geprüft" entfernt, Regressionstest bleibt.
4. climber/underdog-Ausschluss auf die EXPLIZITEN Guards umgeschrieben
   (Gutachten 2) — §4: has_prior-Gate (:151-158) und `> i32::MIN`-Guard
   (:184) statt bloßer Zahlengrenzen-Argumentation.
5. WP02-Akzeptanz präzisiert (Gutachten 2) — "null Laufzeitänderung" →
   "keine Verhaltensänderung, bestehende Tests byte-identisch grün".
6. Zeitbonus als Entscheidungsvorlage umgebaut (Auftrag + beide Gutachter) —
   §6.2: Variante A (mit Zeitbonus, WP04, Kostenrechnung, prominente
   UX-Warnung zu "first timestamp wins" bei ehrlichen Reloads) vs.
   Variante B (Verzicht, Accuracy/rt=0), plus Annahmen-Check, dass die
   B-Empfehlung auf der unverifizierten Annahme "Solo = asynchron" ruht.
7. Award-Persistierung entschieden statt offen gelassen (Gutachten 2,
   Befund 7) — §9: selbst nachgeprüft, Multiplayer persistiert (players-Blob
   game_results); Solo-Divergenz als bewusst dokumentiert, ADR in WP07.
8. "byte-identisch"-Formulierung geschärft (Gutachten 1) — §6.1 Punkt 4:
   gilt nur für den Degenerationsfall; Streak/Bonus scoren gewollt höher,
   practice neu 0 — Ursache der Leaderboard-Mischung.
9. WP05-Merge-Blocker explizit (Gutachten 1: "3 Paritäts-Gates +
   Leaderboard-Entscheid kritisch") — §12 WP05: vier verbatim
   nachzuweisende Blocker.
10. WP07-Kopplung als Dispatch-Regel (Gutachten 1) — §12 WP07: rs-Hälfte
    vor ts-Hälfte, nie parallel an verschiedene Worker.
11. streakBefore-Implementier-Invariante (Gutachten 1) — §8: genau eine
    Read-Site, grep-beweisbar, WP10-Test.

Entschieden bei Widerspruch:

- Flache `×1.5`-Max-Formel (Gutachten 2) vs. Testvektor "Maximal-Lauf
  erreicht exakt das Max" (Gutachten 1): beides zusammen ist unerfüllbar
  (Multiplikator erreicht 1.5 erst ab der 6. scored Frage). Entschieden für
  die exakte Formel + Exakt-Vektor; Begründung in §9.

Zurückgewiesen (mit Begründung):

- "WP03 ist ohne WP05 nicht testbar" (Gutachten 1, Hinweis 1) — teilweise
  zurückgewiesen: `score_solo_run` ist eine reine Engine-Funktion und mit
  Quizz-Fixtures vollständig unit-testbar (§11.1); offen bleibt nur die
  HTTP-Verdrahtung, die per Design zu WP05/WP09/WP11 gehört (§12 WP03).
- "Award-Persistierung braucht einen ADR VOR WP07 als offener
  Owner-Entscheid" (Gutachten 2) — in der scharfen Form zurückgewiesen:
  die Faktenlage wurde stattdessen jetzt geklärt (Multiplayer persistiert,
  Solo-Schema kann nicht ohne Migration) und die Nicht-Persistierung als
  YAGNI-Default festgelegt; der ADR in WP07 dokumentiert das nur noch,
  blockiert aber keinen Dispatch mehr. Ein Owner-Veto bleibt jederzeit als
  additives Folge-WP möglich (§9).
