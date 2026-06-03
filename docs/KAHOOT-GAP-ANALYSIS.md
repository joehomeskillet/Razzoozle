# Gap-Analyse: Razzia (dieser Fork) ↔ echtes Kahoot — Fragetypen

Stand: 2026-06-03. Bezug: Südhang-Personalfest-Quiz.

## Was Razzia heute kann

- **Ein Fragetyp:** Multiple Choice, 2–4 **Text**-Antworten, Spieler tippt **genau eine**.
- `solutions` ist ein Array → mehrere Antworten können „als richtig" gelten, aber
  der Spieler wählt trotzdem nur **eine** (also „eine von mehreren akzeptierten",
  **kein** echtes Multi-Select wie bei Kahoot).
- **Medien in der Frage:** Bild / Video / Audio (URL).
- Pro Frage: Zeit (5–120 s) + Cooldown (3–15 s).
- **Speed-Scoring** (schneller = mehr Punkte) + Streaks, Podium + Sound.
- **Neu in diesem Fork:** `practice`-Flag (0 Punkte), Theming (Hintergründe/Farben).

## Fragetyp-Vergleich

| Kahoot-Typ | Razzia | Lücke / Aufwand |
|---|---|---|
| **Quiz** (MC, 1 richtig, 2–4) | ✅ vorhanden | — |
| **Wahr/Falsch** | ✅ (= 2-Antwort-MC) | trivial; optional 1-Klick-Preset im Editor |
| **Multiple-Select** (ALLE richtigen tippen) | ⚠️ nur teilweise | Backend kennt `solutions[]`, aber Spieler-UI ist Single-Select. Echtes Multi-Select braucht Checkbox-UI + Teil-/All-Scoring. **Mittel** |
| **Type Answer** (Freitext tippen) | ❌ | Text-Input-UI + Antwort-Matching (exakt/fuzzy). **Mittel** |
| **Slider / Zahl schätzen** | ❌ | **Hoher Nutzen für dieses Quiz** (lauter Zahlen-Schätzfragen). Slider-UI + Nähe-Scoring (näher = mehr Punkte). **Mittel** |
| **Puzzle** (Reihenfolge ordnen) | ❌ | Drag-Reorder-UI + Scoring. **Mittel-Hoch** |
| **Umfrage / Poll** (keine richtige Antwort) | ❌ | einfach: MC ohne Wertung (Reuse `practice`-Flag) + Verteilung zeigen. **Niedrig-Mittel** |
| **Word Cloud** | ❌ | Text-Input + Aggregation/Render. **Mittel-Hoch** |
| **Open-Ended / Brainstorm** | ❌ | Text-Input + manuelle Sichtung. **Mittel** |
| **Drop Pin** (Punkt auf Bild) | ❌ | Bild-Koordinaten-Input. **Hoch** |
| **Bild-Antworten** (Antworten sind Bilder) | ❌ | Antworten sind Strings; Bild-Antwort-Support nötig. **Mittel** |
| **Medien in Frage** (Bild/Video/Audio) | ✅ vorhanden | — |

## Weitere Kahoot-Features (jenseits der Typen)

| Feature | Razzia |
|---|---|
| Podium + Musik/SFX | ✅ |
| Leaderboard zwischen Fragen | ✅ |
| Punkte-Streak-Bonus | ✅ |
| Team-Modus | ❌ |
| Nickname-Generator | ❌ |
| Frage-Bank / Wiederverwendung | ❌ (Quiz-Dateien, kein Pool) |
| Doppelte Punkte / Joker | ❌ |
| Branching / adaptive Pfade | ❌ |

## Empfehlung (für dieses Einsatz-Szenario)

Die Südhang-Fragen sind fast alle **Zahlen-Schätzungen**. Priorität:

1. **Slider / „am nächsten gewinnt"** — grösster Gewinn. Statt erfundener MC-Distraktoren
   schätzen alle eine Zahl; Punkte nach Nähe zur echten Antwort. Passt perfekt zu
   „Wie viele WC-Rollen / kWh / Stufen …".
2. **Wahr/Falsch-Preset** — trivial, schnelle Abwechslung.
3. **Umfrage/Poll** (Reuse `practice`-Flag) — für lockere, ungewertete Publikumsfragen.

Type-Answer / Multi-Select sind danach die nächst-sinnvollen. Word Cloud / Drop Pin /
Puzzle sind „nice to have" mit höherem Aufwand.

> Alle „Neu/❌"-Typen sind in diesem Fork umsetzbar (Monorepo: `common` Typen+Validator,
> `socket` Scoring, `web` Spieler-UI + Editor). Der Slider wäre ein gutes nächstes
> Feature analog zum bereits gebauten `practice`-Flag + Theming.
