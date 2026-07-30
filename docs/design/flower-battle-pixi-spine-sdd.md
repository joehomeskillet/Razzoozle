# SDD: Razzoozle «Blüten-Battle» mit PixiJS 8 und Spine

**Status:** Umsetzungsentwurf (User-Direktive 2026-07-30, verbatim)
**Stand:** 30.07.2026
**Zielsystem:** Razzoozle Web-Client, Presenter und bestehendes Multiplayer-Backend
**Rendering:** PixiJS 8
**Skelettanimation:** offizielles `@esotericsoftware/spine-pixi-v8` Runtime-Paket
**Visuelle Richtung:** hochwertiges, freundliches 2D-Cartoon-Spiel mit Tiefe, weichen Formen und lebendigen Figuren; inspiriert von modernen Casual-Webgames wie *Mergic Pets* und *Adventure Time Elemental*, jedoch ohne Übernahme geschützter Figuren, Assets, Layouts oder Markenmerkmale.

---

## 1. Auftrag

Implementiere einen neuen Razzoozle-Spielmodus «Blüten-Battle». Teams beantworten Fragen und lassen dadurch ihre eigene Pflanze wachsen. Richtige Antworten, Antwortgeschwindigkeit, Serien und Power-ups verändern Wachstum, Animationen und temporäre Effekte.

Die grosse Presenter-Szene wird mit PixiJS und Spine dargestellt. Fragen, Antworten, Navigation, Dialoge und administrative UI bleiben in der bestehenden Web-Komponentenarchitektur. Das bestehende Multiplayer-, Badge-, Achievement-, Punkte-, Strike- und Zeitbonus-System muss wiederverwendet werden.

### Kernprinzipien

1. Keine parallele zweite Spiellogik im PixiJS-Client.
2. Der Server bleibt autoritativ.
3. PixiJS stellt dar und animiert fachliche Ereignisse.
4. Spine wird ausschliesslich für komplexe, organische Animationen eingesetzt.
5. Wiederverwendbare kleine Module statt grosser Szenen- oder Controller-Dateien.
6. Keine Kopie bestehender Spiele oder fremder Assets.
7. Mobile Clients müssen auch ohne komplexe PixiJS-Szene vollständig spielbar bleiben.

---

## 2. Technische Entscheidung

### 2.1 Verbindlicher Stack

| Bereich | Technologie |
|---|---|
| 2D-Rendering | PixiJS 8 |
| Skelettanimation | `@esotericsoftware/spine-pixi-v8` |
| Animationssequenzen ausserhalb Spine | bestehende Tween-Lösung oder GSAP nach Lizenzprüfung |
| Partikel | PixiJS `ParticleContainer` beziehungsweise projektinterner Effekt-Wrapper |
| Assetverwaltung | PixiJS Assets, Manifeste und Bundles; optional PixiJS AssetPack |
| Netzwerk | bestehender Razzoozle-WebSocket-Layer |
| Zustandsmodell | bestehender serverautoritärer Game State |
| UI | bestehender Frontend-Stack; kein PixiJS-UI-Rewrite |
| Tests | bestehende Testwerkzeuge plus gezielte Render-, Contract- und E2E-Tests |

### 2.2 Kompatibilität

- `spine-pixi-v8` ist für PixiJS 8 vorgesehen und benötigt gemäss offizieller Runtime-Dokumentation mindestens PixiJS 8.16.
- Spine-Editor-Export und Spine-Runtime müssen dieselbe `major.minor`-Version verwenden.
- Für die stabile 4.2-Linie ist das Runtime-Paket als `@esotericsoftware/spine-pixi-v8@~4.2.0` zu pinnen.
- Keine Abhängigkeit auf das ältere, inoffizielle `pixi-spine` einführen.
- Lockfile verbindlich committen; automatische Major-/Minor-Upgrades der Spine-Runtime verhindern.

Beispiel, nur nach Prüfung des vorhandenen Package-Managers:

```bash
npm install pixi.js@^8.16.0 @esotericsoftware/spine-pixi-v8@~4.2.0
```

Die tatsächlich verwendete PixiJS-Version soll innerhalb der kompatiblen v8-Linie auf eine getestete Version gepinnt werden.

### 2.3 Lizenz-Gate

Vor Merge in einen produktiven Build muss die Spine-Lizenzierung dokumentiert und bestätigt sein.

- Die Spine-Runtimes stehen nicht unter MIT.
- Die Anwendung beziehungsweise der veröffentlichende Rechtsträger benötigt die gemäss Spine-Lizenz erforderlichen Rechte.
- Die Runtime-Lizenz und Copyright-Hinweise müssen entsprechend den Lizenzbedingungen in der Distribution enthalten sein.
- Das Open-Games-Repository von PixiJS ist MIT-lizenziert; enthaltene Figma-Assets dürfen laut Projekt-README nur als Referenz betrachtet und nicht übernommen werden.

Erzeuge dafür:

```text
THIRD_PARTY_NOTICES.md
licenses/spine-runtimes-license.txt
licenses/pixijs-license.txt
```

---

## 3. Visuelle Zielrichtung

### 3.1 Stil

Der Modus soll wie ein hochwertiges, lebendiges Cartoon-Gartenspiel wirken:

- runde, klar erkennbare Silhouetten
- weiche Texturen und dezente Farbverläufe
- Vorder-, Mittel- und Hintergrundebenen mit Parallax-Effekt
- handgezeichnet wirkende Pflanzen und Umweltobjekte
- freundliche Gesichter und überzeichnete Reaktionen
- sanfte Idle-Bewegungen, niemals eine vollständig statische Szene
- kurze, gut lesbare Treffer- und Belohnungseffekte
- starke Teamfarben, aber keine aggressiven Vollflächen
- weiche Schatten direkt innerhalb der PixiJS-Szene
- keine realistische Botanik
- keine Pixel-Art
- kein 3D-Look
- keine visuelle Kopie von *Mergic Pets*, *Adventure Time* oder anderen Marken

### 3.2 Art Bible

Vor Produktion der finalen Assets ist eine kleine Art Bible anzulegen:

```text
art-bible/
├── visual-principles.md
├── palette.md
├── shape-language.md
├── line-and-shading.md
├── effects-language.md
├── team-colors.md
├── reference-board.md
└── prohibited-copying.md
```

`prohibited-copying.md` muss festhalten:

- keine bekannten Figuren, Logos oder UI-Formen nachzeichnen
- keine extrahierten Screenshots oder Texturen verwenden
- keine identischen Landschaftskompositionen übernehmen
- nur allgemeine Gestaltungsprinzipien als Inspiration nutzen

---

## 4. Fachliches Spielmodell

### 4.1 Grundablauf

1. Lobby zeigt Teams und zugehörige Beete.
2. Runde startet.
3. Spieler beantworten die normale Razzoozle-Frage.
4. Server wertet Antwort, Geschwindigkeit, Strike und Zeitbonus aus.
5. Server berechnet fachliche Wirkung auf das Blüten-Battle.
6. Server publiziert ein semantisches Game Event.
7. Presenter legt das Event in die Animationswarteschlange.
8. Die betroffene Pflanze spielt Reaktion und Wachstumsänderung ab.
9. Nach der Animation gleicht sich die Darstellung erneut mit dem autoritativen Snapshot ab.

### 4.2 Zustandsmodell

```typescript
export type GrowthStage =
  | 'seed'
  | 'sprout'
  | 'young'
  | 'budding'
  | 'blooming'
  | 'full_bloom';

export interface FlowerTeamState {
  teamId: string;
  teamColorToken: string;
  score: number;
  growth: number;          // 0..1000, serverautoritativ
  stage: GrowthStage;
  streak: number;
  activeEffects: ActiveGardenEffect[];
  lastServerRevision: number;
}

export interface ActiveGardenEffect {
  effectId: string;
  type: GardenEffectType;
  sourceTeamId?: string;
  startedAt: number;
  endsAt: number;
  strength: number;
}
```

`growth` wird intern fein granular gespeichert. Die sichtbare Spine-Animation kann daraus diskrete Stufen und proportionale Übergänge ableiten.

### 4.3 Ereignistypen

```typescript
export type GardenGameEvent =
  | AnswerResolvedEvent
  | GrowthChangedEvent
  | GrowthStageChangedEvent
  | StreakChangedEvent
  | PowerUpAppliedEvent
  | PowerUpExpiredEvent
  | TeamOvertakenEvent
  | RoundStartedEvent
  | RoundEndedEvent
  | StateReconciledEvent;
```

Beispiel:

```json
{
  "type": "growth_changed",
  "eventId": "evt_01J...",
  "matchId": "match_123",
  "serverRevision": 418,
  "serverTime": 1785441000123,
  "teamId": "team_orange",
  "delta": 42,
  "growthBefore": 318,
  "growthAfter": 360,
  "reason": "correct_answer_time_bonus"
}
```

### 4.4 Keine Animationsbefehle aus dem Backend

Nicht erlaubt:

```json
{
  "animation": "play_flower_jump_3",
  "duration": 1400,
  "particles": 200
}
```

Erlaubt:

```json
{
  "type": "growth_changed",
  "reason": "correct_answer_time_bonus",
  "delta": 42
}
```

Die visuelle Interpretation bleibt im Client. So bleiben Backend und Game-Regeln unabhängig von Assets, Spine-Animationsnamen und Rendertechnologie.

---

## 5. Client-Architektur

### 5.1 Modulgrenzen

```text
src/features/garden-battle/
├── application/
│   ├── GardenBattlePresenter.ts
│   ├── GardenEventQueue.ts
│   ├── GardenStateReconciler.ts
│   └── GardenQualityController.ts
├── domain/
│   ├── garden-events.ts
│   ├── garden-state.ts
│   ├── garden-effect-types.ts
│   └── growth-stage.ts
├── rendering/
│   ├── GardenPixiApplication.ts
│   ├── GardenScene.ts
│   ├── GardenCamera.ts
│   ├── GardenViewport.ts
│   ├── layers/
│   │   ├── BackgroundLayer.ts
│   │   ├── MidgroundLayer.ts
│   │   ├── PlotLayer.ts
│   │   ├── WeatherLayer.ts
│   │   ├── EffectsLayer.ts
│   │   └── ForegroundLayer.ts
│   ├── entities/
│   │   ├── TeamFlowerView.ts
│   │   ├── GardenPlotView.ts
│   │   └── TeamMarkerView.ts
│   ├── spine/
│   │   ├── SpineAssetRegistry.ts
│   │   ├── SpineFlowerFactory.ts
│   │   ├── SpineAnimationController.ts
│   │   ├── SpineMixProfile.ts
│   │   └── SpineEventAdapter.ts
│   ├── effects/
│   │   ├── GardenEffectRenderer.ts
│   │   ├── RainEffect.ts
│   │   ├── SunBurstEffect.ts
│   │   ├── SparkleEffect.ts
│   │   └── GrowthBurstEffect.ts
│   └── performance/
│       ├── RenderBudget.ts
│       ├── TextureBudget.ts
│       └── VisibilityPauser.ts
├── assets/
│   ├── garden-asset-manifest.ts
│   └── garden-bundles.ts
├── integration/
│   ├── garden-websocket-adapter.ts
│   ├── garden-game-state-adapter.ts
│   └── garden-audio-adapter.ts
├── ui/
│   ├── GardenBattleCanvasHost.tsx
│   ├── GardenStatusOverlay.tsx
│   └── GardenFallbackView.tsx
└── tests/
```

Dateien sollen in der Regel unter 250 Zeilen bleiben. Grössere Dateien benötigen eine begründete Ausnahme.

### 5.2 Scene Graph

```text
GardenScene
├── BackgroundLayer
│   ├── sky
│   ├── distantHills
│   └── clouds
├── MidgroundLayer
│   ├── trees
│   ├── fence
│   └── decorativeProps
├── PlotLayer
│   ├── TeamPlot[0]
│   │   ├── soil
│   │   ├── flowerShadow
│   │   ├── SpineFlower
│   │   └── localEffectsAnchor
│   └── TeamPlot[n]
├── WeatherLayer
├── EffectsLayer
└── ForegroundLayer
    ├── leaves
    └── vignetteProps
```

HTML-Overlay ausserhalb des Canvas:

```text
GardenBattleCanvasHost
├── canvas
├── round status
├── reduced-motion indicator
├── reconnect state
└── accessible event announcements
```

---

## 6. Spine-Spezifikation

### 6.1 Rig pro Pflanzentyp

Jede Hauptpflanze erhält ein gemeinsames semantisches Rig. Die konkrete Knochenanzahl darf variieren, die benannten Steuerpunkte müssen jedoch stabil bleiben.

```text
root
├── ground_anchor
├── stem_root
│   ├── stem_mid
│   │   ├── stem_top
│   │   │   └── flower_head
│   │   │       ├── face_root
│   │   │       │   ├── eye_l
│   │   │       │   ├── eye_r
│   │   │       │   └── mouth
│   │   │       ├── petals
│   │   │       └── fx_head_anchor
│   │   ├── leaf_l
│   │   └── leaf_r
├── fx_ground_anchor
└── ui_anchor
```

### 6.2 Skins

Empfohlene Skins:

```text
base
team-violet
team-blue
team-orange
team-green
status-dry
status-boosted
status-poisoned
```

Teamfarben sollen möglichst über Skin-/Attachment-Varianten oder kontrolliertes Tinting umgesetzt werden. Kein unkontrolliertes globales Tinting, das Schattierung und Gesicht verfälscht.

### 6.3 Pflichtanimationen

| Animation | Loop | Zweck |
|---|---:|---|
| `idle_seed` | Ja | Samen-/Bodenbewegung |
| `idle_sprout` | Ja | Keimling |
| `idle_young` | Ja | junge Pflanze |
| `idle_budding` | Ja | Knospe |
| `idle_blooming` | Ja | offene Blüte |
| `idle_full_bloom` | Ja | finale Blüte |
| `grow_small` | Nein | kleiner Wachstumsschub |
| `grow_medium` | Nein | mittlerer Wachstumsschub |
| `grow_stage_up` | Nein | sichtbarer Stufenwechsel |
| `celebrate_small` | Nein | normale richtige Antwort |
| `celebrate_big` | Nein | Serien-/Zeitbonus |
| `hit_light` | Nein | leichter negativer Effekt |
| `hit_heavy` | Nein | starker negativer Effekt |
| `wilt_enter` | Nein | Schwächungszustand beginnt |
| `wilt_idle` | Ja | geschwächter Zustand |
| `wilt_exit` | Nein | Erholung |
| `shield_enter` | Nein | Schutz beginnt |
| `shield_idle` | Ja | Schutz aktiv |
| `shield_break` | Nein | Schutz verbraucht |
| `win` | Nein/Loop-Ende | Rundensieg |
| `lose` | Nein/Loop-Ende | Rundenende ohne Sieg |

### 6.4 Tracks

| Track | Verwendung |
|---:|---|
| 0 | Basishaltung, Wachstum und Hauptreaktionen |
| 1 | Gesicht, Blinzeln und kleine Emotes |
| 2 | additive Statusreaktionen, soweit sinnvoll |

Keine zufällige Track-Nutzung in einzelnen Komponenten. Alle Animationen laufen über `SpineAnimationController`.

### 6.5 Animation Mixing

Zentrale Mixing-Konfiguration:

```typescript
export const FLOWER_MIXES = {
  default: 0.18,
  idleToReaction: 0.08,
  reactionToIdle: 0.16,
  stageTransition: 0.24,
  statusEnter: 0.12,
  statusExit: 0.18,
} as const;
```

Die finalen Werte werden über visuelle Tests abgestimmt, nicht in einzelnen Views hardcodiert.

### 6.6 Spine Events

Spine-Events dürfen nur visuelle oder akustische Marker auslösen:

```text
foot_puff
leaf_rustle
petal_pop
sparkle_peak
impact_peak
stage_reveal
```

Spine-Events dürfen niemals Score, Wachstum, Strike, Achievement oder andere fachliche Zustände verändern.

---

## 7. Animationsorchestrierung

### 7.1 Event Queue

Netzwerkereignisse können schneller eintreffen als Animationen abgespielt werden. Implementiere eine priorisierte, begrenzte Queue.

Prioritäten:

1. Reconnect und State-Reconciliation
2. Rundenende und Siegeranimation
3. Stage-Up
4. starke Power-up-Reaktion
5. normale Wachstumsschübe
6. kosmetische Emotes

Regeln:

- kosmetische Events dürfen zusammengefasst oder verworfen werden
- mehrere kleine Wachstumsänderungen dürfen zu einem mittleren Schub aggregiert werden
- fachlicher Endzustand darf nie verloren gehen
- maximale Queue-Dauer: 3 Sekunden im Normalbetrieb
- bei Überschreitung Fast-Forward und Snapshot-Abgleich

### 7.2 Beispielsequenz: richtige Antwort

```text
Server event empfangen
→ lokalen Zielzustand aktualisieren
→ Teambeet leicht hervorheben
→ Spine `celebrate_small`
→ Wachstumspartikel am `fx_ground_anchor`
→ bei Schwellenübertritt `grow_stage_up`
→ neue Idle-Animation aktivieren
→ Darstellung mit serverRevision markieren
```

### 7.3 Beispielsequenz: saurer Regen

```text
Power-up angewendet
→ Wolke über Zielbeet bewegen
→ Regenpartikel starten
→ Spine `hit_heavy`
→ gegebenenfalls `wilt_enter`
→ Status-Icon im HTML-Overlay aktualisieren
→ nach Ende des Effekts `wilt_exit`
```

Keine permanenten Vollbildfilter. Effekte müssen zielgerichtet und innerhalb von 1 bis 2 Sekunden verständlich sein.

---

## 8. Asset-Pipeline

### 8.1 Bundles

```text
boot
shared-ui
garden-background
garden-common
garden-flower-violet
garden-flower-blue
garden-flower-orange
garden-flower-green
garden-effects-low
garden-effects-high
garden-audio
```

Ladestrategie:

1. `boot` sofort laden.
2. `garden-background` und `garden-common` beim Betreten der Lobby laden.
3. Team-Blumen nach bekannter Teambelegung laden.
4. High-End-Effekte nur bei passendem Qualitätsprofil im Hintergrund laden.
5. Nicht mehr benötigte match-spezifische Assets nach dem Spiel freigeben.

### 8.2 Spine-Export

Bevorzugt:

```text
flower.skel
flower.atlas
flower.webp oder flower.png
```

Vorgaben:

- Binäre `.skel`-Daten für Produktion bevorzugen.
- JSON nur für Debug- und Entwicklungszwecke verwenden.
- Atlasgrösse pro Pflanze möglichst auf maximal 2048 × 2048 begrenzen.
- Transparente Ränder minimieren.
- Meshes nur verwenden, wenn sie sichtbaren Nutzen bringen.
- Gewichte und Vertex-Anzahl klein halten.
- Teamvarianten möglichst in einem gemeinsamen Skeleton und Atlas bündeln, sofern dies Speicher und Wartbarkeit verbessert.
- Exportversion im Dateinamen oder Manifest dokumentieren.

### 8.3 Texturformate

- WebP oder PNG als breit kompatible Basis.
- KTX2 nur als zusätzliche optimierte Variante nach Browser- und Geräteprüfung.
- Kein zwingender KTX2-Pfad ohne funktionierenden Fallback.
- Device-Pixel-Ratio berücksichtigen, aber keine unnötigen 4K-Texturen für kleine Figuren laden.

---

## 9. Responsive Darstellung

### 9.1 Presenter

Design-Basis: 16:9, Safe Area berücksichtigen.

- Garten bleibt vollständig sichtbar.
- Teambeete dynamisch nach Teamanzahl anordnen.
- 2 Teams: gross und symmetrisch.
- 3 Teams: Dreieckskomposition.
- 4 Teams: gleichmässige Viererkomposition.
- Mehr Teams nur nach expliziter fachlicher Freigabe; ansonsten Clustering oder alternative Ansicht.
- HTML-Overlay darf keine relevanten Pflanzen verdecken.

### 9.2 Spieler-Client

Auf mobilen Spielergeräten:

- Hauptinteraktion bleibt HTML.
- Optional nur eine kleine eigene Team-Pflanze rendern.
- Keine vollständige Garten-Szene als Pflicht.
- Bei schwacher GPU oder Data-Saver-Modus statische beziehungsweise Sprite-basierte Darstellung nutzen.

---

## 10. Qualität und Performance

### 10.1 Qualitätsprofile

| Profil | Ziel | Effekte |
|---|---|---|
| `high` | Presenter, Desktop, gute GPU | volle Spine-, Wetter- und Partikeleffekte |
| `medium` | normale Notebooks/Tablets | reduzierte Partikel, reduzierte Hintergrundbewegung |
| `low` | schwache Geräte, Mobile | vereinfachte Effekte, weniger Spine-Instanzen |
| `static` | Fallback | vorgerenderte Wachstumsstufen ohne Spine-Runtime-Ausführung |

### 10.2 Zielwerte

- 60 FPS Ziel auf normalem Presenter-Gerät.
- 30 FPS Mindestziel auf unterstützten schwachen Geräten.
- Keine dauerhaften Frame-Spitzen über 33 ms im `medium`-Profil.
- Initiales Garden-Bundle komprimiert möglichst unter 3 MB.
- Team-Blumen und zusätzliche Effekte lazy laden.
- Keine neuen Texture-Leaks nach mehreren Runden.
- Pause bei verborgenem Tab über Page Visibility API.

### 10.3 Renderbudget

Richtwerte, keine starren Architekturgrenzen:

```text
aktive Spine-Hauptfiguren: Teamanzahl
zusätzliche Spine-Effektfiguren: maximal 2 gleichzeitig
sichtbare Partikel high: ca. 400
sichtbare Partikel medium: ca. 150
sichtbare Partikel low: ca. 40
permanente Vollbildfilter: 0
```

### 10.4 Degradation

Bei wiederholter Unterschreitung der Ziel-FPS:

1. Hintergrundparallax reduzieren.
2. Partikelmenge reduzieren.
3. Wettereffekte vereinfachen.
4. additive Spine-Animationstracks deaktivieren.
5. auf `low` wechseln.
6. bei Renderfehler auf `static` wechseln.

Der Match darf dadurch niemals abbrechen.

---

## 11. Barrierefreiheit und Bedienbarkeit

- `prefers-reduced-motion` respektieren.
- Bei reduzierter Bewegung keine starken Kamera-, Shake- oder Blitz-Effekte.
- Relevante Ereignisse zusätzlich als Text im DOM bereitstellen.
- Teamstatus niemals ausschliesslich über Farbe kommunizieren.
- Effekte mit ausreichendem Kontrast, aber ohne schnelle Vollbildblitze.
- Canvas mit verständlicher Accessible-Description versehen.
- Der Spielmodus muss auch mit deaktiviertem Canvas fachlich verständlich bleiben.

---

## 12. Audio

Audio ist optional und darf die Umsetzung nicht blockieren.

- kurze Wachstum-, Treffer- und Blüten-Sounds
- kein permanentes lautes Soundbett
- vorhandene globale Lautstärke- und Mute-Einstellungen wiederverwenden
- Audioereignisse über Adapter entkoppeln
- Spine-Events dürfen Audio triggern, aber nur über den zentralen Audio-Adapter

---

## 13. Testing

### 13.1 Unit Tests

- Growth-Stage-Mapping
- Event-Aggregation
- Queue-Priorisierung
- Animation-Namensauflösung
- Quality-Degradation
- Snapshot-Reconciliation
- Asset-Bundle-Auswahl

### 13.2 Contract Tests

- Backend-Events entsprechen dem gemeinsamen Schema.
- unbekannte Eventtypen führen nicht zum Absturz.
- ältere kompatible Eventversionen werden verarbeitet.
- serverRevision ist monoton beziehungsweise korrekt reconciliert.

### 13.3 Render- und Integrationstests

- alle Teamfarben
- jede Wachstumsstufe
- jede Pflichtanimation
- Animation Mixing ohne sichtbare harte Sprünge
- Reconnect während einer Animation
- schnelles Eintreffen mehrerer Antworten
- Rundenende bei gefüllter Queue
- Resize zwischen 16:9, 4:3 und Ultrawide
- Reduced-Motion-Modus
- Canvas-/WebGL-Fehler und statischer Fallback

### 13.4 Visuelle Regression

Referenzbilder für:

```text
2 teams / seed
2 teams / full bloom
4 teams / mixed stages
acid rain
sun boost
shield active
round winner
reduced motion
static fallback
```

Keine pixelgenaue Prüfung dynamischer Partikel. Stabile Kernbereiche maskieren und mit toleranten Schwellen prüfen.

---

## 14. Observability

Erfasse mindestens:

```text
garden_renderer_init_ms
garden_asset_bundle_load_ms
garden_average_fps
garden_frame_drop_count
garden_quality_profile
garden_reconciliation_count
garden_event_queue_peak
garden_static_fallback_count
garden_spine_load_error_count
```

Keine personenbezogenen oder antwortbezogenen Inhalte in Rendertelemetrie aufnehmen.

---

## 15. Micro-Work-Packages

Jedes Work Package muss einzeln reviewbar, testbar und rückrollbar sein. Keine Umsetzung als ein grosser Branch.

### WP-01: Architektur- und Lizenz-Gate

**Ziel:** Voraussetzungen bestätigen.

- vorhandenen Frontend-Stack und Package-Manager prüfen
- PixiJS-Version und Runtime-Kompatibilität dokumentieren
- Spine-Lizenzentscheidung dokumentieren
- ADR für hybride HTML/PixiJS-Architektur anlegen
- keine produktive Runtime integrieren, solange Lizenz-Gate offen ist

**Akzeptanz:** ADR und Lizenznotiz sind reviewt; keine offene Versionsunklarheit.

### WP-02: Minimaler PixiJS-Canvas-Host

**Ziel:** PixiJS isoliert in bestehender Seite starten und sauber abbauen.

- Application-Lifecycle
- ResizeObserver
- Page Visibility
- Destroy/cleanup
- Fehlergrenze und statischer Fallback

**Akzeptanz:** 20-faches Mount/Unmount ohne Listener-, Canvas- oder Texture-Leak.

### WP-03: Asset-Manifeste und Bundle-Loader

**Ziel:** reproduzierbare Asset-Pipeline.

- Bundles definieren
- Ladefortschritt
- Lazy Loading
- Fehlerbehandlung
- Asset-Unload nach Match

**Akzeptanz:** Bundle-Ausfall führt zu Fallback, nicht zu Match-Abbruch.

### WP-04: Spine-Proof-of-Concept

**Ziel:** eine technisch neutrale Testpflanze laden.

- offizielles `spine-pixi-v8`
- Skeleton + Atlas + Textur
- Idle, Reaction und Stage-Up
- zentraler AnimationController
- Version-Mismatch mit verständlicher Fehlermeldung

**Akzeptanz:** keine direkten `state.setAnimation`-Aufrufe ausserhalb des Controllers.

### WP-05: Garden Scene und Layer

**Ziel:** modulare Szene ohne Fachlogik.

- Layer-Struktur
- responsive Kamera
- zwei bis vier Teambeete
- Parallax
- Quality Profiles

**Akzeptanz:** Szene ist mit Dummy-State vollständig testbar.

### WP-06: Domain-Event-Adapter

**Ziel:** bestehende Multiplayer-Events in Garden-Events übersetzen.

- Eventschemas
- Adapter
- Versionierung
- unbekannte Events
- keine Renderdetails im Backend

**Akzeptanz:** Contract Tests grün.

### WP-07: Event Queue und Reconciliation

**Ziel:** stabile Darstellung unter Last und Reconnect.

- Prioritäten
- Aggregation
- Fast-Forward
- Snapshot-Abgleich
- Queue-Metriken

**Akzeptanz:** 50 simulierte Events führen innerhalb definierter Zeit zum korrekten Endzustand.

### WP-08: Vollständiges Pflanzen-Rig

**Ziel:** produktionsfähiges, eigenes Spine-Rig.

- Pflichtbones
- Pflichtanimationen
- Skins
- Events
- Mix-Profil
- Exportdokumentation

**Akzeptanz:** automatischer Asset-Validator meldet fehlende Animationen, Skins oder Events.

### WP-09: Wachstums- und Antwortreaktionen

**Ziel:** normale Antworten sichtbar machen.

- kleine und mittlere Wachstumsschübe
- Stage-Up
- Streak-/Zeitbonus-Reaktion
- Overtake-Reaktion

**Akzeptanz:** jede fachliche Ursache hat eine konsistente visuelle Reaktion.

### WP-10: Power-up-Effekte

**Ziel:** bestehende Power-ups wiederverwenden und visualisieren.

- Effekt-Registry statt Switch-Monolith
- saurer Regen
- Sonnenboost
- Schild
- Heilung beziehungsweise Wachstumsschub
- klare Start-/Aktiv-/Endzustände

**Akzeptanz:** Power-ups verändern keine lokale Fachlogik.

### WP-11: Performance und Fallback

**Ziel:** robuste Ausführung auf unterschiedlichen Geräten.

- FPS-Sampling
- automatische Qualitätsreduktion
- `prefers-reduced-motion`
- statischer Sprite-Fallback
- Texture- und Listener-Leak-Tests

**Akzeptanz:** Match bleibt bei absichtlich ausgelöstem Renderfehler spielbar.

### WP-12: Presenter-Integration

**Ziel:** vollständige Einbindung in den realen Spielablauf.

- Lobby
- Rundenstart
- aktive Runde
- Rundenende
- Reconnect
- Matchwechsel

**Akzeptanz:** bestehende Modi bleiben unverändert und Regressionstests grün.

### WP-13: Mobile Team-Pflanze

**Ziel:** optionale, reduzierte Ansicht für Spieler.

- kleine eigene Pflanze
- Low-/Static-Profil
- keine Beeinträchtigung der Antwortinteraktion

**Akzeptanz:** Time-to-interactive der Antwortseite verschlechtert sich nicht relevant.

### WP-14: Dokumentation und Release

**Ziel:** wartbare Übergabe.

- Architektur
- Assetproduktion
- Spine-Export
- neue Animation hinzufügen
- neues Power-up visualisieren
- Debugging
- Lizenzhinweise
- Performance-Budgets

**Akzeptanz:** ein Entwickler kann eine neue Reaktion ohne Änderung an Backend oder Kernszene ergänzen.

---

## 16. Definition of Done

Der Modus gilt erst als fertig, wenn:

- der Server die alleinige fachliche Autorität behält
- alle bestehenden Score-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme wiederverwendet werden
- PixiJS nur für Rendering und lokale Animation verwendet wird
- ausschliesslich die offizielle Spine-Pixi-v8-Runtime verwendet wird
- Runtime- und Editor-Exportversion kompatibel und gepinnt sind
- Lizenzprüfung abgeschlossen ist
- fremde Assets und geschützte Figuren nicht übernommen wurden
- zwei bis vier Teams korrekt dargestellt werden
- Reconnect und Snapshot-Reconciliation funktionieren
- Reduced Motion und statischer Fallback funktionieren
- keine bekannten Texture-, EventListener- oder WebSocket-Leaks bestehen
- Performance-Budgets dokumentiert und getestet sind
- visuelle Regressionstests vorhanden sind
- bestehende Razzoozle-Modi unverändert funktionieren
- Dokumentation und Third-Party-Notices vollständig sind

---

## 17. Verbindliche Anti-Patterns

Nicht zulässig:

- kompletter Frontend-Rewrite in PixiJS
- fachliche Punkteberechnung im Renderclient
- direkte WebSocket-Verarbeitung in Spine-Views
- Animation-Namen im Backend
- ein zentraler `GardenScene.ts`-Monolith
- direkte Assetpfade in UI-Komponenten
- ungeprüfte Übernahme des Open-Games-Codes
- Übernahme von Open-Games-Figma-Assets
- Verwendung von `pixi-spine` statt `spine-pixi-v8`
- permanenter Einsatz teurer Vollbildfilter
- unbegrenzte Event Queue
- harte Abhängigkeit auf 60 FPS
- Match-Abbruch bei Canvas-, WebGL-, WebGPU- oder Spine-Fehler
- lokale Score- oder Growth-Korrekturen ohne Server-Snapshot
- Kopie des Mergic-Pets- oder Adventure-Time-Designs

---

## 18. Arbeitsauftrag für Claude Code und Subagents

1. Repository und bestehende Architektur zuerst lesen.
2. Bestehende Multiplayer-, Punkte-, Event-, Audio-, Asset- und UI-Abstraktionen identifizieren.
3. Keine neue Parallelarchitektur erstellen, wenn eine bestehende Abstraktion erweitert werden kann.
4. Vor Implementierung jedes Work Packages einen kleinen Plan mit betroffenen Dateien, Risiken und Tests erstellen.
5. Work Packages einzeln umsetzen und gegenseitig reviewen lassen.
6. Änderungen klein halten; keine sachfremden Refactorings im gleichen Commit.
7. Jede neue öffentliche Schnittstelle typisieren und dokumentieren.
8. Bei Versions- oder Lizenzunklarheit stoppen und als Blocker melden, nicht raten.
9. Nach jedem WP passende Unit-, Contract- oder Integrationstests ausführen.
10. Nach Abschluss einen Architekturreview, Performance-Review und Lizenzreview durchführen.

### Empfohlene Agentenaufteilung

| Rolle | Aufgabe |
|---|---|
| Architect | bestehende Architektur analysieren, ADR und Modulgrenzen definieren |
| Runtime Engineer | PixiJS-/Spine-Integration und Lifecycle |
| Game Integration Engineer | WebSocket-, State- und Multiplayer-Adapter |
| Animation Engineer | Rig-Vertrag, Controller, Mixing und Eventmapping |
| Performance Reviewer | Budgets, Profiling, Fallback und Leaks |
| Test Reviewer | Contract-, Render-, Reconnect- und Regressionstests |
| License Reviewer | Spine-, PixiJS-, Open-Games- und Asset-Lizenzen prüfen |

Kein Agent darf fachliche Spiellogik in den Rendering-Layer verschieben.

---

## 19. Primärquellen

- PixiJS 8 Dokumentation: https://pixijs.com/8.x/
- PixiJS Spine-Tutorial: https://pixijs.com/8.x/tutorials/spine-boy-adventure
- PixiJS Assets, Manifeste und Bundles: https://pixijs.com/8.x/guides/components/assets/manifest
- PixiJS AssetPack: https://pixijs.io/assetpack/
- PixiJS Open Games: https://github.com/pixijs/open-games
- Offizielle Spine-Pixi-Runtime: https://esotericsoftware.com/spine-pixi
- Spine Runtimes License: https://esotericsoftware.com/spine-runtimes-license
