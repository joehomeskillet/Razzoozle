# ADR 007: HTTP-API-Dokumentationsstrategie

**Status:** Angenommen  
**Datum:** 2026-07-29  
**Autor:** Architecture Review  

---

## Kontext

Der Razzoozle-Server bietet eine HTTP-Schnittstelle mit circa 51 Routen (Health-Checks, Login, Benutzerverwaltung, Solo-Quiz-Abwicklung, Observability). Diese Routen werden in `rust/server/src/http/mod.rs` mit Axum registriert und von der Web-Clientanwendung (`packages/web`) konsumiert.

Die Frage stellt sich: Wie wird die HTTP-Schnittstelle maschinenlesbar dokumentiert?

### Aktueller Ist-Zustand (Audit 2026-07-29)

1. **OpenAPI-Generator existiert:** `packages/common/src/openapi/doc.ts` enthält einen `buildOpenApiDoc(routes: RouteDoc[])`-Generator, der OpenAPI 3.1.0-JSON aus einer Route-Tabelle + Zod-Schemas erzeugt.

2. **Der Generator wird nicht aufgerufen:** 
   - Die TypeScript-Funktion wird nirgends importiert oder ausgeführt.
   - Es gibt keinen Rust-Handler `/api/openapi.json`, um das generierte Dokument zu servieren.
   - Dokumentation (`docs/sdd/game-solo-multiplayer-refactor/phase0-gaps-and-duplication.md`, G17) nennt dies explizit "Dead OpenAPI route".

3. **Keine Rust-seitige OpenAPI-Generation:**
   - Es gibt keine utoipa, aide oder sonstige OpenAPI-Generierungs-Dependency im Rust-Projekt.
   - HTTP-Handler haben keine Attribute zur Dokumentation.

4. **Validator-Infrastruktur ist veraltet:**
   - `packages/common/src/validators/solo.ts` enthält `soloScoreSubmitValidator`, der nach der SEC-05-Rewrite stale ist (dokumentiert alte `correct`-trusting Payload, nicht die aktuelle `answerId`/`answerIds`-Struktur).
   - `packages/common/src/validators/assignment.ts` wird nirgends außer in `openapi/doc.ts` importiert.
   - Diese Validatoren dienen **nur** der OpenAPI-Dokumentation, die nicht aktiv ist.

5. **Nur interner Konsument:**
   - Die HTTP-Schnittstelle wird ausschließlich vom eigenen Web-Client (`packages/web`) genutzt.
   - Typen werden über TypeScript-Importe gelöst; es gibt keine externen Konsumenten, die maschinenlesbare Dokumentation bräuchten.

6. **Alternative Dokumentation existiert:**
   - MCP-Server (`packages/mcp`) teilt Zod-Schemas mit `packages/common/validators/` und dient als Alternative für externe Tool-Integration.
   - HTTP-Routen werden durch Code-Kommentare und Integrationstests dokumentiert.

---

## Entscheidung

**Die HTTP-Schnittstelle wird NICHT durch OpenAPI dokumentiert.** Die HTTP-API wird auf drei Wegen beschrieben:

1. **Code-Kommentare:** HTTP-Handler in `rust/server/src/http/` tragen aussagekräftige Kommentare zu Zweck, Authentisierung, Fehlerbehandlung.
2. **TypeScript-Integrationstests:** `packages/web/src/**/*.test.ts` und `source/e2e/` validieren Request/Response-Verträge durch Live-Aufrufe.
3. **MCP-Schnittstelle:** Der MCP-Server (`packages/mcp`) dokumentiert domänenspezifische Datentypen über Zod-Schemas und dient als das maschinenlesbare Interface für externe Tools (z.B. CLI, Browser-Extensions).

Das heißt konkret:

- **OpenAPI wird nicht produziert:** `packages/common/src/openapi/doc.ts` wird gelöscht. Wer Bedarf für externe HTTP-Dokumentation hat, wird utoipa oder aide direkt in Rust einführen (zusammen mit den HTTP-Routen gepflegt, nicht in TypeScript).
- **Validator-Dateien, die nur OpenAPI bedienen, werden bereinigt:** Stale Validatoren wie `soloScoreSubmitValidator` und `assignmentValidator` werden entfernt, wenn sie nicht anderswo importiert werden.
- **Dokumentation wird korrigiert:** Alle Erwähnungen von "OpenAPI wird bedient" oder "OpenAPI könnte aktiviert werden" werden aus `docs/sdd/` und anderen Teilen des Repos entfernt oder korrigiert.

---

## Konsequenzen

### Positiv

- **Weniger tote Code:** Eine nicht-aufgerufene Generierungs-Pipeline wird beseitigt.
- **Validator-Hygiene:** Stale Zod-Schemas (die falsche Payload-Formen dokumentieren) werden nicht mehr im Repo gepflegt.
- **Klare Architektur:** Das MCP-Interface ist die explizite, gepflegte Stelle für externe Tool-Integration; HTTP-Verträge sind für den Web-Client implizit (direkte TS-Importe) oder explizit in Rust (via utoipa, wenn echte externe Consumer kommen).
- **Wartungsreduktion:** Routen + HTTP-Dokumentation müssen nicht in zwei Sprachen synchron bleiben.

### Umsetzung (erforderlich)

1. **Lösche `packages/common/src/openapi/doc.ts`** — die Datei wird nicht genutzt.
2. **Prüfe Validator-Importe:**
   - `grep -rn "soloScoreSubmitValidator\|assignmentValidator" packages/` (außer in openapi/doc.ts)
   - Falls nur in `openapi/doc.ts` importiert: aus `packages/common/src/validators/*.ts` löschen.
   - Falls anderswo importiert: behalte, aber aktualisiere auf die aktuelle Payload-Form (POST-SEC-05).
3. **Dokumentation korrigieren:** In `docs/sdd/game-solo-multiplayer-refactor/` und `docs/rezept-neuer-fragetyp.md` alle Bezüge auf "OpenAPI wird bedient" oder "OpenAPI-Generator tut X" entfernen oder klarstellen, dass OpenAPI nicht aktiv ist.
4. **Developer Experience:** Im `AGENTS.md` dokumentieren: "HTTP-Verträge sind in Rust-Kommentaren + Tests dokumentiert, nicht in OpenAPI. Externe Tool-Integration geht über MCP (`packages/mcp`)."

### Risiken

- **Fehlende formale Schnittstellen-Dokumentation:** Wenn später externe Consumer kommen (z.B. andere Frontend, Mobile App), wird man utoipa/aide in Rust nachträglich hinzufügen müssen. Das ist akzeptabel, da dieser Fall nicht besteht und die technische Schuld minimal ist.
- **Validator-Drift:** Wenn Validator-Dateien im Repo bleiben und nicht regelmäßig gepflegt werden, können sie veraltern. Mittel: Regelmäßige Audits im Code-Review.

---

## Alternativen

### A1: OpenAPI aktivieren (nicht gewählt)

Würde Infrastruktur bauen, um die HTTP-Routen in TypeScript oder Rust formal zu dokumentieren:
- **TypeScript-Weg:** `buildOpenApiDoc()` aufrufen, HTTP-Handler registrieren, RouteDoc-Tabelle bei jeder Änderung synchonisieren. Nachteil: Doppelte Dokumentation (Code + RouteDoc), Drift-Risiko.
- **Rust-Weg:** utoipa oder aide einführen, alle Handler annotieren. Nachteil: Nicht triviale Einrichtung, Abhängigkeit hinzufügen.

Begründung Ablehnung: Der einzige Konsument (Web-Client) braucht keine OpenAPI. Externe Consumer sind nicht in Sicht. Der Aufwand wäre nicht null und die Nutzen-Aufwand-Ratio ungünstig.

### A2: OpenAPI später (nicht gewählt)

OpenAPI aus dem Repo entfernen, wenn später externe Consumer kommen, utoipa einführen.

Begründung Ablehnung: Fällt unter diese Entscheidung — wir entfernen es jetzt, nicht später. "Später" ist meist nie, und toter Code ist Schuld.

### A3: Nur MCP (nicht gewählt, aber ähnlich der Entscheidung)

HTTP-Dokumentation ganz ausblenden, nur MCP als Interface für externe Tools.

Begründung Ablehnung: MCP ist für domänenspezifische Operationen (Quiz-Verwaltung via LLM-Agent), nicht für Raw-HTTP. HTTP-Schnittstelle bleibt (Health, Solo-Quiz-Spielfluss), braucht aber keine maschinenlesbare Dokumentation, solange der Client sie direkt nutzt.

---

## Verweise

- Generator (wird gelöscht): `packages/common/src/openapi/doc.ts`
- Stale Validatoren (zu prüfen): `packages/common/src/validators/solo.ts`, `packages/common/src/validators/assignment.ts`
- HTTP-Handler: `rust/server/src/http/mod.rs` (~51 Routen)
- Dokumentation (zu korrigieren): `docs/sdd/game-solo-multiplayer-refactor/phase0-gaps-and-duplication.md` (G17), `docs/rezept-neuer-fragetyp.md` (Zeile 142)
- MCP-Server: `packages/mcp/src/`

---

## Nächste Schritte

1. **Lösche `packages/common/src/openapi/doc.ts`** mit neuer commit message.
2. **Audit Validator-Importe** — entferne Validatoren, die nur von gelöschtem openapi/doc.ts genutzt werden.
3. **Korrigiere Dokumentation** — entferne Bezüge zu "OpenAPI wird bedient" in `docs/sdd/`.
4. **Dokumentiere im `AGENTS.md`** — klarstelle, dass HTTP-Dokumentation nicht OpenAPI ist.
