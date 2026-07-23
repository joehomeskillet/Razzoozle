# Game-UI/UX-Konsistenz — Implementierungsmatrix (WP-0a, #304)

**Ziel:** Presenter (`/party/manager/$gameId`, `/display/play`, `/satellite/$gameId`)
und Player (`/party/$gameId`, Solo `/quizz/$id/solo`, Assignment
`/quizz/$id/assignment.$assignmentId`) sollen als EIN Produkt wirken — gemeinsame
Hierarchie **Question Heading → Media → HUD → Interaction → Action**,
audience-spezifische Skalierung (`GameAudience = "player" | "presenter" | "display"`),
einheitliche Antwortkomponenten, ein gemeinsames Result/Reveal-Muster.

Alle Zeilen sind gegen den realen Code (Branch `feat/game-ui-consistency`,
Basis-Commit `31ddc16`) verifiziert. Behauptungen mit falscher SDD-Annahme sind
explizit im Abschnitt **Code-Abweichungen von der SDD** vermerkt.

## Geplante Shared Components (Referenz für Spalte „Shared Component")

| Name | Rolle |
|---|---|
| **GameStage** | Äußerer Layout-Shell pro Screen (ersetzt die 24× wiederholte `section.mx-auto.max-w-7xl.flex-1.flex-col…`). Nimmt `audience` entgegen und skaliert. |
| **QuestionStage** | Block „Question Heading → Media" (Markdown-Überschrift + Media-Slot mit reservierter Höhe). |
| **GameHud** | Timer + „N/M beantwortet"-Zähler (heute inline in Answers/SoloAnswers). |
| **InteractionZone** | Container für die Antwort-Leaf-Komponente (choice/slider/text/…). |
| **GameActionBar** | Footer/Toolbar: Submit / Weiter / Skip / „gesendet"-Bestätigung. |
| **AnswerRevealPanel** | Gemeinsames Result/Reveal-Muster (Verdict-Icon, richtige Antwort, Punkte, RewardStack). |

## Matrix (24 Zeilen)

| Screenshot-Zustand | Status | Route | Aktuelle Komponente | Shared Component | Problem | Änderung | Tests |
|---|---|---|---|---|---|---|---|
| Lobby | `SHOW_ROOM` | `/party/manager/$gameId`, `/display/play`, `/satellite/$gameId` | `states/Room.tsx` | GameStage | Bespoke Layout ohne geteilten Shell; `LOBBY_SLOTS` fixe %-Positionen (Room.tsx:23–28); Trenner `bg-gray-300` (Room.tsx:146) und Cards `bg-white` sind NICHT tokenisiert; App-Titel `text-4xl` folgt keiner geteilten Heading-Skala | Room in GameStage einhängen; `bg-gray-300` → `bg-[var(--border-hairline)]`; Heading an QuestionStage-Skala angleichen. Kein Rebranding der Lobby-Choreografie | visual (design-validator), e2e-Flow (Lobby erreichen + PIN sichtbar) |
| Start-Countdown | `SHOW_START` | manager/display/satellite | `states/Start.tsx` | GameStage | Nutzt CSS-Klasse `.anim-show` + `bg-primary` (Start.tsx:43,50) und hart-berechnetes `rotate(${45*(time-cooldown)}deg)` statt `useReveal`/presets; keine geteilte Heading-Hierarchie | In GameStage einhängen; Countdown-Zahl über `reveal.pop`/`snap` statt `.anim-show`. Motion-Logik minimal belassen | visual, e2e-Flow |
| Frage-Vorschau (Prepared) | `SHOW_PREPARED` | manager/display/satellite | `states/Prepared.tsx` | QuestionStage | `mb-20` am Heading (Prepared.tsx:110) drückt das Layout künstlich nach unten; `TILE_TYPES` hardcoded (Prepared.tsx:16); Vorschau-Kacheln duplizieren den Answer-Tile-Look statt `ChoiceGrid`/`answerColor` konsistent zu teilen; reserviert keinen Media-Slot | `mb-20` → Token-Spacing der QuestionStage; Vorschau als leere `InteractionZone`-Preview. Kein neuer Preview-Typ | visual, unit/vitest |
| Single Choice | `SELECT_ANSWER` | player + manager/display + Solo/Assignment | `states/Answers.tsx` → `answers/ChoiceGrid.tsx` (Solo: `states/SoloAnswers.tsx` → gleiches `ChoiceGrid`) | QuestionStage + GameHud + InteractionZone | Heading-Drift: `Answers` `text-2xl md:text-4xl` (Answers.tsx:567) vs `Question` `text-3xl md:text-4xl` (Question.tsx:71); `ChoiceGrid` Grid `grid-cols-2 gap-1` (ChoiceGrid.tsx:55) sehr enge Lücke; HUD (Timer + Zähler) inline in Answers.tsx:609–625, nicht geteilt; Media via `QuestionMedia` (max-h-60/sm:max-h-100) ohne reservierten Platz | Heading/Media/HUD in QuestionStage+GameHud extrahieren; Heading-Skala vereinheitlichen; `gap-1` → Token. `ChoiceGrid` bleibt Leaf | unit/vitest, e2e-Flow (Solo je Fragetyp, 3 Viewports), visual |
| Multiple Select | `SELECT_ANSWER` (`type="multiple-select"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/MultiSelectGrid.tsx` | InteractionZone | Eigener `selectHint` + eigener `SubmitButton` (MultiSelectGrid.tsx:126); identisches `grid-cols-2 gap-1`; Submit-Copy `quizz:multipleSelect.submitButton` weicht von anderen Submit-Labels ab | In InteractionZone + GameActionBar konsolidieren (ein Submit-Muster); Grid-Gap-Token teilen | unit/vitest, e2e-Flow, i18n:check |
| True/False | `SELECT_ANSWER` (`type="boolean"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/ChoiceGrid.tsx` (Fallback-Zweig, KEINE dedizierte Komponente) | InteractionZone | Boolean läuft durch denselben `ChoiceGrid` mit 2 Optionen → 2 breite Kacheln im 2-Spalten-Grid (asymmetrisch, kein T/F-spezifisches Layout); keine visuelle Differenzierung Wahr/Falsch | Boolean-Layout in `ChoiceGrid` (oder InteractionZone-Variante) 2-spaltig-gleichbreit halten; minimal, kein neues Komponentenfile | unit/vitest, e2e-Flow (Solo boolean) |
| Poll | `SELECT_ANSWER` (`type="poll"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/ChoiceGrid.tsx` | InteractionZone | Poll läuft durch `ChoiceGrid`; im Reveal wird `correct` unterdrückt (Responses.tsx:277 `type==="poll" ? undefined`) — korrekt, aber keine „kein richtig/falsch"-Kennzeichnung im Antwort-Screen | Poll-Semantik über InteractionZone-Flag statt Sonderpfade; kein Result-Verdict für Poll (Result.tsx:177 `!poll` bereits vorhanden) | unit/vitest, e2e-Flow |
| Slider | `SELECT_ANSWER` (`type="slider"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/SliderInput.tsx` | InteractionZone + GameActionBar | Submit-Copy `game:slider.submit` („Bestätigen") ≠ `game:submitAnswer` („Absenden") der anderen Typen (SliderInput.tsx:79) → inkonsistente Aktions-Copy; Wert `text-5xl` eigene Skala | Submit-Copy über GameActionBar vereinheitlichen (ein Absende-Label); `min`/`max`/`unit` bleiben | unit/vitest, e2e-Flow, i18n:check |
| Textantwort | `SELECT_ANSWER` (`type="type-answer"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/TypeAnswerInput.tsx` | InteractionZone + GameActionBar | Weitgehend konsistent (`type="text"`, `maxLength=200`, `game:submitAnswer`); nur der Container `max-w-xl` vs Grid-Typen `max-w-7xl` — Breiten-Drift zwischen Text- und Kachel-Antworten | Breite über InteractionZone normalisieren; sonst unverändert | unit/vitest, e2e-Flow |
| **Mathematik** | `SELECT_ANSWER` (`type="mathematik"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/MathematikInput.tsx` | InteractionZone + GameActionBar | **BUG:** `type="number"` (MathematikInput.tsx:27) → native Number-Spinner. `inputMode="decimal"` und `step="0.01"` sind BEREITS vorhanden (Zeile 28–29) | `type="number"` → `type="text"` (Spinner weg); `inputMode="decimal"` behalten; Spinner-Reste per CSS unterdrücken (`[appearance:textfield]`); großes Zahlenfeld. Kein Parsing-Umbau (Komma→Punkt bleibt) | unit/vitest (Mathematik-Input), e2e-Flow (Solo mathematik), visual |
| Satzbau | `SELECT_ANSWER` (`type="sentence-builder"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/SentenceBuilderBoard.tsx` | InteractionZone + GameActionBar | Eigener Submit-Button (SentenceBuilderBoard.tsx:131, nicht `SubmitButton`); Submit erst wenn Bank leer (`isComplete`); englische `defaultValue`-Fallbacks vorhanden, aber Keys existieren (siehe Abweichungen) | Submit über GameActionBar-Muster; Chip-Interaktion (Tap-to-place) unverändert | unit/vitest, e2e-Flow (Solo sentence-builder) |
| **Wortarten** | `SELECT_ANSWER` (`type="wortarten"`) | player + manager/display + Solo | `states/Answers.tsx` → `answers/WortartenPicker.tsx` | InteractionZone (Player: Bottom Sheet · Presenter: Popover) | **BUG:** Der POS-Picker rendert inline im normalen Fluss direkt unter dem getippten Token (WortartenPicker.tsx:139–162) innerhalb `flex-wrap items-start` (Zeile 100) → Öffnen schiebt die nachfolgenden Tokens der Zeile um/überlagert sie; nur `z-10` (Zeile 143), kein Portal, keine Collision-Logik | Player: Picker als **Bottom Sheet** (fix am unteren Rand, Portal). Presenter/Display: **collision-safe Popover** (Radix Popover + Portal + `collisionPadding`). Token-Reflow entfällt. Server-Contract (tokens/posSet/disabledTokens) unverändert | unit/vitest (`buildWortartenAnswer.test.ts`), e2e-Flow (Solo wortarten), visual |
| Antwort gesendet | `SELECT_ANSWER` (submitted) | player + manager/display (MP); Solo per-Input-Feedback | `states/Answers.tsx` „answer-submitted"-Pille (Answers.tsx:592–607) | GameActionBar / AnswerRevealPanel | Bestätigungs-Pille nutzt für ALLE Typen die Slider-Copy `game:slider.submitted` („Abgeschickt") — Namespace-Leak; nur im MP-Pfad vorhanden, Solo hat keine solche Pille (nutzt `feedback`-Ring am Input) | Neutrale, geteilte „Antwort gesperrt"-Bestätigung in GameActionBar mit eigenem i18n-Key (nicht `slider.*`); MP+Solo gleich | unit/vitest, i18n:check, e2e-Flow |
| Correct | `SHOW_RESULT` (`correct=true`) | player (`audience:"player"`), manager/display | `states/Result.tsx` (correct-Zweig, Result.tsx:189) | AnswerRevealPanel | `Result` hat schon einen `audience`-Prop, aber nur `"player" \| "manager"` (Result.tsx:33), KEIN `"display"`; die Manager-Route übergibt gar keinen `audience` (nur `/party/$gameId` setzt `"player"`, siehe $gameId.tsx:196); `showPoints`/`showRoundRecap` hängen an `audience !== "player"` | `GameAudience` 3-wertig einführen und aus allen 3 Routen durch GameWrapper bis in `Result` fädeln; correct/wrong/points/RewardStack in AnswerRevealPanel bündeln | unit/vitest, e2e-Flow (correct je Fragetyp), visual |
| Wrong | `SHOW_RESULT` (`correct=false`) | player, manager/display | `states/Result.tsx` (wrong-Zweig, Result.tsx:253) | AnswerRevealPanel | Richtige-Antwort-Anzeige nutzt `game:slider.correctAnswer` (Result.tsx:255) für ALLE Typen → Slider-Namespace-Leak (Text ist zwar korrekt „Richtige Antwort"); `correctChunks`-Header (Satzbau) nutzt fehlenden Key `game:sentenceBuilder.correctSentence` → englisches „Correct answer" (Result.tsx:231) | Neutralen Key `game:result.correctAnswer` (o. ä.) statt `slider.*`; fehlenden `correctSentence`-Key in allen 6 Locales anlegen. Reveal in AnswerRevealPanel | unit/vitest, i18n:check, e2e-Flow, visual |
| Responses | `SHOW_RESPONSES` | `/party/manager/$gameId`, `/display/play`, `/satellite/$gameId` (manager-only) | `states/Responses.tsx` | AnswerRevealPanel + QuestionStage | Mathematik/Wortarten-Header nutzt `game:correctAnswer` = **„Richtig!"** (Responses.tsx:217) — semantischer Mismatch (Label „Correct!" statt „Richtige Antwort"); Satzbau-Header nutzt fehlenden `correctSentence`-Key → englisch (Responses.tsx:155); Balken-Höhe `h-40 lg:h-[40vh]` eigene Skala | Header-Copy auf einen neutralen Richtig-Antwort-Key vereinheitlichen (nicht `game:correctAnswer`=„Richtig!"); Balken + Reveal an AnswerRevealPanel/QuestionStage angleichen | unit/vitest, i18n:check, visual |
| Round Recap | `SHOW_ROUND_RECAP` | manager/display/satellite (manager-only, Player bekommt es nie) | `states/RoundRecap.tsx` → `components/RecapSequence.tsx` | GameStage | Dünne Shell um `RecapSequence`; full-bleed ohne geteilten GameStage/Heading; eigenständige Karten-Choreografie | In GameStage einhängen (nur Shell-Ebene); `RecapSequence` unverändert (wird auch vom Podium genutzt) | visual, e2e-Flow (manager recap) |
| Leaderboard | `SHOW_LEADERBOARD` | manager/display/satellite (manager-only) | `states/Leaderboard.tsx` | GameStage | Kein geteilter GameStage (`section.max-w-4xl`, Leaderboard.tsx:367); Heading `text-5xl` (Zeile 368) weicht von anderen Screens ab; Zeilen-Hintergrund `--color-accent` fest | In GameStage einhängen, Heading-Skala teilen; Rank-Animation/Chips unverändert | visual, e2e-Flow |
| Podium | `FINISHED` (manager-Map) | manager/display/satellite | `states/Podium.tsx` | GameStage | `.spotlight` (index.css:190–194) mit **`z-index: 100`** wird nur im Podium montiert (Podium.tsx:365–367); z-100 liegt weit über der Game-Chrome (Wrapper nutzt z-10/z-50) — `pointer-events-none`, aber überlagert Stacking | Spotlight in den GameStage-Stacking-Kontext einbetten / z-Index senken; Podium-Reveal sonst unverändert | visual, e2e-Flow (manager finish) |
| Player Finished | `FINISHED` (player-Map) | `/party/$gameId` | `states/PlayerFinished.tsx` | GameStage + AnswerRevealPanel | Medaillen-Farben hart als Tailwind `text-yellow-600 / text-slate-400 / text-orange-600` (PlayerFinished.tsx:64–68, 99–103) statt `--tier-*`-Tokens; Top-3-Logik dupliziert die Podium-Rangfarben; `overflow-y-auto`-Eigenlayout | Medaillen-Farben tokenisieren; Screen in GameStage; Recap-Karten bleiben | unit/vitest, e2e-Flow (Solo→finished), visual |
| Wait | `WAIT` | player (Lobby + Zwischenfrage); `game:waitingForPlayers` = Lobby | `states/Wait.tsx` | GameStage | Zwei WAIT-Nutzungen (Lobby vs. Zwischenfrage) über `text`-String diskriminiert (Wait.tsx:62); Loader + Heading bespoke, kein geteilter Stage | In GameStage; Avatar-/Team-Picker-Gating unverändert | e2e-Flow (Lobby), visual |
| Avatar Picker | `WAIT` (Lobby, `showPicker`) | player | `components/join/AvatarPicker.tsx` (in Wait montiert) | GameStage-Panel | Größter Token-Drift: durchgehend NICHT-tokenisierte Grautöne — `bg-gray-200`, `bg-white/40`, `text-gray-800`, `text-gray-600`, `border-gray-300`, `border-gray-200` (AvatarPicker.tsx:153,157,158,177,192…) verletzen design.md (Client-Fläche → `--surface`/`--border-hairline`/`--game-fg`) | Grautöne auf Tokens umstellen; Layout/Logik (DiceBear + Upload) unverändert | visual (design-validator), unit/vitest |
| Paused | `PAUSED` | player (im shared Map → auch manager/display) | `states/Paused.tsx` | GameStage | Kein geteilter Stage; ansonsten sauber tokenisiert (`--game-fg`); Lucide-`Pause`-Icon | In GameStage einhängen; sonst unverändert | e2e-Flow (pause/resume), visual |
| Ended | (kein Server-Status — Client-seitig via `endedMessage`) | `/party/$gameId` (direkt gerendert, NICHT in `GAME_STATE_COMPONENTS`) | `states/Ended.tsx` | GameStage | Wird bei `EVENTS.GAME.RESET("errors:game.managerDisconnected")` außerhalb der Status-Map gerendert ($gameId.tsx:182–188) mit `statusName={undefined}`; englische `defaultValue`s vorhanden, aber die `game:ended.byHost.*`-Keys tragen deutsche Defaults | In GameStage; Rendering-Pfad (statusloser Sonderfall) dokumentieren, nicht umbauen | e2e-Flow (host verlässt Spiel), i18n:check |

## Code-Abweichungen von der SDD

1. **`constants.ts`, nicht `constants.tsx`.** Das Status→Komponente-Mapping liegt in
   `packages/web/src/features/game/utils/constants.ts` (`.ts`), obwohl es
   React-Komponenten importiert. Es gibt ZWEI Maps: `GAME_STATE_COMPONENTS` (Player)
   und `GAME_STATE_COMPONENTS_MANAGER` (spreadet die Player-Map + `SHOW_ROOM`/
   `SHOW_RESPONSES`/`SHOW_ROUND_RECAP`/`SHOW_LEADERBOARD` und überschreibt `FINISHED`
   mit `Podium`). `FINISHED` → `PlayerFinished` (Player) vs. `Podium` (Manager).

2. **`SoloAnswers.tsx` existiert als eigenständige Komponente** (`states/SoloAnswers.tsx`,
   ~432 Zeilen), NICHT als Variante von `Answers.tsx`. Solo/Assignment umgehen
   `GameWrapper` komplett und nutzen `components/solo/SoloShell.tsx` (eigener Footer +
   Solo/Aufgabe-Badge) plus `SoloAnswers` (REST statt Socket) und
   `solo/SoloFinishedScreen.tsx` statt `PlayerFinished`. Die Antwort-Leaf-Komponenten
   (`ChoiceGrid`, `MultiSelectGrid`, `SliderInput`, `TypeAnswerInput`, `MathematikInput`,
   `WortartenPicker`, `SentenceBuilderBoard`) sind hingegen bereits über
   `testIdPrefix=""` (MP) / `"solo-"` (Solo) geteilt.

3. **MathematikInput hat `inputMode="decimal"` und `step="0.01"` BEREITS** (Zeile 28–29).
   Die SDD-Annahme „inputmode hinzufügen" ist teilweise erledigt — der reale Fix ist nur
   `type="number"` → `type="text"` (Spinner entfernen) + CSS-Spinner-Unterdrückung.

4. **„Englische `defaultValue`-Fallbacks" sind überwiegend TOT.** Die meisten
   `t(key, { defaultValue: "…" })`-Fallbacks (z. B. `sentenceBuilder.submit`/`wordBank`/
   `tapHint`, `avatar.done`, `teams.*`, `ended.byHost.*`) haben existierende deutsche Keys
   und lösen NIE zum englischen Default auf. Der EINE echt leckende String ist
   **`game:sentenceBuilder.correctSentence` — dieser Key fehlt in ALLEN 6 Locales**
   (verifiziert: `grep -rn correctSentence packages/web/src/locales/` = 0 Treffer). Dadurch
   rendern `Result.tsx:231` und `Responses.tsx:155` das literale englische **„Correct answer"**
   in der deutschen UI. Das ist der eigentliche i18n-Bug (nicht die anderen Defaults).

5. **`game:correctAnswer` = „Richtig!"** (de/game.json:292), NICHT „Richtige Antwort".
   `Responses.tsx:217` nutzt diesen Key als Header über der richtigen Mathematik-/Wortarten-
   Antwort → semantischer Mismatch (Label „Correct!" statt „Richtige Antwort:"). Zur
   Unterscheidung: `game:slider.correctAnswer` (de/game.json:39) und
   `game:mathematik.correctAnswer` (:44) sind beide „Richtige Antwort".

6. **„z-index 100 Spotlight" ist KORREKT** — aber nur im Podium. `.spotlight` (index.css:190)
   hat `z-index: 100` und wird ausschließlich in `Podium.tsx:366` montiert (Radial-Gradient
   hinter dem Podium, `pointer-events-none`). Kein anderes Game-Element nutzt `z-[100]`.

7. **Media-Höhe ~28vh/42vh gilt nur für `Question.tsx`.** Der Platzhalter `h-[28vh]
   lg:h-[42vh]` (Question.tsx:104) und das Bild `max-h-[28vh] lg:max-h-[42vh]` (:97)
   existieren nur im Vorschau-Screen. Die Antwort-/Reveal-Screens (`Answers`, `SoloAnswers`,
   `Responses`) nutzen die geteilte `components/QuestionMedia.tsx` mit `max-h-60 sm:max-h-100`
   und reservieren KEINEN Platz. → Der Media-Block ist zwischen Vorschau und Antwortphase
   uneinheitlich (unterschiedliche Höhen-Tokens + Platz-Reservierung nur in Question).

8. **`gap-1` in `ChoiceGrid` bestätigt** (ChoiceGrid.tsx:55, `grid-cols-2 gap-1`); ebenso
   `MultiSelectGrid` (:65). **`mb-20` in `Prepared` bestätigt** (Prepared.tsx:110).

9. **`Result` hat bereits einen `audience`-Prop — aber 2-wertig** (`"player" | "manager"`,
   Result.tsx:33) und OHNE `"display"`. Nur `/party/$gameId` übergibt ihn (`"player"`,
   $gameId.tsx:196); die Manager-/Display-/Satellite-Routen übergeben ihn NIE (Manager erhält
   `audience === undefined` → `showPoints`/`showRoundRecap` = true). Das ist der Keim des
   `GameAudience`-Contracts, aber unvollständig.

10. **`STATUS.SHOW_ROOM` ist typseitig auf `"SHOW_ROOM" | "PAUSED"` verbreitert**
    (status.ts:16) — ein Back-Compat-Typ-Hack, damit `MANAGER_SKIP_BTN` & Co. weiter
    typechecken. Runtime-Wert bleibt `"SHOW_ROOM"`. `PAUSED` ist zusätzlich als eigener
    Wert vorhanden (:30).

## Audience-Modell-Befund

Heute gibt es **kein `GameAudience`** — die Unterscheidung läuft über zwei Booleans auf
`GameWrapper` (`GameWrapper.tsx:34–40`):

```
type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?; onBack?
  manager?: boolean       // ← einzige Player/Presenter-Diskriminante
  controls?: boolean      // ← default true; false = passiver Beamer
}
```

Es wird **weder die Route noch ein Param noch ein `isManager`-Store-Flag** ausgewertet —
allein die von der Route übergebenen Props entscheiden:

| Route | GameWrapper-Aufruf | Effekt |
|---|---|---|
| `/party/$gameId` (Player) | `<GameWrapper statusName>` (kein `manager`) | Player-Footer (Name + Punkte, GameWrapper.tsx:328–335); `GAME_STATE_COMPONENTS`; übergibt `audience:"player"` NUR an `Result` ($gameId.tsx:196) |
| `/party/manager/$gameId` (Presenter/Host) | `<GameWrapper manager onNext onBack>` | Host-Control-Bar (Auto/Skip/Exit/QR/Fullscreen); `GAME_STATE_COMPONENTS_MANAGER` via `useManagerGameSession`; übergibt KEINEN `audience` an Kinder |
| `/display/play` (Beamer) | `<GameWrapper manager controls={false}>` | Presentation-Chrome ohne interaktive Controls, kein onNext/onBack; `.display-stage`-Wrapper |
| `/satellite/$gameId` (Kiosk) | `<GameWrapper manager controls={false}>` | identisch zu display |
| `/quizz/$id/solo`, `…/assignment.$assignmentId` | **kein GameWrapper** — `SoloShell` | Eigener Shell + Footer + Solo/Aufgabe-Badge; `SoloAnswers` (REST) |

**Kernbefund:** „Presenter" (manager) und „Display" (beamer) kollabieren derzeit in
denselben `manager`-Boolean; sie werden NUR durch `controls` getrennt. Solo/Assignment
liegen ganz außerhalb (`SoloShell`). Der einzige bereits audience-typisierte Nahtpunkt ist
`Result.audience` (2-wertig).

**Grundlage für den `GameAudience`-Contract:** `GameAudience = "player" | "presenter" | "display"`
sollte das Paar `manager` + `controls` ersetzen, aus den 3 Presenter-/Player-Routen (+ ein
`"solo"`-Zweig für `SoloShell`, falls gewünscht) über `GameWrapper` in die State-Komponenten
gefädelt werden und `Result.audience` von 2 auf 3 Werte erweitern — statt der heutigen
`audience !== "player"`-Heuristiken (`showPoints`, `showRoundRecap`).
