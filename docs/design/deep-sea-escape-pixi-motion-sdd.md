# SDD: Razzoozle «Tiefsee-Flucht» mit PixiJS, Motion und Puppet-Rigs

> **ADDENDUM (Orchestrator, 2026-07-30, bindende User-Entscheide):** (1) Reihenfolge: Blüten-Battle → Pyramide → Tiefsee; Shared-Puppet-Core wird erst bei der Pyramiden-Umsetzung aus flower-battle extrahiert (ADR-013 v2) — das hiesige WP-03 «Gemeinsames Puppet-Core» wird entsprechend zur Extraktions-Aufgabe. (2) Pfad-Mapping auf Repo-Konvention: src/features/<mode>/ → packages/web/src/experiences/<mode>/, docs/architecture/adr/ → docs/adr/, docs/research/ → docs/design/. (3) Wire-Contract: alle Modus-Events (team_movement_resolved / escape_round_resolved) laufen als Payloads im bestehenden game:experience-Envelope (Revision, Reconnect-Resend, ts-rs, display-room) — keine neuen Top-Level-Socket-Events. (4) Die Alt-WP-Cluster (#884/#892, Umbrellas #900/#948) werden superseded; gültige Detail-Erkenntnisse (ModeOutcome-Hook #933) fliessen in die neuen WPs.

**Status:** revidierter Umsetzungsentwurf  
**Stand:** 30.07.2026  
**Ersetzt:** SDD-Entwurf mit Spine  
**Zielsystem:** Razzoozle Web-Client, Presenter und bestehendes Multiplayer-Backend  
**Rendering:** PixiJS 8  
**Tweening:** vorhandenes Paket `motion`  
**Actor-Animation:** hierarchische PixiJS-Container/Sprites als Puppet-Rig  
**Neue Animationsdependencies:** keine

---

## 1. Auftrag

Implementiere den Razzoozle-Spielmodus «Tiefsee-Flucht». Die Klasse beantwortet auf ihren Geräten normale Razzoozle-Fragen und steuert gemeinsam ein U-Boot durch mehrere Fluchtabschnitte. Korrekte und schnelle Antworten erzeugen Vortrieb. Falsche Antworten und Timeouts erhöhen den Druck des Verfolgers. Das Ziel ist, die Sicherheitszone vor Ablauf der Zeit und vor dem Einholen zu erreichen.

Die Presenter-Ansicht zeigt nur Unterwasser-Flucht, Fortschritt, Gefahr, Level, Zeit und Ergebnisanimationen. Fragen und Antwortoptionen bleiben auf den Spielergeräten. Quiz-, Multiplayer-, Punkte-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme werden wiederverwendet.

### Primärer Modus

Version 1 ist kooperativ:

- alle Spieler tragen zu einem gemeinsamen U-Boot bei
- individuelle Punkte verbleiben im bestehenden System
- gemeinsamer Fortschritt und Bedrohung sind serverautoritativ
- niemand scheidet individuell aus
- PvP-Teamrennen ist nicht Teil von Version 1

### Kernprinzipien

1. Der Server bleibt autoritativ für Antwortwertung, Vortrieb, Bedrohung, Level und Matchausgang.
2. PixiJS und Motion visualisieren semantische Events.
3. Pixelpositionen sind keine fachliche Distanz.
4. Fragen und Antworten bleiben DOM-basiert.
5. U-Boot und Seeungeheuer sind segmentierte Puppet-Rigs.
6. Höhlen, Pflanzen und Hintergründe sind Sprites, TilingSprites und gecachte Container.
7. Animationen sind abbrechbar.
8. Reconnect korrigiert direkt auf den Snapshot.
9. Reduced Motion und Fallback sind Pflicht.
10. Keine fremden Markenassets oder Figurenkopien.

---

## 2. Verbindliche Architekturentscheidung

```text
PixiJS 8
+ vorhandenes motion
+ Puppet-Rig aus PixiJS Container/Sprite
```

Nicht verwenden:

```text
Spine
Rive
GSAP als Standarddependency
```

### Softwarelizenzen

| Baustein | Lizenz | Status |
|---|---|---|
| PixiJS | MIT | verbindlich |
| Motion | MIT | verbindlich, bereits vorhanden |
| GSAP | Webflow/GSAP Standard License | nur Fallback |
| Rive | Runtime Open Source, Exportworkflow bezahlt | ausgeschlossen |
| Kenney Assets | CC0 | selektiv zulässig |

---

## 3. Scope

### In Scope

- kooperativer Fluchtmodus
- mindestens zwei Fluchtabschnitte
- Presenter mit U-Boot, Verfolger und Unterwasserparallaxe
- serverautoritatives `escapeProgress` und `threatProgress`
- Antwortaggregation über bestehende Infrastruktur
- Wiederverwendung von Punkten, Strike und Zeitbonus
- Puppet-Rigs für U-Boot und Seeungeheuer
- Motion-Sequenzen für Boost, Ausweichen, Treffer, Lunge und Ergebnis
- Event Queue und Reconciliation
- responsive Darstellung
- Assetbundles und Level-Preloading
- Quality Profiles, Reduced Motion und Sprite-Fallback
- Audio, Tests, Telemetrie, ADR, Research und Lizenzdokumentation

### Nicht in Scope

- direkte Steuerung
- freie 2D-Navigation
- Kollision als fachliche Quelle
- prozedurale Höhlen
- individuelle Eliminierung
- PvP-Rennen
- neue Punkteengine
- neues Badge-System
- Skelett- oder Rive-Runtime
- kopierte U-Boot- oder Monsterfiguren

---

## 4. Fachliches Spielmodell

### 4.1 Ablauf

1. Lobby zeigt Mission und Spielerzahl.
2. Presenter lädt Level 1.
3. Server startet Fragephase.
4. Spieler antworten.
5. Bestehende Wertung berechnet Richtigkeit, Zeitbonus und Strike.
6. Server übersetzt Beiträge in `propulsionUnits` und `threatUnits`.
7. `EscapeResolutionPolicy` berechnet Fortschritt und Bedrohung.
8. Server publiziert `escape_round_resolved`.
9. Presenter plant Boost-, Druck- oder Lunge-Sequenz.
10. Snapshot-Reconciliation bestätigt Positionen.
11. Levelziel startet den nächsten Abschnitt.
12. `escaped` oder `caught` beendet das Match.

### 4.2 State

```typescript
export interface DeepSeaEscapeState {
  matchId: string;
  phase: DeepSeaEscapePhase;
  levelIndex: number;
  totalLevels: number;
  escapeProgress: number;
  threatProgress: number;
  shield: number;
  combo: number;
  remainingTimeMs: number;
  serverRevision: number;
  serverTime: number;
}
```

Normalisierung:

- `escapeProgress`: 0..1000
- `threatProgress`: 0..1000
- fachliche Distanz aus Serverwerten
- Bildschirmposition nur Darstellung

### 4.3 Rundenergebnis

```typescript
export interface EscapeRoundResolution {
  roundId: string;
  participants: number;
  correctAnswers: number;
  wrongAnswers: number;
  timeouts: number;
  propulsionUnits: number;
  threatUnits: number;
  escapeProgressBefore: number;
  escapeProgressAfter: number;
  threatProgressBefore: number;
  threatProgressAfter: number;
  outcome: EscapeRoundOutcome;
  policyVersion: string;
}

export type EscapeRoundOutcome =
  | "strong_boost"
  | "boost"
  | "narrow_escape"
  | "pressure"
  | "monster_lunge"
  | "level_complete"
  | "escaped"
  | "caught";
```

### 4.4 Event

```json
{
  "type": "escape_round_resolved",
  "eventId": "evt_01J...",
  "matchId": "match_123",
  "serverRevision": 522,
  "serverTime": 1785441000123,
  "roundId": "round_7",
  "outcome": "strong_boost",
  "propulsionUnits": 84,
  "threatUnits": 12,
  "escapeProgressBefore": 410,
  "escapeProgressAfter": 494,
  "threatProgressBefore": 330,
  "threatProgressAfter": 342
}
```

Nicht erlaubt:

```json
{
  "animation": "submarine_boost_fast",
  "moveX": 240,
  "bubbleCount": 180
}
```

---

## 5. Clientmodule

```text
src/features/deep-sea-escape/
├── application/
│   ├── DeepSeaEscapePresenter.ts
│   ├── DeepSeaEventQueue.ts
│   ├── DeepSeaStateReconciler.ts
│   ├── DeepSeaMovementPlanner.ts
│   └── DeepSeaQualityController.ts
├── domain/
│   ├── deep-sea-events.ts
│   ├── deep-sea-state.ts
│   ├── escape-round-outcome.ts
│   ├── escape-thresholds.ts
│   └── deep-sea-level.ts
├── rendering/
│   ├── DeepSeaScene.ts
│   ├── DeepSeaViewport.ts
│   ├── DeepSeaCamera.ts
│   ├── layers/
│   ├── effects/
│   └── layout/
├── puppet/
│   ├── SubmarinePuppet.ts
│   ├── SubmarineRig.ts
│   ├── SubmarinePoses.ts
│   ├── SubmarineAnimations.ts
│   ├── SeaMonsterPuppet.ts
│   ├── SeaMonsterRig.ts
│   ├── SeaMonsterPoses.ts
│   └── SeaMonsterAnimations.ts
├── motion/
│   ├── DeepSeaMotionPolicy.ts
│   ├── DeepSeaMotionSequences.ts
│   └── DeepSeaMotionTimings.ts
├── ui/
├── audio/
└── testing/
```

Gemeinsame Module nur real wiederverwenden, nicht voreilig universell abstrahieren.

---

## 6. Scene Graph

```text
DeepSeaScene
├── WaterBackgroundLayer
│   ├── gradientWater
│   ├── distantLight
│   └── suspendedParticles
├── CaveBackLayer
│   ├── distantRocks
│   ├── plantsBack
│   └── fishBack
├── CaveMidLayer
│   ├── caveWalls
│   ├── plantsMid
│   └── landmarks
├── ActorLayer
│   ├── seaMonsterPuppet
│   └── submarinePuppet
├── HazardLayer
│   ├── fallingRocks
│   ├── currents
│   └── ambientCreatures
├── EffectsLayer
│   ├── bubblePool
│   ├── boostPool
│   ├── sonar
│   ├── impact
│   └── celebration
└── CaveForegroundLayer
    ├── rockSilhouettes
    ├── plantsFront
    └── vignette
```

HUD bleibt DOM-basiert.

---

## 7. U-Boot-Puppet

### 7.1 Hierarchie

```text
submarine
├── root
├── shadow
├── bodyJoint
│   ├── body
│   ├── cabinJoint
│   │   ├── cabin
│   │   ├── eyeLeft
│   │   ├── eyeRight
│   │   ├── browLeft
│   │   ├── browRight
│   │   └── mouth
│   ├── lampJoint
│   │   ├── lampBase
│   │   ├── lampHead
│   │   └── lampGlow
│   ├── propellerJoint
│   │   └── propeller
│   ├── finTopJoint
│   │   └── finTop
│   ├── finLeftJoint
│   │   └── finLeft
│   └── finRightJoint
│       └── finRight
├── bubbleAnchor
├── boostAnchor
└── impactAnchor
```

### 7.2 Pflichtposen

```text
neutral
ready
boost_small
boost_large
brake
look_back
worried
panic
dodge_up
dodge_down
hit_light
hit_heavy
recover
level_complete
escape
caught
```

### 7.3 Pflichtsequenzen

```text
idle_swim
look_back
boost_small
boost_large
brake
dodge_up
dodge_down
hit_light
hit_heavy
panic
recover
level_complete
escape
caught
reconcile
```

Propeller kann als eigenes Motion-Loop rotieren. Bei Hidden Tab oder Low Profile wird der Loop pausiert beziehungsweise reduziert.

---

## 8. Seeungeheuer-Puppet

### 8.1 Hierarchie

```text
sea-monster
├── root
├── shadow
├── bodyJoint
│   ├── body
│   ├── headJoint
│   │   ├── head
│   │   ├── eye
│   │   ├── brow
│   │   ├── jawJoint
│   │   │   ├── jaw
│   │   │   └── teeth
│   │   └── cheek
│   ├── finTopJoint
│   │   └── finTop
│   ├── finLeftJoint
│   │   └── finLeft
│   ├── finRightJoint
│   │   └── finRight
│   └── tailJoint
│       └── tail
├── lungeAnchor
└── impactAnchor
```

Optional tentakelartige Elemente werden als maximal zwei kurze Containerketten aufgebaut. Keine komplexe Bone-Physik.

### 8.2 Pflichtposen

```text
distant
watch
approach
lunge
bite_open
bite_miss
bite_hit
stunned
fall_back
angry
defeated
victory
```

### 8.3 Pflichtsequenzen

```text
idle_swim
watch
approach
lunge
bite_miss
bite_hit
stunned
fall_back
angry
level_transition
defeated
victory
reconcile
```

---

## 9. Motion-Integration

### 9.1 U-Boot-Boost

```typescript
import { animate } from "motion";

export async function playStrongBoost(
  actor: SubmarinePuppet,
  targetX: number,
  signal: AbortSignal,
): Promise<void> {
  const move = animate(actor.root.position, { x: targetX }, {
    duration: 0.65,
    ease: [0.16, 1, 0.3, 1],
  });

  const squash = animate(actor.bodyJoint.scale, {
    x: [1, 0.94, 1.08, 1],
    y: [1, 1.06, 0.92, 1],
  }, {
    duration: 0.65,
  });

  signal.addEventListener("abort", () => {
    move.stop();
    squash.stop();
  }, { once: true });

  await Promise.all([move, squash]);
}
```

### 9.2 Monster-Lunge

```typescript
await Promise.all([
  animate(monster.root.position, {
    x: [monster.root.x, lungeX, targetX],
  }, {
    duration: 0.58,
    ease: [0.4, 0, 0.2, 1],
  }),
  animate(monster.jawJoint, {
    rotation: [0, 0.36, 0.05],
  }, {
    duration: 0.58,
  }),
]);
```

Ob der Biss trifft, kommt vorher vom Serverevent. Die Animation stellt das Resultat nur dar.

### 9.3 Ambient Loops

- Propeller
- Lampenschweben
- Flossenwippen
- Monsterschwanz
- Pflanzen
- Blasen

Regeln:

- zentraler AmbientController
- keine unkontrollierten Endlosschleifen
- Pause bei `document.hidden`
- Low Profile reduziert Frequenz und Teile
- Destroy stoppt alle Motion Controls

---

## 10. Asset- und Beispielintegration

### 10.1 Direkt einbauen

| Quelle | Asset | Nutzung |
|---|---|---|
| Kenney | Fish Pack | Ambient-Fische und kleinere Meereslebewesen |
| Kenney | Particle Pack | Blasen, Boost, Einschlag, Schwebeteilchen |
| Kenney | Light Masks | U-Boot-Lampe, Wasserstrahlen, Warnlicht |
| Kenney | Background Elements | entfernte Formen und Parallaxebasis |
| eigene Produktion | U-Boot-Puppet | zentrale Spielfigur |
| eigene Produktion | Seeungeheuer-Puppet | zentraler Verfolger |
| eigene Produktion | Höhlenhauptlayer | konsistenter Zielstil |

Die konkreten Kenney-Seiten weisen CC0 aus. Assets werden lokal importiert, angepasst und in `SOURCES.md` dokumentiert.

### 10.2 Als Code-Referenz

| Quelle | Übernahme |
|---|---|
| PixiJS Open Games | Screen-/Asset-/Settings-Struktur |
| PixiJS TilingSprite | scrollende Höhlen- und Wasserlayer |
| PixiJS ParticleContainer | Blasen- und Boostpools |
| PixiJS Asset Bundles | Level-Preloading |
| PixiJS Container/Pivot | Actor-Rigs |
| Motion Object Animation | Actor- und Kamera-Tweens |
| Motion Sequences | koordinierte U-Boot-/Monsterabläufe |

Nicht übernehmen:

- Figma-Assets der Open Games
- bekannte Unterwasserfiguren
- externe Screenshots
- Spine- oder GSAP-spezifische Runtimepfade

### 10.3 Assetstruktur

```text
assets/deep-sea-escape/
├── manifest.ts
├── common/
├── level-01/
├── level-02/
├── puppets/
│   ├── submarine/
│   │   ├── parts/
│   │   └── rig.json
│   └── sea-monster/
│       ├── parts/
│       └── rig.json
├── ambient/
│   └── fish/
├── effects/
├── audio/
└── fallback/
```

Bundles:

```text
deep-sea-core
deep-sea-puppets
deep-sea-level-01
deep-sea-level-02
deep-sea-effects-high
deep-sea-audio
deep-sea-fallback
```

---

## 11. Visuelles Positionsmodell

```typescript
export interface EscapeTrackLayout {
  submarineMinX: number;
  submarineMaxX: number;
  monsterMinX: number;
  monsterMaxX: number;
  baselineY: number;
}
```

Regeln:

- Serverwerte werden auf Safe-Area-Koordinaten abgebildet.
- Keine Rückschreibung von Pixelpositionen.
- U-Boot und Monster bleiben sichtbar.
- kritische Distanz darf die Kamera optisch verdichten, nicht fachlich verändern.
- HUD und Szene verwenden denselben Snapshot.

---

## 12. Orchestrierung

Prioritäten:

1. `escaped`/`caught`
2. Levelwechsel
3. Snapshot-Reconciliation
4. Monster-Lunge
5. U-Boot-Boost/Treffer
6. Reaktionen
7. Ambiente

### Starker Boost

1. positives Face-Pose
2. Lampenimpuls
3. Boost-Partikel
4. U-Boot bewegt sich auf Ziel
5. Monster fällt optisch zurück
6. HUD aktualisiert
7. Snapshot bestätigt

### Monster-Lunge

1. kritischer DOM-Status
2. Monster `approach`
3. Lunge
4. U-Boot `panic` oder `dodge`
5. Resultat gemäss Server
6. Impact-/Bubble-Effekt
7. Snapshot bestätigt

### Gemischte Runde

- U-Boot und Monster bewegen sich beide
- Nettodistanz bleibt korrekt
- Effekte übertreiben das Ergebnis nicht
- HUD und Szene bleiben synchron

### Levelwechsel

- nächstes Bundle vorladen
- kurzer Tunnel-/Lichtübergang
- neue Kulisse
- Actorpositionen aus Snapshot
- kein Blockieren der mobilen Fragephase

---

## 13. Qualität und Fallback

| Profil | Verhalten |
|---|---|
| High | volle Puppet-Rigs, Parallaxe, Wasserlicht, Partikel |
| Medium | reduzierte Partikel und vereinfachtes Licht |
| Low | reduzierte Gesichtsteile, weniger Ambient-Loops, 0.5x-Texturen |
| Fallback | Spritesheet-U-Boot/Monster, statische Kulisse, DOM-HUD |

Degradation:

1. Schwebeteilchen reduzieren
2. Blasen reduzieren
3. Lichtmasken reduzieren
4. Vordergrundparallaxe reduzieren
5. Ambient-Fische reduzieren
6. Gesichtsanimationen reduzieren
7. Puppet durch Spritesheet ersetzen
8. statische Presenter-Ansicht

---

## 14. Accessibility

- Gefahr nicht nur rot
- Status: sicher, angespannt, kritisch
- Reduced Motion
- kein Kamera-Shake im Reduced-Modus
- keine realistischen Horror- oder Bissdarstellungen
- Live-Region für Level, Abstand und Ergebnis
- Audio nie als einzige Information
- Fallback mit Zahlen/Status
- U-Boot-/Monsterposition nicht einzige Fortschrittsanzeige

---

## 15. Tests

### Unit

- `EscapeResolutionPolicy`
- Teilnehmernormalisierung
- Progress-/Threat-Grenzen
- Levelwechsel
- Position Mapping
- Pose Mixer
- Motion-Sequenzabbruch
- Queue
- Reconciliation
- Ambient Cleanup
- Asset Source Registry

### Integration

- starker Boost
- Druckrunde
- gemischte Runde
- kritische Distanz
- Monster-Lunge
- Levelwechsel
- Flucht
- Einholen
- Disconnect/Reconnect
- Hidden Tab
- Snapshot bricht Animation ab
- fehlendes Puppet-Asset
- Motion-Cleanup nach Unmount

### Visuell

```text
lobby
level_01_safe
level_01_warning
strong_boost
mixed_round
monster_lunge
submarine_hit
critical_distance
level_transition
level_02
escaped
caught
reduced_motion
low_quality
fallback
```

---

## 16. Telemetrie

```text
deep_sea_scene_init_ms
deep_sea_asset_load_ms
deep_sea_level_transition_ms
deep_sea_fps_average
deep_sea_frame_time_p95
deep_sea_event_queue_depth
deep_sea_event_lag_ms
deep_sea_reconciliation_count
deep_sea_motion_cancel_count
deep_sea_puppet_load_error_count
deep_sea_quality_profile
deep_sea_fallback_reason
```

---

## 17. Micro-Work-Packages

### WP-01/codex: ADR und Research

Lieferobjekte:

```text
docs/architecture/adr/ADR-xxxx-pixijs-motion-puppet-rig.md
docs/research/pixijs-motion-puppet-assets.md
docs/research/asset-sources/SOURCES.md
```

Pflicht:

- Motion/PixiJS MIT
- GSAP kostenlos, proprietäre Standard License
- Rive-Export bezahlt
- Open-Games-Code versus Figma-Assets
- Kenney CC0
- Lockfile-Version
- null neue Dependencies

### WP-02: Motion-Pixi-Prototyp

- direkte Objektanimation
- Abort
- Cleanup
- Hidden-Tab-Pause
- Reduced Motion

### WP-03: Gemeinsames Puppet-Core

- Rig Loader
- Pose Mixer
- Animation Controller
- Face Controller
- Validator

### WP-04: CC0-Assetimport

- Fish Pack
- Particle Pack
- Light Masks
- Background Elements
- Quellenliste
- Atlasoptimierung

### WP-05: Deep-Sea-Scene

- Layer
- TilingSprite
- Safe Areas
- DOM-HUD
- responsive Layout

### WP-06: U-Boot-Puppet

- Teile
- Pivots
- Idle
- Boost
- Panic
- Hit
- Escape

### WP-07: Monster-Puppet

- Teile
- Pivots
- Idle
- Approach
- Lunge
- Stunned
- Defeat

### WP-08: Backend-State und Events

- Progress
- Threat
- Levels
- Policy
- keine Renderbegriffe

### WP-09: Contribution Adapter

- bestehende Punktewertung
- Teilnehmernormalisierung
- Timeout/Disconnect
- keine Doppelwertung

### WP-10: Queue und Reconciliation

- zwei Actor-Queues
- globale Priorität
- Abort
- Snapshot-Snap

### WP-11: Hauptsequenzen

- Boost
- Mixed
- Pressure
- Lunge
- Hit
- Reduced Motion

### WP-12: Levelwechsel

- Preload
- Bundlewechsel
- Timeout/Fallback
- Stateerhalt

### WP-13: Endsequenzen

- Escape
- Caught
- bestehende Achievements
- Ergebnisnavigation

### WP-14: Audio und Effekte

- Pools
- Blasen
- Licht
- Warnung
- Mute

### WP-15: Performance/Fallback

- Profile
- Leaktests
- Spritesheet-Fallback
- Unload

### WP-16: E2E und Release

- E2E
- Visual Regression
- Doku
- Feature Flag
- Rollback
- Third-Party/CC0 Sources

---

## 18. Definition of Done

- keine Spine- oder Rive-Abhängigkeit
- kein GSAP im Standardbundle
- keine neue Animationsdependency
- U-Boot und Monster sind Puppet-Rigs
- Motion-Sequenzen sind abbrechbar
- Szene und HUD verwenden denselben Snapshot
- Pixelpositionen bestimmen keine Fachlogik
- Punkte-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme werden wiederverwendet
- Kenney-Assets sind lokal und dokumentiert
- Open-Games-Figma-Assets werden nicht verwendet
- zwei Level funktionieren
- High/Medium/Low/Fallback funktionieren
- Tests, Telemetrie, ADR und Research sind vorhanden

---

## 19. Quellen

- Motion: https://motion.dev/
- Motion Object Animation: https://motion.dev/docs/quick-start
- Motion `animate()`: https://motion.dev/docs/animate
- Motion `propEffect()`: https://motion.dev/docs/prop-effect
- PixiJS Scene Objects: https://pixijs.com/8.x/guides/components/scene-objects
- PixiJS TilingSprite: https://pixijs.com/8.x/guides/components/scene-objects/tiling-sprite
- PixiJS ParticleContainer: https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- PixiJS Asset Bundles: https://pixijs.com/8.x/guides/components/assets/manifest
- PixiJS Background Loader: https://pixijs.com/8.x/guides/components/assets/background-loader
- PixiJS Open Games: https://github.com/pixijs/open-games
- Kenney License FAQ: https://kenney.nl/support
- Kenney Fish Pack: https://kenney.nl/assets/fish-pack
- Kenney Particle Pack: https://kenney.nl/assets/particle-pack
- Kenney Light Masks: https://kenney.nl/assets/light-masks
- GSAP Free Announcement: https://webflow.com/updates/gsap-becomes-free
- GSAP Standard License: https://gsap.com/community/standard-license/
- Rive Runtime Export: https://rive.app/docs/editor/exporting/exporting-for-runtime
