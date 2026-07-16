# Security-Welle — SDD (Razzoozle Rust twin)

**Date:** 2026-07-15
**Status:** Design Phase — VORBEREITET, noch NICHT dispatcht (User-Direktive)
**Grundlage:** End-Audit 2026-07-15 (codex D2-Security), fortschreibt `docs/security/rust-razzoozle-security-audit-2026-07-13.md`
**Stakeholder:** joel.scherrer90@gmail.com

## Ziel + Nicht-Ziele

**Ziel:** Die 4 offenen Security-HIGHs schließen — alle sind Server-Trust-Fehler (der Server vertraut client-gelieferten Werten, die er selbst berechnen/prüfen müsste). Plus 1 Auth-MED (X2a authorize-Pfad ohne Rollen-Check).

**Nicht-Ziele:** Kein Umbau der bestehenden Auth-Architektur (X2a multi-token bleibt); keine neue Krypto/Dependency; kein Rework der Nicht-betroffenen Handler. Session-Revocation-bei-PW-Reset (MED) + Owner-Re-Check (MED) + last_seen (LOW) → Welle-2/Backlog, NICHT hier.

## User-Entscheid (eingearbeitet)
- **F-03:** Nur EINGELOGGTE dürfen Spiele hosten (fail-closed). Anonymes Hosten wird abgeschafft. Per-User-Rate-Limit statt globalem Cap-Risiko.

---

## WP-Schnitt (file-disjunkt, jeder eigener Worktree; Reihenfolge frei, alle parallel-fähig)

### WP-SEC-05 — F-05: Solo-Score server-seitig berechnen (Scoring-kritisch)
**Severity HIGH · Effort M · Lane: sonnet-worker (Scoring-Kern) + codex-Adversarial-Review**
**Datei:** `rust/server/src/http/solo.rs` (~:317, Solo-Submit-Handler)
**Problem:** Der Solo-Submit summiert einen client-gelieferten `correct`-Flag/Score. Jeder Schüler kann sich pro Frage die volle Punktzahl gutschreiben (verifiziert im Audit).
**Fix:**
- Pro eingereichter Antwort: Frage per Index aus dem Quiz laden, `evaluate_answer(question, answer_input)` server-seitig aufrufen (dieselbe Eval wie MP — `rust/engine/src/eval.rs`; für Wortarten den bestehenden disabledTokens-Arm nutzen), Korrektheit + Score SELBST bestimmen.
- Client-`correct`/Score-Felder IGNORIEREN (nie lesen).
- Finalscore auf theoretisches Maximum cappen vor dem Persistieren.
- Wire-Kompat: die Antwort-Payload-Struktur bleibt; nur die serverseitige Bewertung ändert sich.
**Kontrakt-Referenz:** eval.rs-Scoring ist die Wahrheit; Solo muss byte-gleich zu MP bewerten (sonst Score-Drift Solo vs MP).
**Tests:** manipulierter Client (`correct:true` auf falsche Antwort) → Score 0; Partial-Credit (Wortarten/multiple-select) server-berechnet; Score-Cap greift; Regression: ehrliche Antworten → identischer Score wie vorher.
**Gate:** cargo check + `cargo test -p razzoozle-engine` + `cargo test -p razzoozle-server` + `bash rust/gate.sh` GO.

### WP-SEC-04 — F-04 + F-04-Secondary: Answer-Impersonation + Re-Join-Token (EIN WP, gleiche player_token-Mechanik)
**Severity HIGH · Effort M · Lane: codex-gpt5 (primär) + grok-Adversarial-Review**
**Dateien:** `rust/server/src/main.rs` (~:275, clientId aus Handshake), `rust/server/src/socket/player/login.rs` (~:136, Re-Join-by-clientId), Answer-Handler (`socket/player/answer.rs`)
**Problem:** `clientId` ist client-kontrolliert und NICHT an den Socket gebunden → Spieler A kann im Namen von Spieler B antworten. Re-Join per clientId-Match erlaubt Duplikat ohne Token-Prüfung.
**Fix:**
- Server-seitiges `player_token` (kryptografisch, kurzlebig) beim ersten Join generieren; Antwort-Handler verlangt gültiges token↔player-Match für JEDE Antwort (nicht nur clientId).
- clientId nur noch als Legacy-Reconnect-Fallback, socket-gebunden bei connect-time.
- Re-Join (`login.rs:136`): nur erlauben wenn (a) Player hat KEIN token (Legacy, dann max. 1 Socket) ODER (b) der re-joinende Socket liefert EXAKT dasselbe token. Mismatch/fehlendes Token bei bestehendem Token → ablehnen (+ warn!).
**Kontrakt:** `player_token` als neues Feld im Join-Ack + Answer-Payload (common/-Type + protocol-Type — WP besitzt beide Seiten). Rückwärtskompat: fehlt token (alter Client) → Legacy-Ein-Socket-Pfad.
**Tests:** fremde clientId-Antwort ohne Token → abgelehnt; Re-Join mit falschem Token → abgelehnt; Legacy-Join ohne Token → genau 1 Socket; ehrlicher Reconnect mit Token → ok.
**Gate:** cargo check + workspace test --no-run + rust/gate.sh GO. SECURITY-CHECK-Schlusszeile Pflicht.
**Memory-Warnung:** `duplicate-authorizers-devkey` — ALLE Antwort-/Join-Pfade greppen, keiner darf auf der alten clientId-only-Prüfung bleiben (Call-Site-Grep-Beweis in den Report).

### WP-SEC-03 — F-03: Game-Create nur für Eingeloggte + Rate-Limit
**Severity HIGH · Effort M · Lane: grok-build + codex-Adversarial-Review**
**Datei:** `rust/server/src/socket/game.rs` (~:37, register_create)
**Problem:** Anonyme können Spiele erstellen und das globale 100-Spiele-Cap von einer IP erschöpfen.
**Fix (User-Policy: nur eingeloggte):**
- `ctx.require_user()` == None → Game-Create ablehnen (fail-closed, `manager:unauthorized` + warn!).
- Per-User-Rate-Limit (z.B. 10 Spiele/Stunde) — bestehendes Rate-Limit-Muster im Repo wiederverwenden (Memory `security_wiring_proof`: Limiter muss an der Call-Site AUFGERUFEN werden, nicht nur gebaut).
- Owner-User-Id im Game-Struct für Audit ablegen (nutzt der Owner-Re-Check in Welle-2).
**Tests:** anonymer Create → abgelehnt; eingeloggter Create → ok; 11. Spiel/h desselben Users → rate-limited; Cap nicht mehr von einer Quelle erschöpfbar.
**Gate:** cargo check + workspace test --no-run + rust/gate.sh GO. SECURITY-CHECK-Schlusszeile.

### WP-SEC-X2a — MED: assignments authorize ohne Rollen-Check
**Severity MED · Effort S · Lane: codex-gpt5 (im selben Review-Kontext wie SEC-04)**
**Datei:** `rust/server/src/http/assignments.rs` (~:85, authorize_manager_request)
**Problem:** Nach `session_user()` fehlt der `role == "admin"`-Check auf einem Pfad.
**Fix:** Rollen-Check nach session_user ergänzen ODER (sauberer) in die session_user-SQL: `AND u.active = true AND u.role = 'admin'` — ABER nur für den Admin-erfordernden Pfad, nicht global (require_user-Pfade brauchen keine Admin-Rolle). Genau prüfen, welcher Pfad Admin verlangt.
**Tests:** Nicht-Admin auf assignments-Admin-Pfad → 401/403; Admin → ok.
**Gate:** cargo check + rust/gate.sh.

---

## Dispatch-Plan (wenn User Go gibt)
- **Wave-0 Contract-Freeze (zuerst, S):** die neuen Wire-Felder `player_token` (SEC-04) in protocol + common einfrieren → damit SEC-04-Implementer + Test-Writer parallel können. or-qwen3-next/free-pool.
- **Wave-1 parallel:** SEC-05 (sonnet), SEC-04 (codex), SEC-03 (grok), SEC-X2a (codex) — file-disjunkt.
- **Reviews:** JEDER Security-WP adversarial cross-vendor (Reviewer ≠ Fix-Agent, anderer Hersteller). grok-Security-Gate-Schlusszeile Pflicht. Migration/DB-Änderungen (keine erwartet) → Wegwerf-PG-Probe.
- **Merge/Deploy:** ein gemeinsamer Security-Deploy-Batch, Migration (falls) session-erhaltend, gebündelter CD-Deploy.
- **Abnahme:** Stagehand-Suite (nach Fertigstellung) deckt SEC-05/SEC-04 ab (manipulierte Antworten müssen 0 Punkte geben); zusätzlich gezielter Impersonation-Repro.

## Test-Absicherung (übergreifend)
- Die Stagehand-e2e-Suite (Fragetyp × MP+Solo × 3 Viewports) sollte VOR dieser Welle grün laufen — sie fängt Scoring-Regressionen aus SEC-05.
- Adversariale Unit-/Integration-Tests pro WP (manipulierter Client) sind AKZEPTANZKRITERIUM, nicht optional.

## Offene Punkte / Welle-2-Übergabe (NICHT hier)
- Session-Revocation bei PW-Reset/Rollenwechsel (MED, `db/users.rs:292`) — `revoke_all_user_sessions` + Aufruf aus set_password.
- Owner-Re-Check auf Lifecycle-Ops (MED, `socket/manager/auth.rs:85`) — nutzt die F-03-Owner-User-Id.
- last_seen-Tracking (LOW) — Doku oder Batch-Update.
