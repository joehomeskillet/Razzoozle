# Security-Audit und Behebungsplan: `rust.razzoozle.xyz`

Stand: 2026-07-13  
Audit-Ziel: `https://rust.razzoozle.xyz`  
Geprüfter und live deployter Commit: `2d8c70cc4169168a08ffb2af74887164f12bc6bc`  
Zielgruppe: neue Claude-Code-Session zur schrittweisen Behebung

> [!CAUTION]
> Dieser Bericht dokumentiert Befunde und einen künftigen Arbeitsplan. Beim Audit wurden keine Schwachstellen ausgenutzt, keine Scores, Spiele, Benutzer, Sessions oder Konfigurationen verändert und keine Fixes implementiert.

## 1. Kurzfassung

Audit bestätigte zwei kritische Berechtigungsfehler und mehrere Integritäts-, DoS- und Härtungslücken:

1. Jeder angemeldete Benutzer kann im aktuellen Dev-Betrieb den vollständigen `DEV_API_KEY` erhalten. Derselbe Key wird als Admin-Credential akzeptiert.
2. Jeder angemeldete Benutzer kann globales JavaScript hochladen. Browser laden dieses JavaScript unter derselben Origin auf Spieler-, Host- und Admin-Seiten.
3. Spiel-, Antwort- und Solo-Ergebnis-Flows vertrauen mehreren vom Client kontrollierten Identitäts- und Score-Werten.
4. Globale oder client-wählbare Rate-Limit-Schlüssel erlauben mehrere DoS- und Quota-Bypässe.
5. Session-Lebenszyklus, CSP, interne Dienste und Deployment-Definition brauchen Härtung.

Live war `customJsEnabled=false`. Es gibt keinen Hinweis auf aktive Kompromittierung. Live war kein globaler AI-Provider-Key konfiguriert. Diese Zustände senken aktuelle Exposition einzelner Pfade, beseitigen aber nicht zugrunde liegende Fehler.

## 2. Scope und Methodik

### Im Scope

- Rust-Backend unter `rust/server` und Wire-Typen unter `rust/protocol`
- Gemeinsamer Webclient unter `packages/web`
- HTTP- und Socket.IO-Autorisierung
- Spieleridentität, Scores und Assignments
- AI-Provider-Aufrufe und Rate Limits
- Live-HTTPS-Header und anonym erreichbare Routen
- Container-, Proxy- und Theme-Asset-Konfiguration
- Abhängigkeits- und Secret-Scanner, soweit lokal verfügbar

### Durchgeführte Prüfungen

- Source-Review mit Datenfluss- und Berechtigungsverfolgung
- Passive Live-Requests: `GET`, `HEAD` und `OPTIONS`
- Abgleich von Git-HEAD und deployter SHA
- `pnpm audit --prod --audit-level low`
- Semgrep- und Gitleaks-Prüfung mit manueller Bewertung
- Live-Prüfung von TLS, Security-Headern und anonymen API-Antworten

### Grenzen

- Keine mutierenden HTTP-Requests
- Keine Socket-Exploitation
- Keine Anmeldung als normaler Benutzer oder Admin zur Angriffssimulation
- Kein Last- oder DoS-Test
- Kein `cargo-audit`, da Tool fehlt
- Kein Container-CVE-Scan, da Trivy/Grype fehlt
- ComfyUI-Port `8188` antwortete lokal, war beim externen Test aber nicht erreichbar

## 3. Positive Kontrollen

- HTTPS und HSTS funktionieren; TLS 1.2 und 1.3 sind verfügbar.
- Anonyme Requests auf Admin-, Observability- und Metrik-Routen lieferten `401`.
- Keine permissive CORS-Konfiguration gefunden.
- Keine Source Maps oder aktuellen statischen Secrets im ausgelieferten Frontend gefunden.
- `pnpm audit --prod --audit-level low` meldete keine bekannten Schwachstellen.
- Rust-Container läuft als UID `10001`; App- und Postgres-Port sind loopback-gebunden.
- SQL-Zugriffe verwenden Parameter; keine offensichtliche SQL- oder Command-Injection gefunden.

## 4. Priorisierte Befunde

| ID | Schwere | Befund | Aktueller Zustand |
|---|---|---|---|
| F-01 | CRIT | `DEV_API_KEY` an normale Benutzer und Admin-Bypass | Live: Dev-Modus an, Key vorhanden |
| F-02 | CRIT | Globales Stored XSS durch Skeleton-JavaScript | Codepfad aktiv; Custom JS derzeit aus |
| F-03 | HIGH | Anonyme Game-Erstellung erschöpft globales Limit | Codepfad aktiv |
| F-04 | HIGH | Antwort-Impersonation über wählbare `clientId` | Codepfad aktiv |
| F-05 | HIGH | Solo-/Assignment-Score wird vom Client bestimmt | Codepfad aktiv; keine Live-Assignments |
| F-06 | MED | Globale AI-Konfiguration erlaubt SSRF | Codepfad aktiv; kein globaler AI-Key |
| F-07 | MED | Assignment-Owner-IDOR und fehlende Owner-Zuordnung | Codepfad aktiv; keine Live-Assignments |
| F-08 | MED | Globaler Login-Throttle erlaubt Lockout-DoS | Codepfad aktiv |
| F-09 | MED | Submission-/AI-Limits sind umgehbar | Codepfad aktiv |
| F-10 | MED | Logout, Ablauf und Sperre widerrufen Socket-Rechte nicht sicher | Codepfad aktiv |
| F-11 | MED | JS-lesbare Langzeit-Tokens; CSP und Frame-Schutz fehlen | Live bestätigt |
| F-12 | MED | ComfyUI lauscht ohne Auth auf `0.0.0.0:8188` | Lokal erreichbar, extern nicht bestätigt |
| F-13 | LOW | Theme-Backups und Quiz-IDs öffentlich sichtbar | Live bestätigt |
| F-14 | MED | Compose-/Proxy-Definition entspricht Live-Topologie nicht | Live bestätigt |

## 5. Detailbefunde

### F-01 — `DEV_API_KEY` für normale Benutzer und Admin-Bypass

**Evidenz**

- `rust/server/src/socket/manager/config.rs:22-40`: `manager:getConfig` verlangt nur `require_user()`.
- `rust/server/src/socket/manager/config_helper.rs:44-80`: Antwort enthält im Dev-Modus den vollständigen `DEV_API_KEY` ohne Rollenprüfung.
- `rust/server/src/http/mod.rs:125-153`: Admin-Autorisierung akzeptiert Admin-Session oder Dev-Key.
- `packages/web/src/features/manager/components/configurations/ConfigDev/useDevTelemetry.ts:25-31,51-62`: Client setzt Key in Query-Strings ein.
- Live: `RAZZOOLE_DEV=true`; nichtleerer Dev-Key vorhanden.

**Voraussetzung:** gültige normale Benutzersession oder anderweitiger Query-/Log-Leak.  
**Auswirkung:** Privilegienausweitung auf Admin-HTTP-Routen; zusätzliche Leaks über URLs, Logs, History und Screenshots.  
**Künftige Behebung:** Dev-Key nie serialisieren, Query-Authentisierung entfernen, Admin-Routen nur mit serverseitig geprüfter Admin-Session autorisieren, Produktion ohne Dev-Modus betreiben, Key rotieren.  
**Regressionstest:** Normaler Benutzer erhält nie Key-Material und bekommt auf jede Admin-Route `401/403`; Admin-Session bleibt funktionsfähig.

### F-02 — Stored Same-Origin XSS durch Skeleton-JavaScript

**Evidenz**

- `rust/server/src/socket/manager/theme/skeleton.rs:101-147`: `manager:setSkeletonAsset` verlangt nur `require_user()` und akzeptiert JavaScript.
- `rust/server/src/socket/manager/theme/skeleton.rs:18-55,170-200`: Inhalt wird global gespeichert, aktiviert und verteilt.
- `packages/web/src/features/theme/apply.ts:90-120`: Browser bindet `/theme/skeleton.js` als Same-Origin-Script ein.
- `packages/common/src/skeleton-doc.ts:329-336`: Dokumentation benennt vollen DOM-Zugriff.
- Live: `customJsEnabled=false`; kein Hinweis auf aktuell aktives Schadskript.

**Voraussetzung:** gültige normale Benutzersession.  
**Auswirkung:** Codeausführung in Spieler-, Host-, Satelliten- und Admin-Browsern; Token-Diebstahl, Phishing und Spielmanipulation.  
**Künftige Behebung:** alle Theme-Mutationen mindestens mit `require_admin()` sichern; beliebiges Same-Origin-JavaScript entfernen. Falls zwingend nötig, nur in separater Origin und Sandbox ohne Tokenzugriff ausführen.  
**Regressionstest:** Normaler Benutzer kann weder JS setzen noch Skeleton importieren; Browser lädt kein benutzerdefiniertes Same-Origin-Script.

### F-03 — Anonyme Game-Erstellung blockiert legitime Hosts

**Evidenz**

- `rust/server/src/socket/game.rs:37-42`: fehlende Authentisierung wird zu `owner_user_id=None`; Handler bricht nicht ab.
- `rust/server/src/socket/game.rs:100-106`: Spiel wird trotzdem erstellt.
- `rust/server/src/state/mod.rs:22-24`: globales Limit liegt bei 100 aktiven Spielen.
- `rust/server/src/state/registry.rs:175-200`: bei vollem Register scheitern weitere Spiele.

**Voraussetzung:** keine Anmeldung; bekannte Quiz-ID reicht.  
**Auswirkung:** Angreifer füllt 100 Slots und blockiert legitime Hosts bis zur Eviction.  
**Künftige Behebung:** Handler bei fehlender Authentisierung sofort beenden; zusätzlich Limits pro Benutzer und vertrauenswürdiger Quell-IP.  
**Regressionstest:** anonymer und ungültiger Socket erzeugt kein Spiel und verändert Registry-Zähler nicht.

### F-04 — Spieler können Antworten anderer Spieler abgeben

**Evidenz**

- `rust/server/src/main.rs:268-293`: Client liefert `clientId` beim Socket-Handshake.
- `rust/server/src/socket/player/answer.rs:85-109`: Antwort verwendet diese ID ohne Player-Token-, Socket- oder Membership-Prüfung.
- `rust/protocol/src/player.rs:15-28`: Player-Daten enthalten `client_id`.
- `rust/server/src/socket/player/mod.rs:45-53`: Player-Daten werden in den Raum gesendet.
- `rust/server/src/socket/player/session.rs:175-217`: Reconnect prüft dagegen bereits Player-Token.

**Voraussetzung:** Teilnahme an einem Spiel und Kenntnis fremder `clientId`.  
**Auswirkung:** Antwort- und Score-Manipulation im Namen anderer Spieler.  
**Künftige Behebung:** Identität nach Join/Reconnect serverseitig an Socket binden; Answer-Handler nutzt ausschließlich diese Bindung; fremde interne IDs nicht senden.  
**Regressionstest:** zweiter Socket kann mit fremder `clientId` keine Antwort für Opfer speichern.

### F-05 — Client kann Solo- und Assignment-Scores fälschen

**Evidenz**

- `rust/server/src/http/solo.rs:244-263`: ohne Antworten wird `payload.score` vertraut; mit Antworten werden clientseitige `correct`-Flags vertraut.
- `rust/server/src/http/solo.rs:277-288`: Name, Score und Assignment-ID werden gespeichert.
- `rust/server/src/http/assignments.rs:128-142`: Deadline, maximale Versuche und Identifier-Regeln werden gespeichert, aber beim Score-Submit nicht durchgesetzt.
- `rust/server/src/http/mod.rs:230`: Submit-Route ist öffentlich.

**Voraussetzung:** Kenntnis von Quiz- oder Assignment-ID.  
**Auswirkung:** beliebige Highscores, wiederholte korrekte Antworten, gefälschte Namen und Assignment-Ergebnisse.  
**Künftige Behebung:** Antworten serverseitig gegen Quiz bewerten; eindeutige Fragenindizes verlangen; signiertes, einmaliges Attempt-Token an Assignment und Quiz binden; Frist und Versuche serverseitig prüfen.  
**Regressionstest:** gesendeter Score und `correct` werden ignoriert; Duplikate, falsches Quiz, abgelaufene oder wiederverwendete Attempts scheitern.

### F-06 — AI-Einstellungen erlauben interne Server-Requests

**Evidenz**

- `rust/server/src/socket/ai.rs:36-58`: jeder Benutzer kann globale AI-Einstellungen ändern.
- `rust/server/src/socket/ai.rs:112-166`: jeder Benutzer kann Provider-Test auslösen.
- `rust/server/src/socket/ai_validate.rs:85-93`: URL-Prüfung akzeptiert jedes `http://` oder `https://`.
- `rust/server/src/socket/ai_provider.rs:22-36,84-119`: Test kann globalen Provider-Kontext verwenden.
- `rust/server/src/socket/ai_http.rs:16-30,57-64`: Server sendet Request an konfigurierte Basis-URL.
- Live: kein globaler AI-Key konfiguriert.

**Voraussetzung:** normale Benutzersession.  
**Auswirkung:** SSRF zu Loopback-, privaten, Link-Local- oder internen Diensten; bei später konfiguriertem globalem Key zusätzlicher Credential-Abfluss möglich.  
**Künftige Behebung:** globale Settings und Tests admin-only; User-Tests nie mit globalem Key; Host-Allowlist, DNS/IP-Prüfung und Redirect-Prüfung; Egress-Regeln.  
**Regressionstest:** private, Loopback-, Link-Local- und Metadata-Ziele werden vor und nach DNS-Auflösung sowie nach Redirect abgewiesen.

### F-07 — Assignment-Ergebnisse ohne Owner-Prüfung

**Evidenz**

- `db/migrations/008_owner_scoping.sql:17-24`: Schema unterstützt `owner_id`.
- `rust/server/src/http/assignments.rs:95-152`: Create speichert keinen Owner.
- `rust/server/src/http/assignments.rs:201-230`: jeder Benutzer kann Ergebnisse einer bekannten Assignment-ID lesen.
- Live: keine Assignments vorhanden.

**Auswirkung:** Zugriff auf fremde Namen und Ergebnisse, sobald Assignments verwendet werden.  
**Künftige Behebung:** Caller als Owner speichern; Create, Read und Result-Queries auf Owner scopen; Admin-Ausnahme explizit testen.  
**Regressionstest:** Benutzer B erhält für Assignment von Benutzer A `404/403` und keine Metadaten.

### F-08 — Globaler Login-Limiter ermöglicht Lockout

**Evidenz**

- `rust/server/src/http/login.rs:33-80`: alle Versuche teilen denselben Limiter.
- `rust/server/src/state/rate_limit.rs:123-147`: Key ist literal `global`.
- `rust/server/src/state/mod.rs:68-70`: zehn Fehler in 60 Sekunden blockieren Login.

**Auswirkung:** zehn ungültige Versuche blockieren alle legitimen Logins für 60 Sekunden.  
**Künftige Behebung:** Limit nach vertrauenswürdiger Quell-IP und normalisiertem Account; progressiver Backoff; wesentlich höherer globaler Circuit Breaker.  
**Regressionstest:** Fehler gegen Konto A oder IP A blockieren Konto B von IP B nicht.

### F-09 — Umgehbare Submission- und AI-Quotas

- `rust/server/src/http/submit.rs:31-100`: HTTP-Submit hat kein per-IP-/Token-Limit; nur globales Pending-Limit.
- `rust/server/src/socket/manager/public.rs:163-188,254-260`: Socket-Pfad besitzt mehr Limits, Queue-Cap bleibt global.
- `rust/server/src/media_ai/throttle.rs:42-45,90-125`: AI-Quota nutzt vom Client wählbare `clientId`.

**Auswirkung:** globale Queue kann gefüllt werden; AI-Quotas lassen sich durch neue Client-IDs umgehen.  
**Künftige Behebung:** serverseitig signierte anonyme Identität, IP-/Token-/Owner-Limits, owner-spezifische Queue-Caps und atomare Quota-Prüfung plus Insert.  
**Regressionstest:** neue frei gewählte `clientId` setzt Quota nicht zurück; parallele Inserts überschreiten Cap nicht.

### F-10 — Session- und Socket-Rechte werden nicht sicher widerrufen

- `rust/server/src/socket/mod.rs:25-49`: authentisierter Benutzer wird am Socket gecacht.
- `rust/server/src/socket/manager/auth.rs:13-29`: Logout widerruft serverseitig keine Session.
- `rust/server/src/db/users.rs:134-183`: Ablauf und Active-Status werden nur beim Lookup geprüft.
- `rust/server/src/http/users.rs:126-146`: Account-Sperre trennt bestehende Sockets nicht.

**Auswirkung:** kopierte Tokens bleiben nach Logout nutzbar; bestehende Sockets können Rechte nach Ablauf oder Sperre behalten.  
**Künftige Behebung:** Session bei Logout löschen/hashbasiert widerrufen, Socket trennen, privilegierte Aktionen erneut prüfen, alle Sessions bei Sperre widerrufen.  
**Regressionstest:** Token und offener Socket verlieren unmittelbar nach Logout, Ablauf oder Account-Sperre Zugriff.

### F-11 — Token-Speicherung und Browser-Härtung

- `packages/web/src/features/game/stores/manager.ts:54-85,111-135`: siebentägiges Manager-Token liegt in `localStorage`.
- Live fehlen Content Security Policy, `frame-ancestors` und `X-Frame-Options`.

**Auswirkung:** F-02 kann Tokens direkt lesen; Manager-UI ist framebar.  
**Künftige Behebung:** HttpOnly/Secure/SameSite-Session-Cookies oder kurzlebige Memory-Tokens mit Rotation; nach Entfernung von Same-Origin-Custom-JS restriktive CSP; mindestens `frame-ancestors 'none'`, `object-src 'none'` und `base-uri 'none'`.  
**Regressionstest:** Tokens sind nicht per JavaScript lesbar; Browser-Header-Test prüft CSP und Anti-Framing.

### F-12 bis F-14 — Infrastruktur und Informationspreisgabe

- ComfyUI lauscht ohne Authentisierung auf `0.0.0.0:8188`. Lokale Statusrouten antworten; externer Verbindungstest schlug fehl.
- `rust/server/src/http/assets.rs:58-149` erlaubt öffentlichen Download von Backup-Dateien im Theme-Verzeichnis.
- `GET /api/quizzes` listet öffentlich Quiz-IDs.
- Root-`compose.yml` definiert nicht den separat laufenden Rust-Produktionscontainer; Proxy- und Test-Host-Annahmen weichen von Live ab.
- Gitleaks fand einen historischen Datenbank-Credential-Kandidaten. Er stimmt nicht mit aktuellem Runtime-Credential überein und erscheint rotiert. Kein Wert darf in Issues, Logs oder Folgedokumente kopiert werden.

**Künftige Behebung:** ComfyUI nur intern/loopback und authentisiert; Theme-Dateien exakt allowlisten und Backups außerhalb des Webroots lagern; Quiz-Sichtbarkeit definieren; eine autoritative Deployment-Definition mit Healthchecks und festen Images pflegen; historische Credentials als kompromittiert behandeln und Rotation dokumentieren.  
**Regressionstest:** Port `8188` extern nicht erreichbar; Backup-Suffixe liefern `404`; private Quiz-IDs fehlen anonym; frischer Deploy entsteht allein aus dokumentierter Definition.

## 6. Sofortige Eindämmung — Empfehlung, nicht ausgeführt

Vor Codearbeit sollte Betreiber folgende Schritte kontrolliert planen und separat freigeben:

1. `RAZZOOLE_DEV` auf öffentlicher Instanz deaktivieren.
2. `DEV_API_KEY` rotieren und alte Ausgaben in Proxy-, Browser- und Observability-Logs prüfen.
3. Nicht-Admin-Konten bis Deployment von F-01/F-02 einschränken.
4. Custom Skeleton JavaScript deaktiviert lassen und vorhandene Datei/Revisionen prüfen.
5. ComfyUI an Loopback oder internes Docker-Netz binden; Firewall-Regel verifizieren.
6. Vor Eingriff Konfigurations- und Datenbank-Backup sowie getesteten Rollback-Punkt erstellen.

Diese Schritte sind nicht Teil dieses Berichts-Laufs und wurden nicht ausgeführt.

## 7. Behebungsplan für neue Claude-Code-Session

### Arbeitsregeln

- Erst Report und `AGENTS.md` lesen.
- Jede Wave in eigenen Worktrees und kleinen, nicht kollidierenden Work-Packages ausführen.
- Keine Secret-Werte in Prompts, Diffs, Tests oder Logs.
- CRIT/HIGH blockieren Release.
- Reviewer und Fix-Agent müssen verschieden sein.
- Nach jedem Rust-Worker `bash rust/gate.sh`; am Wave-Ende zusätzlich `pnpm verify`.
- Live-Verifikation bleibt passiv, bis Betreiber mutierende Security-Tests ausdrücklich freigibt.

### Wave 0 — Zustand sichern und Containment verifizieren

**WP0.1 Runtime-Inventar, read-only**

- Eigentum: Deployment/Operations
- Prüft SHA, Dev-Modus als Boolean, Custom-JS-Status, AI-Key-Konfiguration als Boolean und Port-Bindings.
- Gibt niemals Credential-Werte aus.
- Akzeptanz: reproduzierbares Vorher-Protokoll ohne Secrets.

**WP0.2 Testgerüst**

- Eigentum: neue Security-Regressionstests, keine Produktionslogik
- Legt Rollenmatrix `anonymous`, `user`, `admin` für HTTP und Socket an.
- Akzeptanz: Tests reproduzieren F-01 bis F-05 vor Fix oder sind explizit als erwartete Failures dokumentiert.

### Wave 1 — Kritische Autorisierung und XSS

**WP1.1 Dev-Key entfernen**

- Dateien: `socket/manager/config.rs`, `config_helper.rs`, `http/mod.rs`, Dev-Telemetry-Client und zugehörige Tests.
- Ziel: kein Secret im Config-Payload, kein Query-Key, kein Dev-Key als Admin-Ersatz.
- Abhängigkeit: WP0.2.
- Akzeptanz: Rollenmatrix beweist Admin-only; Secret-Scanner bleibt sauber.

**WP1.2 Skeleton-Mutationen sichern**

- Dateien: `socket/manager/theme/skeleton.rs`, Skeleton-Importpfade, Theme-Client und Tests.
- Ziel: normale Benutzer können keine globalen Assets ändern; beliebiges Same-Origin-JS wird entfernt oder separat gesandboxt.
- Abhängigkeit: WP0.2; unabhängig von WP1.1 implementierbar.
- Akzeptanz: negativer User-Test, positiver Admin-Test nur für erlaubte Assets, Browser lädt kein unkontrolliertes Script.

**Wave-1-Gate:** `bash rust/gate.sh`, `pnpm verify`, Semgrep, Gitleaks, unabhängiger Security-Review. Erst danach Deployment-Kandidat.

### Wave 2 — Spiel- und Ergebnisintegrität

**WP2.1 Game-Erstellung authentisieren**

- Eigentum: `socket/game.rs`, Registry-Limit-Tests
- Akzeptanz: anonyme Erstellung scheitert ohne State-Änderung; per-User-Limit getestet.

**WP2.2 Spieleridentität serverseitig binden**

- Eigentum: Handshake/Session/Answer-Handler plus `rust/protocol`-Contract und Web-Wiring.
- Akzeptanz: Opfer-Impersonation scheitert; Reconnect mit gültigem Player-Token funktioniert.

**WP2.3 Scores serverseitig berechnen**

- Eigentum: `http/solo.rs`, Attempt-/Scoring-Service und Tests.
- Akzeptanz: Client-Score und `correct` beeinflussen Ergebnis nicht; Duplikate und Replay scheitern.

**WP2.4 Assignment-Ownership und Regeln**

- Eigentum: Migration/Queries, `http/assignments.rs`, Submit-Validierung und Tests.
- Abhängigkeit: WP2.3 für Attempt-Modell.
- Akzeptanz: Owner-Isolation, Deadline, maximale Versuche, Quiz-Bindung und Identifier-Regeln sind serverseitig getestet.

### Wave 3 — SSRF, Limits und Session-Lebenszyklus

**WP3.1 AI-Konfiguration admin-only und SSRF-sicher**

- Akzeptanz: private/Loopback/Link-Local/Metadata-Ziele, DNS-Rebinding und Redirects werden abgewiesen; globale Keys werden nie in User-Tests benutzt.

**WP3.2 Rate Limits neu schlüsseln**

- Akzeptanz: Login-Isolation nach IP und Account; Submission-Limits nach Token/Owner; AI-Limit nutzt serverseitige Identität; konkurrierende Inserts bleiben atomar.

**WP3.3 Revocation implementieren**

- Akzeptanz: Logout, Ablauf, Passwort-/Rollenwechsel und Account-Sperre widerrufen Token und offene Sockets.

### Wave 4 — Browser, Assets und Betrieb

**WP4.1 Token-Transport und CSP**

- Abhängigkeit: WP1.2 vor strikter CSP.
- Akzeptanz: kein langlebiges Manager-Token in `localStorage`; CSRF-Modell dokumentiert und getestet; CSP und Anti-Framing live vorhanden.

**WP4.2 Theme- und Quiz-Sichtbarkeit**

- Akzeptanz: Asset-Allowlist; keine Backups im Webroot; dokumentierte Public/Private-Regel für Quiz-Liste.

**WP4.3 Interne Dienste und Deployment-Quelle**

- Akzeptanz: ComfyUI nur intern erreichbar; Rust-Service, Netzwerke, Mounts, Healthchecks, Proxy und Rollback sind in einer autoritativen Definition abgebildet.

**WP4.4 Supply-Chain-Gate**

- Installiert oder integriert `cargo-audit` und Container-CVE-Scan in CI.
- Akzeptanz: Scanner laufen reproduzierbar; Severity-Policy und Ausnahmen sind versioniert.

## 8. Verifikation und Rollout

### Pflicht-Gates pro Wave

```bash
bash rust/gate.sh
pnpm verify
semgrep --config p/security-audit --config p/secrets --error .
gitleaks detect --no-banner --redact -v
```

Ergänzend:

- neue negative AuthZ-Tests für jede betroffene Route und jedes Socket-Event
- Parallelitäts- und Replay-Tests für Score/Assignment/Quota
- passive Live-Smokes für Statuscodes, CSP, Anti-Framing und Asset-Sichtbarkeit
- `cargo audit` und Container-CVE-Scan nach Tool-Integration
- manueller Diff-Review ohne Vertrauen auf Worker-Selbstauskunft

### Rollout-Reihenfolge

1. Backup und Runtime-Baseline sichern.
2. Wave 1 separat deployen; Admin-Login, Quiz-Start, Join und Theme ohne Custom JS prüfen.
3. Wave 2 deployen; Live- und Solo-Flows mit Testdaten prüfen.
4. Wave 3 deployen; Login, Logout, AI-off und Limits prüfen.
5. Wave 4 deployen; Browser-Header, Proxy und interne Netzgrenzen prüfen.
6. Nach jeder Wave Logs auf `401/403/429/5xx`, Socket-Abbrüche und Score-Abweichungen beobachten.

### Rollback

- Pro Wave eigener Commit-/Image-Stand und DB-Migrationsplan.
- Additive Migrationen bevorzugen; destruktive Migrationen erst nach Kompatibilitätsfenster.
- Bei Auth- oder Game-Flow-Regression vorheriges Image und kompatible Konfiguration wiederherstellen.
- Rotierte Secrets niemals auf alte Werte zurücksetzen.
- Nach Rollback Security-Befund als weiterhin offen markieren.

## 9. Definition of Done

- [ ] F-01 und F-02 durch negative Rollen-Tests geschlossen.
- [ ] F-03 bis F-05 durch serverseitige Authentisierung und Bewertung geschlossen.
- [ ] F-06 blockiert interne und nicht erlaubte AI-Ziele.
- [ ] F-07 erzwingt Owner-Isolation und Assignment-Regeln.
- [ ] F-08/F-09 widerstehen globalem Lockout und frei rotierbaren Client-IDs.
- [ ] Logout, Ablauf und Sperre widerrufen Sessions und offene Sockets.
- [ ] Keine langlebigen privilegierten Tokens in JS-lesbarem Storage.
- [ ] CSP und `frame-ancestors` sind live verifiziert.
- [ ] ComfyUI ist nur aus notwendigem internen Netz erreichbar.
- [ ] Theme-Backups und private Quiz-Metadaten sind nicht anonym abrufbar.
- [ ] Autoritative Deployment-Definition reproduziert Live-System.
- [ ] Rust- und Container-CVE-Scans laufen in CI.
- [ ] `bash rust/gate.sh`, `pnpm verify`, Semgrep und Gitleaks sind grün.
- [ ] Unabhängiger Security-Reviewer hat alle CRIT/HIGH-Befunde geschlossen.
- [ ] Passive Live-Smokes zeigen keine Regression und keine Secret-Ausgabe.

## 10. Startprompt für frische Claude-Code-Session

```text
Arbeite im Projekt /nvmetank1/projects/Razzoozle/source.

Lies zuerst AGENTS.md und docs/security/rust-razzoozle-security-audit-2026-07-13.md vollständig. Der Bericht ist Evidenz und Plan, nicht bereits ausgeführte Arbeit.

Ziel: Sicherheitsbefunde in kleinen, reviewbaren Waves beheben. Starte nicht sofort mit Code. Prüfe zuerst deployte SHA und relevante Quellstellen ohne Secret-Werte auszugeben. Erzeuge danach Work-Packages für Wave 0 und Wave 1 mit disjunktem File-Ownership, Tests und Akzeptanzkriterien. CRIT/HIGH blockieren Release.

Regeln:
- keine Secret-Werte in Prompts, Logs, Tests oder Diffs;
- Writer arbeiten in eigenen Worktrees;
- AuthZ zuerst mit negativen Tests absichern;
- Contract-Dateien und Web-Wiring gehören zum verursachenden Work-Package;
- nach jedem Rust-Worker bash rust/gate.sh;
- am Wave-Ende pnpm verify, Semgrep und Gitleaks;
- Reviewer und Fix-Agent müssen verschieden sein;
- keine Produktionsmutation oder Deployment ohne ausdrückliche Freigabe;
- bei Abweichung zwischen Bericht und aktuellem Code gilt aktuelle Runtime-Evidenz. Dokumentiere Abweichung.

Liefere zuerst Wave-0/1-Plan, betroffene Dateien, Tests, Risiken und Rollback. Warte vor Produktionsänderungen auf Freigabe.
```
