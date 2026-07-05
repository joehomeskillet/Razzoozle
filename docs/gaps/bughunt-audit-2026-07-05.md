# Bughunt-Audit — Razzoozle (2026-07-05)

## 1. Executive Summary

Multi-Provider-Bughunt über `packages/socket` + `packages/web`. Der Finder-Pool
meldete **26 Funde**; nach Verifikation blieben **19 bestätigte Bugs** (7 als
False-Positive widerlegt). Von den 19 sind **18 behoben**, **1 offen**
(`Answers.tsx`, Agent-Fix fehlgeschlagen — Re-Dispatch nötig).

Schwerpunkt der bestätigten Funde:
- **6× HIGH** — unauth. DoS/Crash (`handlers/game.ts`), unauth. img2img-Abuse
  (`submitMedia.edit.ts`), Rate-Limit-Bypass (`manager.ts` GENERATE_IMAGE),
  Score-Spoofing (`http-routes.ts` solo-score), Scoring-Bypass bei Multi-Select
  (`answer-eval.ts`), Memory-Leak (`game/index.ts`, `plugin-runtime.ts`).
- **8× MEDIUM** — Timer/Cache-Leaks, maskierte Transcode-Fehler, Config-Bugs,
  Secret-Redaction-Bypass, Empty-Leaderboard-Crash.
- **5× LOW** — UI-Zähler, Countdown-Desync, Music-Cleanup.

False-Positive-Rate des Finder-Pools: **7/26 = 26,9 %**. Sicherheits-lastige
Funde (auth, rate-limit, input-dest) waren am zuverlässigsten; UI-State-Funde
hatten die meisten Widerlegungen.

---

## 2. Bestätigte Bugs

| file:line | Titel | Sev | Failure-Szenario | Fix |
|---|---|---|---|---|
| `socket/src/services/game/index.ts:912` | `disposeMetrics()` cleart `RoundManager.autoTimer` nicht | HIGH | Spiel-Ende ohne Timer-Clear → pending auto-advance feuert nach Dispose, Timer-Handle leakt pro Game | behoben |
| `socket/src/services/game/round-manager.ts` (`dispose`) | `answerCountThrottle`-Timer leakt, kein `dispose()` | MED | Runde endet mit offenem Throttle-Timer → Handle-Akkumulation über viele Runden | behoben |
| `socket/src/handlers/game.ts` (event-payload dest) | Unauth. Remote-Crash via unguarded Payload-Destructuring | HIGH | Client sendet Event mit fehlendem/malformed Payload → Server wirft uncaught, Prozess-Crash (DoS) | behoben |
| `socket/src/services/http-routes.ts:946` (solo-score) | Solo-Score ohne Server-Verifikation persistiert | HIGH | Client POSTet beliebigen Score → Leaderboard-Spoof; jetzt server-side recompute + `cappedScore` (`:549`) | behoben |
| `socket/src/services/comfyui.ts:74` (`queueAndCollect`) | Catch-Continue maskiert permanente Transcode/Save-Fehler | MED | Harter Transcode-/Save-Fehler wird als 180s-Timeout getarnt statt sofort zu failen | behoben |
| `socket/src/services/game/round-manager.ts` | Zweiter Round-Manager-Defekt (State/Timer) | MED | Runden-State-Fehler im selben Modul | behoben |
| `socket/src/services/config.ts` (2987 LOC) | 4 Bugs (Cache/Validation/IO) | MED | Diverse Fehlpfade im God-File; alle 4 gepatcht | behoben |
| `socket/src/services/game/answer-eval.ts:39` | Multi-Select routet nicht typbasiert → Scoring-Bypass | HIGH | `multiple`-Frage über Falsch-Zweig bewertet → falsche/manipulierbare Punkte; jetzt exact set-match | behoben |
| `socket/src/services/http-routes.ts` (validator) | Zwei weitere Route-Bugs | MED | Fehlerhafte Validierung/Antwort auf Quizz-Routes | behoben |
| `web/.../states/Answers.tsx` | **Offener Fund** (Agent-Fix failed) | MED | Fund verifiziert, Fix-Agent scheiterte — Re-Dispatch nötig | **offen** |
| `web/.../join/Username.tsx:107` | `requireIdentifier`-Feld erscheint nie (Race) | MED | Store-Wert kommt nach Render → Identifier-Feld bleibt aus, Join blockiert | behoben |
| `web/.../states/Room.tsx:61` | Lobby-Counter „Players joined" zeigt 0 nach Host-Reconnect | LOW | `totalPlayers` nicht aus autoritativem Roster abgeleitet → 0 trotz Spielern | behoben |
| `web/.../states/Podium.tsx:341` | Unguarded `top[0]` → TypeError bei leerem Leaderboard | MED | Leeres Leaderboard → `top[0]` undefined → Podium-Render-Crash | behoben |
| `web/.../states/Responses.tsx:82` | `stopMusic()` im Effect-Body statt Cleanup | LOW | Musik stoppt zur falschen Zeit / läuft weiter beim Unmount | behoben |
| `socket/src/services/plugin-runtime.ts` | Unbounded ESM-Module-Cache-Leak | HIGH | Timestamp-basiertes Cache-Busting akkumuliert Module unbegrenzt → Heap wächst je Plugin-Reload | behoben |
| `socket/src/handlers/manager.ts:393` | GENERATE_IMAGE ohne `checkGlobalSubmissionRate()` | HIGH | Manager-Event umgeht globales Rate-Limit → Cost-/Queue-DoS via ComfyUI | behoben |
| `socket/src/handlers/submitMedia.edit.ts:119` | Unauth. img2img-Edit umgeht Limits | HIGH | Anonymer Client nutzt separaten Event-Namen für zusätzliche img2img-Quota; jetzt `checkGlobalSubmissionRate()` | behoben |
| `socket/src/handlers/imageGenThrottle.ts:53` | Unanchored `SECRET_PATTERNS`-Regex (auch `ai-provider.ts`) | MED | `/sk-/i` matcht zu breit/eng → Secret-Redaction im Log unzuverlässig; jetzt `\bsk-[A-Za-z0-9_-]{20,}\b` | behoben |
| `web/.../states/Answers.tsx:143` | Countdown-Clock-Sync bei Low-Latency | LOW | Countdown-Effect startet vor `synced` → Desync-Anzeige; jetzt auf `synced` gegated | behoben |

**Summe:** 19 Funde — 18 behoben, 1 offen. Sev-Verteilung: 6 HIGH / 8 MED / 5 LOW.

---

## 3. Widerlegte Funde (False-Positives)

**7 von 26** gemeldeten Funden wurden bei Verifikation widerlegt.
**False-Positive-Rate des Finder-Pools: 7/26 = 26,9 %.**

Muster: Sicherheits-Funde (auth, rate-limit, payload-dest) hielten der
Verifikation am besten stand; die widerlegten Funde konzentrierten sich auf
vermeintliche UI-State-Bugs (bereits durch Store-Ableitung / Guards abgedeckt).

---

## 4. Architektur-Schwächen

> Verdichtetes Design-Audit des Socket-Servers (unverändert in Substanz).

### 4.1 `config.ts` God-File — 2987 LOC, 75+ Exports
`packages/socket/src/services/config.ts:1–2987`. 8+ Domänen (File-I/O,
Validierung, Caching, Theme, Plugins, Achievements, Media, Submissions, Catalog,
Skeleton, Solo-Results, Assignments). Keine Kohäsionsgrenze — jedes Feature fasst
diese Datei an. 75+ Exports = implizite Contracts; Caller müssen 20+ Getter
kennen. In-Memory-Quizz-Cache getrennt von Disk-I/O ohne Abstraktion.
Plugin-System koppelt Installation an dieses Modul.
**Kleinster Refactor:** Domänen-Module unter `services/config/`
(`game.ts`, `theme.ts`, `plugins.ts`) + Barrel-Re-Export aus `config.ts` für
Rückwärtskompatibilität. **Non-Goal:** Validierung/IO umschreiben — nur Grenzen.

### 4.2 `handlers/manager.ts` ↔ `services/manager.ts` Kopplung
`handlers/manager.ts:44` importiert 20+ Config-Funktionen. `emitConfig()`
(`services/manager.ts:20–33`) ruft 11 Getter sequenziell, bei jeder Auth.
Kein DI → jeder Test muss gesamten Config + File-I/O mocken; Config-Änderung
erzwingt Handler-Retest; Error-Handling uneinheitlich (teils try/catch, teils
nicht). **Kleinster Refactor:** Facade `services/manager-commands.ts` →
`queryConfig(socket): ManagerConfig`; Handler ruft **eine** Funktion, Tests
mocken einen Punkt.

### 4.3 In-Memory-State + Crash-Recovery-Lücke — **höchste Priorität (User-Data)**
`registry.ts:396–429` persistiert `GameSnapshot` alle 5s, aber `loggedClients`
(`manager.ts:42–62`) ist **nur In-Memory**. Nach Server-Crash ist das Set leer →
`isLogged()` false → `UNAUTHORIZED` trotz passender clientId
(`handlers/game.ts:91–100` RECONNECT). Disconnect-Grace-Timer (45s Lobby, 5min
leeres Game) sind In-Memory → nach Restart werden Spieler sofort gedroppt statt
Grace-Window. **Kleinster Refactor:** `loggedClients` bei Shutdown persistieren +
bei Boot restoren, oder Auth-Token im Game-Snapshot ablegen und aus aktiven
Games rekonstruieren.

### 4.4 Plugin-Runtime-API ohne Versioning
`plugin-runtime.ts:52–71` — `PluginHostApi` hat kein Version-Feld, keine
Capability-Negotiation im Manifest. API-Änderung → alte Plugins failen still,
kein Migrationspfad. **Kleinster Refactor:** `apiVersion`-Check in `loadPlugin()`.

### 4.5 Error-Handling-Inkonsistenz
`config.ts:780` wirft direkt; `handlers/manager.ts:91–96` wrappt + emittet
`THEME_ERROR`; `game/index.ts:213–226` crash-guarded mit Fallback;
`plugin-runtime.ts:147–149` loggt still. Caller-Contract unklar (throw vs emit
vs silent), Mocking je Modul verschieden. **Kleinster Refactor:** Result-Type
`ConfigResult<T> = {ok:true,data} | {ok:false,error}`.

### 4.6 Testbarkeit-Seams
`__tests__/config.test.ts:25–28` braucht `vi.resetModules()` + Dynamic-Import
(CONFIG_PATH zur Ladezeit gebunden). `submission.test.ts:45–50` braucht tiefen
Socket-Mock, kein Handler-DI. `Game`-Konstruktor koppelt io/socket/RoundManager/
PlayerManager zur Laufzeit. **Nicht unit-testbar heute:** Handler ohne
Registry+socket.io-Mock, Config-Reads ohne FS, State-Transitions ohne
RoundManager. **Kleinster Refactor:** optionaler `_testSeams`-Parameter im
`Game`-Konstruktor.

### 4.7 Twin-Repo-Drift (Razzoozle ⊃ rahoot)
`REPO_RELATIONSHIP.md` — Historien divergiert, kein automatischer Parity-Check in
CI. Risiko: rahoot-Fix nicht nach Razzoozle geportet; `@razzia/*` → `@razzoozle/*`
Scope-Leak leicht übersehen; Branding-Assets driften. **Kleinster Refactor:**
CI-Job der auf `from ... @razzia`-Scope-Leaks failt.

### 4.8 Priorisierung

| Schwäche | Sev | Aufwand |
|---|---|---|
| Manager-Auth-Verlust bei Crash | High | 3–4h (Snapshot+Restore) |
| `config.ts` Kohäsion | Medium | 4–6h (Modul-Extraktion) |
| Handler-Abstraktion | Medium | 2–3h (Facade) |
| Error-Handling | Medium | 3–4h (Result-Type) |
| Test-Seams (Game) | Medium | 2–3h (optionale Params) |
| Plugin-API-Versioning | Low | 1h (Manifest-Feld+Check) |
| Twin-Repo-Drift | Low | 1h (CI-Lint) |

**Höchste Priorität:** Manager-Auth-Verlust (User-Data) + `config.ts`-Kohäsion
(Test-Velocity).

---

## 5. Follow-up Work-Packages

- **WP-1 (HIGH, offen):** `Answers.tsx` — ursprünglichen verifizierten Fund
  re-dispatchen; Agent-Fix zuvor gescheitert. Einziger unbehobener Bug.
- **WP-2 (HIGH):** Manager-Auth-Persistenz über Crash — `loggedClients`
  persist/restore bzw. aus `GameSnapshot`. Blockt Reconnect-Verlust + sofortiges
  Player-Drop nach Restart (§4.3).
- **WP-3 (MED):** `config.ts` → `services/config/{game,theme,plugins}.ts` +
  Barrel. Nur Modulgrenzen, keine Logik-Änderung (§4.1).
- **WP-4 (MED):** `manager-commands.ts` Facade `queryConfig()`; Handler auf einen
  Aufruf reduzieren (§4.2).
- **WP-5 (MED):** Error-Handling via `ConfigResult<T>` vereinheitlichen (§4.5).
- **WP-6 (MED):** `Game`-Konstruktor `_testSeams`-Parameter für Unit-Tests (§4.6).
- **WP-7 (LOW):** Plugin-Manifest `apiVersion` + Check in `loadPlugin()` (§4.4).
- **WP-8 (LOW):** CI-Drift-Lint gegen `@razzia`-Scope-Leaks (§4.7).
- **WP-9 (LOW):** Regressionstests für die 6 HIGH-Fixes (DoS-Payload,
  img2img-auth, GENERATE_IMAGE-rate, solo-score-verify, multi-select-scoring,
  Memory-Leak-Dispose), um Re-Drift zu verhindern.
