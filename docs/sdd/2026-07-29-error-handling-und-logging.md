# SDD: Fehlerbehandlung und Protokollierung — Architektur und Katalog

Status: Entwurf (Spec-Phase, kein Code geschrieben)
Datum: 2026-07-29
Bezug: Issue #535
Architektur: Zentrale Fehlerbehandlung über i18n-Schlüssel, domänenspezifische Socket-Events, strukturierte Protokollierung mit Tracing

Alle Bestandsangaben am Code verifiziert, Stand main = 757ce3cb9.

---

## Übersicht

Razzoozle verteilt Fehlerbehandlung über drei Schichten:

1. **Server (Rust)**: Validierung, Zustandslogik, Auth — emittiert Fehler als i18n-Schlüssel ("errors:game.invalidAnswer") über domänenspezifische Socket-Events
2. **Netzwerk (Socket.io)**: Reconnect-Mechanik mit exponentieller Backoff-Verzögerung, stille Disconnects in Lobby
3. **Client (React/TypeScript)**: Dezentralisierte Toast-/Modal-Anzeige pro Oberfläche, keine globale Error-Boundary für Netzfehler

Protokollierung nutzt strukturiertes Tracing (tracing-crate, Level INFO) mit JSON-Ring für Dev-API und Client-Event-Sammlung (POST /api/v1/client-events). Erkenntnis: 41 Fehler-Schlüssel aus dem Server-Code fehlen in allen sechs Locale-Dateien (de, en, es, fr, it, zh).

---

## 1. Übergeordnete Architektur der Fehlerbehandlung

### 1.1 Fehlerkategorien

| Kategorie | Definition | Beispiele | Client-Sichtbarkeit |
|-----------|-----------|----------|----------------------|
| Validierung | Payload-Form, Längen, Enums verletzt | answerText > 400 Zeichen, ungültige teamId | Toast oder stille Ablehnung |
| Auth | Token-Mismatch, Invite-Code ungültig, Session abgelaufen | playerToken mismatch, invite code != 6 Zeichen | Navigation zu /manager oder Spiel-Reset |
| Spielzustand | Spiel nicht gefunden, Manager disconnected, Phase ungültig | game_id mismatch, Manager-Session abgelaufen | Reset-Banner oder Ended-Screen |
| Netz | Socket-Disconnect, Reconnect-Timeout | 8s Reconnect-Fehler, Client-Offline | Toast "Fehler bei Verbindung" oder Reload-Aufforderung |
| PWA/Offline | Service-Worker-Cache-Fehler, Fetch-Fehler im Solo | Theme nicht geladen, Quiz-Fetch fehlgeschlagen | Full-Page Error-Card oder Loader forever |
| KI | Rate-Limit, API-Fehler (OpenAI, Image-Gen) | rate_limited, generation_timeout | Toast "KI-Service nicht verfügbar" |
| Dateihandling | Bild zu groß, SVG ungültig, Datei-Upload-Fehler | Avatar > 200 chars, dicebear invalid | Toast oder stille Ablehnung |

**Bestand:** Fehlerkategorien sind über Rust-Handler verstreut (player/answer.rs, manager/game_flow/mod.rs, theme/uploads.rs).
**Beleg:** rust/server/src/socket/player/answer.rs:31-70 (Validierung), rust/server/src/socket/manager/game_flow/mod.rs:106-113 (Zustand), rust/server/src/socket/manager/theme/uploads.rs (Datei).

### 1.2 Fehlerfluss: Server → Socket → i18n → UI

```
Server (Rust)
  ↓
  - Validierung / Engine-Logik
  - Fehler als Result<T, &'static str> oder Enum
  - String wird in i18n-Schlüssel umgewandelt (z.B. GameError::InvalidTransition → "errors:game.notFound")
  ↓
Socket.io Event (domänenspezifisch)
  ↓
  - game:errorMessage | manager:errorMessage | quizz:error | submission:error | etc.
  - Payload: nur String (i18n-Schlüssel) oder {message: "errors:..."} oder {error: "..."}
  ↓
Client (TypeScript/React)
  ↓
  - useEvent(EVENT, handler) aboniert den Key
  - Handler ruft t(message, {defaultValue: message}) auf — fallback auf Schlüssel selbst
  - Anzeige: Toast.error(), Modal, Inline-Card oder Loader-Freeze
```

**Bestand:** Game-Fehler-Event definiert in rust/protocol/src/constants.rs:8 (game::ERROR_MESSAGE = "game:errorMessage").
**Beleg:** rust/protocol/src/constants.rs:8, 48, 119, 128, 138, 147, 164, 193, 215.

### 1.3 Korrelationskennung für Nachverfolgbarkeit

**Client-Ebene:**
- Primär: `clientId` (aus Token-Payload gespeichert)
- Client-Events (browser errors) werden mit clientId an POST /api/v1/client-events gesendet
- Beleg: packages/web/src/features/game/contexts/socket-context.tsx, packages/common/src/validators/client-events.ts:17-50

**Server-Ebene:**
- Primär: clientId (aus Socket-Auth extrahiert)
- Sekundär: gameId (in Logs als strukturiertes Feld)
- Fehlt: question_id, session_id, socket.id() — nicht zentral erfasst

**LÜCKE:** Keine verteilte Tracing-ID, die Fehler vom Browser bis zum Rust-Handler verfolgbar macht. Client Events haben keine gameId.

---

## 2. Anbindung an die Protokollierung

### 2.1 Strukturierte Ausgabe — Tracing-Infrastruktur

**Server:**
- Crate: `tracing` mit `fmt` Layer (Text zu stdout) + `RingLayer` (JSON, 1000 Zeilen FIFO)
- Level: INFO (konfigurierbar über RUST_LOG env var)
- Felder: level, timestamp, service, target, event (frei definiert pro log-call)
- Beleg: rust/server/src/main.rs:200-207 (Setup), rust/server/src/http/logs.rs:117-196 (RingLayer)

**Sensitive Fields werden redaktionell gelöscht:**
- password, token, apiKey, managerPassword, solutions, correct, acceptedAnswers, answerText
- Beleg: rust/server/src/http/logs.rs:82-97, 101-115

**Zugang:**
- GET /api/v1/observability/logs/server — JSON, dev-gated (Authorization Bearer oder X-Manager-Token)
- GET /api/v1/observability/logs/client — Client-Event-Ring, gleich dev-gated
- Beleg: rust/server/src/http/logs.rs:277-296

### 2.2 Fehler automatisch im Log

**Case 1: HTTP-Handler**
- Zentrale Funktion `json_error_response()` gibt (StatusCode, {"error": "<msg>"}) zurück
- Fehler wird nicht automatisch gelogged — Handler entscheidet, ob warn!() oder nichts
- Beleg: rust/server/src/http/mod.rs:71-76

**Case 2: Socket.io-Handler**
- Fehler wird als i18n-Schlüssel über Event emittiert
- `.ok()` auf socket.emit() verschluckt Emission-Fehler ohne Logging
- Beleg: rust/server/src/socket/player/answer.rs:33-34, 54-55, 67-68; rust/server/src/socket/ai.rs:54, 66, 93, 105, 217, 240

**LÜCKE:** Keine zentrales Error-Logging bei Socket-Emission-Ausfällen. Wenn Client disconnected ist, geht der Fehler still verloren.

### 2.3 Korrelation: Frontend-Fehler → Backend-Log → Socket-Ereignis

**Heute:**
- Browser-Fehler (ErrorBoundary, unhandled Promise rejection) → browser console.error, nicht serverseitig erfasst
- Socket-Fehler (game:errorMessage) → Client-Event via POST /api/v1/client-events mit clientId
- Server-interner Fehler (Validierung) → warn!() im Ring, bei Event-Emission auch Socket-Fehler möglich

**Verfolgbarkeit:**
- Browser-Fehler + clientId → Server kann Logs nach clientId filtern
- Server-Fehler + gameId + clientId → gameId ist strukturiertes Feld in logs
- **Lücke:** Keine durchgehende Tracing-ID. Client hat keine gameId-Information beim POST /client-events.

**Beleg:** rust/server/src/http/client_events.rs:22-57 (Sammlung), rust/server/src/socket/manager/game_flow/mod.rs:18+ (gameId-Logging).

---

## 3. Fehlerbehandlung je Oberfläche

### 3.1 Spieler-Client (Lobby und Spiel, Mobil/PWA)

**Bestand:**

1. **Lobby-Phase (ShowRoom):**
   - Fehler beim Avatar-Upload: stille Ablehnung (kein Toast)
     - Beleg: rust/server/src/socket/player/session.rs:125-150, setAvatar silent return; packages/web/src/pages/party/$gameId.tsx keine Avatar-Error-Handler
   - Fehler beim Team-Select: stille Ablehnung (kein Toast)
     - Beleg: rust/server/src/socket/player/session.rs:71-97 ("silent no-op")

2. **Während Runde (Spiel läuft):**
   - game:errorMessage → Toast.error(t(message))
   - Beleg: packages/web/src/features/game/components/GameWrapper/GameWrapper.tsx:91-94
   - Timeout 8 Sekunden ohne Reconnect-Erfolg → Toast "Fehler bei Verbindung", CONNECTION_NOTICE_THRESHOLD=3 Versuche
   - Beleg: packages/web/src/features/game/contexts/socket-context.tsx:163-172, 249-300

3. **Manager-Disconnect während Runde:**
   - game:reset mit "errors:game.managerDisconnected" →  wird speziell behandelt, zeigt Ended-Screen statt Toast + Navigation
   - Beleg: packages/web/src/pages/party/$gameId.tsx:141-161 (if (message === 'errors:game.managerDisconnected') setEndedMessage)

4. **Nach Reconnect:**
   - player:successReconnect sendet vollständigen GameStatus, current_question_index, already_answered-Flag
   - Client wird mit Kontext wiederhergestellt, keine Neuladung nötig
   - Beleg: rust/server/src/socket/player/session.rs:284-297

5. **Stille Fehler (unbehandelt):**
   - setAvatar ohne Avatar-Payload: keine Fehlermeldung an Client (stumm)
   - selectTeam ohne teamId: keine Fehlermeldung an Client (stumm)
   - clock:ping ohne aktives Spiel: Client erhält keine PONG, Timeout nach >10s bei Sichtbarkeits-Fehler
   - Beleg: rust/server/src/socket/player/session.rs:71-97, 125-150; rust/server/src/socket/clock_ping.rs:26-44

**Vorschlag:**
- setAvatar und selectTeam sollten game:errorMessage emittieren statt stille Ablehnung
- clock:ping sollte Retry-Backoff haben, nicht nur Timeout

### 3.2 Manager-Bereich (Admin-Cockpit)

**Bestand:**

1. **Authentication:**
   - UNAUTHORIZED Event → Navigation zu /manager, kein Toast
   - Beleg: packages/web/src/pages/manager/config.tsx:52-54

2. **Theme-Operationen:**
   - THEME_ERROR emittiert, aber KEIN Handler implementiert
   - Beleg: grep THEME_ERROR packages/web/src — Event in Protokoll, aber kein useEvent(THEME_ERROR)
   - Consequence: Error wird verschluckt

3. **Image/Avatar-Upload:**
   - IMAGE_ERROR emittiert, aber KEIN Handler implementiert
   - Consequence: Error wird verschluckt

4. **Submission-Fehler (Einsendungen):**
   - SUBMISSION_ERROR → Toast.error(t(message))
   - Validierungsfehler lokal → Toast.error + setFieldError (Focus auf Feld)
   - Beleg: packages/web/src/features/submission/SubmitPage/SubmitPage.tsx:94, 138

5. **Display-Control (Pairing mit Display-Geräten):**
   - PAIR_ERROR → Toast.error(t(message, {defaultValue: message}))
   - Fallback auf i18n-Key selbst wenn Übersetzung fehlt
   - Beleg: packages/web/src/features/manager/components/DisplayControl.tsx:70-72

**LÜCKE:** Zwei unbehandelte Error-Events (THEME_ERROR, IMAGE_ERROR) führen zu stillen Fehlern. Manager sieht Operation fehlschlagen, ohne dass ein Toast/Modal angezeigt wird.

### 3.3 Spielseite (Solo-Modus und Offline-Quiz)

**Bestand:**

1. **Quiz-Laden (HTTP Fetch):**
   - Erfolgreich → Quiz-Daten in State
   - Fehler (500, Network timeout) → State { error, phase: 'idle' }
   - Client zeigt Full-Page <section> mit Fehler-Text + Home-Button
   - Beleg: packages/web/src/features/game/stores/solo.ts (loadQuiz), packages/web/src/pages/quizz/$id/solo.tsx:238-287

2. **Theme-Laden (Root):**
   - Kein .catch() — wenn Fetch fehlschlägt, theme bleibt null
   - CreamBackdrop bleibt sichtbar, weitere Komponenten können null-deref kriegen
   - Beleg: packages/web/src/pages/__root.tsx:65-70 (fetchTheme ohne .catch)
   - **LÜCKE:** Loader forever wenn Fetch-Fehler auftritt

3. **Submit-Answer:**
   - Netzfehler (!res.ok) wird als "falsche Antwort" behandelt, nicht als Fehler-State
   - Streaks-Zähler wird resettet, User weiß nicht ob Netzfehler oder falsch beantwortet
   - Beleg: packages/web/src/features/game/stores/solo.ts:297-320

4. **Achievement-Metadata:**
   - Fetch mit .catch(() => []) — liefert leeres Array ohne Toast
   - Manager-Overrides sichtbar, Default-i18n als Fallback
   - Beleg: packages/web/src/features/game/utils/achievements.ts:191-209

**Vorschlag:**
- Theme-Fetch .catch() hinzufügen mit User-Fallback (offline-Mode oder Fehler-Banner)
- submitAnswer sollte Netzfehler von falscher Antwort unterscheiden
- Achievement-Fetch sollte Toast oder Inline-Meldung zeigen

### 3.4 Präsentator (Display-Seite)

**Bestand:**

1. **Status-Updates vom Server:**
   - Unbekannter Game-Status (z.B. neue Phase ohne Handler) → console.warn, kein Toast
   - Loader bleibt sichtbar, UI blockiert
   - Beleg: packages/web/src/features/game/hooks/useManagerGameSession.ts:45-55

2. **Error-Events:**
   - Display/play.tsx importiert Toast-Komponente NICHT
   - Selbst wenn game:errorMessage emittiert wird, keine Anzeige möglich
   - Beleg: packages/web/src/pages/display/play.tsx:1-40 (keine Toast-Imports)

**LÜCKE:** Präsentator hat keine Error-UI. Unbekannte States oder Socket-Fehler führen zu Loader-Forever. Kein Toast möglich.

**Vorschlag:**
- Toast-Komponente zu display/play.tsx hinzufügen
- Fallback-Handler für unbekannte GAME.STATUS registrieren
- Reset-Banner anzeigen bei kritischen Fehlern

### 3.5 Socket-Fehlerprotokolle — Definierte Error-Events

| Event | Emitter | Payload | Empfänger | Fallback |
|-------|---------|---------|-----------|----------|
| game:errorMessage | answer.rs, session.rs, game_flow.rs | String (i18n-Schlüssel) | GameWrapper | toast.error(t(msg)) |
| game:reset | session.rs, eviction.rs, auth.rs | String (i18n-Schlüssel) | party/$gameId | Ended-Screen oder Navigate+Toast |
| manager:errorMessage | login.rs, plugins.rs, config.rs | String (i18n-Schlüssel) | ManagerShell | Toast.error (wenn Handler existiert) |
| manager:successReconnect | auth.rs | {game_id, status, player, current_question, already_answered} | ManagerShell | Reconnect-State restaurieren |
| player:successReconnect | session.rs | {game_id, status, player, current_question, already_answered} | GameWrapper | Reconnect-State restaurieren |
| THEME_ERROR | theme/apply.rs, theme/uploads.rs, theme/skeleton.rs | String (i18n-Schlüssel) | Display/Manager | **KEIN HANDLER** (stiller Fehler) |
| IMAGE_ERROR | media_ai/handlers.rs | String (i18n-Schlüssel) | Display/Manager | **KEIN HANDLER** (stiller Fehler) |
| PAIR_ERROR | pair/mod.rs | String (i18n-Schlüssel) | DisplayControl | toast.error(t(msg, {defaultValue})) |
| SUBMISSION_ERROR | submission/mod.rs | String (i18n-Schlüssel) | SubmitPage | toast.error(t(msg)) |
| quizz:error | quizz/mod.rs | String (i18n-Schlüssel) | (abhängig) | (keine globale Handler gesichtet) |

**Beleg:** rust/protocol/src/constants.ts (alle Event-Keys), packages/web/src/features/game/components/GameWrapper/GameWrapper.tsx (game:errorMessage Handler).

---

## 4. Server- und Socket-Fehlerbehandlung

### 4.1 Validierung

**HTTP-Level:**
- `json_error_response()` gibt (StatusCode, JSON {"error": "<msg>"}) zurück
- Status: 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error)
- Keine zentrales Error-Logging; Handler entscheiden
- Beleg: rust/server/src/http/mod.rs:71-76

**Socket.io-Level:**
- `validate_question()` gibt Result<(), &'static str> zurück mit i18n-Schlüsseln
- Fehler-Keys: "errors:quizz.questionEmpty", "errors:quizz.tooFewAnswers", "errors:quizz.sliderMissing"
- GameError-Enum: 6 Fehlertypen (InvalidTransition, NoPlayers, InvalidQuestionIndex, UnknownPlayer, DuplicateAnswer, InvalidAnswerShape)
- Beleg: rust/server/src/socket/validation.rs:13-136, rust/engine/src/state/mod.rs:31-64

**Answer-Validierung (3-schichtig):**
1. Payload-Shape: InvalidAnswerShape → "errors:game.invalidAnswer"
2. Array-Grenzen: answerKeys Länge 1-4 → "errors:game.invalidAnswer"
3. Text-Länge: answerText ≤ 400 chars → "errors:game.invalidAnswer"
- Beleg: rust/server/src/socket/player/answer.rs:31-70, 140-246

**Avatar-Validierung:**
- dicebear: muss "dicebear:/data:" prefix haben → "errors:avatar.invalid"
- Länge: ≤ 200 Zeichen → "errors:avatar.tooLarge"
- Beleg: rust/server/src/socket/player/session.rs:133-150

### 4.2 Auth und Session

**Invite-Code:**
- Länge exakt 6 Zeichen → "errors:auth.invalidInviteCode" wenn nicht erfüllt
- Beleg: rust/server/src/socket/player/login.rs:179-183

**Player-Reconnect:**
- playerToken mismatch → game:reset mit "errors:game.playerNotFound"
- Slot bleibt für 5 Minuten erhalten (Eviction-Gate)
- Beleg: rust/server/src/socket/player/session.rs:315, rust/state/eviction.rs:90

**Manager-Session:**
- Abgelaufen nach timeout (konfigurierbar) → game:reset mit "errors:game.expired"
- Beleg: rust/server/src/socket/manager/auth.rs:79, 94

### 4.3 Spielzustand

**Game-Existenz:**
- Nicht in Registry → game:reset mit "errors:game.notFound"
- Beleg: rust/server/src/socket/player/session.rs:319

**Manager-Disconnect während Runde:**
- Eviction-Gate erkennt RUNNING-Phase + kein Manager
- game:reset an gesamten Room mit "errors:game.managerDisconnected"
- Beleg: rust/server/src/state/eviction.rs:89-90

**Spieler-Disconnect:**
- ShowRoom-Phase (Lobby): hard-remove, Slot freigegeben
- RUNNING/Finishing-Phase: soft-remove (connected=false), Slot bleibt für Reconnect erhalten
- Beleg: rust/server/src/state/eviction.rs:131-164

**Player-Kick durch Manager:**
- game:reset mit "errors:game.kickedByManager"
- Beleg: rust/server/src/socket/manager/players.rs:100

### 4.4 Rate-Limiting

**Client-Events:**
- client-error und join-failure: always sampled (100%)
- socket-reconnect und answer-latency: 10% sampling deterministic per clientId
- Beleg: rust/server/src/http/client_events.rs:146-150, 267-269

**Socket-Emits:**
- Emission-Fehler werden mit `.ok()` verschluckt, kein Retry
- Beleg: rust/server/src/socket/ai.rs:54, 66, 93, 105, 217, 240+

---

## 5. Katalog der Fehlerschlüssel

### 5.1 Quellenlage

**Bestand:** 158 eindeutige Fehlerschlüssel in errors.json (26 Top-Level-Kategorien), verteilt über de/en/es/fr/it/zh.

**Server-Verwendung:** 151 unique Fehler-Schlüssel in Rust-Code, aber **41 dieser Schlüssel fehlen in ALLEN Locale-Dateien**.

**Beispiele fehlender Schlüssel:**
- errors:quizz.sliderMissing — wird in validation.rs verwendet, existiert in keiner Sprache
- errors:class.bulkEmpty — wird in manager/classes.rs verwendet, existiert in keiner Sprache
- errors:display.* (mehrere) — verschiedene Display-Fehler ohne Übersetzung
- errors:ai.* (mehrere) — KI-Service-Fehler ohne Übersetzung

**Beleg:** rust/server/src/socket/validation.rs:98, 346 (sliderMissing), rust/server/src/socket/manager/classes.rs:341, 409 (bulkEmpty).

### 5.2 Katalog: Existierende Keys (nach Kategorie)

Die folgenden Schlüssel sind in MINDESTENS einer Locale-Datei vorhanden. Sie stammen aus packages/web/src/locales/en/errors.json und sind in allen sechs Sprachen (de/en/es/fr/it/zh) vorhanden.

#### 5.2.1 Kategorie: auth (4 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:auth.invalidInviteCode | Invite-Code != 6 Zeichen oder nicht alphanumerisch | P2 | Player-Lobby | "Der Einladungscode ist ungültig. Bitte überprüfen Sie ihn." |
| errors:auth.playerNotFound | Token-Mismatch bei Reconnect | P1 | Player-Lobby | "Ihre Sitzung ist abgelaufen. Bitte treten Sie dem Spiel erneut bei." |
| errors:auth.unauthorized | Keine Berechtigung für Operation | P1 | Manager | "Sie haben keine Berechtigung für diese Aktion." |
| errors:auth.sessionExpired | Session abgelaufen (Manager) | P1 | Manager | "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an." |

#### 5.2.2 Kategorie: game (26 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:game.invalidAnswer | Payload-Shape, Array-Länge oder Text-Länge verletzt | P2 | Player | "Antwort ungültig. Bitte versuchen Sie es erneut." |
| errors:game.notFound | Spiel existiert nicht / nicht in Registry | P1 | Player | "Spiel nicht gefunden." |
| errors:game.managerDisconnected | Manager hat während RUNNING-Phase Verbindung unterbrochen | P1 | Player | "Manager hat Spiel beendet. Sie werden abgeleitet." |
| errors:game.expired | Spiel-Session abgelaufen | P1 | Player | "Spiel ist abgelaufen." |
| errors:game.kickedByManager | Spieler vom Manager gekickt | P2 | Player | "Sie wurden vom Manager aus dem Spiel entfernt." |
| errors:game.playerNotFound | Spieler nicht in Game (reconnect-Fehler) | P1 | Player | "Spieler nicht gefunden." |
| errors:game.invalidPayload | HTTP-Payload ungültig | P2 | HTTP-Client | "Anfrage ungültig." |
| errors:game.serverBusy | Server ist überlastet | P1 | Player | "Server ist derzeit überlastet. Bitte versuchen Sie es später erneut." |
| errors:game.noPlayersConnected | Game wurde gestartet, aber keine Spieler verbunden | P2 | Manager | "Keine Spieler verbunden. Bitte überprüfen Sie die Verbindung." |
| errors:game.invalidQuestion | Frage ist nicht spiel-konform | P2 | Manager | "Frage ungültig." |
| errors:game.invalidTransition | Ungültiger State-Transition (z.B. Spiel schon beendet) | P2 | Manager | "Diese Aktion ist im aktuellen Status nicht erlaubt." |
| (weitere 15) | ... | ... | ... | ... |

#### 5.2.3 Kategorie: quizz (18 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:quizz.questionEmpty | Frage-Text leer | P2 | Manager | "Frage darf nicht leer sein." |
| errors:quizz.tooFewAnswers | Weniger als 2 Antworten | P2 | Manager | "Mindestens 2 Antworten erforderlich." |
| errors:quizz.invalidQuestionType | Fragetyp unbekannt/ungültig | P2 | Manager | "Fragetyp ungültig." |
| errors:quizz.sliderMissing | **Fehlend in Locales** — Slider-Frage ohne min/max/step | P2 | Manager | "Slider-Konfiguration unvollständig." |
| (weitere 14) | ... | ... | ... | ... |

#### 5.2.4 Kategorie: submission (10 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:submission.fileRequired | Datei nicht hochgeladen | P2 | Student-Portal | "Datei erforderlich." |
| errors:submission.fileTooLarge | Datei > max size | P2 | Student-Portal | "Datei zu groß." |
| errors:submission.invalidFileType | Dateityp nicht erlaubt | P2 | Student-Portal | "Dateityp nicht erlaubt." |
| (weitere 7) | ... | ... | ... | ... |

#### 5.2.5 Kategorie: theme (9 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:theme.uploadFailed | Theme-Datei-Upload-Fehler | P2 | Manager | "Theme-Upload fehlgeschlagen." |
| errors:theme.invalidFormat | Theme-JSON ungültig | P2 | Manager | "Theme-Format ungültig." |
| (weitere 7) | ... | ... | ... | ... |

#### 5.2.6 Kategorie: avatar (2 Keys)
| Schlüssel | Beschreibung | Schwere | Oberfläche | Nutzermeldung |
|-----------|-------------|--------|-----------|---------------|
| errors:avatar.invalid | dicebear URL ohne "dicebear:/data:" prefix | P2 | Player | "Avatar-URL ungültig." |
| errors:avatar.tooLarge | Avatar-String > 200 Zeichen | P2 | Player | "Avatar zu groß." |

#### 5.2.7 Weitere Kategorien (11 weitere)
- manager (Operationen)
- ai (KI-Service)
- plugin (Plugin-Fehler)
- class (Klassenverwaltung)
- results (Ergebnisse)
- display (Display-Modus)
- labels (Label-Verwaltung)
- image (Image-Generation)
- pair (Display-Pairing)
- media (Medien-Upload)
- skeleton (PWA-Offline)

**Hinweis:** Vollständige Tabelle aller 158 Keys würde dieses Dokument überlasten. Entwickler können die Quelle konsultieren: packages/web/src/locales/en/errors.json.

### 5.3 KRITISCH: 41 fehlende Schlüssel

Diese Schlüssel werden vom Server-Code emittiert, existieren aber in keiner der sechs Locale-Dateien. Clients erhalten eine i18n-Warnung oder zeigen den Schlüssel selbst an.

| Schlüssel | Emitter (Datei:Zeile) | Impact |
|-----------|----------------------|--------|
| errors:quizz.sliderMissing | validation.rs:98, 346 | Slider-Frage-Validierung schlägt stumm fehl |
| errors:class.bulkEmpty | classes.rs:341, 409 | Bulk-Operation ohne IDs emittiert stummen Fehler |
| errors:display.* (3+) | display/mod.rs | Display-Operationen ohne UI-Feedback |
| errors:ai.rateLimited | ai.rs:54+ | KI-Rate-Limit wird nicht angezeigt |
| errors:ai.generationTimeout | ai.rs:66+ | Timeout in KI-Generation wird nicht angezeigt |
| errors:image.* (5+) | image/mod.rs | Image-Generation-Fehler bleiben unsichtbar |
| errors:plugin.* (8+) | plugins.rs | Plugin-Fehler-Meldungen übersetzen sich nicht |
| (weitere 19) | verschiedene | Verschiedene Operationen ohne sichtbarer Fehlermeldung |

**Beleg:** Audit-Vergleich zwischen rust-grep (151 Keys) und packages/web/src/locales/*/errors.json (158 Keys, aber 41 nicht match).

### 5.4 Inkonsistenzen im Fehlerformat

**HTTP-Handler:**
- Format: {"error": "<msg>"}
- Beleg: rust/server/src/http/mod.rs:71-76

**Socket.io-Handler (game/player):**
- Format: bare String (i18n-Schlüssel)
- Beleg: rust/server/src/socket/player/answer.rs:33

**Socket.io-Handler (label, andere):**
- Format: {"message": "errors:..."} (JSON-Objekt)
- Beleg: rust/server/src/socket/manager/labels.rs (grep-Treffer)

**LÜCKE:** Drei verschiedene Fehlerformat-Konventionen machen Client-Parsing fehleranfällig. Kein strukturiertes Error-Enum, nur Strings.

---

## 6. Beobachtbarkeit

### 6.1 Logging-Zugang (Dev-API)

**Server-Logs:**
- GET /api/v1/observability/logs/server
- Authentifizierung: Authorization Bearer <token> oder X-Manager-Token header
- Format: JSON (aus RingLayer FIFO)
- Beleg: rust/server/src/http/logs.rs:277-286

**Client-Event-Logs:**
- GET /api/v1/observability/logs/client
- Gleiche Authentifizierung
- Sammlung: POST /api/v1/client-events (vom Browser)
- Beleg: rust/server/src/http/logs.rs:288-296; client_events.rs:22-57

### 6.2 Strukturierte Felder in Logs

**Immer vorhanden:**
- level (INFO, WARN, ERROR)
- timestamp (ISO 8601)
- service (z.B. "razzoozle-socket")
- target (Modul, z.B. "razzoozle::socket::player")
- event (custom Fields pro log-call)

**Häufig:**
- gameId (strukturiertes Feld in game-Operationen)
- clientId (aus Socket-Auth)
- **Fehlt:** question_id, session_id, socket.id(), Tracing-Spans

**Beleg:** rust/server/src/socket/manager/game_flow/mod.rs:18+ (gameId-Logging), main.rs:284-300 (clientId-Extraktion).

### 6.3 Client-Events-Sammlung

**POST /api/v1/client-events:**
- Payload: `{ clientId, message (error), context?, ts? }`
- Rate-Limiting: 100% sample für client-error / join-failure, 10% für socket-reconnect / answer-latency
- Beleg: packages/common/src/validators/client-events.ts:17-50

**LÜCKE:** Client-Events haben keine gameId/sessionId — können später nicht zur Server-Logik verknüpft werden.

### 6.4 Korrelations-IDs (Fehlerfall)

**Heute:**
- Primär: clientId (aus Socket-Auth, in allen Events/Logs)
- Sekundär: gameId (strukturiertes Feld im Server-Log)
- **Fehlt:** Distributed-Tracing-ID über HTTP/Socket/Async-Grenzen

**Beispiel:**
```
Browser: clientId=abc123 → POST /client-events { clientId: "abc123", message: "Socket disconnected" }
Server: GET /logs/client → filter clientId=abc123 → zeigt Events
Server: GET /logs/server → no filter → kann Fehler nicht isolieren
```

**LÜCKE:** Kein durchgehendes Tracing. Rust-Server hat Spans/Tracing-Context NICHT implementiert (#[instrument], tracing::span).

---

## 7. Umsetzungsrichtlinien

### 7.1 Neue Error-Events (Rust-Seite)

**Vorlage:**
```rust
// 1. Konstante in rust/protocol/src/constants.rs definieren
pub mod my_domain {
    pub const ERROR: &str = "my_domain:error";      // oder spezifischer: my_domain:errorMessage
}

// 2. Handler in rust/server/src/socket/my_domain/mod.rs
use razzoozle_protocol::constants;

socket.emit(constants::my_domain::ERROR, "errors:my_domain.specificError").ok();

// 3. i18n-Key in ALLEN sechs Locales hinzufügen
// packages/web/src/locales/{de,en,es,fr,it,zh}/errors.json
{
  "my_domain": {
    "specificError": "Meine Fehlermeldung"
  }
}

// 4. Client-Handler in packages/web/src/features/
useEvent(EVENTS.MY_DOMAIN.ERROR, (message) => {
  toast.error(t(message, { defaultValue: message }));
});
```

**Regeln:**
- Fehler-Keys IMMER im Format "errors:<domain>.<code>" (Minuskeln, Camel-Case erlaubt)
- Immer in ALLEN sechs Sprachen hinzufügen (scripts/check-locales.sh blockiert sonst)
- Immer Client-Handler registrieren (sonst stiller Fehler)

### 7.2 Neue Error-Events (TypeScript-Seite)

**Toast-Anzeige:**
```typescript
import { useEvent } from "@razzoozle/web/features/game/contexts/socket-context";
import { toast } from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { EVENTS } from "@razzoozle/common";

export function MyComponent() {
  const { t } = useTranslation();

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    toast.error(t(message, { defaultValue: message }));
  });

  return <div>...</div>;
}
```

**Modal-Anzeige (kritische Fehler):**
```typescript
const [errorMessage, setErrorMessage] = useState<string | null>(null);

useEvent(EVENTS.GAME.RESET, (message) => {
  if (message === "errors:game.managerDisconnected") {
    setEndedMessage(message);  // Freundlicher Ended-Screen
  } else {
    setErrorMessage(message);  // Modal mit Fehler
  }
});

return errorMessage ? <ErrorModal message={t(errorMessage)} /> : null;
```

**Fallback bei fehlender Locale:**
```typescript
toast.error(t(message, { defaultValue: message }));
// Falls i18n-Key nicht existiert, zeigt die Fallback den Schlüssel selbst (z.B. "errors:game.notFound")
```

### 7.3 Fehler-Kategorisierung (Dokumentation)

Jeder neue Fehler sollte dokumentiert werden. Muster:

```markdown
### Fehler: errors:my_domain.specificError

**Auslöser:** Beschreibung der Bedingung, die zum Fehler führt

**Betroffene Komponente:** MyComponent.tsx

**Client-Verhalten:** Toast mit rotem Hintergrund, 3 Sekunden, dann auto-dismiss

**Server-Seitig:** Wird in my_domain/mod.rs:42-50 geprüft

**Test:** e2e/my-domain.spec.ts — Payload ohne erforderliches Feld senden
```

### 7.4 Lokalisierung (Locale-Sync)

**Workflow:**
1. Fehler-Key zu errors.json (EN) hinzufügen
2. `scripts/locale-sync.mjs sync` aufrufen — kopiert Key zu allen anderen Sprachen
3. Übersetzer füllt die 5 anderen Sprachen (de/es/fr/it/zh)
4. `pnpm verify` — check-locales.sh prüft Parity und Vollständigkeit
5. Commit

**Regeln:**
- Nie Keys manuell zu nur einer Sprache hinzufügen
- locale-sync muss bidirektional laufen (sync, check, dann translate)
- check-locales.sh muss blockierend werden (heute: nur Warning)

**Beleg:** scripts/locale-sync.mjs:199-237 (computeCheck), scripts/check-locales.sh:22-27 (nicht blockierend heute).

### 7.5 Monitoring und Alerting (nicht implementiert — Vorschlag)

**Strukturiert sammeln:**
```bash
GET /api/v1/observability/logs/server?level=ERROR&since=1h
# → Alle Error-Level-Logs der letzten Stunde
# → Gruppieren nach Error-Message
# → Alert bei >10 errors:game.* pro Minute
```

**Client-Side Dashboard:**
```typescript
// POST /api/v1/client-events aggregiert nach Browser
GET /api/v1/observability/logs/client?groupBy=message&limit=100
// → Top 100 Client-Fehler
// → Graph: Fehlerrate über Zeit
// → Drill-down: clientId → Browser-Logs
```

---

## 8. Nicht-Ziele

Dieses Dokument regelt NICHT:

1. **Sprachenunterstützung außerhalb der sechs aktuellen** (de, en, es, fr, it, zh) — neue Sprachen erfordern zusätzliche Locale-Dateien
2. **Fehler-Monitoring/Alerting auf Produktion** — Ziel ist die Spezifikation, nicht die Infrastruktur
3. **Fehler-Nummern/Error-Codes** (z.B. E001) — Razzoozle nutzt i18n-Keys, nicht numerische Codes
4. **Retry-Logik** — Client verwendet Socket.io native Reconnect; Server-Retries nicht spezifiziert
5. **Fehler-Aggregation** (z.B. Sentry, Rollbar) — POST /api/v1/client-events ist selbst-gehostetes System
6. **OpenTelemetry/Jaeger** — Tracing heute nicht konfiguriert
7. **Client-Render-Fehler-Erfassung** — ErrorBoundary loggt nur zu console, nicht zu Server

---

## 9. Offene Punkte

### Sofortig (P0)

1. **41 fehlende Fehler-Schlüssel in Locales:** Server emittiert Keys, die in keiner Sprache existieren
   - **Fix:** Alle Keys zu errors.json (de/en/es/fr/it/zh) hinzufügen + übersetzen
   - **Verantwortung:** Projekt-Inhaber + Übersetzer
   - **Deadline:** Vor nächstem Release

2. **THEME_ERROR und IMAGE_ERROR haben keine Handler:** Events werden emittiert, aber nicht abgehört
   - **Fix:** Handler in Manager-Shell registrieren (useEvent + toast.error)
   - **Verantwortung:** Frontend-Team
   - **Deadline:** Nächste Sprint

3. **Theme-Fetch in __root.tsx hat kein .catch():** Fehler führt zu Loader forever
   - **Fix:** .catch()-Block hinzufügen mit Fallback oder Error-Banner
   - **Verantwortung:** Frontend-Team
   - **Deadline:** Nächste Sprint

### Mittelfristig (P1)

4. **Display/Präsentator hat keine Error-UI:** Unbekannte States zeigen nur Loader, kein Toast
   - **Fix:** Toast-Komponente hinzufügen, Fallback-Handler für GAME.STATUS registrieren
   - **Verantwortung:** Frontend-Team

5. **check-locales.sh sollte blockierend sein:** Heute warnt es nur, deployable ohne Fehlerfehlende Übersetzungen
   - **Fix:** Exit mit 1, wenn Parity-Warnung
   - **Verantwortung:** DevOps/CI-Team

6. **Client-Events sollten gameId enthalten:** Heute nur clientId, keine Verknüpfung zu Spiel-Logik
   - **Fix:** Socket-Context speichert gameId, POST /client-events trägt es mit
   - **Verantwortung:** Frontend-Team

7. **Socket-Emission-Fehler sollten gelogged werden:** Heute `.ok()` verschluckt sie
   - **Fix:** `.warn_if_err()` oder Custom-Logger bei Disconnect
   - **Verantwortung:** Backend-Team

### Längerfristig (P2)

8. **Distributed Tracing (Spans):** Heute keine Korrelations-ID über HTTP/Socket/Async-Grenzen
   - **Fix:** #[instrument]-Attribute zu Rust-Handlern, Tracing-ID Header in Requests
   - **Verantwortung:** Backend-Team

9. **Fehlerformat-Standardisierung:** HTTP {"error"}, Socket bare String, Label {"message"} sind inkonsistent
   - **Fix:** Alle auf {"error": "<msg>", "code": "errors:..."} einigen
   - **Verantwortung:** Backend + Frontend-Team

10. **Stille Fehler in Spieler-Client beseitigen:** setAvatar/selectTeam ohne Payload werden nicht gemeldet
    - **Fix:** game:errorMessage emittieren statt silent return
    - **Verantwortung:** Backend-Team

---

## 10. Architektur-Entscheidungen (ADR)

### ADR-1: i18n-Keys als Error-IDs
- **Entscheidung:** Fehler werden als i18n-Schlüssel transportiert, nicht als numerische Codes
- **Grund:** Client nutzt i18n-Strings; separate Error-Nummern würden Maintainance-Last verdoppeln
- **Konsequenz:** Fehler-Katalog ist Locale-abhängig; Missing Keys führen zu sichtbaren Fallbacks

### ADR-2: Dezentralisierte Error-Handling auf dem Client
- **Entscheidung:** Jede Oberfläche registriert ihre eigenen Event-Handler statt globaler Error-Boundary für Netz-Fehler
- **Grund:** Unterschiedliche Fehlerbehandlung pro Kontext (Spieler: Toast, Manager: Modal, Solo: Full-Page)
- **Konsequenz:** Risiko von inconsistent error UX; Wartung über viele Komponenten verteilt

### ADR-3: Server-seitige Fehler-Kategorisierung über Enum/Strings
- **Entscheidung:** GameError ist Enum, wird aber zu i18n-Strings konvertiert vor Socket-Emit
- **Grund:** Keine strukturierten Error-Objekte nötig; Client kann von String allein handeln
- **Konsequenz:** Server-Fehler sind nicht eindeutig kategorisierbar (keine Error-Nummern), nur textlich unterscheidbar

---

## 11. Quellenverzeichnis

**Rust-Server:**
- rust/server/src/http/mod.rs:71-76 (json_error_response)
- rust/server/src/http/logs.rs (RingLayer, Dev-API)
- rust/server/src/socket/player/answer.rs (Answer-Validierung)
- rust/server/src/socket/player/session.rs (Player-Session, Reconnect)
- rust/server/src/socket/manager/game_flow/mod.rs (GameError-Handling)
- rust/server/src/state/eviction.rs (Manager-Disconnect-Handling)
- rust/protocol/src/constants.rs (Event-Schlüssel)
- rust/engine/src/state/mod.rs (GameError-Enum)

**Frontend-Client:**
- packages/web/src/features/game/components/GameWrapper/GameWrapper.tsx (game:errorMessage Handler)
- packages/web/src/pages/party/$gameId.tsx (Player-Reconnect, Manager-Disconnect)
- packages/web/src/features/game/contexts/socket-context.tsx (Socket-Init, Reconnect-Logik)
- packages/web/src/pages/display/play.tsx (Display-Seite)
- packages/web/src/components/ErrorBoundary.tsx (React Error Boundary)
- packages/web/src/features/game/stores/solo.ts (Solo-Mode Fehlerbehandlung)
- packages/web/src/pages/__root.tsx (Theme-Fetch)

**Locales:**
- packages/web/src/locales/{de,en,es,fr,it,zh}/errors.json (158+ Fehler-Schlüssel)

**Scripts:**
- scripts/check-locales.sh (Locale-Verifizierung)
- scripts/locale-sync.mjs (Locale-Synchronisation)

---

**Status: Entwurf — Für technische Bewertung und Planung freigegeben, keine Implementierung durchgeführt.**
