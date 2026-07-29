<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Pantalla de bienvenida de Razzoozle con entrada de PIN y fondo animado" />

# Razzoozle

### Plataforma de cuestionarios en vivo autoalojada y de código abierto — un presentador estilo Kahoot + juego móvil con diseño crema limpio.

[English](README.md) · [Deutsch](README.de.md) · 🌐 **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demo en vivo](https://rust.razzoozle.xyz)** · **[🌐 Galería](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Documentación](docs/)** · **[Reportar un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *derivado de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## ¿Qué es Razzoozle?

Razzoozle es una plataforma de cuestionarios en tiempo real autoalojada para aulas, eventos y noches de juegos. Un anfitrión abre una partida en la pantalla grande, los jugadores se unen desde sus móviles con un PIN, y las respuestas correctas más rápidas puntúan más. Es un fork amigable de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) con una cabina de temas impulsada por el moderador, gamificación, juego en equipo e individual, e imágenes locales de IA — manteniendo la experiencia clásica de presentador de azulejos de colores + teléfono.

> Proyecto de código abierto independiente. No afiliado a, respaldado por, o conectado a Kahoot!® o cualquier otra plataforma comercial de cuestionarios.

---

## Inicio rápido

### Opción 1: Desarrollo local

Requiere Node 22+ y pnpm 11+.

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm dev
```

Abre `http://localhost:3000` (cliente web). El servidor se ejecuta en puertos separados (hot reload habilitado).

### Opción 2: Docker (recomendado para producción)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle

# Construir imagen Docker (incluye SPA web + servidor Rust)
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .

# Ejecutar con Postgres (requiere variable de entorno DATABASE_URL)
# Ejemplo: establecer contraseña predeterminada del administrador
docker run -d \
  -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='tu-contraseña-segura' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

<div align="center">
<img src="docs/screenshots/start.webp" width="680" alt="Pantalla de inicio del anfitrión mostrando PIN del juego y código QR para que los jugadores se unan" />
</div>

El servidor se ejecuta en el puerto `3020` y requiere una base de datos PostgreSQL. Abre la aplicación, ve a `/manager` y **cambia la contraseña predeterminada del administrador**. Coloca un proxy inverso (Caddy/Traefik/nginx) enfrente para TLS y un nombre de host público. Consulta **[Auto-hospedaje](docs/Self-Hosting.md)** para una configuración detallada.

---

## ✦ Lo que Razzoozle agrega sobre Razzia

| | Característica |
| --- | --- |
| 🎨 | **Cabina de temas** — una pestaña "Diseño" del moderador en vivo con colores, fondos por vista, logo, radio, presets y selectores de color conscientes del contraste. |
| ☕ | **Diseño crema plano** — una interfaz crema plana cálida con fondo animado viviente (gotas flotantes + iconos escolares/de conocimiento flotantes), logo plano y azulejos de respuesta tinta-sobre-crema. |
| 🎯 | **Pantallas de juego fieles a Kahoot** — azulejos de respuesta con los iconos de forma clásicos (triángulo / diamante / círculo / cuadrado), temporizador de cuenta atrás circular, contador de respuestas recibidas y podio animado. |
| 🧑‍🎨 | **Avatares de jugadores** — cada jugador obtiene un avatar DiceBear generado (elige un estilo + renueva o carga el tuyo); los avatares flotan alrededor del lobby y aparecen en clasificaciones, podio y premios. |
| 🏆 | **Gamificación** — 14 logros, medallas, rachas, confeti y campanas de sonido, más una galería personal de trofeos. |
| 🥇 | **Resumen de premios de fin de juego** — una secuencia de superlativos animados (dedo más rápido, mayor escalador, racha más larga, niño regreso…) mostrando avatar y nombre de cada ganador, auto-paced en autoplay. |
| 👥 | **Modo de equipo** — equipos rojo / azul / verde / amarillo con tabla de clasificación de equipo en vivo. |
| 📱 | **Juego individual** — practica cualquier cuestionario solo a través de un enlace compartido, con su propio historial de puntuación. |
| 🏫 | **Modo de clase para escuelas** — un modo de maestro opcional: crear clases, gestionar una lista de estudiantes (agregar estudiantes, moverlos entre clases, eliminar), dar a cada estudiante su propio PIN y asignar un cuestionario a una clase completa con fecha límite, límite de intentos y seguimiento de resultados pseudónimo consciente de privacidad. |
| ✍️ | **Diecisiete tipos de preguntas** — opción única, verdadero/falso, encuesta, deslizador, selección múltiple, escribe la respuesta, constructor de oraciones, entrada matemática, tipos de palabras (Wortarten), secuenciación, rellenar espacios en blanco, emparejar, soltar alfiler, nube de palabras, lluvia de ideas, confianza y microlección, además de los azulejos de respuesta de color clásicos. |
| 📳 | **Háptica móvil** — retroalimentación de vibración opcional en teléfonos de jugadores (cuenta atrás, respuestas), consciente del movimiento reducido. |
| 🔗 | **Resultados compartibles** — vistas previas de enlace por resultado ricas (despliegue de Open Graph), página de resultados con llamadas de "juega tú mismo / aloja el tuyo" y calcomanías de ganadores descargables. |
| 🤝 | **Preguntas comunitarias** — página de envío público con cola de moderación del administrador, plus catálogo de preguntas reutilizable y archivo de cuestionarios. |
| 🖼️ | **Imágenes IA locales** — generar imágenes de preguntas/temas en el dispositivo a través de ComfyUI (Z-Image), o conectar proveedores de nube — las claves permanecen en el servidor. |
| 🌍 | **6 idiomas + PWA** — inglés, alemán, francés, español, italiano, chino; instalable, consciente del modo sin conexión. |
| 📺 | **Kiosko de proyector + confiabilidad** — una vista de proyector `/display`, modo de baja latencia, recuperación de fallos, reconexión y servidor MCP para control de herramientas de IA. |
| 🎛️ | **Consola unificada del moderador** — una UI del moderador rediseñada con sistema basado en filas, acciones de selección múltiple, operaciones masivas y controles consistentes en todas las pestañas de gestión. |

Respaldado por **592+ pruebas automatizadas**, un paso de seguridad CVE de traversal de ruta + `ws`, una superficie no autenticada endurecida (límites de recursos por juego + desalojo de juego, límites de velocidad por IP, acelerador de fuerza bruta de autenticación del administrador, auth de token de host acuñado por servidor cerrando IDOR) y un despliegue Docker regulado por salud. Probado de carga a **600 jugadores concurrentes**.

---

## Experiencia de juego

### Pantalla de presentador y anfitrión

El anfitrión controla el juego en una pantalla grande con los azulejos de respuesta estilo Kahoot clásicos:

<div align="center">
<img src="docs/screenshots/presenter.webp" width="680" alt="Pantalla de presentador con azulejos de respuesta grandes, temporizador y contador de respuestas recibidas" />
</div>

### Teléfonos de jugadores y clientes de escritorio

Los jugadores se unen desde dispositivos móviles o escritorios y ven la misma pregunta con azulejos, su puntuación actual y un temporizador de cuenta atrás:

<div align="center">

| Jugador móvil | Jugador de escritorio |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="280" alt="Vista de jugador móvil con pregunta y botones de respuesta" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Vista de jugador de escritorio con azulejos de respuesta" /> |

</div>

### Selección de avatar

Cada jugador elige o genera un avatar antes de unirse:

<div align="center">
<img src="docs/screenshots/avatar.webp" width="420" alt="Pantalla de selección de avatar con opciones de estilo DiceBear y opción de carga" />
</div>

---

## Cabina de temas del moderador

Personaliza completamente el aspecto y la sensación en tiempo real — colores, fondos, animaciones y tipografía — sin tocar el código:

<div align="center">
<img src="docs/screenshots/admin.webp" width="680" alt="Panel de control de diseño del moderador con configuración de temas y vista previa en vivo" />
</div>

---

## Servidor Rust

El backend de Razzoozle es un **servidor Rust** (`axum` + `socketioxide`, seguro en memoria y de bajo peso) que cubre todo el juego, moderador, jugador y flujos de pantalla y habla socket.io al cliente React sin cambios. El estado del juego se persiste en **PostgreSQL**; las plantillas de cuestionarios están respaldadas por archivo bajo `config/templates/*.json`.

**→ Interna de Rust, construcción & pruebas: [`rust/README.md`](rust/README.md)**

---

## Desarrollado agenticamente

Razzoozle se desarrolla casi en su totalidad mediante agentes de codificación de IA, orquestados por supervisión humana. Un equipo diverso de modelos y herramientas especializadas trabaja juntos para construir características, probar, revisar e implementar.

| Agente | Rol |
| --- | --- |
| Claude | Orquestación y revisión |
| Codex (GPT-5.6) | Implementación full-stack |
| Cursor (GPT-5.6) | Refinamiento y corrección de código |
| Grok (xAI) | Implementación del backend Rust |
| Gemini (Google) | Revisión de contexto largo y juicio |
| Modelos abiertos | Qwen, DeepSeek, Nemotron |
| Inferencia local | OpenVINO en Intel Arc |
| QA del navegador (Playwright) | Pruebas de juego de extremo a extremo |

Los humanos revisan y fusionan cada commit. La IA aumenta la velocidad y la calidad, no reemplaza el juicio.

---

## Configuración y documentación

Los datos en tiempo de ejecución viven en el volumen `config`, inicializado en el primer arranque. La configuración del juego está en `config/game.json`; los cuestionarios se crean en el editor del moderador o como `config/quizz/*.json`. Consulta **[docs/](docs/)**: [Auto-hospedaje](docs/Self-Hosting.md) · [Configuración](docs/Configuration.md) · [Temas](docs/Theming.md) · [Modo de baja latencia](docs/LOW-LATENCY-MODE.md).

---

## Contribuir

Los issues y pull requests son bienvenidos. Ejecuta `pnpm verify` (typecheck + lint + tests) antes de abrir una PR; para cambios de Rust, ejecuta `bash rust/gate.sh`.

---

## Créditos y licencia

Un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — gracias a los autores originales. Publicado bajo la **[Licencia MIT](LICENSE)** (© 2024 Ralex, © 2026 colaboradores de Razzoozle).
