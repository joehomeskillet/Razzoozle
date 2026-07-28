# SDD: Solo-Scoring-Parität mit dem Multiplayer-Kern

Datum: 2026-07-28 · Branch: docs/scoring-parity · Status: Entwurf zur Freigabe

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
  climber und underdog strukturell selbst aus (rank_before=1 bzw.
  `max_before_strictly_below` bleibt `i32::MIN`, achievement_awards.rs:40-65);
  `first_responder` NICHT — muss per Config deaktiviert werden.

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
   Ergebnis für den heutigen Degenerationsfall (kein Streak/Bonus) bleibt
   byte-identisch zu `base*1000` (Belege: Test solo.rs:926-938 = 667 vs.
   scoring.rs:157-165 = 667).
5. Streak-Fortschreibung nach Multiplayer-Regel: bei scored-Frage
   `streak = if correct { streak_before + 1 } else { 0 }` — auch eine
   fehlende Antwort auf eine scored-Frage bricht den Streak (Parität zu
   mod.rs:353 + 382-389). Der Streak ist damit VOLLSTÄNDIG serverseitig aus
   den Roh-Antworten ableitbar — er braucht keinen Session-State und keinen
   Client-Wert.
6. Achievements: pro Frage eine `AwardRow` der Länge 1 bauen und
   `compute_achievement_awards` mit einem Solo-Config-Preset aufrufen
   (first_responder `enabled=false`; Zeit-Trigger speed_demon/speedy_gonzales/
   lucky_guess bleiben mangels `response_time_ms=None` automatisch aus —
   nicht geprüft, ob die drei Trigger bei `None` sauber aussteigen; das ist
   Akzeptanzkriterium von WP07). `GameCounter` wird im Fold lokal geführt
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

### 6.2 Die entscheidende Frage: Zeitbonus in Solo

Serverautoritative Antwortzeit verlangt, dass mindestens ein Server-Zeitstempel
pro Frage zwischen zwei HTTP-Requests überlebt. Heute existiert dafür nichts:
`handle_get_quiz_solo` liefert alle Fragen auf einmal (solo.rs:173-274), der
Server beobachtet das Pacing nicht, `AppState`/`GameRegistry` halten keine
Solo-Session (rust/server/src/http/mod.rs:42-46, rust/server/src/state/registry.rs:20-34
laut Ist-Analyse), und die `solo_sessions`-Tabelle ist nur ein
Einmal-PIN-Auth-Token (rust/server/src/db/pins.rs:44).

Konkreter Entwurf (falls gebaut, = WP04):

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

Ehrliche Kostenrechnung:

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

Alternative: Zeitbonus in Solo bewusst auslassen. Solo läuft fest auf
`ScoringMode::Accuracy` mit `response_time_ms = 0` — das ist KEINE Sonderlogik,
sondern ein regulärer, existierender Modus des gemeinsamen Kerns
(scoring.rs:24-25). Basispunkte, Streak-Multiplikator, Bonusfrage ×2,
practice-Gate und Achievements (ohne die drei Zeit-Trigger) werden trotzdem
vollständig angeglichen.

**Empfehlung:** Phase 1 ohne Zeitbonus bauen (WP03/05/06/07), WP04 als
getrennten, nachschaltbaren Entscheid des Projektinhabers führen. Begründung:
(a) der gesamte Paritäts-Gewinn außer dem Zeit-Decay ist ohne jeden
Session-State erreichbar, weil Streak und Counter deterministisch aus den
Roh-Antworten rekonstruierbar sind; (b) der Resume-Zielkonflikt ist ein
UX-/Fairness-Entscheid, den Code nicht auflösen kann; (c) die Architektur
lässt den Zeitbonus später zuschalten, ohne Phase-1-Code anzufassen —
`score_solo_run` nimmt `Option<response_time_ms>` und `mode` von Anfang an als
Parameter. Wenn der Projektinhaber den Zeitbonus trotz Kosten will: Variante
In-Memory + "first timestamp wins" + Accuracy-Fallback bei Session-Verlust,
wie oben spezifiziert.

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

Zusätzlich unverändert: Rate-Limiting pro IP (solo.rs:288, 456-460),
Payload-Größen-Guards (solo.rs:466-543), Deadline-/Attempt-Enforcement
(solo.rs:577-612), Anti-Cheat im Wire-Format (correctIndex forced 0,
solo.rs:80-85).

## 9. Persistenz- und API-Auswirkungen

- DB: Phase 1 braucht KEINE Migration. `solo_results` (Schema laut INSERT
  solo.rs:619-631: id, quiz_id, player_name, score, answered_at, assignment_id)
  bleibt unverändert; Achievements werden in der Response geliefert, nicht
  persistiert (Persistierung wäre eine eigene Entscheidung — nicht geprüft, ob
  Multiplayer Awards persistiert).
- `theoretical_max`: heute `non_poll_count * 1000` (solo.rs:546-549). Mit
  Streak-Multiplikator (bis ×1.5, scoring.rs:68-72) und Bonusfragen (×2,
  scoring.rs:74) muss das Max exakt nachgezogen werden: Summe über scored
  Fragen von `1000 * 1.5 * (bonus ? 2 : 1)`, practice-Fragen zählen 0.
  Ein zu kleines Max würde legitime Scores kappen.
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
  null Laufzeitänderung.
- **WP03 MP-Kern nutzbar machen** — für `calculate_points` selbst
  GEGENSTANDSLOS (bereits transport-/session-frei aufrufbar, §4); Restinhalt:
  `solo_run.rs`-Fold implementieren (Guards, Poll-Gate, calculate_points-Aufruf,
  Streak-Fold, GameCounter). Datei: rust/engine/src/solo_run.rs. Akzeptanz:
  Unit-Tests aus §11.1 grün, keine Änderung an scoring.rs/mod.rs.
- **WP04 Solo-Zeitdaten serverautoritativ** — ENTSCHEIDUNGS-GATE (§6.2):
  nur nach explizitem Owner-Go. Inhalt: SoloRunSession-Modul
  (rust/server/src/state/solo_run_session.rs), open-Endpoint, runToken in
  solo.rs, Stempel-Logik, TTL. Akzeptanz: "first timestamp wins" per Test
  bewiesen (Reload setzt Uhr nicht zurück), Accuracy-Fallback bei
  Session-Verlust, Multiplayer-Timing unberührt. Ohne Go: dokumentierter
  Verzicht, Solo fest Accuracy/rt=0.
- **WP05 Solo umstellen** — `compute_solo_score` → dünner Adapter auf
  `score_solo_run`; check-answer:318 auf calculate_points (untrusted Hint);
  theoretical_max-Formel nachziehen (§9). Datei: rust/server/src/http/solo.rs.
  Akzeptanz: kein `* 1000.0` mehr im Scoring-Pfad von solo.rs, SEC-05-Suite
  grün, Poll-/Cap-Tests grün.
- **WP06 Streak anbinden** — Client: streakBefore-Hint senden, Anzeige auf
  Server-Antwort umstellen, `streak`-Feld nur noch UI-State. Datei:
  packages/web/src/features/game/stores/solo.ts. Akzeptanz: Live-Summe ==
  finaler Server-Score für ehrlichen Client (e2e-Assertion).
- **WP07 Achievements aktivieren** — Solo-Config-Preset (first_responder aus),
  sharpshooter aus Registry statt 95.0-Literal (solo.rs:333), finale Awards
  aus dem Fold in die solo-score-Response; Client-`streakBadges` (solo.ts:37-44)
  löschen, Anzeige speist sich aus Server-Feldern (SoloRewardToast bleibt
  unverändert, ist props-getrieben). Dateien: solo.rs + solo.ts (zwei WP-Hälften,
  getrennt dispatchbar). Akzeptanz: grep findet weder `95.0` im Handler noch
  `streakBadges` im Store; Badge-e2e grün.
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
- R4 Achievement-Zeit-Trigger verhalten sich bei `response_time_ms=None`
  unerwartet (nicht geprüft, §6.1 Punkt 6): Akzeptanztest in WP07; notfalls
  Preset-disable der drei Trigger.
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

## Offene Fragen (gesammelt)

1. Zeitbonus: WP04 bauen oder Verzicht per ADR? (Empfehlung §6.2: Phase 1
   ohne, WP04 als nachgelagerter Entscheid.)
2. Leaderboard-Mischung alt/neu in `solo_results` hinnehmen oder
   Versions-Spalte? (§9, Empfehlung: hinnehmen.)
3. Sollen Achievements aus Solo-Läufen persistiert werden? (Heute nirgends;
   nicht geprüft, ob Multiplayer Awards persistiert.)
4. Verhalten der drei Zeit-Trigger bei `response_time_ms=None` — nicht
   geprüft; Akzeptanzkriterium WP07.
5. UI-Kennzeichnung von Bonusfragen im Solo-Wire-Format — Produktfrage,
   außerhalb dieses Scopes.
6. Dreifache Registry-Duplikation (common/engine/http) — Folge-Issue,
   nicht dieser Scope.
