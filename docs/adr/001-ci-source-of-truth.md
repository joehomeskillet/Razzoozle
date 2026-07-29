# ADR 001: Quelle der Wahrheit für CI

**Datum:** 2026-07-29  
**Status:** Angenommen  
**Autor:** Claude Code

---

## Kontext

Razzoozle wird über zwei Git-Remotes und zwei Continuous-Integration-Plattformen entwickelt:

- **Gitea** (git.joelduss.xyz): `.gitea/workflows/ci.yml` — umfassende Pipeline (Lint, Typecheck, Rust-Gate, Docker-Build, Token-Gates, Designvalidation)
- **GitHub** (github.com/joehomeskillet/Razzoozle): `.github/workflows/tokens-sync.yml` — nur tokenisierte Governance & automatische Sync

Aktuell laufen beide Workflows, aber mit unterschiedlichem Gewicht: Gitea führt die komplette Validierung durch, GitHub läuft nur auf Audit-Pfaden. Die Frage ist formal offen, welche Plattform die "Single Source of Truth" für den Projekt-Zustand ist.

---

## Entscheidung

**Gitea Actions ist die authoritative Quelle für den CI-Zustand und damit die Single Source of Truth für Validierung, Tests und Deployment-Freigaben.**

Konkret:
- **Gitea/main** ist der authoritative Zustand: Lint, Typecheck, Rust-Gate, Docker-Image-Build, Token-Governance und Design-Tokens-Validierung laufen hier.
- **GitHub Actions** läuft nur auf Design-Token-Audit und -Sync (`.github/workflows/tokens-sync.yml`), hat aber keine Build- oder Deployment-Authority.
- **Deployment-Quelle:** CD-Entscheidungen werden von Host-Systemd-Timern (`razzoozle-cd.timer`, `rust-cd.timer`) basierend auf Gitea-main getroffen, nicht GitHub.
- **Merge-Richtung:** Feature-Branches mergen in Gitea/main; GitHub/main wird anschließend als Read-Only-Spiegel aktualisiert (siehe ADR 002).

---

## Konsequenzen

### Positiv
1. **Klare Autorisierung:** Entwickler und Automation orientieren sich an EINEM CI-Status, nicht zwei divergierenden.
2. **Schnelle Feedback-Schleifen:** Gitea-Workflows sind vom Intranet optimiert, keine GitHub-API-Latenz.
3. **Deployment-Sicherheit:** nur Commits, die Gitea-Gating bestanden haben, landen in Produktion.
4. **Keine Merge-Konflikte:** CI-Status ist eindeutig; zweiter Workflow dupliziert nicht.

### Kosten & Anforderungen
1. **GitHub-Actions als Sekundär-System:** GitHub-Workflow wird nicht als Gatekeeper gebaut, nur als Audit/Dokumentation. Entwickler müssen Gitea zur Wahrheit erklären.
2. **Branch-Protection:** Gitea/main braucht Branch-Protection mit Gitea-Gate (nicht GitHub-Gate), um Merges ohne Validierung zu verhindern.
3. **Monitoring:** bei Gitea-Ausfällen muss klar sein, dass das Projekt blockiert ist (nicht auf GitHub ausweichen).
4. **Dokumentation:** die CI-Authority muss zentral dokumentiert sein (Onboarding, PR-Templates, Merge-Prozesse sollten Gitea referieren).

---

## Alternativen (verworfen)

1. **Dual-Authority (beide Plattformen Gatekeeper):**
   - Erfordert Bi-Direktionale Sync zwischen Gitea/GitHub
   - Erhöht Komplexität: welche Plattform gewinnt bei Konflikt?
   - Verzögert Merges (auf beide GH + Gitea warten)
   - Verworfen: zu viel Overhead für Nutzen.

2. **GitHub als Single Source of Truth:**
   - Erfordert Hosting von Rust-Gaten auf GitHub (CPU/Memory-intensive Gate läuft nicht in GitHub-Actions-freien Tier).
   - Verursacht Vendor Lock-in zu GitHub (Migrationshürde).
   - Gitea-Instanz müsste trotzdem betrieben werden (Backup, Intranet-Dev-Repo) — Redundanz ohne Vorteil.
   - Verworfen: Gitea ist bereits der Primär-Repo, CI lokal zu migrieren ist höherer Aufwand.

3. **Gitea-Workflow als Read-Only, GitHub als Primary:**
   - Inverses Problem zu (2): GitHub-Pipeline ist Partial (nur Tokens).
   - Würde erfordern, dass Gitea alle Workflows aufbaut, dann GitHub nicht nutzt — Ressourcenverschwendung.
   - Verworfen.

---

## Implikationen für Entwicklung

### Branch-Strategy
- Feature-Branches werden gegen `origin/main` (Gitea) geplant und tested.
- Gitea/main muss nach **jedem Merge** grün sein (Gating erzwingt das).
- GitHub/main folgt als Spiegel (siehe ADR 002).

### Deployment-Gating
- Der CD-Entscheidungsbaum (`razzoozle-cd.timer`, `rust-cd-poll.sh`) prüft **nur Gitea/main**.
- GitHub-Action-Status ist informativ, keine Freigabe-Bedingung.

### Monitoring
- Gitea Workflow-Failures sind kritisch und müssen sofort behoben werden.
- GitHub Workflow-Failures sind ernst (signalisieren Token-Sync-Problem), aber nicht blockierend für Deploy.

### Onboarding
- Neue Entwickler klonen `origin` (Gitea) nicht `github`.
- Branch-Richtlinien und CI-Docs referieren Gitea als Source of Truth.

---

## Referenzen

- Gitea CI: `docs/adr/001-ci-source-of-truth.md` (dieses ADR)
- Workflow-Config: `.gitea/workflows/ci.yml` (authoritative Pipeline)
- Deploy-Scripts: `razzoozle-cd.timer`, `cd-poll.sh`, `rust-cd-poll.sh`
- Mirror-Policy: ADR 002 (GitHub/Gitea Rollen)
- Commit-Beispiele: `30cb62a0a` (Gitea-only paths), `e78087e44` (exclude from GitHub)
