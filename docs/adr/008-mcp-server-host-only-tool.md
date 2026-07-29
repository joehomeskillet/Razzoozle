# ADR 008: MCP Server als Host-Only Development Tool

## Status
Angenommen

## Kontext
Das Paket `@razzoozle/mcp` implementiert einen Model Context Protocol (MCP) stdio server für projektspezifische Entwicklungs- und Administrationsfunktionen: Quiz-Authoring (inkl. AI-Bildgenerierung), Live-Game-Kontrolle und Game-Master-Aktionen. Das Paket existiert seit mehreren Releases und hat Build-Skripte (`esbuild` Bundling), TypeScript-Konfiguration und aktive Abhängigkeiten auf `@modelcontextprotocol/sdk@1.25.3` und `@razzoozle/common`.

Die Frage ist, ob dieses Paket als produktiver Bestandteil des Monorepos gilt oder als Experiment/temporäre Altlast zu behandeln ist — mit direkten Konsequenzen für:
- **Workspace-Inclusion**: Driftet die pnpm-lock.yaml oder bleibt sie stabil?
- **Docker-Abnahme**: Wird der MCP-Server in Prod deployiert oder nur lokal auf Dev-Maschinen?
- **CI-Gating**: Wird das Paket in Typecheck-, Lint-, Test- und Build-Gating geführt?
- **Lint & Format**: Unterliegt es den Projekt-Standardregeln oder läuft mit Ausnahmen?

## Entscheidung
`@razzoozle/mcp` ist ein **unterstütztes Host-Only Development Tool** und bleibt explizit aus dem pnpm-Workspace ausgeschlossen (Deklaration `!packages/mcp` in `pnpm-workspace.yaml`). Das Paket wird **esbuild-gebündelt, selbstständig verwaltet und bootet nur auf Entwicklungsmaschinen** über eine projekt-scoped `.mcp.json`-Konfiguration. Es wird **nicht in Prod-Container deployiert** — Runtime-Image enthält nur `web` + `socket`.

Diese Entscheidung ist bereits in `pnpm-workspace.yaml` seit v3.0.0 dokumentiert und praktiziert.

## Konsequenzen

### Workspace & Dependency Lock
- `pnpm install` bei Main-Tree-Änderungen driftet die workspace-lock nie durch `packages/mcp`-Abhängigkeiten
- Das Paket **muss** eigenen `node_modules/` und `pnpm-lock.yaml` (lokal) verwalten oder sich über ein Isolation-Setup (z.B. esbuild-bundle) selbst versorgen
- Großer Vorteil: Monorepo-Lock bleibt stabil, selbst wenn MCP-Dependencies veraltern oder anwachsen

### Docker & Deployment
- `packages/mcp` wird in der Dockerfile-Build-Phase **weder installiert noch gebündelt**
- Rust-CD und Web-Builder erkennen das Paket nicht — keine dist-Ablage im Runtime-Image
- MCP-Server läuft ausschließlich auf Host-Entwicklungs-Umgebungen (z.B. via `node packages/mcp/dist/index.cjs` nach lokaler esbuild)

### CI-Gating
- `pnpm build` (alle Workspaces) überspringt `packages/mcp` mangels Workspace-Inclusion
- `pnpm verify` (typecheck + lint + test) überspringt das Paket ebenfalls
- **Lokale Tester müssen `pnpm --filter @razzoozle/mcp build` und `pnpm --filter @razzoozle/mcp types` manuell vor dem Commit fahren**
- Keine automatische Absicherung durch Main-Tree CI

### Lint & Format
- `pnpm format` (lokal) muss als Worktree-interne Aktion auf dem Host laufen
- Prettier-Regel gelten, sind aber nicht CI-gated
- Esbuild & TypeScript Versions dürfen unabhängig vom Monorepo-Standard driften

### Koexistenz mit Common-Lib
- `@razzoozle/mcp` importiert `@razzoozle/common` (symlink: `link:../common`)
- Bei Changes in `common/` müssen MCP-Entwickler das Paket lokal neu bauen
- Nicht automatisch bei `pnpm install` nachbuild

## Alternativen

### Alt. A: MCP in Workspace-vollständig integrieren
- Würde `packages/mcp` zu einem regulären workspace-Paket machen
- **Vorteil**: Automatische CI-Gating, synchronized lock-Datei
- **Nachteil**: Prod-Docker wird bloated, pnpm-lock.yaml driftet bei MCP-Updates, Deployment-komplexität (Docker müsste MCP explizit ausschließen)
- **Gesamturteile**: Schlechter fit — MCP ist nur ein Dev-Tool

### Alt. B: MCP komplett löschen
- Würde das Paket aus dem Repo entfernen
- **Vorteil**: Keine Wartungskosten
- **Nachteil**: Quiz-Authoring/-Bildgen und Game-Master-Remote-Kontrolle verlören ihre CLI-Tooling
- **Gesamturteile**: Nicht akzeptabel — MCP ist notwendig

## Belege
- `pnpm-workspace.yaml`: `!packages/mcp`-Directive mit Kommentar „host-only dev tool"
- `packages/mcp/package.json`: Aktive Abhängigkeiten, esbuild-Config, TypeScript + "private": true
- `packages/mcp/src/`: Implementierung vorhanden, nicht leer
- `packages/mcp/esbuild.config.js`: esbuild-bundler konfiguriert
- Keine Imports von `@razzoozle/mcp` in anderen Workspace-Paketen (grep-bestätigt)
- Keine Erwähnung in Docker- oder Prod-Deployment-Config
