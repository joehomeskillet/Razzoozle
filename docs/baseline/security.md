# Sicherheits- und Session-Baseline

Datum: 2026-07-29 · Basis: ADR-009 (docs/adr/009-centralized-auth-session-management.md) · Relevant: Issues #552, #705, #706, #815

## Überblick

Razzoozle authentifiziert Anfragen über drei Kanäle: HTTP-Manager-Anfragen (Authorization: Bearer oder X-Manager-Token), WebSocket-Ereignisse (Token im Handshake-Payload) und Legacy-Spiele (manager_client_id aus localStorage). Diese Baseline dokumentiert die Umsetzung — nicht die Entscheidung — und trägt bekannte Grenzen ausdrücklich auf.

## HTTP-Authentifizierung

### Zentraler Gateway

`auth::ensure_manager_user(headers: &HeaderMap, db_pool: &Option<sqlx::PgPool>) -> Option<AuthUser>`

- Wird in allen Manager-Endpunkten aufgerufen (z.B. assignments.rs Zeile 343–376)
- Prüft `Authorization: Bearer <token>` (Vorrang), fällt auf `X-Manager-Token` zurück
- Delegiert an `crate::db::users::session_user(pool, token)`
  - Token-Abfrage: `tokens` Tabelle mit `token_hash`, prüft `expires_at > now()` und `u.active = true`
  - Rückgabe: `Option<AuthUser>` mit `user_id` und `role`
- Zusätzliche Autorisierung auf Handler-Ebene (z.B. assignments-Results: nur Admin oder owner_id-Match)

Fail-Closed: Ungültiges/fehlendes Token → None

### Admin-spezifische Gates

- `auth::ensure_admin(headers, db_pool) -> bool`: Wrapper über `ensure_manager_user`, zusätzlich `role == "admin"`
- `auth::ensure_admin_user(headers, db_pool) -> Option<AuthUser>`: Gibt AuthUser zurück für Logging von abgelehnten Rollen

### Dev-Routen

Endpunkte wie GET `/api/v1/observability/logs` (logs.rs Zeile 265–300):
- Nutzen `authorize_dev_request(headers, _registry) -> bool`
- Prüfen `Authorization: Bearer` oder `X-Manager-Token` gegen `DEV_API_KEY` (Umgebungsvariable)
- Timing-sichere Vergleich: `constant_time_eq`
- Fail-Closed: Wenn `DEV_API_KEY` nicht konfiguriert, werden alle Dev-Anfragen abgelehnt

## Socket-Authentifizierung

### Handshake & Caching (socket/mod.rs Zeilen 30–91)

`HandlerCtx::require_user() -> Option<AuthUser>`

- Liest `session_token` aus Handshake-Payload (NICHT aus HTTP-Headern)
- Prüft Cache zunächst: `user_cache: Arc<RwLock<Option<CachedUserWithTimestamp>>>`
  - **Cache-TTL in Produktion: 30 Sekunden** (socket/mod.rs Zeile 20)
  - **Cache-TTL in Tests: 0 Sekunden** (erzwingt unmittelbare Revalidierung)
- Nach Ablauf der TTL: Revalidierung gegen DB über `session_user(pool, token)`
- Speichert Ergebnis mit `cached_at: Instant::now()`

**Sitzungswiderruf:** Wenn eine Sitzung in der DB gelöscht wird (z.B. Benutzer deaktiviert), wird ein Handler auf derselben Socket-Verbindung bei der nächsten Anfrage erst dann benachrichtigt, wenn der Cache abläuft (bis zu 30 Sekunden später). Das ist das Reauthentifizierungs-Gap (dokumentiert in ADR-009 als akzeptiertes Risiko für Wellen nach SEC-003/SEC-004).

### Admin-Check

`HandlerCtx::require_admin() -> Option<AuthUser>`

- Ruft `require_user()` auf, filtert zusätzlich `role == "admin"`

## Login & Brute-Force-Throttle

### Login-Handler (http/login.rs Zeilen 111–122)

POST `/api/login` mit Username und Password:

1. **Throttle-Schlüssel-Ableitung**
   - Extrahiert `X-Forwarded-For` (erste IP) und `X-Real-IP` Header
   - Nutzt `crate::state::client_throttle_key(peer_ip, xff, real_ip)` (rate_limit.rs Zeilen 359–383)
   - **Vertraute Proxys (Loopback oder Private-Range):** Prüft Header
   - **Untrusted Peer:** Ignoriert Header, bindet an direkte Peer-IP (verhindert Header-Spoofing)
   - Resultat: Pro-Client-Schlüssel (z.B. "203.0.113.5")

2. **Throttle-Check** (login.rs Zeile 38)
   - `RATE_LIMITER.is_auth_throttled_per_client(client_key)` — reiner Blick ohne Inkrementierung
   - Wenn über Limit: 401 mit generischer Fehlermeldung, keine Nutzeridenumeration

3. **Passwort-Verifikation** (login.rs Zeilen 57–85)
   - `db::users::find_user_for_login(pool, username)` sucht Benutzer
   - `db::users::verify_password(hash, password)` prüft Passwort
   - **Fehler bei User nicht gefunden ODER Passwort falsch:**
     - `RATE_LIMITER.record_auth_failure_per_client(client_key)` — nur bei tatsächlichem Fehler inkrementieren
     - Gleichzeitig 401 mit Fehlermeldung

4. **Rate-Limits** (state/mod.rs Zeile 5–6)
   - `AUTH_RATE_MAX_PER_CLIENT: i32 = 10` — max 10 Fehler pro Client
   - `SOLO_RATE_WINDOW_MS: u64 = 60_000` — Fenster von 60 Sekunden
   - Fenster-Reset: Automatisch bei Fenster-Ablauf

5. **Session-Mint** (login.rs Zeile 88)
   - `db::users::mint_session(pool, user_id, 7).await` erzeugt Token
   - Gültigkeitsdauer: 7 Tage
   - Token ist ein zufälliger String (Hashing: siehe DB-Layer)

### Trusted-Proxy-Logik (rate_limit.rs Zeilen 342–383)

```rust
fn is_trusted_proxy(ip: IpAddr) -> bool {
    if ip.is_loopback() { return true; }
    match ip {
        IpAddr::V4(ipv4) => ipv4.is_private(),
        IpAddr::V6(_ipv6) => false,  // IPv6 nicht vertraut
    }
}
```

**Vertraute Proxys:** 127.0.0.1, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16

**Sicherheits-Implikation:** Der Vertrauensbereich umfasst das gesamte private Netz (Docker-Bridge, Kubernetes, Datencenter-Netzwerk). Wenn der Server auf einem offenen Netz erreichbar ist oder eine private IP von außen geroutet wird, können Angreifer die Throttle umgehen. Mitigation: Firewall muss Server auf Loopback/Private-Range beschränken.

## Sicherheits-Header

### Zentrale Layer (http/security_headers.rs)

Alle Responses erhalten Headers via Middleware nach `.fallback()`:

- **X-Content-Type-Options: nosniff** (Zeile 25–28)
  - Verhindert MIME-Sniffing in Browsern
  - z.B. behandelt hochgeladenes Bild nicht als JavaScript

- **X-Frame-Options: SAMEORIGIN** (Zeile 34–37)
  - Blockiert Cross-Origin-Framing
  - Ermöglicht aber Same-Origin-Framing (falls die App iframes braucht)

- **Referrer-Policy: strict-origin-when-cross-origin** (Zeile 43–46)
  - Cross-Origin-Anfragen senden nur Origin (nicht URL/Query)
  - Same-Origin-Anfragen behalten vollständigen Referrer
  - Schutz: Wenn PIN/Tokens versehentlich in URL landen, leaken sie nicht zu Third Parties

### Nicht enthalten: Content-Security-Policy

**Absichtlich ausgelassen** (security_headers.rs Zeile 7):
- 43 Dateien enthalten Inline-Styles
- Eine restriktive CSP würde die App brechen
- ADR-009 lädt alternative Mitigationen auf später (SEC-008)

## Spielverwaltung & Ownership

### is_game_host() (main.rs Zeilen 61–100)

Drei-Ebenen-Ownership-Check:

1. **hostToken** (Zeile 68–99)
   - Wenn `payload.hostToken` vorhanden und valid: autoritativ
   - Vergleich: `hostToken` als String gegen `game.host_token`

2. **Authenticated User + Admin Bypass** (Zeile 73–82)
   - Wenn Benutzer authentifiziert und `role == "admin"`: Besitzer (Zeile 74–75)
   - Wenn Benutzer `user_id` mit `game.owner_user_id` matcht: Besitzer (Zeile 78–82)

3. **Legacy-Fallback** (Zeile 87–91)
   - Nur wenn `game.owner_user_id == None` (Pre-Wave-1 Snapshot)
   - Fallback auf `game.manager_client_id` (UUIDv4, ephemär pro Session)
   - **Risiko:** `client_id` liegt in Browser-localStorage, angreifbar bei XSS
   - **Mitigation:** Admin-Prüfung übergeht Fallback nie ohne Logging (siehe auto_silent_unauthorized_is_game_host.md)

### Tests (main.rs Zeilen 178–197)

- Legacy-Spiele **ohne** Benutzer-Auth werden **abgelehnt** (Zeile 179–186)
- Admin-Rolle **übergeht** Legacy-Fallback (Zeile 189–196)
- Korrekt: Admin can alte Spiele reparieren, aber Fallback selbst ist nicht offen

## Logging & Geheimnisse

### Redaction-Regel (http/logs.rs Zeilen 82–97)

DEV-gated Endpunkt GET `/api/v1/observability/logs/server` (dev-gated via `authorize_dev_request`):

```rust
const REDACT_KEYS: &[&str] = &[
    "password",
    "managerPassword",
    "apiKey",
    "devApiKey",
    "key",
    "token",        // ← generisch
    "authorization",
    "cookie",
    "dataUrl",
    "baseUrl",
    "solutions",
    "correct",
    "acceptedAnswers",
    "answerText",
];
```

**Bekannte Lücke:** Spezialisierte camelCase-Tokens wie `hostToken`, `sessionToken`, `clientToken`, `deviceToken` sind **NICHT** gelistet — sie erscheinen ungeheim in Logs (bis SEC-007, geplant).

**Redaction-Scope:** 
- Exact-Match auf Schlüsselnamen (z.B. `k.as_str()`)
- Rekursive Tiefe über `redact_value()`

**Risiko-Bewertung:**
- DEV-Logs sind dev-gated (nur mit `DEV_API_KEY`)
- Aber einmal heruntergeladen, sind Tokens sichtbar
- `hostToken` ist UUIDv4 (122 Bit), `sessionToken` auch kritisch

## Unverschlüsselte Metadaten

### Assignment-Zugriff ohne Auth (http/assignments.rs Zeile 284–300)

GET `/api/v1/assignments/{id}`:

- **Keine Auth-Prüfung** (nur `safe_asset_id(&id)` Validierung)
- Gibt Quiz-Metadaten zurück: `quiz_id`, `assigned_at`, `metadata`
- **Intention:** Vermutlich öffentliche Assignment-Metadaten (bedarfsgerechte Generalisierung?)

**Bekannte Grenzen:**
- Assignment-ID (`id`) ist eine 48-Bit-Kennung (hex-String, z.B. "a1b2c3d4e5f6")
- Ohne Authentifizierung abrufbar → Capability-URL (absichtlich? vgl. Issue #815)
- Keine Schleier-Tokens, aber begrenzte Schlüsselraum (48 Bit)

## Häufige Raten-Limits

Alle konfigurierten Rate-Limits (state/mod.rs):

| Limit | Wert | Fenster |
|-------|------|---------|
| Solo API (GET /api/solo/:id)           | 120 pro Client-IP | 60 Sekunden |
| Login Throttle (POST /api/login)        | 10 Fehler pro Client-IP | 60 Sekunden |
| Submissions (Spielantwort-POST)         | 3 pro durable Client | 60 Sekunden |
| Submissions (Global Server)             | 60 gesamt | 60 Sekunden |
| PIN-Versuche (Assignment)               | 3 Fehler pro Assignment+IP | 60 Sekunden |
| PIN-Versuche (Klassen Live-Join)        | 5 Fehler pro (Game, Client-IP) | 5 Minuten |
| PIN-Versuche (Klassen per-Student)      | 5 Fehler pro (Game, Student-ID) | 5 Minuten |
| Game-Erstellung (pro User)              | 10 pro Benutzer | 1 Stunde |

## Bekannte Grenzen & Sicherheitskompromisse

### 1. Vertrauensbereich für Proxy-Header

- **Annahme:** Loopback oder Private-Range = vertraut
- **Realität:** Gesamtes privates Netz ist Vertrauensbereich
- **Konsequenz:** Wenn der Server in einem offenen Netzwerk erreichbar ist oder Private-IPs geroutet werden, kann ein Angreifer X-Forwarded-For/X-Real-IP spoofing nutzen, um Throttle zu umgehen
- **Mitigation:** Firewall-Regeln müssen sicherstellen, dass nur Loopback/vertraute Proxys den Server erreichen

### 2. Socket-Cache-Reauthentifizierung (30 Sekunden)

- **Annahme:** Session-Widerruf ist keine Echtzeit-Anforderung
- **Realität:** Ein deaktivierter Benutzer kann bis 30 Sekunden nach Deaktivierung noch Socket-Events auf derselben Verbindung senden
- **Konsequenz:** Kritische Handler müssen explizit `require_user()` aufrufen
- **Status:** Akzeptiert für Wellen nach SEC-003/SEC-004 (nicht sofort adressiert)

### 3. Legacy-Fallback auf manager_client_id

- **Annahme:** Alte Snapshots ohne `owner_user_id` brauchen `manager_client_id` für Kompatibilität
- **Realität:** `client_id` liegt in Browser-localStorage (UUIDv4), angreifbar bei XSS
- **Konsequenz:** Pre-Wave-1 Spiele sind angreifbar, bis sie neuinstanziert oder migriert sind
- **Mitigation:** Mit Warnung geloggt; Admin-Bypass tritt nie ohne Auth auf
- **Status:** Audit geplant in SEC-005 (wie viele alte Spiele noch aktiv?)

### 4. Keine Content-Security-Policy

- **Annahme:** 43 Dateien mit Inline-Styles sind nicht umzustrukturieren
- **Realität:** XSS-Schutz durch CSP fehlt
- **Konsequenz:** Inline-Script-Injection ist nicht durch CSP mitigiert
- **Mitigation:** Alternativ: Input-Sanitization, Output-Encoding
- **Status:** SEC-008 wird Alternativen evaluieren

### 5. Token-Redaction in Logs unvollständig

- **Annahme:** `token` (generisch) wird redacted
- **Realität:** `hostToken`, `sessionToken`, `clientToken` usw. sind **NICHT** gelistet
- **Konsequenz:** Spezialisierte Tokens erscheinen ungeheim in DEV-Logs
- **Mitigation:** Dev-Logs sind dev-gated, aber einmal heruntergeladen sichtbar
- **Status:** SEC-007 wird REDACT_KEYS erweitern

### 6. Assignment-Metadaten öffentlich abrufbar

- **Annahme:** Assignment-IDs sind Capability-URLs (schwache Geheime)
- **Realität:** GET `/api/v1/assignments/{id}` hat keine Auth, gibt Metadaten zurück
- **Konsequenz:** Mit 48-Bit-Schlüssel systematisch durchsuchbar (theoretisch ~281 Billionen Kombinationen, aber mit Datum + Muster schneller)
- **Status:** Intentional per Issue #815 oder Versehens? SEC-002 wird klären

## Architektur-Zusammenfassung

```
HTTP-Request
  ↓
  Header: Authorization: Bearer oder X-Manager-Token
  ↓
  auth::ensure_manager_user()
  ↓
  session_user(pool, token)  ← Single Source of Truth
  ↓
  returns Option<AuthUser> {user_id, role}
  ↓
  Handler-spezifische Autorisierung (z.B. can_view_assignment_results)

WebSocket-Connect
  ↓
  Handshake-Payload: {session_token: ...}
  ↓
  HandlerCtx::require_user()
  ↓
  Prüft Cache (30s TTL) → session_user(pool, token)
  ↓
  Speichert Ergebnis + Timestamp
  ↓
  Nachfolgende Handler nutzen Cache, bis TTL abläuft
```

## Referenzen

- `rust/server/src/auth/mod.rs`: Zentrale Manager-Token-Auflösung
- `rust/server/src/db/users/mod.rs`: `session_user()` Token-Hash-Lookup (199–212)
- `rust/server/src/socket/mod.rs`: `HandlerCtx::require_user()` Cache-Logik (30–91)
- `rust/server/src/main.rs`: `is_game_host()` mit Legacy-Fallback (61–100)
- `rust/server/src/http/login.rs`: Login-Handler mit Throttle (111–122)
- `rust/server/src/state/rate_limit.rs`: Rate-Limiter-Implementierung (92–135)
- `rust/server/src/http/security_headers.rs`: Security-Header-Middleware
- `rust/server/src/http/logs.rs`: Logging & Redaction (82–97)
- `rust/server/src/http/assignments.rs`: Assignment-Endpunkte (keine Auth auf GET /api/v1/assignments/{id})
- ADR-009: `docs/adr/009-centralized-auth-session-management.md`
- Issues: #552 (Baseline), #705/#706 (Login Throttle), #815 (Assignment Capability-URLs)

## Nachgelagerte Wellen

- **SEC-001:** Rollout dieser Baseline-Dokumentation
- **SEC-002:** Authentifizierung von `handle_get_assignment()` klären (öffentlich oder geheim?)
- **SEC-003, SEC-004:** Socket-Reauthentifizierungs-Gaps adressieren (kritische Handler)
- **SEC-005:** Legacy-Fallback-Audit (wie viele `owner_user_id IS NULL` Spiele existieren noch?)
- **SEC-006:** Broadcast-Sender-Spezifikation kodifizieren
- **SEC-007:** REDACT_KEYS erweitern (hostToken, sessionToken, clientToken, etc.)
- **SEC-008:** Content-Security-Policy Alternativen evaluieren
