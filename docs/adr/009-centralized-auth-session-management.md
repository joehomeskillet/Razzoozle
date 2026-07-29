# ADR 009 — Zentralisierte Authentifizierung und Sitzungsverwaltung

Datum: 2026-07-29 · Status: angenommen (HTTP+Socket) / vorgeschlagen (Legacy-Fallback & Logging) · Kontext: #565, SEC-001 bis SEC-010

## Kontext

Razzoozle authentifiziert Anfragen über drei Kanäle:

1. **HTTP-Manager-Anfragen** (Admin-Panel, Lehrkräfte, API): Token via `Authorization: Bearer` oder `X-Manager-Token`-Header
2. **Socket-Ereignisse** (Spielhosts, Manager): Token aus dem WebSocket-Handshake
3. **Legacy-Spiele** (pre-Wave-1-Snapshots): `manager_client_id` aus localStorage

Diese Untersuchung dreht sich um drei Fragen:

- **Wie wird authentifiziert, und an wie vielen Stellen?** Gibt es eine zentrale Funktion oder mehrere parallele Implementierungen?
- **Was passiert mit offenen Socket-Verbindungen, wenn die Sitzung widerrufen wird?** Bleibt die Verbindung authentifiziert?
- **Broadcast & Raumzugehörigkeit:** Wer darf an wen senden, und wird bei jedem Sender geprüft?

Zwei bekannte Befunde:

1. **Legacy-Fallback in `is_game_host()`:** Wenn `game.owner_user_id` ist `None` (alte Snapshots), akzeptiert die Funktion einen lokalen `manager_client_id` als Eigentumsnachweis (main.rs, Zeile 87–90). Diese `client_id` liegt unverschlüsselt im Browser-localStorage, ist kurzlebig, aber webs-angreifbar.

2. **Unredacted Capabilities in Logs:** `REDACT_KEYS` in `http/logs.rs` enthält `"token"` (generisch), aber nicht spezialisierte camelCase-Schlüssel wie `hostToken` oder `sessionToken`. Sie bleiben ungeheim in DEV-Logs stehen.

## Ist-Zustand (gründliche Erhebung)

### HTTP-Authentifizierung

**Zentrale Gateways:**

- `auth::ensure_manager_user(headers, db_pool)` → `Option<AuthUser>`
  - Prüft `Authorization: Bearer` oder `X-Manager-Token` (Bearer zuerst)
  - Ruft `db::users::session_user(token)` auf
  - Token-Hash-Abfrage mit `expires_at > now()` und `u.active = true`
  - Wird in `handle_get_assignment_results()` **korrekt** verwendet (assignments.rs, Zeile 343)
  - Zusätzlich wird Ownership via `can_view_assignment_results(role, owner_id, user_id)` geprüft (Zeile 376)

- `auth::ensure_admin(headers, db_pool)` → `bool`
  - Wrapper über `ensure_manager_user()`, zusätzlich `role == "admin"`

- `auth::ensure_admin_user(headers, db_pool)` → `Option<AuthUser>`
  - Wie `ensure_admin`, gibt aber `AuthUser` zurück (für Rollen-Logging)

**Fehler in HTTP:**

- `handle_get_assignment(id)` (assignments.rs, Zeile 284) **hat KEINE Auth-Prüfung**
  - Ruft nur `safe_asset_id(&id)` auf
  - Das ist wahrscheinlich intentional (öffentliche Assignment-Metadaten?), aber sollte dokumentiert sein

**Dev-Routen:**

- `authorize_dev_request(headers, _registry)` für `/metrics`, `/logs`, usw.
- Prüft `Authorization: Bearer` oder `X-Manager-Token` gegen `DEV_API_KEY` (Umgebungsvariable)
- Verwendet `constant_time_eq` (timing-safe Vergleich)
- **Fail-closed:** Wenn kein Key konfiguriert, werden alle Dev-Anfragen abgelehnt

### Socket-Authentifizierung

**Handshake & Caching:**

- `HandlerCtx::require_user()` ist das zentrale Gateway (socket/mod.rs, Zeile 30)
  - Liest `session_token` aus dem Handshake-Payload (nicht aus HTTP-Headern!)
  - Ruft `db::users::session_user(token)` mit demselben Token-Hash-Lookup auf
  - **Cacht das Ergebnis** in `HandlerCtx::user_cache` (RwLock<Option<AuthUser>>)
  - Alle Handler in derselben Socket-Verbindung teilen denselben Cache

- `HandlerCtx::require_admin()` wie oben, zusätzlich `role == "admin"`

**Sitzungswiderruf und offene Sockets:**

Beobachtung in `socket/manager/auth.rs`:

- LOGOUT-Handler (Zeile 23) ruft `ctx.require_user()` auf
- Findet eine gültige Sitzung, führt `delete_session(pool, token)` aus
- **Dann löscht es den Cache:** `*cache = None` (Zeile 39)
- Kommende Handler-Aufrufe auf **derselben Socket-Verbindung** sehen `require_user() → None` (Zeile 52–61)

**Status:** Wenn eine Sitzung in der Datenbank widerrufen wird (z.B. Benutzer deaktiviert, Sitzung gelöscht durch einen anderen Client), wird ein Handler auf derselben Socket-Verbindung bei der nächsten Anfrage NICHT revalidieren, solange der Cache noch gültig ist (bis zu RwLock-Neulösung). Das ist ein **Reauthentifizierungs-Gap.**

### Broadcast & Raumzugehörigkeit

**Keine explizite Sender-Prüfung bei Broadcasts:**

- Handler senden über `socket.emit(event_name, data)` oder `socket.to(room).emit(...)`
- **Es gibt keine Prüfung, wer in einem Raum senden darf.** Jeder authentifizierte Socket im Raum kann ein Event an den Raum senden.
- Räume werden nach `game_id` benannt (socket.join(game_id.clone()), game.rs, Zeile 159)
- Senderberechtigungen werden auf **Handler-Ebene** geprüft (z.B. `is_game_host()` für `game:start`), nicht auf Raum-Ebene

**Beispiel: game:start Handler (game.rs, Zeile ~145):**
```rust
if !crate::is_game_host(&game, &payload, &ctx.client_id, ctx.require_user().await) {
    return; // Silently deny (common pattern)
}
// Proceed to emit
socket.to(game_id).emit(constants::game::START, ...).ok();
```

Dieser Handler prüft Ownership, bevor er sendet. Die Raumzugehörigkeit ist sekundär.

### Legacyfall: `is_game_host()` mit Fallback

**Befund 1 bestätigt:**

In `main.rs`, Zeile 87–90:

```rust
if game.owner_user_id.is_none() {
    if let Some(owner_client_id) = &game.manager_client_id {
        return owner_client_id == client_id;
    }
}
```

- Nur wenn `owner_user_id` fehlt (alte Snapshots), wird `manager_client_id` akzeptiert
- `snapshot.rs`, Zeile 198: `let owner_user_id = snap.get("ownerUserId").and_then(|v| v.as_i64());`
  - Fehlt das Feld, wird `None` gespeichert
- **Risiko:** Ein Spieler mit derselben `client_id` (vom selben Browser, falls localStorage erhalten), könnte diesen Spielzustand wieder übernehmen
- **Minderung:** `client_id` ist UUIDv4 + ephemär (pro Session neu generiert), aber localStorage-angreifbar in XSS-Szenarien

**Tests zeigen Intention (main.rs, Zeile 179–186):**
- Legacyspiele **ohne** Benutzer-Auth werden **abgelehnt** (`is_game_host_legacy_fallback_denies_without_user()`)
- Aber Admin-Rolle **überschreibt** das (`is_game_host_legacy_with_admin()`, Zeile 189–196)

### Logging & Geheimnisse

**Befund 2 bestätigt:**

`REDACT_KEYS` in `logs.rs`, Zeile 82–97:
```rust
const REDACT_KEYS: &[&str] = &[
    "password",
    "managerPassword",
    "apiKey",
    "devApiKey",
    "key",
    "token",          // ← generic
    "authorization",
    // ...
];
```

- **generisches `token`** wird redacted → aber...
- `hostToken` und `sessionToken` sind **exakte Schlüsselnamen**, nicht enthalten
- Die Redaction sucht: `if REDACT_KEYS.contains(&k.as_str())` (exakte Übereinstimmung)
- **Resultat:** Logs enthalten `hostToken: "abc123"` und `sessionToken: "def456"` **ungeheim**

**Auftreten:**
- DEV-Logs (GET `/api/v1/observability/logs`) sind dev-gated (`authorize_dev_request`)
- Aber einmal heruntergeladen, sind diese Fähigkeits-Tokens sichtbar
- `host_token` ist UUIDv4 (122 Bit), tragfähig; `sessionToken` ist auch kritisch

## Entscheidung

### HTTP + Socket — angenommen

**Eine zentrale Authentifizierungskette für HTTP und Socket ist aktuell der Standard und wird beibehalten:**

1. HTTP: `auth::ensure_manager_user()` → `session_user()` mit Bearer/X-Manager-Token
2. Socket: `HandlerCtx::require_user()` → `session_user()` mit Handshake-Token
3. Dev-Routen: `authorize_dev_request()` mit `constant_time_eq`

**Konkret:**

- `crate::db::users::session_user(pool, token)` ist die Single Source of Truth (Zeile 199–212 in `db/users/mod.rs`)
  - Alle Kanäle delegieren dorthin
  - Sie prüft `expires_at > now()` und `u.active = true` **konsistent**
  - Diese Consolidation wurde in WP-0 / WP-2-7 durchgeführt
- `handle_get_assignment()` hat keine Auth-Prüfung, was intentional sein kann → **SEC-002 wird klären** (Bestandszustand beibehalten, bis SEC-002 entscheidet)
- Die `auth/`-Modul-Struktur ist gut und wird erweitert

### Socket-Reauthentifizierung — vorgeschlagen

**Die `HandlerCtx::user_cache` ist ein Single-Shot-Cache (kein Reload pro Handler).** Wenn eine Sitzung nach dem Handshake in der Datenbank widerrufen wird, erfährt ein Handler auf derselben Socket-Verbindung nichts davon, **solange er nicht `require_user()` erneut aufruft.**

Dies ist ein Trade-off zwischen Latenz (Netzwerk-Ronde bei jedem Handler) und Konsistenz (stale Authorizations).

**Entscheidung:**

- **Handler-spezifische Reauthentifizierung:** Handler, die Änderungen an kritischen Zuständen vornehmen (`game:start`, `record_answer`, Logout), müssen `ctx.require_user()` **explizit** aufrufen und **nicht** dem Cache vertrauen, wenn der Zustand hochsensibel ist (z.B. Spielen mit kritischen Fragen).
- **Für Observer-Handler** (Telemetrie, Metriken): Der Cache ist ausreichend.
- **Benutzer-Deaktivierung ist unkritisch für offene Sockets:** Ein deaktivierter Benutzer kann technisch noch nach Logout neue Anfragen auf seiner Socket-Verbindung stellen (alte Session gelöscht, neuer Handshake erforderlich). Das ist ein **akzeptiertes Risiko für Folgenwellen** (SEC-003).

**Status:** vorgeschlagen. Implementierung in SEC-003 / SEC-004.

### Legacy-Fallback auf `manager_client_id` — vorgeschlagen

**Der Fallback ist für alte Snapshots notwendig, um bestehende Spiele nicht zu unterbrechen.** Aber er ist ein Sicherheitsrisiko.

**Entscheidung:**

1. **Der Fallback wird beibehalten für Prod-Kompatibilität**, solange alte Snapshots existieren. Er wird mit `tracing::warn!()` protokolliert (`silent_unauthorized_is_game_host` / `auto_silent_unauthorized_is_game_host.md` bestätigt dieses Muster).
2. **Neue Spiele (Wave-1+) müssen `owner_user_id` haben**, nicht `manager_client_id`. Der Fallback wird nicht aufgerufen.
3. **Prüfung vor Entfernung des Fallbacks:** `SEC-005` wird einen Migration-Audit durchführen → Wie viele aktive Spiele haben noch `owner_user_id IS NULL`? Wenn <0,5%, kann der Fallback aufgelöst werden.
4. **Risiko-Bewusstsein:** Die Tests zeigen, dass Legacyspiele **ohne Benutzer abgelehnt** werden — aber der Admin-Bypass übergeht das. Das ist korrekt (Admins sollen alte Spiele reparieren können), aber sollte gemint werden.

**Status:** vorgeschlagen. Audit in SEC-005.

### Broadcast-Autorisierung — vorgeschlagen

**Es gibt keine zentrale Raumzugehörigkeits-Prüfung vor Broadcasts.** Stattdessen prüft jeder Handler Ownership, bevor er sendet.

**Entscheidung:**

1. **Handlerspezifische Gateways bleiben Standard:** Jeder Handler, der ein Broadcast-Event sendet, muss den Sender authentifizieren (z.B. `is_game_host()`, `require_admin()`).
2. **Keine globale Raumzugehörigkeits-Policy:** Raumzugehörigkeit (`socket.join()`) ist kein Authentifizierungsmechanismus, sondern ein Routing-Primitive.
3. **Sender-Prüfung ist Handler-spezifisch und wird durch SEC-006 kodifiziert** (gilt für jeden Socket-Handler, der `.emit()` oder `.to().emit()` aufruft).

**Status:** vorgeschlagen. Spezifikation in SEC-006.

### Logging-Geheimnisse — vorgeschlagen

**`hostToken` und `sessionToken` erscheinen ungeheim in DEV-Logs.**

**Entscheidung:**

1. **REDACT_KEYS wird erweitert** (SEC-007): Füge `"hostToken"` und `"sessionToken"` explizit hinzu.
2. **Review REDACT_KEYS für weitere camelCase-Schlüssel:** `clientToken`, `deviceToken`, `refreshToken`, `studentToken`, usw. → Alle sollten explizit gelistet sein (oder eine camelCase-Variante der generischen `token`-Regel).
3. **DEV-Logs werden bereits dev-gated** (`authorize_dev_request`), aber Best Practice ist, Geheimnisse erst gar nicht zu loggen.

**Status:** vorgeschlagen. Implementierung in SEC-007.

## Konsequenzen

### Positive
- **Zentrale Authentifizierungskette ist in Ort:** `session_user()` ist Single Source of Truth.
- **HTTP und Socket sind konsistent:** Beide benutzen denselben `session_user()` Lookup.
- **Dev-Routen sind fail-closed:** `DEV_API_KEY` ist erforderlich, und nur Konstante-Zeit-Vergleich wird zugelassen.
- **Tests zeigen Intention:** `is_game_host()` Tests sind detailliert und dokumentieren Legacy-Fallback-Semantik.

### Kosten
- **Socket-Cache ist ein stale-Authorization-Gap:** Ein Benutzer, der auf derselben Socket-Verbindung bleibt, könnte nach Logout kurzzeitig noch Anfragen stellen (bis nächster `require_user()`-Aufruf). Für kritische Operationen müssen Handler explizit revalidieren.
- **Legacy-Fallback ist Schuld:** `manager_client_id` ist ein weicher Beweis (browser-localStorage). Alte Spiele sind solange angreifbar, bis sie neuinstanziert oder migriert sind.
- **Geheimnisse in Logs:** `hostToken` und `sessionToken` sind aktuell ungeheim. Das ist ein Datenschutzmissstand, aber nur in dev-gated Logs.

### Keine Doppel-Implementierung
- `session_user()` wird von HTTP und Socket geteilt.
- `auth/`-Modul fasst Manager-Token-Auflösung zusammen (WP-2-7).
- Keine parallelen `require_user()`- oder `session_user()`-Implementierungen gefunden.

### Zukünftige Wellen
- **SEC-001:** Rollout der Architektur-Beschreibung.
- **SEC-002:** Authentifizierung von `handle_get_assignment()` klären (öffentlich oder geheim?).
- **SEC-003, SEC-004:** Socket-Reauthentifizierungs-Gaps adressieren (kritische Handler).
- **SEC-005:** Legacyfall-Audit (wie viele `owner_user_id IS NULL` existieren noch?).
- **SEC-006:** Broadcast-Sender-Spezifikation kodifizieren.
- **SEC-007:** REDACT_KEYS erweitern, `hostToken` und `sessionToken` hinzufügen.

## Referenzen

- `rust/server/src/auth/mod.rs`: Zentralisierte Manager-Token-Auflösung (WP-0, WP-2-7)
- `rust/server/src/db/users/mod.rs` L199: `session_user()` Token-Hash-Lookup
- `rust/server/src/socket/mod.rs` L30: `HandlerCtx::require_user()` Socket-Gateway
- `rust/server/src/main.rs` L61: `is_game_host()` mit Legacy-Fallback
- `rust/server/src/state/snapshot.rs` L198: `ownerUserId` Fallback zu None
- `rust/server/src/http/logs.rs` L82: REDACT_KEYS (fehlend: `hostToken`, `sessionToken`)
- `rust/server/src/http/assignments.rs` L284: `handle_get_assignment()` (keine Auth)
- `rust/server/src/http/assignments.rs` L338: `handle_get_assignment_results()` (Auth korrekt)
- `rust/server/src/socket/manager/auth.rs` L23, L54: LOGOUT & RECONNECT Handler
- Issue #565: ADR-009 Request
- Issues #705–#714: SEC-001 bis SEC-010 Spezifikationen
- Memory: `auto_silent_unauthorized_is_game_host.md` (gefundener Bestand)
- Memory: `project_wp1c_self_admin_guard.md` (Admin-Sicherheits-Referenz)
