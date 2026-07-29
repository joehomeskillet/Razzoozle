# Branch Protection Policy für `main`

**Stand:** 2026-07-29 | **Status:** Aufarbeitung für Freigabe | **Issues:** #780 (GitHub), #781 (Gitea)

---

## 1. Ist-Zustand (2026-07-29)

### GitHub

```bash
$ gh api repos/joehomeskillet/Razzoozle/branches/main/protection
{
  "message": "Branch not protected",
  "documentation_url": "...",
  "status": 404
}
```

**Ergebnis:** Keine Schutzregeln aktiv.

### Gitea

```bash
$ curl -H "Authorization: token $TOKEN" \
  https://git.joelduss.xyz/api/v1/repos/agent-claude/Razzoozle/branches/main
{
  "protected": false,
  "required_approvals": 0,
  "enable_status_check": false,
  "user_can_push": true,
  "user_can_merge": true,
  ...
}
```

**Ergebnis:** Keine Schutzregeln aktiv. Alle Nutzer können direkt auf `main` pushen und mergen.

---

## 2. Workflow-Constraints

Dieses Projekt arbeitet mit drei Akteuren, die direkt auf `main` schreiben oder commits dort landen lassen:

### 2.1 Orchestrator (Merges Branch → main)

**Akteur:** `claude-orchestrator` (lokal, programmatisch) oder Human-Orchestrator  
**Aktion:** Mergt Feature/Fix-Branches direkt auf `main` und pusht

```bash
git checkout main
git merge fix/<slug>
git push
```

**Abhängigkeit:** Keine Genehmigung erforderlich; der Merge ist das Resultat einer Review/Entscheidung,
nicht der Trigger.

**Risiko bei PR-Pflicht:** Branch-Schutz würde `Require pull request reviews` erzwingen → Merge schlägt fehl,
weil Orchestrator keinen PR öffnet.

### 2.2 Token-Sync-Workflow (Gitea)

**Datei:** `.gitea/workflows/tokens-sync.yml`

**Trigger:** Push zu `main` oder `workflow_dispatch`

**Aktion:** (Zeilen 45–55)
```bash
git add \
  packages/common/src/theme-tokens.generated.ts \
  build/css/tokens.css \
  docs/design/LIVING_DESIGN_SYSTEM.md
git diff-index --quiet HEAD || \
  git commit -m "chore(tokens): auto-sync generated CSS, TS types, and Living Design System spec"
git push origin main
```

**Abhängigkeit:** Commits und pusht zurück zu `main` als `razzoozle-bot[bot]` (Gitea-spezifisch).

**Risiko bei Genehmigungen erforderlich:** Bot-Commit würde in der Genehmigungswarteschlange stecken, bis
ein Mensch ihn approved → Token-Syncs verzögert oder blockiert.

**Risiko bei Status-Checks erforderlich:** Wenn die Checks fehlschlagen, blockt der Push und das Workflow-Ergebnis
ist unklar (ist der Commit/Push gespeichert oder nicht?).

### 2.3 CD-Timer (Host-Polling)

**Mechanismus:** `razzoozle-cd.timer` (systemd, alle ~5 Minuten)

**Aktion:** Prüft `main`-SHA, zieht ggf. neue Commits, buildet und deployed

**Abhängigkeit:** Kein direktes Schreiben auf `main` — nur lesend.

**Risiko bei Schutz:** Keine; Timer wird blockiert, wenn Deployment-Logik selbst auf `main` schreiben würde (aktuell nicht der Fall).

### 2.4 CI (Gitea Actions)

**Datei:** `.gitea/workflows/ci.yml`

**Trigger:** Push zu `main` oder Pull-Request

**Aktion:** 
- `lint-typecheck`: Linting, Typecheck, Token-Gates
- `rust` (derzeit deaktiviert per `if: ${{ false }}`)
- `build`: Docker-Image-Build nur auf `push ... main`

**Abhängigkeit:** Nur lesend; keine Commits/Pushes an `main`.

**Risiko bei Status-Check-Pflicht:** Wenn Status-Checks erforderlich werden, muss CI BESTANDEN sein, bevor Merge erlaubt ist.
Dies würde den Orchestrator blockieren, es sei denn, `Require status checks to pass` wird als **optional** konfiguriert
oder der Orchestrator hat eine Exception.

---

## 3. Was würde durch Branch-Schutz kaputtgehen?

### Regel: "Require pull request reviews before merging"

**Problem:**
- Orchestrator öffnet keinen PR; er merged direkt via `git merge`.
- Regel würde den Merge ablehnen mit `blocked by missing reviewers`.

**Kosten:** Orchestrator-Workflow komplett blockiert. Token-Syncs, Hotfixes und tägliche Deployment-Zyklen
würden einfrieren.

**Lösung:** Regel müsste Exceptions haben (z. B. `authorized_dismissal_actors`) — aber in Gitea/GitHub ist
eine Exception für den direkten Merge kompliziert (PRs sind das Modell, nicht Merges ohne PR).

### Regel: "Require status checks to pass before merging"

**Problem (gering):**
- Wenn CI temporär fehlschlägt, kann Orchestrator nicht mergen.
- Token-Sync-Workflow: wenn Checks fehlschlagen, wird der Auto-Commit-Push blockiert. Ist der Commit dann
  lokal erstellt, aber der Push nicht durchgegangen? (Unklar, abhängig von `git push`-Semantik unter
  Branch-Schutz).

**Kosten:** 
- Alle Merges müssen auf CI-Grün warten.
- Token-Sync-Failures wären explizit, aber ggf. unklar auf dem Workflow-Run (Commit da, Push blockiert?).

**Gewinn:**
- Unkorrekte oder unvollständige Commits landen nicht auf `main`.

### Regel: "Dismiss stale reviews"

**Problem:** Keine (nur relevant, wenn überhaupt Reviews erzwungen).

**Kosten:** Keine (Review-Enforcement ist nicht geplant).

### Regel: "Require branches to be up to date before merging"

**Problem:** Wenn `main` sich schnell ändert, müssen Branches häufig rebasiert werden.

**Kosten:** Aufwand beim Orchestrator-Merge; rebase erforderlich vor jedem Merge.

**Gewinn:** Reduziertes Risiko von konflikt-massierten Merges.

### Regel: "Prevent force pushes" + "Prevent deletion"

**Problem:** Keine (Orchestrator und Token-Sync nutzen normale, nicht-force-Operationen).

**Kosten:** Keine (normale Workflows nicht betroffen).

**Gewinn:**
- Verhindert `git push --force` oder `git push --force-with-lease` zu `main`.
- Verhindert versehentliche `git push --delete origin main`.
- Schaltet accidental-overwrite scenarios aus.

---

## 4. Vorschlag: Minimale, nicht-blockierende Schutzregeln

Da Orchestrator-Merges und Token-Syncs direkt zu `main` gehen, biete ich ein Set an, das **Unfälle verhindert**,
ohne die bestehenden Workflows zu blockieren:

### GitHub

**Regel 1: Prevent force pushes**
- Blockiert `git push -f`, `git push --force-with-lease`.
- Erlaubt normale Fast-Forward- und Merge-Commits.

| Aspekt | Detail |
|--------|--------|
| Verhindert | Accidental Force-Overwrite (z. B. `git push -f nach lokalem rebase`) |
| Kostet | Nichts für legale Workflows |
| Enforcement | Auf Push-Zeit; blockiert sofort |

**Regel 2: Prevent deletions**
- Blockiert `git push --delete origin main`.
- Verhindert versehentliche Branchlöschung.

| Aspekt | Detail |
|--------|--------|
| Verhindert | Accidental Branch Deletion |
| Kostet | Nichts für legale Workflows |
| Enforcement | Auf Push-Zeit; blockiert sofort |

**Regel 3 (Optional): Require status checks to pass**
- CI-Checks (lint, typecheck, rust gate) müssen grün sein.
- Nur empfohlen, nicht blockierend (falls implementiert, als `Draft` in der Konfiguration).

| Aspekt | Detail |
|--------|--------|
| Verhindert | Commits mit fehlgeschlagenen Tests auf `main` |
| Kostet | Orchestrator muss auf CI-Durchlauf warten |
| Enforcement | Pre-Merge-Check; blockiert Merge, wenn Checks laufen oder fehlschlagen |
| Workaround | Wenn CI hängt, Orchestrator kann (mit Warnung) die Regel temporär aussetzen |

**Nicht empfohlen (blockiert Workflows):**
- ❌ Require pull request reviews
- ❌ Require multiple approvals
- ❌ Require conversation resolution
- ❌ Require status checks to pass (stark, nur als Option mit Workaround)

### Gitea

Identisch zu GitHub, mit Gitea-spezifischem UI:

**Regel 1: Prevent force pushes** → `Enable push` + `Disable force push`

**Regel 2: Prevent deletions** → `Enable branch protection` + `Prevent branch deletion`

**Regel 3 (Optional): Require status checks** → `Enable status check` + Configs für die Checks

---

## 5. Implementierungs-Sicherung

Falls diese Regeln aktiviert werden:

### Vor Aktivierung testen

1. **Lokal:** 
   ```bash
   git push --force origin main  # Sollte abgelehnt werden
   ```
   Ergebnis muss sein: `rejected ... hook declined`.

2. **Workflow-Test:**
   ```bash
   # Orchestrator macht normalen Merge und Push
   git checkout main && git pull
   git merge fix/test-branch
   git push  # Sollte funktionieren
   ```
   Ergebnis muss sein: `Fast-forward [...]` erfolgreich.

3. **Token-Sync-Test:**
   - Manuell in `.gitea/workflows/tokens-sync.yml` Trigger auslösen.
   - Workflow muss zum Abschluss kommen (Commit und Push erfolgreich).

### Im Fehlerfall Escalation

Falls eine Regel einen kritischen Workflow blockiert:

```bash
# Temporär Regel disabled (Admin-UI oder API)
# Merge durchführen
# Regel re-enabled
# Post-Merge: Issue dokumentieren
```

---

## 6. Zur Freigabe

**Diese Dokumentation ist eine Aufarbeitung, keine Aktivierung.**

Um die Regeln tatsächlich zu scharf zu stellen, braucht es:

1. **Explizite Freigabe:** User bestätigt, dass die Regeln passen und nichts blockieren.
2. **Test-Durchlauf:** Alle drei Workflows (Orchestrator, Token-Sync, CI) laufen einmal durch,
   um zu verifizieren, dass nichts bricht.
3. **API-Calls:** Dann werden die Regeln per GitHub/Gitea API aktiviert.

**Geplante Regeln (zur Freigabe empfohlen):**
- ✅ Prevent force pushes (beide Plattformen)
- ✅ Prevent deletions (beide Plattformen)
- ⚠️ Require status checks (Optional; nur nach expliziter Koordination mit CD-Betrieb)

**Nicht planen:**
- ❌ Require pull request reviews (blockiert Orchestrator)
- ❌ Require multiple approvals (blockiert Token-Sync)
- ❌ Require conversation resolution (blockiert Workflows)

