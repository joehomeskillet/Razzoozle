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

<img src="docs/screenshots/presenter.webp" width="640" alt="Presenter view" />

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

## Características

- **Cabina de temas** — una pestaña "Design" en vivo: colores, fondos por vista, logo, radio, un conmutador Flat ⇄ Glass y presets.
- **Pantallas fieles a Kahoot** — fichas de respuesta con formas, una cuenta atrás circular, un contador de respuestas recibidas y un podio animado.
- **Gamificación** — 15 logros, medallas, rachas, confeti, un resumen de superlativos al final de la partida y avatares de jugador generados.
- **7 tipos de preguntas** — opción simple y múltiple, verdadero/falso, escribe la respuesta y deslizador.
- **Equipos e individual** — equipos de colores con una clasificación en vivo, o practica cualquier cuestionario en solitario mediante un enlace compartido.
- **Plugins y temas skeleton** — complementos ZIP instalables por el moderador y paquetes de tema de partida completos descargables.
- **Imágenes de IA locales** — genera arte de preguntas/temas en el dispositivo mediante ComfyUI (Z-Image); las claves permanecen en el servidor.
- **6 idiomas + PWA** — EN/DE/FR/ES/IT/ZH, instalable y con soporte sin conexión, con una vista de proyector `/display`.

Respaldado por más de 592 pruebas automatizadas, una superficie sin autenticar reforzada (límites de recursos por partida, límites de tasa por IP, autenticación con host-token emitido por el servidor) y probado con carga de 600 jugadores simultáneos.

---

## Backends

Razzoozle incluye **dos backends intercambiables** que hablan el mismo protocolo socket.io sobre una única base de datos Postgres compartida — cambia por cliente en la interfaz del moderador o con `VITE_DEFAULT_BACKEND`. El servidor **Rust** (`axum` + `socketioxide`, seguro en memoria y de baja huella) cubre todos los flujos de juego, moderación, jugador y visualización. El servidor **Node.js** (`packages/socket`) está completo y es el valor por defecto autónomo en `compose.node.yml`. Algunos endpoints HTTP periféricos (métricas de Prometheus, telemetría de cliente, vista previa de enlaces compartidos, el documento OpenAPI) y los hooks JS de plugins del lado servidor son solo de Node.

**→ Detalles internos de Rust, compilación y pruebas: [`rust/README.md`](rust/README.md)**

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
