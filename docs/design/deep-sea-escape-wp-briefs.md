# WP-Briefe: Tiefsee-Flucht (PixiJS/Motion/Puppet)

**Quelle:** SDD §17, revidiert 2026-07-30  
**Zielfreigabe:** Herbst 2026  
**Rendering:** PixiJS 8 + Motion + Puppet-Rigs  
**Besonderheit:** Shared Puppet-Core aus Pyramiden-Aufstieg (WP-03 gemeinsam)

---

## Wave 0: Infra & Shared

### WP-01: ADR und Lizenzierung konsumieren
**Lane:** codex · **Effort:** low · **Wave:** 0 · **Abhängig von:** —
**Setup:** git worktree add -b docs/deep-sea-adr .claude/worktrees/dse0-adr main
**Scope:** Konsumiere ADR-013 PixiJS/Motion/Puppet-Hybrid. Adaptiere Deep-Sea-spezifische Anforderungen: U-Boot + Monster Puppets, TilingSprite für Höhlen-Scrolling, zwei Level-Bundles, keine neuen Dependencies. Lizenzcheck Kenney CC0 + Rive ausgeschlossen.
**Nicht im Scope:** neue ADR, Rive, GSAP-Standardbundle
**Dateien (≈):** docs/research/deep-sea-escape-rendering.md, docs/research/asset-sources/SOURCES.md (+ Deep-Sea-Einträge)
**Gates (verbatim in Report):** pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Lizenz-Sync mit Pyramid

---

### WP-02: Motion + PixiJS Prototyp (Shared)
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 0 · **Abhängig von:** WP-01
**Setup:** (Verzeigt auf feat/pyramid-motion-proto aus Pyramid WP-02; kein neuer Worktree nötig)
**Scope:** Nutze Motion-Adapter aus Pyramid WP-02. Tests mit U-Boot X-Position (lineares Boost) und Y-Position (Ausweich-Dynamik). Abort-Signale unter Serverupdate. Reduced Motion reduziert Loop-Frequenz auf 0.
**Nicht im Scope:** eigener Motion-Code
**Dateien (≈):** Nur Tests in packages/web/src/features/deep-sea-escape/motion/
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/motion/ (nur neue Tests)
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — U-Boot Motion + Abort grün

---

### WP-03: Gemeinsames Puppet-Core (Shared mit Pyramid)
**Lane:** —
**Setup:** (Bereits geleistet in Pyramid WP-03)
**Scope:** Deep Sea nutzt denselben Puppet-Core wie Pyramid (Rig Loader, Pose Mixer, Animation Controller). Keine Duplikation.
**Abgabe:** Kein Deep-Sea-WP-03 nötig; referenziere Pyramid WP-03
**Abhängig von:** Pyramid WP-03 abgeschlossen

---

### WP-04: CC0-Assetimport (Kenney)
**Lane:** free-pool · **Effort:** low · **Wave:** 0 · **Abhängig von:** WP-01
**Setup:** git worktree add -b feat/deep-sea-assets .claude/worktrees/dse0-assets main
**Scope:** Importiere Kenney Fish Pack, Particle Pack, Light Masks, Background Elements lokal unter assets/deep-sea-escape/. Level-Bundles: deep-sea-core, level-01, level-02. Atlasen optimieren. SOURCES.md dokumentieren (CC0-Links).
**Nicht im Scope:** 3D-Assets, proprietäre Lizenzen
**Dateien (≈):** assets/deep-sea-escape/manifest.ts, SOURCES.md (append), Atlanten
**Gates (verbatim in Report):** node scripts/validate-assets.js deep-sea-escape
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Level-01 + Level-02 Atlanten validiert

---

## Wave 1: Szene & Puppet-Basis

### WP-05: DeepSeaScene Aufbau
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 1 · **Abhängig von:** WP-02, WP-04
**Setup:** git worktree add -b feat/deep-sea-scene .claude/worktrees/dse1-scene main
**Scope:** Erstelle DeepSeaScene.ts mit Schichtenmodell (WaterBackground, CaveBack, CaveMid, Actor, Hazard, Effects, CaveForeground). TilingSprite für scrollende Höhlen. Safe Area für DOM-HUD. Viewport mit verschiebbarer Kamera für U-Boot/Monster-Verfolgung. Keine Logik, reine Container.
**Nicht im Scope:** Animationen, Levelwechsel, Physik
**Dateien (≈):** packages/web/src/features/deep-sea-escape/rendering/DeepSeaScene.ts (~150 LOC), TilingSprite-Utilities
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/rendering/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Scene-Rendering + Kamera grün

---

### WP-06: U-Boot-Puppet Prototyp
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 1 · **Abhängig von:** Pyramid WP-03, WP-05
**Setup:** git worktree add -b feat/deep-sea-submarine .claude/worktrees/dse1-submarine main
**Scope:** SubmarinePuppet.ts mit Teilen: Körper, Kabine (Auge/Augenbraue/Mund), Lampe, Propeller, Flossen. Rig-Loader, Idle-Swim, Boost-Small/Large, Brake, Dodge-Up/Down, Hit, Panic, Escape. Propeller als Endlosschleife (Motion-Loop, pausierbar bei Hidden Tab).
**Nicht im Scope:** finale Assets, alle 33 Posen, Kamera-Verfolgung
**Dateien (≈):** packages/web/src/features/deep-sea-escape/puppet/SubmarinePuppet.ts (~120 LOC), Ambient-Controller (~80 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/puppet/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — U-Boot Prototype grün

---

### WP-07: Monster-Puppet Prototyp
**Lane:** kimi-k3 · **Effort:** medium · **Wave:** 1 · **Abhängig von:** Pyramid WP-03, WP-05
**Setup:** git worktree add -b feat/deep-sea-monster .claude/worktrees/dse1-monster main
**Scope:** SeaMonsterPuppet.ts mit Teilen: Körper, Kopf (Auge/Augenbraue/Kiefer), Rückenflosse, Seitenfossen, Schwanz. Rig-Loader, Idle-Swim, Watch, Approach, Lunge, Bite-Miss/Hit, Stunned, Fall-Back. Maximal 2 kurze Tentakel-Container, keine komplexe Knochdenphysik.
**Nicht im Scope:** finale Assets, Interaktion mit U-Boot
**Dateien (≈):** packages/web/src/features/deep-sea-escape/puppet/SeaMonsterPuppet.ts (~130 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/puppet/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Monster Prototype grün

---

## Wave 2: Backend & Event-Verarbeitung

### WP-08: Backend State & EscapeResolutionPolicy
**Lane:** grok · **Effort:** high · **Wave:** 2 · **Abhängig von:** —
**Setup:** git worktree add -b feat/deep-sea-escape-policy .claude/worktrees/dse2-backend main
**Scope:** Rust `EscapeResolutionPolicy`: versionierte `escape_round_resolved`-Events (escapeProgressBefore/After, threatProgressBefore/After, outcome: strong_boost|boost|narrow_escape|pressure|monster_lunge|level_complete|escaped|caught). Serverautoritativ, keine Animationsbegriffe. Nutze game:experience-Envelope + ModeOutcome-Hook #933. Integriere Multiplayer-Aggregation (Punkte, Strike, Zeitbonus, kein individuelles KO).
**Nicht im Scope:** UI-Integration, Kamera-Logik
**Dateien (≈):** rust/server/src/game/modes/deep_sea_escape/policy.rs (~250 LOC), tests
**Gates (verbatim in Report):** bash rust/gate.sh && cargo test deep_sea_escape
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Policy-Tests + Outcome-Mapping grün

---

### WP-09: Contribution Adapter (Spielerausgaben → Vortrieb/Bedrohung)
**Lane:** grok · **Effort:** medium · **Wave:** 2 · **Abhängig von:** WP-08
**Setup:** git worktree add -b feat/deep-sea-contribution .claude/worktrees/dse2-contrib main
**Scope:** Adapter zwischen Multiplayer-Wertung (bestehend: Punkte, Strike, Zeitbonus) und propulsionUnits/threatUnits für Policy. Teilnehmernormalisierung (keine Doppelwertung). Timeout/Disconnect-Handling. Keine neue Punkteengine.
**Nicht im Scope:** Spieler-Eliminierung, PvP-Logik
**Dateien (≈):** rust/server/src/game/modes/deep_sea_escape/contribution_adapter.rs (~120 LOC), tests
**Gates (verbatim in Report):** bash rust/gate.sh && cargo test deep_sea_escape::contribution
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Aggregation grün

---

### WP-10: DeepSeaEventQueue & StateReconciler
**Lane:** sonnet · **Effort:** medium · **Wave:** 2 · **Abhängig von:** WP-08, WP-09
**Setup:** git worktree add -b feat/deep-sea-queue .claude/worktrees/dse2-queue main
**Scope:** DeepSeaEventQueue.ts (zwei Actor-Queues: submarine, monster; globale Priorität für caught/escaped). DeepSeaStateReconciler.ts (Snapshot direct-snap, Animation Abort). Level-Wechsel-Events verankern ohne Blockierung.
**Nicht im Scope:** Sequenz-Choreographie, Levellogik
**Dateien (≈):** packages/web/src/features/deep-sea-escape/application/DeepSeaEventQueue.ts (~130 LOC), reconciler (~110 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/application/ && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Dual-Actor Queue grün

---

## Wave 3: Choreographie & Verfeinerung

### WP-11: Hauptsequenzen (Boost, Treffer, Lunge)
**Lane:** kimi-k3 · **Effort:** high · **Wave:** 3 · **Abhängig von:** WP-10, WP-06, WP-07
**Setup:** git worktree add -b feat/deep-sea-sequences .claude/worktrees/dse3-sequences main
**Scope:** Motion-Sequenzen für U-Boot-Boost (small/large), Dodge, Hit (light/heavy), Panic; Monster Approach, Lunge, Bite-Miss/Hit, Stunned. Gemischte Runden (beide bewegen sich gleichzeitig, Netto-Distanz korrekt). Reduced-Motion-Fallback. Jede abbrechbar.
**Nicht im Scope:** Audio, Effekte, Levelwechsel-Fädeln
**Dateien (≈):** packages/web/src/features/deep-sea-escape/motion/DeepSeaMotionSequences.ts (~220 LOC), Timings (~50 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/motion/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Boost/Lunge/Dodge grün

---

### WP-12: Levelwechsel (Preload, Bundleswitch, State-Erhalt)
**Lane:** sonnet · **Effort:** medium · **Wave:** 3 · **Abhängig von:** WP-04, WP-11
**Setup:** git worktree add -b feat/deep-sea-level-transition .claude/worktrees/dse3-levels main
**Scope:** Level-Preload via Asset Bundles (deep-sea-level-01, deep-sea-level-02). Kurzer Tunnel-/Lichtübergang zwischen Leveln. Kulisse-Wechsel ohne Blockierung der mobilen Fragephase. State-Erhalt (U-Boot/Monster-Position aus Snapshot).
**Nicht im Scope:** Levelgenerierung, neue Level über 2
**Dateien (≈):** packages/web/src/features/deep-sea-escape/application/DeepSeaLevelManager.ts (~120 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/application/deep-sea-level
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Level-01 → Level-02 Transition grün

---

### WP-13: Endsequenzen (Escape / Caught)
**Lane:** free-pool · **Effort:** low · **Wave:** 3 · **Abhängig von:** WP-11, WP-12
**Setup:** git worktree add -b feat/deep-sea-end-sequences .claude/worktrees/dse3-end main
**Scope:** Motion-Sequenzen für `escaped` (U-Boot fliegt aus Szene, Victory-Pose Monster) und `caught` (Lunge trifft, U-Boot Panic/Caught-Pose). Besitze bestehende Achievement-Integration. Leite zu Ergebnis-Navigation weiter.
**Nicht im Scope:** neue Achievements, Replay-Logik
**Dateien (≈):** packages/web/src/features/deep-sea-escape/motion/DeepSeaEndSequences.ts (~80 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/motion/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Escape + Caught grün

---

### WP-14: Audio + Effekte
**Lane:** free-pool · **Effort:** medium · **Wave:** 3 · **Abhängig von:** WP-11
**Setup:** git worktree add -b feat/deep-sea-audio-fx .claude/worktrees/dse3-audio main
**Scope:** Bestehende Audio-Engine. Sound-Marker in Motion-Sequenzen (via Callback). Effekt-Pools (Blasen, Boost, Impact, Warnung). Low-Profile Frequenz-Reduktion. Mute-Support. Keine Musik-Komposition.
**Nicht im Scope:** neue Audio-Engine
**Dateien (≈):** packages/web/src/features/deep-sea-escape/audio/DeepSeaAudioController.ts (~100 LOC), EffectPool (~80 LOC)
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/audio/
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Audio-Trigger + Pools grün

---

### WP-15: Performance, Profile, Fallback
**Lane:** sonnet · **Effort:** high · **Wave:** 3 · **Abhängig von:** WP-14
**Setup:** git worktree add -b feat/deep-sea-profiles .claude/worktrees/dse3-profiles main
**Scope:** DeepSeaQualityController (High/Medium/Low/Fallback). Memory-Leak-Tests (zwei Puppet-Rigs, Ambient-Loops, Particle-Pools). Spritesheet-Fallback für U-Boot + Monster. Reduced Motion pausiert Ambient-Loops, reduziert Partikel, nutzt Zahlentext. Asset-Unload bei `destroy()`.
**Nicht im Scope:** Netzwerk-Optimierung
**Dateien (≈):** packages/web/src/features/deep-sea-escape/application/DeepSeaQualityController.ts (~160 LOC), Fallback-Manager (~110 LOC), tests
**Gates (verbatim in Report):** cd packages/web && vitest run src/features/deep-sea-escape/application/deep-sea-quality && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — Low Profile + Fallback grün

---

### WP-16: E2E + Telemetrie + Release
**Lane:** sonnet · **Effort:** medium · **Wave:** 3 · **Abhängig von:** WP-15
**Setup:** git worktree add -b feat/deep-sea-e2e .claude/worktrees/dse3-e2e main
**Scope:** E2E-Tests (Level-01 Safe, Level-01 Critical, Monster-Lunge, Level-02, Escape, Caught). Visual Regression. Telemetrie (scene_init_ms, level_transition_ms, event_lag, fps). Feature Flag. Doku (tour, assets, Lizenz). Hidden-Tab-Handling.
**Nicht im Scope:** Prod-Deployment, A/B-Tests
**Dateien (≈):** e2e/deep-sea-escape.spec.ts (~180 LOC), telemetry-adapter (~60 LOC), docs/deep-sea-escape-tour.md
**Gates (verbatim in Report):** cd e2e && npx playwright test deep-sea-escape && pnpm -r run types
**Abgabe:** Commits nur auf Branch, NIE pushen; letzte Zeile WP-REPORT: DONE — E2E + Telemetrie grün
