# Rust-Port: Socket-Server → axum + socketioxide

**Status:** Entwurf · 2026-07-05
**Scope-Entscheid:** Nur der Server (`packages/socket`). Frontend (`packages/web`, React 19) und das socket.io-Wire-Protokoll bleiben unverändert — kein Client merkt den Wechsel.
**Endziel dahinter:** razzoozle-desktop von Electron (~150 MB, gebündelter Node) auf Tauri (~10 MB, Rust-Server als Sidecar) umstellen.

---

## 1. Warum dieser Schnitt

- **socketioxide** spricht das socket.io-Protokoll (v4/v5) serverseitig auf axum — `socket.io-client` im Browser bleibt 1:1 kompatibel.
- Spiel-Zustandsmaschinen (Lobby → Runde → Reveal → Scoreboard) sind ideales Terrain für Rusts Typsystem: illegale Zustandsübergänge werden Compile-Fehler.
- State ist heute **in-memory** (kein Redis) — kein Persistenz-Port nötig, Reconnect-Semantik muss aber nachgebaut werden.
- Ein statisches Server-Binary macht den Desktop-Fall trivial und den Hosted-Fall billiger (RAM, Kaltstart).

## 2. Ist-Zustand `packages/socket` (30'792 LOC TS)

| Bereich | Dateien (Auswahl) | Umfang | Port-Charakter |
|---|---|---|---|
| Game-Engine | `handlers/game.ts` (19K), `handlers/manager.ts` (23K), `handlers/quizz.ts`, `results.ts`, `display.ts` | Kern | 1:1 portierbar, grösster Gewinn |
| Socket-Protokoll | `index.ts`, Events via `@razzoozle/common` | Kern | socketioxide + typisierte Events |
| HTTP-API | `services/http-routes.ts` (36K) | Kern | axum-Router, mechanisch |
| Konfiguration | `services/config.ts` (83K!) | Kern | serde + validator; gross, aber stumpf |
| Validierung | zod überall | Kern | serde + validator/garde |
| **JS-Plugin-Runtime** | `services/plugin-runtime.ts` (15K), `registry.ts` (17K) | **Sonderfall** | Rust kann kein JS hot-loaden → Gate-Entscheid Phase 0 |
| AI-Pipeline | `services/ai-provider.ts` (14K), `comfyui.ts` (11K), `handlers/ai.ts`, `imageGenThrottle.ts` | Peripherie | IO-Orchestrierung; portierbar, aber kein Rust-Gewinn |
| Media | `submitMedia.*.ts`, `services/webp.ts` (jszip, webp) | Peripherie | image/zip-Crates vorhanden |
| Observability | `prom.ts`, `metrics.ts`, pino-Logs | Peripherie | prometheus + tracing, Standard |

## 3. Nicht-Ziele

- Kein Frontend-Port (React-Ökosystem: Radix, motion, dnd, i18next — keine Rust-Pendants, kein Gewinn).
- Keine Protokoll-Änderungen während des Ports (Feature-Freeze auf dem Wire-Format).
- Kein Redis/Persistenz-Umbau — in-memory bleibt in-memory.
- `packages/mcp` bleibt vorerst Node (später rmcp, eigenes Mini-Projekt).

## 4. Phasen

### Phase 0 — Spike & Gate (1–2 Wochen)

Ziel: Beweisen oder beerdigen, bevor Geld verbrannt wird.

1. socketioxide-Spike: Lobby-Join-Flow (Raum erstellen, Code, Spieler joint vom Handy) gegen den echten `@razzoozle/web`-Client.
2. Golden-Tests: Wire-Traffic des Node-Servers für 3 Kern-Flows aufzeichnen (join, antwort, reveal) → Rust-Server muss byte-äquivalente Frames liefern.
3. **Gate-Entscheid Plugin-Runtime** (die eine echte Architekturfrage):
   - Option A: rquickjs einbetten — bestehende JS-Plugins laufen weiter (Kompatibilität, aber JS-Engine im Binary).
   - Option B: Plugin-API auf WASM umstellen (sauber, aber alle Plugins anfassen).
   - Option C: Plugin-Runtime bleibt als schlanker Node-Sidecar (pragmatisch, zwei Prozesse).
4. ts-rs-Spike: ein Event-Struct in Rust definieren, TS-Typ generieren, in `common` einhängen.

**Abbruchkriterium:** socketioxide besteht die Golden-Tests nicht in Grundzügen → Port stoppen, Befund dokumentieren.

### Phase 1 — Protokoll & Typen (2–3 Wochen)

- Vollständiges Event-Inventar aus `common/types` + `constants.ts` extrahieren (Events sind als Konstanten definiert, nicht als String-Literale — sauber maschinell ablesbar).
- Rust-Structs für alle Events/Payloads, `#[derive(Serialize, Deserialize, TS)]` — ts-rs generiert die TS-Typen, `@razzoozle/common` konsumiert sie. **Eine Quelle der Wahrheit, Rust führt.**
- zod-Validatoren → validator/garde-Pendants, Contract-Tests je Event (Property-based wo billig).

### Phase 2 — Game-Engine (4–6 Wochen)

- Zustandsmaschinen als reine, IO-freie Rust-Module (`enum GamePhase`, Übergänge als Methoden, keine Sockets im Kern).
- Port-Reihenfolge nach Abhängigkeit: `game.ts` → `manager.ts` → `quizz.ts`/`results.ts`/`display.ts` → `catalog.ts`, `theme-*.ts`.
- Die vitest-Suite (`__tests__/`) wird zur Spezifikation: jeder TS-Test bekommt ein Rust-Pendant, bevor der zugehörige Handler portiert wird.
- Fleet-Einsatz: Engine-Module sind file-disjunkt → parallele Work-Packages pro Handler-Datei.

### Phase 3 — Server-Shell (3–4 Wochen)

- axum + socketioxide: Rooms, Namespaces, Reconnect-Semantik, Host-Token/Manager-Passwort.
- `http-routes.ts` → axum-Router; `config.ts` → serde-Config mit denselben Defaults (83K Config ist stumpfe Fleissarbeit — Scatter-Kandidat für die Fleet).
- Rate-Limiting (tower-governor), prometheus-Metriken, tracing-Logs (Format pino-kompatibel halten für bestehende Dashboards).
- Media-Pipeline: webp via `image`-Crate, zip via `zip`-Crate.
- AI-Pipeline: zunächst 1:1 als async-Orchestrierung (reqwest gegen ComfyUI/Provider), kein Redesign.

### Phase 4 — Parität & Cutover (2–3 Wochen)

- Shadow-Betrieb: beide Server parallel hinter Caddy, Feature-Flag pro Raum.
- Playwright-E2E (bestehende Flows) gegen den Rust-Server; Lasttest: 100 Räume × 20 Spieler (dort sollte Rust glänzen — messen, nicht behaupten).
- Cutover pro Deployment (hosted zuerst, Desktop später), Node-Server bleibt 4 Wochen als Rollback-Pfad.

### Phase 5 — Tauri-Desktop (Folgeprojekt, +2–4 Wochen)

- Rust-Server als Tauri-Sidecar (oder in-process), statisches Web-Bundle, QR/Code-Flow identisch.
- `tunnel-client.ts`/`gateway-client.ts` aus razzoozle-desktop nach Rust (razzloo-gateway-Protokoll).
- Electron-Build parallel pflegen, bis Tauri-Beta durch ist.

## 5. Aufwand & Staffing

| Phase | Kalenderzeit (mit Agent-Fleet) | Anteil Handarbeit/Review |
|---|---|---|
| 0 Spike | 1–2 Wochen | hoch (Architektur) |
| 1 Protokoll | 2–3 Wochen | mittel |
| 2 Engine | 4–6 Wochen | mittel — Tests zuerst, Fleet portiert |
| 3 Shell | 3–4 Wochen | niedrig (mechanisch, scatter-fähig) |
| 4 Cutover | 2–3 Wochen | hoch (Verifikation) |
| **Summe Server** | **~3–4 Monate** | |
| 5 Tauri | +2–4 Wochen | mittel |

Annahme: Feature-Freeze auf `packages/socket` während Phase 2–4. Paralleles Feature-Development auf dem Node-Server verlängert den Port um jede doppelt gebaute Funktion.

## 6. Risiken

| Risiko | Wahrscheinlichkeit | Gegenmassnahme |
|---|---|---|
| socketioxide-Protokoll-Lücken (Binary-Attachments, Ack-Semantik) | mittel | Phase-0-Golden-Tests decken genau das ab; Abbruchkriterium definiert |
| Plugin-Runtime-Entscheid verschleppt | hoch | Gate in Phase 0, nicht später; Default = Option C (Node-Sidecar), Umbau auf WASM als eigenes Projekt |
| Feature-Drift während des Ports | hoch | Feature-Freeze + Golden-Tests als Contract; neue Features nur noch gegen Rust |
| Typen-Doppelpflege common | sicher | ts-rs von Tag 1, CI-Check: generierte TS-Typen == eingecheckte |
| Reconnect-Edge-Cases (in-memory State) | mittel | Reconnect-Szenarien als explizite Phase-2-Testfälle, aus Produktions-Logs abgeleitet |
| „Rust ist schneller“ stimmt, aber niemand merkt es | mittel | Ehrlich bleiben: der Gewinn ist Tauri + Binary + Typsicherheit, nicht Latenz |

## 7. Definition of Done

- [ ] Alle Golden-Tests grün (Wire-Kompatibilität)
- [ ] vitest-Suite vollständig als Rust-Tests gespiegelt, plus Reconnect-Fälle
- [ ] Playwright-E2E grün gegen Rust-Server (alle 6 Sprachen, Host + Player-Flow)
- [ ] Lasttest dokumentiert (Räume × Spieler, RAM, p99)
- [ ] 4 Wochen Shadow-Betrieb ohne P1
- [ ] Node-`packages/socket` archiviert, nicht gelöscht

## 8. Erster Schritt

Phase-0-Spike als eigenes Verzeichnis `spikes/socketioxide-lobby/` im Repo, ~2 Tage: Cargo-Projekt, socketioxide, ein Raum, ein Join vom echten Web-Client. Ergebnis entscheidet, ob der Rest dieses Plans Papier bleibt oder Programm wird.
