# Flower Battle: Asset Inventory & Kategorisierung

Dieses Dokument führt das vollständige Asset-Inventar für die Erweiterung „Blüten-Battle" auf und mappet jedes Asset zu einer von drei Kategorien: **fixed gameplay assets**, **decorative background raw materials** oder **audio**. Es dient als verbindliche Referenz vor der Implementation und wird bei jedem Import-Prozess (SDD §36) abgerufen.

**Quellen-Priorität (SDD §32–§33):**
1. Bestehende Razzoozle- / Lucide-Assets
2. Eigene SVG-Geometrie
3. Geprüfte CC0-Rohmaterialien
4. Keine CC-BY / CC-BY-SA bei gleichwertiger CC0-Lösung
5. Keine Kahoot-Grafiken
6. Keine generierten Mockups
7. Keine KI- / Laufzeit-Bildgenerierung

---

## A. Fixed Gameplay Assets (Kanonisch, unmittelbar spieltechnisch)

Diese Assets sind unveränderliche Bestandteile der Spiellogik und werden **nicht** durch das Background-Recipe modifiziert oder ausgetauscht.

### A.1 Fertilizer Power-up (`fertilizer-bag-322313`)
| Feld | Wert |
|------|------|
| **Quelle** | https://www.svgrepo.com/svg/322313/fertilizer-bag |
| **Lizenz** | CC0 per source page |
| **Vorgesehene Nutzung** | Base geometry for fertilizer power-up |
| **Entscheidung** | Redraw/simplify into Razzoozle style |
| **Production Path** | `assets/experiences/flower-battle/optimized/fertilizer.svg` |
| **Erforderliche Änderungen** | Replace mark; currentColor/tokens; named groups and particle anchors |
| **Spieltyp** | Fixed gameplay powerup |
| **Scene Layer** | gameplay-powerup |
| **Sicherheitsconstraints** | Stable anchors and token colors; excluded from background catalog |

**Status:** Geometrie-Referenz; Redraw mit Razzoozle-Stil erforderlich. Anchors für Particle-Effekte explizit definieren.

---

### A.2 Umbrella Power-up (Shape Reference, `umbrella-reference-311232`)
| Feld | Wert |
|------|------|
| **Quelle** | https://svgsilh.com/ffff00/image/311232.html |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Geometry reference for shield umbrella |
| **Entscheidung** | Prefer own simple SVG (Quelle nur als Referenz) |
| **Production Path** | `assets/experiences/flower-battle/optimized/umbrella.svg` |
| **Erforderliche Änderungen** | Rebuild with animated canopy/handle groups |
| **Spieltyp** | Fixed gameplay powerup |
| **Scene Layer** | gameplay-powerup |
| **Sicherheitsconstraints** | Stable anchors and token colors; excluded from background catalog |

**Status:** **NUR Geometrie-Referenz** — keine direkte Übernahme. Eigenes SVG mit animierten Gruppen (Dach/Stiel).

---

### A.3 Weather Shape References (`weather-reference`)
| Feld | Wert |
|------|------|
| **Quelle** | https://commons.wikimedia.org/wiki/File:Weather_icon_-_sun_rain.svg |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Reference for sun/rain shapes (power-up / HUD) |
| **Entscheidung** | Build separate own sun, cloud and droplets (keine direkte Übernahme) |
| **Production Path** | `assets/experiences/flower-battle/optimized/` (separate Files pro Typ) |
| **Erforderliche Änderungen** | No direct import preferred; build canonical own assets |
| **Spieltyp** | Fixed gameplay powerup |
| **Scene Layer** | gameplay-powerup |
| **Sicherheitsconstraints** | Stable anchors and token colors; excluded from background catalog |

**Status:** **NUR Geometrie-Referenz** — Sonne, Wolke und Tropfen als separate kanonische Assets neu bauen. Nicht aus Wikimedia übernehmen.

---

### A.4 Garden Ground Base (`garden-ground-base-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Canonical grass and ground plane immediately around the beds |
| **Entscheidung** | Create once and keep fixed |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/fixed/garden-ground.svg` |
| **Erforderliche Änderungen** | Stable viewBox and anchors |
| **Spieltyp** | Fixed gameplay foreground |
| **Scene Layer** | gameplay-foreground |
| **Sicherheitsconstraints** | Excluded from background recipe |

**Status:** Einmalig erstellen, unveränderlich. Plant/Status-Anchor stabil halten.

---

### A.5 Garden Bed Base (`garden-bed-base-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Canonical team bed geometry |
| **Entscheidung** | Create once and keep fixed |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/fixed/garden-bed.svg` |
| **Erforderliche Änderungen** | Stable plant and status anchors |
| **Spieltyp** | Fixed gameplay foreground |
| **Scene Layer** | gameplay-foreground |
| **Sicherheitsconstraints** | Position and dimensions unchanged across recipes |

**Status:** Team-Bed canonical; kein Seed-Variation. Position/Dimensionen über alle Rezepte stabil.

---

### A.6 Flower Plant Skeleton (`flower-plant-skeleton-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned (React-Komponente) |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Shared plant skeleton and ten growth stages |
| **Entscheidung** | Create once and keep fixed |
| **Production Path** | `packages/web/src/.../experiences/flower-battle/FlowerPlant.tsx` |
| **Erforderliche Änderungen** | Stable stage anchors and four fixed head variants |
| **Spieltyp** | Fixed gameplay foreground |
| **Scene Layer** | gameplay-foreground |
| **Sicherheitsconstraints** | Team variant chosen by existing team identity, not background seed; never transformed or replaced |

**Status:** Wachstumsstufen (0–10) + 4 Kopf-Varianten. Team-Identität bestimmt Aussehen, nicht Background-Seed.

---

### A.7 Power-up Assets Bundle (`flower-battle-powerup-assets-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned with documented CC0 shape references |
| **Lizenz** | MIT/project + documented CC0 references |
| **Vorgesehene Nutzung** | Fertilizer, sunbeam, umbrella and acid-rain canonical visuals |
| **Entscheidung** | Create fixed production assets |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/fixed/` |
| **Erforderliche Änderungen** | Stable named groups and effect anchors |
| **Spieltyp** | Fixed gameplay powerup |
| **Scene Layer** | gameplay-powerup |
| **Sicherheitsconstraints** | Excluded from background recipe and decorative placement |

**Status:** Kanonische Visuals für alle 4 Power-up-Typen. CC0-Shape-Referenzen dokumentieren (§35 Production-Path-Mapping).

---

## B. Decorative Background Raw Materials & Catalogs

Diese Assets sind optional, seed-gesteuert oder kuratiert und werden **ausschliesslich** über das Background-Recipe platziert. Sie ersetzen niemals Gameplay-Assets.

### B.1 Kenney Foliage Pack (`kenney-foliage-pack`)
| Feld | Wert |
|------|------|
| **Quelle** | https://kenney.nl/assets/foliage-pack |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Background bushes, distant tree crowns, grass accents |
| **Entscheidung** | Selective import only; no main plants |
| **Production Path** | `assets/experiences/flower-battle/source/external/` |
| **Erforderliche Änderungen** | Extract selected vectors; remove fixed colors; apply semantic tokens; optimize |
| **Spieltyp** | Seed-selected background raw material |
| **Scene Layer** | decorative-background |
| **Sicherheitsconstraints** | Background safe-zone slots only; never replace plants, beds, items or HUD; bounded scale/mirror |

**Status:** Rohmaterial für Background-Vegetation. Nur ausgewählte Vektoren, feste Farben entfernen, Tokens anwenden.

---

### B.2 Kenney Foliage Sprites (`kenney-foliage-sprites`)
| Feld | Wert |
|------|------|
| **Quelle** | https://kenney.nl/assets/foliage-sprites |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Leaf silhouettes and edge vegetation |
| **Entscheidung** | Use flat variants only |
| **Production Path** | `assets/experiences/flower-battle/source/external/` |
| **Erforderliche Änderungen** | Simplify paths; token colors; optimize |
| **Spieltyp** | Seed-selected background raw material |
| **Scene Layer** | decorative-background |
| **Sicherheitsconstraints** | Background safe-zone slots only; never replace plants, beds, items or HUD; bounded scale/mirror |

**Status:** Nur flache Varianten (keine 3D-Sprites). Pfade vereinfachen, Token-Farben.

---

### B.3 44pes Grass Tileset (`44pes-grass-tileset`)
| Feld | Wert |
|------|------|
| **Quelle** | https://44pes.itch.io/platformer-grass-tileset |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Reference/raw material for lawn and soil edge shapes |
| **Entscheidung** | Do not import complete tileset; select individual shapes |
| **Production Path** | `assets/experiences/flower-battle/source/external/` |
| **Erforderliche Änderungen** | Select individual SVG shapes after style review |
| **Spieltyp** | Seed-selected background raw material |
| **Scene Layer** | decorative-background |
| **Sicherheitsconstraints** | Background safe-zone slots only; never replace plants, beds, items or HUD; bounded scale/mirror |

**Status:** Einzelne Rasen-/Bodenformen, kein vollständiger Tileset-Import.

---

### B.4 Garden Cloud Set (`garden-cloud-set-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Six simple fixed cloud silhouettes |
| **Entscheidung** | Create |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/background/clouds/` |
| **Erforderliche Änderungen** | Named viewBoxes; currentColor/token roles; optimized SVG |
| **Spieltyp** | Seed-selected and positioned |
| **Scene Layer** | decorative-background-clouds |
| **Sicherheitsconstraints** | Select 2–4; bounded x/y, scale and optional mirror; HUD exclusion zone; no overlap with status labels; max four; static under reduced motion |

**Status:** 6 Wolken-Silhouetten, seed-gesteuert. Max. 4 gleichzeitig, HUD-Ausschlusszone beachten.

---

### B.5 Garden Horizon Set (`garden-horizon-set-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned plus curated CC0-derived shapes |
| **Lizenz** | MIT/project + documented CC0 sources |
| **Vorgesehene Nutzung** | Hills, tree line, orchard and low hedge silhouettes |
| **Entscheidung** | Create four canonical modules |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/background/horizons/` |
| **Erforderliche Änderungen** | Flatten, simplify, token-map and document derived source hashes |
| **Spieltyp** | Seed-selected |
| **Scene Layer** | decorative-background-horizon |
| **Sicherheitsconstraints** | Must stay behind fence and fixed gameplay area; no high-detail texture; exactly one module per recipe |

**Status:** 4 kanonische Module (Hügel, Baum-Horizont, Obstgarten, Hecke). CC0-Herkünfte dokumentieren (Source-Hashes). Ein Modul pro Rezept.

---

### B.6 Garden Boundary Set (`garden-boundary-set-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Picket fence, low rail fence and quiet hedge boundary |
| **Entscheidung** | Create three canonical modules |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/background/boundaries/` |
| **Erforderliche Änderungen** | Consistent baseline, viewBox and token roles |
| **Spieltyp** | Seed-selected |
| **Scene Layer** | decorative-background-boundary |
| **Sicherheitsconstraints** | Fixed vertical band; never intersect beds or plant anchors; exactly one module per recipe |

**Status:** 3 Module (Holzzaun, Schienenzaun, Hecke). Ein Modul pro Rezept, vertikale Position stabil.

---

### B.7 Garden Edge Foliage Set (`garden-edge-foliage-set-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Derived selectively from documented Kenney CC0 packs and project-owned geometry |
| **Lizenz** | CC0 derivatives + MIT/project |
| **Vorgesehene Nutzung** | Eight fixed edge foliage clusters |
| **Entscheidung** | Create curated catalog only |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/background/edge-foliage/` |
| **Erforderliche Änderungen** | Simplify paths; stable IDs; define allowed side slots and scale bounds |
| **Spieltyp** | Seed-selected and positioned |
| **Scene Layer** | decorative-background-edge |
| **Sicherheitsconstraints** | Outer 8% width only; never cover team labels, plants, beds or power-up effects; select 2–4 in left/right outer slots; optional mirror |

**Status:** 8 kuratierte Rand-Vegetations-Cluster aus Kenney (dokumentierte Auswahl). Nur äussere 8 % Breite, 2–4 Cluster seed-ausgewählt.

---

### B.8 Garden Distant Features Set (`garden-distant-features-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Small shed, greenhouse and birdhouse silhouettes |
| **Entscheidung** | Create three optional modules |
| **Production Path** | `packages/web/src/assets/experiences/flower-battle/optimized/background/distant-features/` |
| **Erforderliche Änderungen** | Low-detail silhouettes; token colors; fixed background anchors |
| **Spieltyp** | Seed-selected optional |
| **Scene Layer** | decorative-background-feature |
| **Sicherheitsconstraints** | Background only; cannot resemble or replace power-up items; no interaction; select zero or one by stable ID |

**Status:** 3 optionale Module (Schuppen, Gewächshaus, Vogelhaus). Keine Game-Item-Ähnlichkeit.

---

### B.9 Garden Background Recipe (`garden-background-recipe-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Deterministic composition of approved decorative background modules |
| **Entscheidung** | Required |
| **Production Path** | `packages/web/src/.../experiences/flower-battle/background/createGardenBackgroundRecipe.ts` |
| **Erforderliche Änderungen** | Pure seeded function; stable ID selection; versioned fallback; 100-seed tests |
| **Spieltyp** | Seed-derived recipe |
| **Scene Layer** | decorative-background-control |
| **Sicherheitsconstraints** | No gameplay assets; no random RGB; no network; no image generation; no per-question reroll; one recipe per new game; same seed/version always yields identical values |

**Status:** Zentrale Kompositions-Funktion. Deterministisch, vollständig getestet. Keine Laufzeit-Bildgenerierung.

---

### B.10 Garden Sky Palettes (`garden-sky-palettes-v1`)
| Feld | Wert |
|------|------|
| **Quelle** | Project-owned |
| **Lizenz** | MIT/project |
| **Vorgesehene Nutzung** | Four approved bright sky palettes: morning, midday, warm afternoon, soft overcast |
| **Entscheidung** | Create as semantic token presets |
| **Production Path** | `packages/web/src/.../experiences/flower-battle/background/garden-background.catalog.ts` |
| **Erforderliche Änderungen** | Contrast review across all team colors and presenter viewports |
| **Spieltyp** | Seed-selected |
| **Scene Layer** | decorative-background-sky |
| **Sicherheitsconstraints** | Exactly one palette by stable ID; no night/dark preset; no arbitrary colors; gameplay and team tokens unchanged |

**Status:** 4 Paletten (Morgen, Mittag, warmer Nachmittag, weiches Grau). Tokens statt Hex-Werte.

---

## C. Audio Assets

Kandidaten für Ton-Effekte; Importe nur, falls nicht im bestehenden Sound-Repository vorhanden.

### C.1 Fertilizer Granule SFX (`fertilizer-sfx-seeds-235278`)
| Feld | Wert |
|------|------|
| **Quelle** | https://freesound.org/people/Godowan/sounds/235278/ |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Fertilizer granule one-shot |
| **Entscheidung** | Candidate; import only if existing sound library lacks equivalent |
| **Production Path** | `public/sounds/flower-battle/fertilizer.ogg` |
| **Erforderliche Änderungen** | Trim to 0.5–0.8s; reduce glass resonance; normalize; encode |
| **Trigger** | Gameplay event; not selected by garden seed |
| **Sicherheitsconstraints** | Existing volume/mute settings; decorative only |

**Status:** Optional. Erst Razzoozle Sound-Library konsultieren.

---

### C.2 Sunbeam / Growth Magic SFX (`sunbeam-sfx-817466`)
| Feld | Wert |
|------|------|
| **Quelle** | https://freesound.org/people/qubodup/sounds/817466/ |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Sunbeam/growth magic one-shot |
| **Entscheidung** | Candidate |
| **Production Path** | `public/sounds/flower-battle/sunbeam.ogg` |
| **Erforderliche Änderungen** | Trim to 0.8–1.2s; loudness limit; encode |
| **Trigger** | Gameplay event; not selected by garden seed |
| **Sicherheitsconstraints** | Existing volume/mute settings; decorative only |

**Status:** Optional.

---

### C.3 Acid Rain Effect SFX (`acid-rain-sfx-789160`)
| Feld | Wert |
|------|------|
| **Quelle** | https://freesound.org/people/FOSSarts/sounds/789160/ |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Short acid-rain effect |
| **Entscheidung** | Candidate |
| **Production Path** | `public/sounds/flower-battle/acid-rain.ogg` |
| **Erforderliche Änderungen** | Extract 0.8–1.5s; no loop; EQ if needed; encode |
| **Trigger** | Gameplay event; not selected by garden seed |
| **Sicherheitsconstraints** | Existing volume/mute settings; decorative only |

**Status:** Optional.

---

### C.4 Final Bloom Sparkle SFX (`bloom-sfx-578803`)
| Feld | Wert |
|------|------|
| **Quelle** | https://freesound.org/people/nomiqbomi/sounds/578803/ |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Final bloom sparkle |
| **Entscheidung** | Candidate; prefer existing Razzoozle chime |
| **Production Path** | `public/sounds/flower-battle/bloom.ogg` |
| **Erforderliche Änderungen** | Trim and normalize only if imported |
| **Trigger** | Gameplay event; not selected by garden seed |
| **Sicherheitsconstraints** | Existing volume/mute settings; decorative only |

**Status:** Optional. Zunächst Razzoozle Glocken-Library prüfen.

---

## D. MVP-Ausschluss & Fallback-Only

### D.1 Watering-Can Power-up (NICHT IN MVP; `watering-can-118774`)
| Feld | Wert |
|------|------|
| **Quelle** | https://www.svgrepo.com/svg/118774/garden-watering-can |
| **Lizenz** | CC0 per source page |
| **Vorgesehene Nutzung** | Future watering-can power-up or small decoration |
| **Entscheidung** | **Not part of MVP** |
| **Production Path** | Not imported for MVP |
| **Erforderliche Änderungen** | None until feature approved |
| **Status** | Reserve feature; indefinite hold |

**Status:** Explizit aus MVP ausgeschlossen bis zur Feature-Genehmigung.

---

### D.2 Nieobie Icon Pack (FALLBACK-ONLY; `nieobie-game-icons`)
| Feld | Wert |
|------|------|
| **Quelle** | https://nieobie.itch.io/free-icons |
| **Lizenz** | CC0 |
| **Vorgesehene Nutzung** | Fallback only when Lucide lacks neutral UI icon |
| **Entscheidung** | Never import full pack; only exact selected SVGs |
| **Production Path** | Only exact selected SVGs (bei Bedarf) |
| **Erforderliche Änderungen** | Verify no existing Lucide/Razzoozle equivalent first |
| **Status** | UI reference; fallback-only |

**Status:** **KEIN Massen-Import.** Nur bei explizitem Lucide-Fehl-Fall und Razzoozle-Äquivalent-Check.

---

## E. Offene Prüfpunkte & Abweichungen zu SDD §35 / §36

### E.1 CC0-Verifikation (svgrepo-Einträge)

Die folgenden Einträge werden als **CC0 per source page** geführt; die svgrepo-Einträge sind aber zu validieren:

- **fertilizer-bag-322313** (svgrepo)
- **watering-can-118774** (svgrepo)

**Prüfpunkt:** Bei Import müssen die Source-Links auf svgrepo.com live verifiziert werden, dass CC0 tatsächlich gilt (nicht CC-BY, CC-BY-SA oder proprietär).

### E.2 Razzoozle Sound Library Abgleich (Audio-Kandidaten)

Alle vier Audio-Dateien sind gekennzeichnet als „Candidate; import only if existing sound library lacks equivalent". **Prüfpunkt:**

1. Aktuelle Razzoozle Sound-Library unter `public/sounds/` auflisten
2. Äquivalente Effekte identifizieren (bereits vorhanden?)
3. Nur abweichende Kandidaten importieren

### E.3 SDD §36 Import-Gate (20-Punkte-Checkliste)

Das vollständige 20-Punkte-Import-Gate (SDD §36) ist in [flower-battle-import-gate-checklist.md](./flower-battle-import-gate-checklist.md) dokumentiert. Dieses Dokument endet mit einer Aufforderung, §36 nachzulesen, falls das ursprüngliche Gitea-Ticket #949 verfügbar ist.

### E.4 Visual-Asset-Budget

**Expliziter Prüfpunkt:** Gesamt-Package **<500 KB unkomprimiert**, **<190 KB gzip initial**. Wird bei jedem Import-Durchlauf überprüft (SDD §36, Punkt 17–18).

### E.5 Production Path Mapping (SDD §35)

Die Production-Paths in Spalte 7 sind an die tatsächliche Repo-Struktur unter `packages/web/src/assets/experiences/flower-battle/` gemappt:

- **Gameplay-Assets:** `optimized/fixed/`
- **Seed-Rezept & Kataloge:** `optimized/background/<category>/`
- **Externe Quellen:** `source/external/` (vor der Kurierung)
- **Audio:** `public/sounds/flower-battle/`
- **Code (Rezept, Paletten):** `packages/web/src/.../experiences/flower-battle/background/`

**Abweichungen / Lücken:** Keine gemappt; alle Paths sind konsistent mit dem CSV und dem typischen Razzoozle-Muster.

---

## F. Zitierte CSV-Spalten Übersicht

Für Referenz; vollständig in der Quell-CSV:

| Spalte | Bedeutung |
|--------|-----------|
| **id** | Eindeutige Asset-ID |
| **type** | Kategorietyp (visual-source, powerup-icon, sound, code-catalog, etc.) |
| **source** | URL oder „project-owned" |
| **license** | CC0, MIT/project, etc. |
| **planned_use** | Beschreibung der Verwendung |
| **decision** | Import-Status (Import, Redraw, Reference-only, Not imported for MVP) |
| **production_path** | Zielverzeichnis im Repo |
| **required_changes** | Transformationen vor Produktionsgebrauch |
| **runtime_variability** | Seed-selected / fixed / etc. |
| **scene_layer** | Gameplay / decorative / audio |
| **selection_behavior** | Wie das Asset platziert wird |
| **safety_constraints** | Spielregeln für die Platzierung |

---

**Dokumentversion:** WP #934 feat/flower-battle-asset-inventory-gate  
**Zuletzt aktualisiert:** 2026-07-30  
**Nächster Prozessschritt:** Import-Gate-Checkliste (SDD §36) durchlaufen vor jedem Asset-Importer-Commit.
