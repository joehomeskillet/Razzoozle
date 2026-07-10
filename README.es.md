<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plataforma de cuestionarios en vivo, autoalojada y de código abierto — un presentador estilo Kahoot + juego para móvil con un diseño crema limpio.

[English](README.md) · [Deutsch](README.de.md) · 🌐 **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demo en vivo](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentación](docs/)** · **[🖥️ App de escritorio](https://github.com/joehomeskillet/razzoozle-desktop)** · **[Reportar un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## ¿Qué es?

Razzoozle es un **juego de cuestionarios** en tiempo real y autoalojado para aulas, eventos y noches de juegos. Un anfitrión abre una partida en la pantalla grande, los jugadores se unen desde sus móviles con un PIN y las respuestas correctas más rápidas puntúan más. Es un fork amistoso de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) con una cabina de temas gestionada por el moderador, gamificación, juego por equipos e individual, plugins e imágenes de IA locales — manteniendo la experiencia clásica de presentador con fichas de colores + móvil.

> Proyecto de código abierto independiente. No está afiliado, respaldado ni conectado con Kahoot!® ni con ninguna otra plataforma comercial de cuestionarios.

---

## 📸 Capturas de pantalla

<div align="center">

| Presentador / anfitrión | Cliente de escritorio |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Teléfono del jugador | Selección de avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## Inicio rápido

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

docker compose -f compose.node.yml up -d   # Node backend → http://127.0.0.1:3010
# or
docker compose -f compose.rust.yml up -d   # Rust backend → http://127.0.0.1:3011
```

Cada archivo es autónomo (aplicación + su propia Postgres) e independiente, así que puedes ejecutar ambos a la vez. Abre la aplicación, ve a `/manager` y **cambia la contraseña de moderador por defecto**. Coloca un proxy inverso (Caddy/Traefik/nginx) delante para TLS y un nombre de host público.

¿No quieres base de datos? Establece `DATABASE_MODE=file` para ejecutar sin Postgres. Sin Docker: `pnpm install && pnpm build && pnpm start` (requiere Node 22+ y pnpm 11+).

---

## ✦ Lo que Razzoozle añade sobre Razzia

| | Función |
| --- | --- |
| 🎨 | **Cabina de temas** — una pestaña "Design" en vivo en el moderador: colores, fondos por vista, logo, radio y un conmutador de estilo **Flat ⇄ Glass**, con presets (un **crema** plano por defecto + un preset opcional violeta **liquid-glass**) y selectores de color con conciencia de contraste. |
| ☕ | **Diseño crema plano** — una interfaz crema plana y cálida con un fondo animado vivo (blobs a la deriva + iconos escolares/de conocimiento flotantes), una marca denominativa/logo plano y fichas de respuesta de tinta sobre crema. |
| 🧊 | **UI liquid-glass** — una variante de tema glassmorphism opcional y heredada (superficies esmeriladas y difuminadas) que nunca toca la base plana. |
| 🎯 | **Pantallas de juego fieles a Kahoot** — fichas de respuesta con los iconos de forma clásicos (triángulo / rombo / círculo / cuadrado), una cuenta atrás circular, un contador de respuestas recibidas y un podio animado. |
| 🧑‍🎨 | **Avatares de jugador** — cada jugador obtiene un avatar DiceBear generado (elige un estilo + vuelve a tirar, o sube el tuyo); los avatares flotan por la sala y aparecen en clasificaciones, el podio y los premios. |
| 🏆 | **Gamificación** — 15 logros, medallas, rachas, confeti y sonidos, más una galería personal de trofeos. |
| 🥇 | **Resumen de premios de fin de partida** — una secuencia animada de superlativos (dedo más rápido, mayor escalador, racha más larga, comeback kid…) que muestra el avatar + nombre de cada ganador, con ritmo automático en autoplay. |
| 👥 | **Modo equipos** — equipos rojo / azul / verde / amarillo con una clasificación de equipos en vivo. |
| 📱 | **Juego individual** — practica cualquier cuestionario en solitario mediante un enlace compartido, con su propio historial de puntuaciones. |
| ✍️ | **Más tipos de preguntas** — selección múltiple, escribe la respuesta y deslizador, además de la opción única clásica. |
| 🔌 | **Sistema de plugins** — complementos ZIP instalables por el moderador con su propia pestaña "Plugins". |
| 🧩 | **Addons del moderador** — sube, activa y configura addons de JavaScript desde la consola del moderador (pestaña propia, badges de capacidad, configuración persistida); incluye un starter skeleton de copiar y pegar (`examples/plugins/starter/`) con un contrato de autoría. |
| 📦 | **ZIPs de tema skeleton** — descarga/sube un tema de partida completo como un ZIP legible por LLM ("skeleton": tokens de diseño + CSS + JS + un contrato SKELETON.md). |
| 📳 | **Háptica móvil** — feedback de vibración opcional en los móviles de los jugadores (cuenta atrás, respuestas), consciente de reduced-motion. |
| 🔗 | **Resultados compartibles** — vistas previas de enlace enriquecidas por resultado (Open Graph unfurl), una página de resultado con llamadas a la acción "juégalo tú mismo / organiza el tuyo" y pegatinas de ganador descargables. |
| 🤝 | **Preguntas de la comunidad** — una página pública de envíos con una cola de moderación del moderador, más un catálogo de preguntas reutilizable y un archivo de cuestionarios. |
| 🖼️ | **Imágenes de IA locales** — genera imágenes de preguntas/temas en el dispositivo mediante ComfyUI (Z-Image), o conecta proveedores en la nube — las claves permanecen en el servidor. |
| 🌍 | **6 idiomas + PWA** — inglés, alemán, francés, español, italiano, chino; instalable, con soporte sin conexión. |
| 📺 | **Kiosco de proyector + fiabilidad** — una vista de proyector `/display`, modo de baja latencia, recuperación ante fallos, reconexión y un servidor MCP para control por herramientas de IA. |

Respaldado por **592+ pruebas automatizadas**, un pase de seguridad de path-traversal + CVE de `ws`, una superficie sin autenticar reforzada (límites de recursos por partida + expulsión de partidas, límites de tasa por IP, freno de fuerza bruta en la auth del moderador, autenticación con host-token emitido por el servidor que cierra IDOR) y un despliegue Docker con health-gate. Probado con carga de **600 jugadores simultáneos**.

---

## Backends

Razzoozle incluye **dos backends intercambiables** que hablan el mismo protocolo socket.io sobre una única base de datos Postgres compartida — cambia por cliente en la interfaz del moderador o con `VITE_DEFAULT_BACKEND`. El servidor **Rust** (`axum` + `socketioxide`, seguro en memoria y de baja huella) cubre todos los flujos de juego, moderación, jugador y visualización. El servidor **Node.js** (`packages/socket`) está completo y es el valor por defecto autónomo en `compose.node.yml`. Algunos endpoints HTTP periféricos (métricas de Prometheus, telemetría de cliente, vista previa de enlaces compartidos, el documento OpenAPI) y los hooks JS de plugins del lado servidor son solo de Node.

**→ Detalles internos de Rust, compilación y pruebas: [`rust/README.md`](rust/README.md)**

---

## Desarrollo agencial

Razzoozle se desarrolla casi enteramente con agentes de IA, orquestados por supervisión humana. Un equipo diverso de modelos y herramientas especializados trabaja en conjunto para construir, probar, revisar e implementar funcionalidades.

| Agent | Role |
| --- | --- |
| Claude | Orquestación y revisión |
| Codex (GPT-5.6) | Implementación full-stack |
| Cursor (GPT-5.6) | Refinamiento y corrección de código |
| Grok (xAI) | Implementación del backend Rust |
| Gemini (Google) | Revisión de largo contexto y evaluación |
| Modelos abiertos | Qwen, DeepSeek, Nemotron |
| Inferencia local | OpenVINO en Intel Arc |
| Browser QA (Playwright) | Pruebas de juego de extremo a extremo |

Los humanos revisan e integran cada commit. La IA mejora la velocidad y la calidad, no sustituye el juicio.

---

## Configuración y documentación

Los datos de ejecución viven en el volumen `config`, inicializado en el primer arranque. Los ajustes de la partida están en `config/game.json`; los cuestionarios se crean en el editor del moderador o como `config/quizz/*.json`. Consulta **[docs/](docs/)**: [Self-Hosting](docs/Self-Hosting.md) · [Configuration](docs/Configuration.md) · [Theming](docs/Theming.md) · [Low-latency mode](docs/LOW-LATENCY-MODE.md).

---

## Apps y complementos

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — una app nativa de Windows para alojar y gestionar partidas sin navegador.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un servicio de descubrimiento ligero (nunca retransmite la partida).

---

## Contribuir

Los issues y pull requests son bienvenidos. Ejecuta `pnpm verify` (typecheck + lint + tests) antes de abrir un PR; para cambios en Rust, ejecuta `bash rust/gate.sh`.

---

## Créditos y licencia

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — gracias a los autores originales. Publicado bajo la **[Licencia MIT](LICENSE)** (© 2024 Ralex, © 2026 colaboradores de Razzoozle).
