# ADR 002: Rollen von Gitea und GitHub

**Datum:** 2026-07-29  
**Status:** Angenommen  
**Autor:** Claude Code

---

## Kontext

Das Razzoozle-Projekt nutzt zwei Git-Remotes mit divergierenden Hauptbranchen:
- `origin` (git.joelduss.xyz, Gitea) — das interne Arbeitsrepo
- `github` (github.com/joehomeskillet/Razzoozle) — der öffentliche Spiegel

Diese Divergenz ist bewusst: die Gitea-Version enthält Dateien (Workflows, interne Dokumentation), die nicht auf GitHub erscheinen sollen. Der aktuelle Zustand funktioniert operativ, aber die Regeln sind informell und fragmentiert (keine zentrale Dokumentation, Merges müssen manuell die Divergenz pflegen).

---

## Entscheidung

**Gitea ist das authoritative Repository mit Deployment-Authority; GitHub ist ein Read-Only-Spiegel für öffentliche Nutzung.**

Konkret:
- **Gitea/main** bleibt der Quellbaum für alle Änderungen (Feature-Branches, Merges, Deployments).
- **GitHub/main** ist ein Spiegel, der durch automatisierte oder halbautomatisierte Strips erzeugt wird: `.gitea/workflows/`, `HOST_INTEGRATION.md` und projektinterne SDDs (z.B. `docs/wave*-sdd.md`) sind auf GitHub **nicht präsent**.
- Direkte Pushes auf `github/main` sind nicht erlaubt; die Branch wird durch Merges aus Gitea (mit Exclusions) gefüllt oder manuell rebasiert.
- Das Deployment erfolgt über Gitea-Workflows (`ci.yml`, `deploy.yml`, `i18n-check.yml`), die von GitHub nicht gesehen werden.

---

## Konsequenzen

### Positiv
1. **Operationale Trennung:** öffentliche Release-Artefakte auf GitHub, interne CI/CD und Orga auf Gitea.
2. **Schutz von Secrets:** Deployment-Scripts und Management-Dokumentation bleiben privat.
3. **Öffentlich-Private-Balance:** Benutzer können das Projekt klonen und nutzen, Mitwirkende arbeiten auf Gitea.

### Kosten & Anforderungen
1. **Mirror-Prozess:** nach jedem main-Merge auf Gitea muss der GitHub-Spiegel explizit aktualisiert werden (entweder via automatisierter Hook `_ghmirror` oder manuell).
2. **Divergenz-Management:** entwickelt sich parallel:
   - Gitea/main erhält neue Features.
   - GitHub/main braucht Pulls, um mit Gitea synchron zu bleiben, aber die Strips (`.gitea/workflows`) müssen vor jedem GitHub-Push angewendet werden.
3. **Merge-Richtung:** Gitea ← GitHub-Pullrequests sind nicht geplant (GitHub ist read-only). Kontributionen können nur über GitHub-PRs kommen, müssen aber auf Gitea rebasiert/gemergt werden.
4. **Dokumentation:** die Mirror-Regeln sind heute verstreut (Commit-Messages, `_ghmirror` Skript, `/etc/github-mirror.conf`). Eine formale Policy sollte gepflegt werden.

---

## Alternativen (verworfen)

1. **Monorepo (single origin):** würde erfordern, dass Deployments & interne Docs auf GitHub liegen oder ausgelagert werden. Erhöht Komplexität für einen Einsitzer-Zustand.
2. **Automatische Bi-Direktionale Sync:** könnte zu Merge-Konflikten führen, wenn Gitea & GitHub unterschiedliche Commits erhalten. Zu fehleranfällig ohne ständige Überwachung.
3. **GitHub-Only mit Submodule/Shallow Clones:** verliert die Flexibilität von lokalem Gitea-Hosting.

---

## Implikationen für Entwicklung

### Commits
- Alle Feature-Commits gehen auf `origin/main` (Gitea).
- `.gitea/workflows/`, `HOST_INTEGRATION.md` und interne SDDs gehören **nicht** in GitHub-Branches.

### Merges
- Nach Gitea-Merges: die GitHub-Branch muss mit den Exclusions aktualisiert werden (via `_ghmirror` oder manueller Rebase mit `.gitea/workflows`-Drops).
- Änderungen an `.gitea/workflows/` sind immer Gitea-only (nicht nach GitHub schieben).

### PRs
- GitHub-PRs sind öffentlich lesbar, müssen aber auf Gitea rebasiert werden.
- Interne/sensible Branches (`ci/*`, `sdd/*`) sollten auf Gitea privat bleiben.

---

## Referenzen

- Commits: `e78087e44` (exclude .gitea/workflows), `219e70c29` (restore after merge), `033bd8c05` (first exclusion policy).
- Dokumentation: `docs/sdd/manager-ui-ux-refactor/14-final-review.md` (erwähnt Mirror-Status).
- Script: `_ghmirror` (host-seitig, nicht im Repo registriert; Konfiguration in `/etc/github-mirror.conf`).
