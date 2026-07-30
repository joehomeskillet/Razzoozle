# SDD: Razzoozle «Pyramiden-Aufstieg» mit PixiJS, Motion und Puppet-Rigs

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

Implementiere den Razzoozle-Spielmodus «Pyramiden-Aufstieg». Teams beantworten die bestehenden Razzoozle-Fragen auf ihren Geräten und wählen anschliessend ihre Antwortsicherheit. Der serverautoritativ berechnete Ausgang bestimmt, wie viele Stufen das Team auf einer gemeinsamen Pyramide auf- oder absteigt.

Die Presenter-Ansicht zeigt ausschliesslich Spielverlauf, Teams, Pyramide, Runde, Zeit und Ergebnisanimationen. Fragen und Antwortoptionen bleiben auf den Spielergeräten. Quiz-, Multiplayer-, Punkte-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme werden wiederverwendet.

### Kernprinzipien

1. Der Server bleibt autoritativ für Antworten, Aggregation, Bewegung, Punkte, Rang und Endergebnis.
2. PixiJS und Motion visualisieren semantische Events.
3. Keine Spielregel in Tween-Sequenzen.
4. Keine zweite Punkte- oder Teamlogik im Presenter.
5. Fragen und Antworten bleiben DOM-basiert.
6. Teamfiguren werden als segmentierte Puppet-Rigs aufgebaut.
7. Pyramide, Tempel und Hintergrund bestehen überwiegend aus Sprites, TilingSprites und gecachten Containern.
8. Animationen sind abbrechbar und enden im autoritativen Zustand.
9. Der Modus funktioniert mit Reduced Motion und statischem Fallback.
10. Keine fremden Markenassets oder exakten Layoutkopien.

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

GSAP ist nur dokumentierter Fallback gemäss gemeinsamem ADR.

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

- Presenter-Szene mit Pyramide, Teams und Tempelkulisse
- mobile Sicherheitswahl
- serverautoritatives Auf- und Absteigen
- Teamaggregation über bestehende Multiplayer-Logik
- Wiederverwendung von Punkten, Strike und Zeitbonus
- Puppet-Rigs für Teamfiguren
- optionaler einfacher Tempelwächter als Puppet
- Motion-Sequenzen für Sprung, Fall, Reaktion und Celebration
- Event Queue und State Reconciliation
- responsive Darstellung
- Assetbundles und Hintergrundladen
- Quality Profiles, Reduced Motion und Sprite-Fallback
- Tests, Telemetrie, ADR, Research und Lizenzdokumentation

### Nicht in Scope

- freie Figurensteuerung
- Physik-Engine
- Kollisionen als fachliche Quelle
- neue Quiz- oder Punkteengine
- neues Badge-System
- externer Skeletteditor
- Mesh-Deformation
- kopierte Tempel- oder Figurenassets
- Rive-, Spine- oder GSAP-Standardintegration

---

## 4. Fachliches Spielmodell

### 4.1 Ablauf

1. Lobby weist Spieler bestehenden Teams zu.
2. Presenter positioniert alle Teams auf der Startstufe.
3. Server startet die normale Fragephase.
4. Spieler geben Antworten ab.
5. Danach wählen sie `low`, `medium` oder `high`.
6. Server schliesst die Runde.
7. Bestehende Multiplayer- und Punktekomponenten aggregieren das Teamresultat.
8. `ClimbResolutionPolicy` berechnet die Stufenänderung.
9. Server publiziert `team_movement_resolved`.
10. Presenter plant daraus eine visuelle Sequenz.
11. Nach der Sequenz erfolgt Snapshot-Reconciliation.
12. Summit und Rang kommen ausschliesslich vom Server.

### 4.2 Beispielprofil

| Ergebnis | Niedrig | Mittel | Hoch |
|---|---:|---:|---:|
| korrekt | +1 | +2 | +3 |
| falsch | 0 | -1 | -2 |
| keine Antwort | 0 | -1 | -1 |

Regeln:

- Werte liegen serverseitig in der Moduskonfiguration.
- Zeitbonus und Strike können innerhalb definierter Grenzen modifizieren.
- Der Client erhält nur das fertige Ergebnis und den Grund.
- Animationen dürfen Stufen visuell staffeln, aber nie zusätzliche Bewegung erzeugen.

### 4.3 State

```typescript
export interface PyramidClimbState {
  matchId: string;
  phase: PyramidClimbPhase;
  currentRound: number;
  totalRounds: number;
  targetStep: number;
  teams: PyramidTeamState[];
  serverRevision: number;
  serverTime: number;
}

export interface PyramidTeamState {
  teamId: string;
  step: number;
  score: number;
  streak: number;
  correctAnswers: number;
  cumulativeAnswerTimeMs: number;
  lastMovement: number;
  resolvedConfidence?: "low" | "medium" | "high";
  rank?: number;
}
```

### 4.4 Event

```json
{
  "type": "team_movement_resolved",
  "eventId": "evt_01J...",
  "matchId": "match_123",
  "serverRevision": 431,
  "serverTime": 1785441000123,
  "teamId": "team_blue",
  "fromStep": 6,
  "toStep": 8,
  "delta": 2,
  "reason": "correct_medium_confidence_time_bonus"
}
```

Nicht erlaubt:

```json
{
  "animation": "jump_two_steps",
  "duration": 1.4,
  "dustParticles": 80
}
```

---

## 5. Clientmodule

```text
src/features/pyramid-climb/
├── application/
│   ├── PyramidClimbPresenter.ts
│   ├── PyramidEventQueue.ts
│   ├── PyramidStateReconciler.ts
│   ├── PyramidMovementPlanner.ts
│   └── PyramidQualityController.ts
├── domain/
│   ├── pyramid-events.ts
│   ├── pyramid-state.ts
│   ├── confidence-level.ts
│   └── pyramid-layout.ts
├── rendering/
│   ├── PyramidScene.ts
│   ├── PyramidViewport.ts
│   ├── PyramidCamera.ts
│   ├── layers/
│   ├── effects/
│   └── layout/
├── puppet/
│   ├── TeamClimberPuppet.ts
│   ├── TeamClimberRig.ts
│   ├── TeamClimberPoses.ts
│   ├── TeamClimberAnimations.ts
│   ├── GuardianPuppet.ts
│   └── PyramidPuppetFactory.ts
├── motion/
│   ├── PyramidMotionPolicy.ts
│   ├── PyramidMotionSequences.ts
│   └── PyramidMotionTimings.ts
├── ui/
├── audio/
└── testing/
```

Gemeinsame Infrastruktur:

```text
src/game-rendering/
├── pixi/
├── motion/
├── puppet/
├── effects/
└── assets/
```

Dateiregeln:

- Ziel unter 250 Codezeilen
- über 400 Zeilen nur mit Begründung
- keine monolithische `PyramidGame.ts`
- keine modusspezifische Kopie des gemeinsamen Motion-Adapters

---

## 6. Scene Graph

```text
PyramidScene
├── BackgroundLayer
│   ├── sky
│   ├── mountains
│   ├── stars
│   └── lightRays
├── TempleBackLayer
│   ├── columns
│   ├── silhouettes
│   └── torches
├── PyramidLayer
│   ├── step_01 ... step_10
│   ├── highlights
│   └── summitRelic
├── TeamLayer
│   ├── teamPuppet_1
│   ├── teamPuppet_2
│   ├── teamPuppet_3
│   └── teamPuppet_4
├── EffectsLayer
│   ├── dustPool
│   ├── starsPool
│   ├── overtakeTrails
│   └── summitEffects
└── ForegroundLayer
    ├── leaves
    ├── stones
    └── vignette
```

HUD bleibt DOM-basiert.

---

## 7. Puppet-Rig

### 7.1 Teamfigur

```text
team-climber
├── root
├── shadow
├── bodyJoint
│   ├── body
│   ├── headJoint
│   │   ├── head
│   │   ├── eyeLeft
│   │   ├── eyeRight
│   │   ├── browLeft
│   │   ├── browRight
│   │   └── mouth
│   ├── armLeftJoint
│   │   └── armLeft
│   ├── armRightJoint
│   │   └── armRight
│   ├── legLeftJoint
│   │   └── legLeft
│   └── legRightJoint
│       └── legRight
├── badgeAnchor
├── groundFxAnchor
└── headFxAnchor
```

### 7.2 Teamvarianten

Die Teamvarianten verwenden:

- gemeinsame Rig-Geometrie
- eigene Texture-Sets oder Tint-Tokens
- gleiche Animationsnamen
- gleiche Pivotstruktur
- optional unterschiedliche Gesichtsdetails

```typescript
export type TeamPuppetSkin =
  | "violet"
  | "blue"
  | "orange"
  | "green";
```

### 7.3 Rigdefinition

```typescript
export interface PuppetPartDefinition {
  textureAlias: string;
  parent?: string;
  x: number;
  y: number;
  pivotX: number;
  pivotY: number;
  zIndex: number;
}

export interface TeamClimberRigDefinition {
  version: 1;
  parts: Record<string, PuppetPartDefinition>;
  anchors: Record<string, { x: number; y: number }>;
}
```

### 7.4 Pflichtposen

```text
neutral
ready
think
confidence_low
confidence_medium
confidence_high
anticipate_up
air_up
land_soft
land_hard
slip
fall
overtake
overtaken
near_summit
victory
defeat
```

### 7.5 Pflichtsequenzen

```text
idle
look_around
show_confidence_low
show_confidence_medium
show_confidence_high
jump_up_1
jump_up_2
jump_up_3
slip_down_1
fall_down_2
overtake
overtaken
summit_reached
celebrate
defeat
reconcile
```

Keine Sequenz ist in einer proprietären Assetdatei gespeichert. Sie liegt typisiert im Quellcode.

---

## 8. Motion-Integration

### 8.1 Grundsatz

Motion animiert JavaScript-Objekte. PixiJS-Container und deren Transformobjekte werden direkt getweent.

```typescript
import { animate } from "motion";

export async function playJump(
  actor: TeamClimberPuppet,
  target: { x: number; y: number },
  signal: AbortSignal,
): Promise<void> {
  const controls = animate(
    actor.root.position,
    {
      x: [actor.root.x, target.x],
      y: [actor.root.y, target.y - 70, target.y],
    },
    {
      duration: 0.62,
      ease: [0.22, 1, 0.36, 1],
    },
  );

  signal.addEventListener("abort", () => controls.stop(), { once: true });
  await controls;
}
```

### 8.2 Squash und Stretch

```typescript
await Promise.all([
  animate(actor.bodyJoint.scale, {
    x: [1, 1.12, 0.96, 1],
    y: [1, 0.88, 1.08, 1],
  }, { duration: 0.55 }),
  animate(actor.headJoint, {
    rotation: [0, -0.08, 0.05, 0],
  }, { duration: 0.55 }),
]);
```

### 8.3 Sequenzabbruch

Jede Sequenz erhält:

- `AbortSignal`
- Cleanup-Registry
- definierte Endpose
- `finally`-Block
- Reconciliation-Pfad

Bei neuem Snapshot darf eine dekorative Animation abgebrochen und die Figur direkt auf den Zielanchor gesetzt werden.

### 8.4 Keine Timeline-Events aus Assets

Audio und Effekte werden über definierte Markierungen der TypeScript-Sequenz gestartet:

```typescript
await sequence([
  () => poses.apply(actor, "anticipate_up"),
  () => effects.spawnDust(actor.groundFxAnchor),
  () => moveAlongArc(actor.root, target, signal),
  () => poses.apply(actor, "land_soft"),
]);
```

---

## 9. Asset- und Beispielintegration

### 9.1 Direkt einbauen

| Quelle | Asset | Nutzung |
|---|---|---|
| Kenney | Particle Pack | Staub, Sterne, Funken, Landeeffekte |
| Kenney | Light Masks | Fackellicht, Summit-Glow, Stufenhighlight |
| Kenney | Sketch Desert | frühe Tempel-/Wüstenkomposition und ausgewählte Nebenelemente |
| Kenney | Background Elements | Himmel, Berge, Wolken, entfernte Silhouetten |
| eigene Produktion | Team-Puppet-Teile | finale Teamfiguren |
| eigene Produktion | Pyramide und Summit | zentrale Hauptgrafik |

Alle Kenney-Assets sind auf den konkreten Assetseiten als CC0 ausgewiesen. Sie werden lokal importiert, stilistisch angepasst und in `SOURCES.md` dokumentiert.

### 9.2 Als Code-Referenz

| Quelle | Übernahme |
|---|---|
| PixiJS Open Games | Navigation, Assetbundles, Screen-Lifecycle, Settings |
| Puzzling Potions | Struktur für Screens, Popups, Assets, UI und Effekte |
| PixiJS Scene Objects | Container-/Pivotmuster für Puppet-Rigs |
| PixiJS ParticleContainer | gepoolte Staub-/Sterneffekte |
| PixiJS Assets | Manifeste, Bundles und Background Loading |
| Motion Docs | Objektanimationen, Sequenzen und Cleanup |

Nicht übernehmen:

- Figma-Assets der Open Games
- GSAP-spezifische Implementierung
- Spine-Code
- bekannte Markenfiguren oder Screenshots

### 9.3 Assetstruktur

```text
assets/pyramid-climb/
├── manifest.ts
├── background/
├── temple/
├── pyramid/
├── puppets/
│   ├── team-climber/
│   │   ├── violet/
│   │   ├── blue/
│   │   ├── orange/
│   │   ├── green/
│   │   └── rig.json
│   └── guardian/
├── effects/
├── audio/
└── fallback/
```

Bundles:

```text
pyramid-core
pyramid-background
pyramid-puppets
pyramid-effects-high
pyramid-audio
pyramid-fallback
```

---

## 10. Layout

```typescript
export interface PyramidStepAnchor {
  step: number;
  x: number;
  y: number;
  scale: number;
  laneOffsets: number[];
}
```

Regeln:

- Positionen aus normalisierter Designfläche
- bis zu vier Teams pro Stufe lesbar
- Stufennummern nicht verdecken
- Team-Puppets erhalten lokale Skalierung je Stufe
- keine Actor-Koordinaten als fachlicher State
- DOM-HUD ausserhalb der Safe Area

---

## 11. Animationsorchestrierung

Prioritäten:

1. Match-Ende/Summit
2. Snapshot-Reconciliation
3. Teambewegung
4. Overtake
5. Reaktion
6. Ambiente

Regeln:

- pro Team maximal eine Hauptsequenz
- parallele Bewegungen erlaubt
- bei Überlast dekorative Effekte verwerfen
- fachliche Zielposition nie verwerfen
- maximale visuelle Verzögerung definieren
- Endevent bricht nicht notwendige Sequenzen ab

### Beispiel +2

1. Sicherheitsreaktion
2. Zielstufe leuchtet
3. Anticipation-Pose
4. Staub
5. Bogenbewegung über zwei Stufen
6. Zwischenhighlight
7. Landepose
8. Rang aktualisieren
9. Overtake-Reaktion
10. Snapshot bestätigen

### Beispiel -2

1. selbstsichere Pose
2. Warnimpuls
3. Slip-Pose
4. Fallbewegung
5. weiche, kurze Landung
6. neutrale Ergebnisanzeige
7. Snapshot bestätigen

---

## 12. Qualität und Fallback

| Profil | Verhalten |
|---|---|
| High | volle Puppet-Rigs, Parallaxe, Lichtmasken, Partikel |
| Medium | reduzierte Partikel und Hintergrundbewegung |
| Low | vereinfachte Puppet-Posen, statischer Wächter, 0.5x-Texturen |
| Fallback | Spritesheet-/statische Teammarker, DOM-Rang und Stufe |

Degradation:

1. Partikel reduzieren
2. Lichtmasken reduzieren
3. Wächter deaktivieren
4. Parallaxe reduzieren
5. Gesichtsanimationen reduzieren
6. Puppet durch Spritesheet ersetzen
7. statische Presenter-Ansicht

---

## 13. Accessibility

- Team nicht nur über Farbe
- Teamname und Stufe als DOM-Text
- Reduced Motion
- kein Kamera-Shake im Reduced-Modus
- keine schnellen Vollbildblitze
- Sicherheitswahl per Tastatur und Screenreader
- Live-Region für Bewegung und Rang
- Fallback mit klaren Zahlen
- Audio nie als einzige Information

---

## 14. Tests

### Unit

- `ClimbResolutionPolicy`
- Confidence-Aggregation
- Layoutanchors
- Lane Resolver
- Motion Planner
- Pose Mixer
- Sequenzabbruch
- Event Queue
- Reconciliation
- Reduced Motion
- Asset Source Registry

### Integration

- vier Teams auf einer Stufe
- paralleler Auf-/Abstieg
- Overtake
- Summit-Gleichstand
- Disconnect und Reconnect
- Animation wird durch Snapshot abgebrochen
- Low Profile
- fehlendes Puppet-Asset
- Motion-Cleanup nach Unmount

### Visuell

```text
lobby
all_step_1
crowded_step
jump_2
fall_2
overtake
near_summit
summit_tie
reduced_motion
low_quality
fallback
```

---

## 15. Telemetrie

```text
pyramid_scene_init_ms
pyramid_asset_load_ms
pyramid_fps_average
pyramid_frame_time_p95
pyramid_event_queue_depth
pyramid_event_lag_ms
pyramid_reconciliation_count
pyramid_motion_cancel_count
pyramid_puppet_load_error_count
pyramid_quality_profile
pyramid_fallback_reason
```

---

## 16. Micro-Work-Packages

### WP-01/codex: ADR und Research

Lieferobjekte:

```text
docs/architecture/adr/ADR-xxxx-pixijs-motion-puppet-rig.md
docs/research/pixijs-motion-puppet-assets.md
docs/research/asset-sources/SOURCES.md
```

Pflicht:

- Motion/PixiJS MIT
- GSAP kostenlos, aber proprietäre Standard License
- Rive-Export bezahlt
- Open-Games-Code versus Figma-Assets
- Kenney CC0
- exakte vorhandene Motion-Version aus Lockfile
- null neue Dependencies

### WP-02: Motion-Pixi-Prototyp

- vorhandenes `motion` verwenden
- PixiJS-Container direkt animieren
- Stop/Pause/Abort
- Cleanup-Test
- Reduced Motion

### WP-03: Gemeinsames Puppet-Core

- Rig Loader
- Pose Mixer
- Animation Controller
- Face Controller
- Asset Validator
- keine Pyramidenspezifik im Core

### WP-04: Assetimport CC0

- Particle Pack
- Light Masks
- Sketch Desert-Auswahl
- Background Elements-Auswahl
- `SOURCES.md`
- optimierte Atlanten

### WP-05: Pyramid Scene

- Layer
- Pyramide
- Safe Area
- responsive Anchors
- DOM-HUD

### WP-06: Team-Puppet-Prototyp

- mindestens fünf Teile
- Team-Skin
- Idle
- Jump
- Fall
- Celebration

### WP-07: Mobile Sicherheitswahl

- DOM
- Accessibility
- Reconnect
- Doppelabgabe verhindern

### WP-08: Backend-State und Events

- serverautoritatitive Policy
- versionierte Events
- keine Renderbegriffe

### WP-09: Queue und Reconciliation

- idempotente Events
- Revisionen
- Abort laufender Sequenzen
- Snapshot-Snap

### WP-10: Produktions-Puppets

- vier Teams
- finale Parts
- Pivotprüfung
- Pflichtposen
- Art Review

### WP-11: Hauptsequenzen

- +1/+2/+3
- -1/-2
- Overtake
- Summit
- Reduced Motion

### WP-12: Audio und Effekte

- bestehendes Audiosystem
- Pools
- Profile
- Mute

### WP-13: Performance/Fallback

- Leaktests
- Profile
- Spritesheet-Fallback
- Asset-Unload

### WP-14: E2E und Release

- E2E
- Visual Regression
- Doku
- Feature Flag
- Rollback
- Third-Party/CC0 Sources

---

## 17. Definition of Done

- keine Spine- oder Rive-Abhängigkeit
- kein GSAP im Standardbundle
- keine neue Animationsdependency
- PixiJS + vorhandenes Motion funktionieren
- Teamfiguren sind Puppet-Rigs
- alle Sequenzen abbrechbar
- Snapshot ist autoritativ
- Punkte-, Strike-, Zeitbonus-, Badge- und Achievement-Systeme wiederverwendet
- CC0-Quellen dokumentiert
- Open-Games-Figma-Assets nicht verwendet
- High/Medium/Low/Fallback funktionieren
- Tests und Telemetrie vorhanden
- ADR und Research eingecheckt

---

## 18. Quellen

- Motion: https://motion.dev/
- Motion Object Animation: https://motion.dev/docs/quick-start
- Motion `animate()`: https://motion.dev/docs/animate
- Motion `propEffect()`: https://motion.dev/docs/prop-effect
- PixiJS Scene Objects: https://pixijs.com/8.x/guides/components/scene-objects
- PixiJS ParticleContainer: https://pixijs.com/8.x/guides/components/scene-objects/particle-container
- PixiJS Assets: https://pixijs.com/8.x/guides/components/assets
- PixiJS Open Games: https://github.com/pixijs/open-games
- Kenney License FAQ: https://kenney.nl/support
- Kenney Sketch Desert: https://kenney.nl/assets/sketch-desert
- Kenney Particle Pack: https://kenney.nl/assets/particle-pack
- Kenney Light Masks: https://kenney.nl/assets/light-masks
- GSAP Free Announcement: https://webflow.com/updates/gsap-becomes-free
- GSAP Standard License: https://gsap.com/community/standard-license/
- Rive Runtime Export: https://rive.app/docs/editor/exporting/exporting-for-runtime
