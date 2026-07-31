# Flower Battle: Third-Party License Sources

Dieses Dokument katalogisiert alle Drittquellen-Assets (externe Downloads, CC0-Material, Shape-Referenzen) für die Blüten-Battle-Erweiterung. Es ist eine **Ergänzung** zu `../../../../../../THIRD_PARTY_LICENSES.md` und enthält nur Flower-Battle-spezifische Einträge.

**Format-Referenz:** Siehe `packages/web/THIRD_PARTY_LICENSES.md` (Haupt-Projekt-Lizenz-Datei); dieses Dokument folgt der gleichen Struktur.

---

## Struktur

Jeder Eintrag folgt diesem Format:

```markdown
### <Asset-Name> (<asset-id>)

**Quelle:** <URL>
**Lizenz:** <CC0 / CC-BY / CC-BY-SA / MIT / etc.>
**Abrufdatum:** YYYY-MM-DD
**Commit-SHA:** <wenn importiert>
**Verwendung:** <Beschreibung>
**Status:** [Imported | Reference-only | Not Imported for MVP]
**Farb-Token-Review:** [Reviewer, Datum] oder [Ausstehend]

#### Erforderliche Änderungen
- <Transformation 1>
- <Transformation 2>

#### Notizen
- <Kontext oder Alternativen>
```

---

## Externe Quellen & CC0 Raw-Material

Diese Einträge sind als **Vorlagen** zu sehen, die vor dem Commit mit echten Import-Daten gefüllt werden.

### Kenney Foliage Pack (`kenney-foliage-pack`)

**Quelle:** https://www.kenney.nl/assets/foliage-pack
**Lizenz:** CC0
**Abrufdatum:** [TBD — bei Import erfassen]
**Commit-SHA:** [TBD]
**Verwendung:** Decorative background vegetation (bushes, grass, distant trees)
**Status:** [Imported | Pending | Reference-only]
**Farb-Token-Review:** [Ausstehend]

#### Erforderliche Änderungen
- Extract selected vectors only (no complete pack import)
- Remove fixed colors; replace with semantic tokens (--accent-tint, --flower-foliage-primary, etc.)
- Optimize SVG paths with SVGO
- Define stable asset IDs and selection criteria for background recipe

#### Notizen
- Kenney assets sind hochwertig; keine alternativen Quellen erforderlich
- Farb-Anpassung mandatory vor Production-Integration

---

### Kenney Foliage Sprites (`kenney-foliage-sprites`)

**Quelle:** https://www.kenney.nl/assets/foliage-sprites
**Lizenz:** CC0
**Abrufdatum:** [TBD]
**Commit-SHA:** [TBD]
**Verwendung:** Leaf silhouettes, edge vegetation
**Status:** [Imported | Pending | Reference-only]
**Farb-Token-Review:** [Ausstehend]

#### Erforderliche Änderungen
- Use flat variants only (no 3D or isometric sprites)
- Simplify paths for web rendering
- Apply semantic tokens for colors
- Optimize for reduced-motion mode

#### Notizen
- Sprites-Pack ist grösser; selective curation essential

---

### 44pes Grass Tileset (`44pes-grass-tileset`)

**Quelle:** https://44pes.itch.io/platformer-grass-tileset
**Lizenz:** CC0
**Abrufdatum:** [TBD]
**Commit-SHA:** [TBD]
**Verwendung:** Reference for lawn and soil edge shapes
**Status:** [Reference-only | Selected SVGs pending import]
**Farb-Token-Review:** [Ausstehend]

#### Erforderliche Änderungen
- Do NOT import complete tileset
- Select individual SVG shapes after style review
- Adapt to Razzoozle garden aesthetic
- Ensure compatibility with team-bed geometry

#### Notizen
- Tileset ist platformer-specific; Blüten-Battle hat anderes Kompositions-Paradigma
- Use only as geometric reference, nicht als direkte Übernahme

---

## Shape-Referenzen & Geometrie-Vorlagen

Diese sind **Referenzen nur**, keine direkten Importe:

### Umbrella Shape Reference (`umbrella-reference-311232`)

**Quelle:** https://svgsilh.com/ffff00/image/311232.html
**Lizenz:** CC0
**Abrufdatum:** [TBD, falls konsultiert]
**Commit-SHA:** [N/A — nicht importiert]
**Verwendung:** Geometric inspiration for umbrella power-up canopy and handle groups
**Status:** Reference-only — eigenes SVG gebaut
**Farb-Token-Review:** N/A

#### Notizen
- Decision: Prefer own simple SVG (nicht direkte Übernahme)
- Razzoozle-Umbrella wird mit benannten Gruppen für Animationen aufgebaut
- svgsilh-Quelle war bloss Formenvorlage

---

### Weather Shape Reference (`weather-reference`)

**Quelle:** https://commons.wikimedia.org/wiki/File:Weather_icon_-_sun_rain.svg
**Lizenz:** CC0
**Abrufdatum:** [TBD, falls konsultiert]
**Commit-SHA:** [N/A — nicht importiert]
**Verwendung:** Geometric reference for sun, cloud, and rain droplet shapes
**Status:** Reference-only — separate canonical Razzoozle assets gebaut
**Farb-Token-Review:** N/A

#### Notizen
- Decision: Build separate own sun, cloud, and droplets (keine Wikimedia-Übernahme)
- Ermöglicht volle Kontrolle über Animationen und Token-Integration

---

## Fallback-Only Icons

### Nieobie Icon Pack (`nieobie-game-icons`)

**Quelle:** https://nieobie.itch.io/free-icons
**Lizenz:** CC0
**Abrufdatum:** [TBD, nur bei Bedarf]
**Commit-SHA:** [TBD, falls einzelne Icons importiert]
**Verwendung:** Fallback UI icons only if Lucide lacks neutral equivalent
**Status:** Fallback-only — kein Massen-Import
**Farb-Token-Review:** [Per Import-Instanz]

#### Erforderliche Änderungen
- Verify no existing Lucide or Razzoozle equivalent first
- Import only exact single SVG files (never the whole pack)
- Apply semantic tokens for colors
- Maintain consistency with existing Razzoozle icon style

#### Notizen
- Nieobie ist gutes Fallback-Set, aber Lucide ist Primär-Quelle
- Nur bei explizitem Design-Fehler fallback-Aktion

---

## CC0-Lizenzverifizierung (svgrepo)

### Fertilizer Bag Icon (`fertilizer-bag-322313`)

**Quelle:** https://www.svgrepo.com/svg/322313/fertilizer-bag
**Lizenz:** CC0 per source page (zu verifizieren)
**Abrufdatum:** [TBD — bei Import]
**Commit-SHA:** [TBD]
**Verwendung:** Base geometry for fertilizer power-up
**Status:** [Imported | Pending Redraw | Queued]
**Farb-Token-Review:** [Ausstehend]

#### Erforderliche Änderungen
- Redraw/simplify into Razzoozle style
- Replace mark with Razzoozle font-icon or vector
- Apply semantic tokens (currentColor/--flower-powerup-primary)
- Define particle-origin and effect-anchor named groups

#### Verifikations-Checkliste
- [ ] svgrepo source page verifizieren: CC0 (nicht CC-BY/CC-BY-SA)?
- [ ] Abrufdatum dokumentieren
- [ ] Lizenz-String speichern (für THIRD_PARTY_LICENSES.md)

#### Notizen
- Svgrepo hat gute Qualität; CC0-Verifikation ist der kritischste Schritt

---

### Watering-Can Icon (`watering-can-118774`)

**Quelle:** https://www.svgrepo.com/svg/118774/garden-watering-can
**Lizenz:** CC0 per source page (zu verifizieren)
**Abrufdatum:** [N/A — nicht in MVP]
**Commit-SHA:** [N/A]
**Verwendung:** [Reserve für zukünftige watering-can power-up]
**Status:** Not imported for MVP
**Farb-Token-Review:** N/A

#### Notizen
- Ist explizit aus dem MVP ausgeschlossen
- Wird erst verifiziert, wenn die Watering-Can-Feature genehmigt ist (SDD-Nachlass)

---

## Audio Assets (Kandidaten)

### Fertilizer Granule One-Shot (`fertilizer-sfx-seeds-235278`)

**Quelle:** https://freesound.org/people/Godowan/sounds/235278/
**Lizenz:** CC0
**Abrufdatum:** [TBD, nur bei Import]
**Commit-SHA:** [TBD]
**Dateiname:** `public/sounds/flower-battle/fertilizer.ogg`
**Verwendung:** Feedback sound when fertilizer power-up collected
**Status:** Candidate — nur wenn Razzoozle sound library kein Äquivalent hat
**Verifikation:** [Ausstehend]

#### Erforderliche Änderungen
- Trim to 0.5–0.8s
- Reduce glass resonance (EQ)
- Normalize to -14 LUFS
- Encode to OGG Vorbis 64 kbps (oder Projekt-Standard)

---

### Sunbeam / Growth Magic (`sunbeam-sfx-817466`)

**Quelle:** https://freesound.org/people/qubodup/sounds/817466/
**Lizenz:** CC0
**Abrufdatum:** [TBD, nur bei Import]
**Commit-SHA:** [TBD]
**Dateiname:** `public/sounds/flower-battle/sunbeam.ogg`
**Verwendung:** Sunbeam / growth magic effect feedback
**Status:** Candidate
**Verifikation:** [Ausstehend]

#### Erforderliche Änderungen
- Trim to 0.8–1.2s
- Loudness limit: -14 LUFS
- Encode to OGG Vorbis

---

### Acid Rain Effect (`acid-rain-sfx-789160`)

**Quelle:** https://freesound.org/people/FOSSarts/sounds/789160/
**Lizenz:** CC0
**Abrufdatum:** [TBD, nur bei Import]
**Commit-SHA:** [TBD]
**Dateiname:** `public/sounds/flower-battle/acid-rain.ogg`
**Verwendung:** Acid-rain weather effect
**Status:** Candidate
**Verifikation:** [Ausstehend]

#### Erforderliche Änderungen
- Extract 0.8–1.5s segment
- No looping
- EQ if needed to reduce harshness
- Normalize and encode to OGG Vorbis

---

### Bloom Sparkle (`bloom-sfx-578803`)

**Quelle:** https://freesound.org/people/nomiqbomi/sounds/578803/
**Lizenz:** CC0
**Abrufdatum:** [TBD, nur bei Import]
**Commit-SHA:** [TBD]
**Dateiname:** `public/sounds/flower-battle/bloom.ogg`
**Verwendung:** Final bloom sparkle feedback
**Status:** Candidate — prefer existing Razzoozle chime
**Verifikation:** [Ausstehend]

#### Notizen
- Check existing Razzoozle chime library first
- Nur wenn kein äquivalenter Ton vorhanden

---

## Ergänzungs-Leitfaden

**Bei jedem neuen Asset-Import:**

1. CSV-Zeile aus [flower-battle-asset-inventory.md](../flower-battle-asset-inventory.md) in dieses Dokument kopieren
2. Alle `[TBD]`-Platzhalter mit echten Werten füllen
3. `Abrufdatum` im Format `YYYY-MM-DD` erfassen (Importtag)
4. Nach Import: `Commit-SHA` nachtragen (aus `git log --oneline`)
5. `Farb-Token-Review` durchlaufen (Design-Review erforderlich)
6. Diesen Datei-Eintrag in `packages/web/THIRD_PARTY_LICENSES.md` auch eintragen (bei Bedarf verkürzt)

**Versionskontrolle:** Dieses Dokument wird mit jedem Asset-Importer-Commit aktualisiert.

---

## Verwandte Dokumente

- **Asset-Inventory & Kategorisierung:** `docs/design/flower-battle-asset-inventory.md`
- **Import-Gate-Checkliste (SDD §36):** `docs/design/flower-battle-import-gate-checklist.md`
- **Projekt-Haupt-Lizenz-Datei:** `packages/web/THIRD_PARTY_LICENSES.md`
- **Design-Tokens Referenz:** `design.md` (Projekt-Root)

---

## Atmosphären-Assets für den Blüten-Battle-Presenter (WP-PRESENTER-1)

Die folgenden 15 Atmosphären-SVGs wurden für den Blüten-Battle-Presenter
(WP-PRESENTER-1) selbst generiert und liegen unter
`packages/web/src/assets/experiences/flower-battle/optimized/fixed/`. Sie sind
Razzoozle-internal CC0 und verwenden ausschliesslich `currentColor` +
`var(--sky-color-*)` / `var(--line)` Token-Referenzen — keine hardcodierten
Produktionsfarben.

### Sky Day (`bg-sky-day`)

**Quelle:** selbst generiert (Razzoozle-internal)
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A — selbst generiert
**SHA-256:** `d9050409cf6db162f1fac1bea347f11559b8ac2d641c63f9fec4963d5f61dadf`
**Datei:** `optimized/fixed/sky-day.svg`
**Verwendung:** Stage-Backdrop (1920×1080, 16:9)
**Status:** Imported
**Farb-Token-Review:** Self-reviewed, token-only (currentColor + var(--sky-color-*))

### Cloud Soft 01 (`bg-cloud-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `8a26fc165784a45c22811f8e5db52499cefad4c18a3188057aade1ccd50f9abe`
**Datei:** `optimized/fixed/cloud-soft-01.svg`
**Verwendung:** Grosse Wolke, Sky-Layer (320×120)
**Status:** Imported

### Cloud Soft 02 (`bg-cloud-02`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `f2b3c0ad6d59125ead69550df87612f3718df5c3c3f3e897e01a754be336a443`
**Datei:** `optimized/fixed/cloud-soft-02.svg`
**Verwendung:** Mittelgrosse Wolke (280×100)
**Status:** Imported

### Cloud Soft 03 (`bg-cloud-03`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `3cd390e4fc80e847d67b20a198baf771b2dcd6e1c3ac3ce2683a4f9f1166cdfc`
**Datei:** `optimized/fixed/cloud-soft-03.svg`
**Verwendung:** Breite Wolke (360×140)
**Status:** Imported

### Sun Glow (`bg-sun-glow`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `c3a8a3a125d9000700ebffe0f3a9ce5c5ac58aed42042dbe9124c2e0ae423114`
**Datei:** `optimized/fixed/sun-glow.svg`
**Verwendung:** Cartoon-Sonne mit Strahlenkranz (256×256)
**Status:** Imported

### Distant Hills 01 (`bg-hill-back-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `5174835ddedacc9125b3b39a917b605b48e8b2aa99f77feaca67ebf27a005c8b`
**Datei:** `optimized/fixed/distant-hills-01.svg`
**Verwendung:** Hügel-Silhouette Parallax-Back (1920×400)
**Status:** Imported

### Distant Bushes 01 (`bg-bush-back-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `c0f557d870c3c203f26f5660b3cd50ab39a64caf72692070e344e3c195a0c102`
**Datei:** `optimized/fixed/distant-bushes-01.svg`
**Verwendung:** Buschreihe Parallax-Back (1920×300)
**Status:** Imported

### Mid Trees 01 (`bg-tree-mid-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `0c0ab49f1dc5a871cd1bb3ffc12e66f1bf45cae390fce6c8d195129bf34588b1`
**Datei:** `optimized/fixed/mid-trees-01.svg`
**Verwendung:** Baumkronen-Reihe Parallax-Mid (1920×350)
**Status:** Imported

### Fence White 01 (`env-fence-white`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `255547cdc9d87e358fc93e1bf32f9d9c57a5224450c18b6747df8e261f4d3ba7`
**Datei:** `optimized/fixed/fence-white-01.svg`
**Verwendung:** Weisser Lattenzaun, frontal (1920×200)
**Status:** Imported

### Lawn 01 (`env-grass-base`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `8e24d67bc5b87f63f0c0b2adce135da44da727f905fb715a96367e93191bc9e5`
**Datei:** `optimized/fixed/lawn-01.svg`
**Verwendung:** Rasenfläche Vordergrund (1920×600)
**Status:** Imported

### Lawn Detail Grass Tufts 01 (`env-grass-detail-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `5e7f6876da49e54d7c1c62d4ba235d76e73137e70b51cc2063eb55151ae50f9a`
**Datei:** `optimized/fixed/lawn-detail-grass-tufts-01.svg`
**Verwendung:** Grasbüschel-Cluster Overlay (400×200)
**Status:** Imported

### Soil Plot Team 01 (`env-soil-plot-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `63a2dea68c2b550cb6d6502beeb69d7f68a57a8f9519ee948491777427bb5bb0`
**Datei:** `optimized/fixed/soil-plot-team-01.svg`
**Verwendung:** Erd-Hügel Basis für Team-Plot (240×100)
**Status:** Imported

### Foreground Leaf Left (`env-foreground-leaf-left`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `c2993c8f74ad78ecf0d6234b12e7d0d13b03ce9ffe2e0b4f6e93498ffb3a3043`
**Datei:** `optimized/fixed/foreground-leaf-left.svg`
**Verwendung:** Vordergrund-Blatt links, Parallax-Front (300×400)
**Status:** Imported

### Foreground Leaf Right (`env-foreground-leaf-right`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `6998cf3112b23be3dcc3ef66464e5edf115c9fa31f7209dd88f9ed9b0a7cfca6`
**Datei:** `optimized/fixed/foreground-leaf-right.svg`
**Verwendung:** Vordergrund-Blatt rechts, Parallax-Front (300×400)
**Status:** Imported

### Foreground Bush 01 (`env-foreground-bush-01`)

**Quelle:** selbst generiert
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**SHA-256:** `7b7b724a534aeec8336bb9db962ae240a92ee2fb23f048ace398892259ac8dcb`
**Datei:** `optimized/fixed/foreground-bush-01.svg`
**Verwendung:** Vordergrund-Busch einzeln (200×200)
**Status:** Imported

### Generierungs-Manifest (`garden-asset-manifest.json`)

**Quelle:** self-generated via `scripts/generate-manifest.mjs`
**Lizenz:** CC0 (Razzoozle-internal)
**Abrufdatum:** 2026-07-31
**Commit-SHA:** N/A
**Verwendung:** Deterministisches JSON-Manifest mit Alias-Map, SHA-256 pro Datei, Lizenz, Status, ViewBox-Geometrie; gelesen von WP-PRESENTER-2 (Pixi-Manifest) und WP-PRESENTER-3 (GardenScene).
**Status:** Imported
**Reproduzierbarkeit:** `pnpm --filter @razzoozle/web garden:manifest` regeneriert deterministisch (sortiert nach Alias, dann Dateiname).

---

**Dokumentversion:** WP #934 feat/flower-battle-asset-inventory-gate + WP-PRESENTER-1
**Zuletzt aktualisiert:** 2026-07-31 (15 Atmosphären-SVGs + Manifest ergänzt)
**Nächste Aktion:** Bei weiteren Asset-Importer-Commits alle `[TBD]`-Felder mit echten Werten füllen
