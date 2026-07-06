<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Una plataforma de concursos en vivo autohospedada y de código abierto — con un diseño limpio y plano en **crema** (y un tema opcional de cristal líquido).

🌐 [English](README.md) · [Deutsch](README.de.md) · **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Rust](https://img.shields.io/badge/Rust_server-default_backend-CE422B?logo=rust&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_backend-available-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592+-3DBFA0)

**[▶ Demostración en vivo](https://razzoozle.joelduss.xyz)** · **[🖥️ Razzoozle Desktop — Aplicación Windows (Beta)](https://github.com/joehomeskillet/razzoozle-desktop)** · **[🛰️ Gateway](https://github.com/joehomeskillet/razzloo-gateway)** · **[🌐 Vitrina](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[Informar de un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *bifurcado de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 ¿Qué es esto?

Razzoozle es un **juego de concursos** autohospedado y en tiempo real para aulas, eventos y noches de juegos. Un anfitrión abre un juego en la pantalla grande, los jugadores se unen desde sus teléfonos con un PIN, y todos compiten por responder — las respuestas correctas más rápidas obtienen más puntos. Es una bifurcación amigable de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), reconstruida alrededor de un diseño limpio y plano en **crema** (el cristal líquido ahora es un tema opcional) con un sistema de temas impulsado por el gerente, gamificación, juego en equipo y en solitario e generación local de imágenes con IA — mientras mantiene la experiencia clásica al estilo Kahoot con presentador + teléfono (fichas de respuesta de colores con formas, una cuenta regresiva, un podio).

> Razzoozle es un proyecto independiente de código abierto. No está afiliado, respaldado ni conectado con Kahoot!® ni con ninguna otra plataforma comercial de concursos.

---

## 🚀 Arquitectura: Servidor dual (Rust es ahora el predeterminado)

Razzoozle se envía con un **servidor Rust eficiente como el predeterminado**, manteniendo el servidor Node.js original disponible para compatibilidad y migración gradual.

### ¿Por qué Rust?

- **Máquina de estados de juego segura en memoria, compilada** — sin pánicas en tiempo de ejecución ni comportamientos indefinidos.
- **Servidor en tiempo real rápido y de bajo consumo** — socketioxide + axum manejan 600+ jugadores concurrentes con sobrecarga mínima.
- **Archivo binario estático único** — se envía como una aplicación Tauri de ~10 MB (sidecar Rust) en lugar de ~150 MB de Electron + tiempo de ejecución Node.
- **Paridad de comportamiento** — habla el protocolo wire socket.io idéntico; el frontend y los jugadores no ven diferencia.
- **Fuente única de verdad compartida** — ambos servidores leen/escriben la misma base de datos Postgres, permitiendo cambiar sin problemas por cliente.

### Cómo funciona

El **servidor Rust** (espacio de trabajo `rust/`):
- **`protocol/`** — ~200 tipos de protocolo de cable, genera automáticamente enlaces TypeScript a través de `ts-rs` (Rust es la fuente de verdad).
- **`engine/`** — lógica pura del juego (chunking de generador de oraciones, mezcla de Fisher-Yates con guardia anti-identidad).
- **`server/`** — servidor HTTP `axum` + servidor en tiempo real `socketioxide`; registro de juegos en memoria; autenticación del gerente (token de host); límites de velocidad + límites de recursos; carga de cuestionarios desde disco o base de datos.

**Operaciones del gerente** completamente implementadas en Rust: guardar/actualizar/eliminar/duplicar/archivar cuestionarios, gestión de configuración, moderación de envíos, catálogo, juegos en ejecución, cambio de tema — controlados por `rust/gate.sh` (cargo build + pruebas de regresión).

**Paridad de características** con servidor Node: todos los 7 tipos de preguntas, ciclo de vida del jugador + reconexión, control del juego (expulsar/saltar/abortar/temporizador), bots, quiosco `/display`, IA/medios, puntos finales en solitario, modo de equipo.

El **servidor Node** (`packages/socket`) permanece disponible para compatibilidad inversa; cambie en la interfaz del gerente o a través de `VITE_DEFAULT_BACKEND`.

**→ Detalles, compilación y prueba: [`rust/README.md`](rust/README.md)**

---

## 📸 Capturas de pantalla

<div align="center">

| Presentador / anfitrión | Cliente de juego de escritorio |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Pantalla del presentador" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Cliente de juego de escritorio" /> |

| Teléfono del jugador | Selección de avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Teléfono del jugador" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Selección de avatar" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Cabina de control de tema del gerente" />

<img src="docs/screenshots/start.webp" width="680" alt="Pantalla de inicio del anfitrión con el PIN del juego" />

</div>

---

## ✦ Lo que Razzoozle añade sobre Razzia

| | Característica |
| --- | --- |
| 🎨 | **Cabina de temas** — una pestaña "Diseño" del gerente en vivo: colores, fondos por vista, logotipo, radio y un interruptor de estilo **Plano ⇄ Cristal**, con preajustes (un predeterminado de crema plana + un preajuste opcional violeta **cristal líquido**) y selectores de color conscientes del contraste. |
| ☕ | **Diseño plano de crema** — una interfaz cálida y plana en crema con un telón de fondo animado viviente (blobs a la deriva + iconos de escuela/conocimiento flotantes), un logotipo/marca Zig plano, y fichas de respuesta de tinta sobre crema. |
| 🧊 | **Interfaz de cristal líquido** — un variante de tema glassmorphism opcional y heredado (esmerilado, superficies borrosas) que nunca toca la línea base plana. |
| 🎯 | **Pantallas de juego fieles a Kahoot** — fichas de respuesta con los iconos de forma clásicos (triángulo / diamante / círculo / cuadrado), un temporizador de cuenta regresiva circular, un contador de respuestas recibidas, y un podio animado. |
| 🧑‍🎨 | **Avatares de jugador** — cada jugador obtiene un avatar DiceBear generado (elija un estilo + remezcle, o cargue el suyo); los avatares flotan alrededor del vestíbulo y aparecen en las clasificaciones, el podio y los premios. |
| 🏆 | **Gamificación** — 15 logros, medallas, rachas, confeti y timbres de sonido, más una galería de trofeos personal. |
| 🥇 | **Resumen de premios de fin de juego** — una secuencia de superlativas animada (dedo más rápido, escalador más grande, racha más larga, niño del regreso…) mostrando el avatar + nombre de cada ganador, con ritmo automático en reproducción automática. |
| 👥 | **Modo de equipo** — equipos rojo / azul / verde / amarillo con una clasificación de equipo en vivo. |
| 📱 | **Juego en solitario** — practique cualquier cuestionario solo a través de un enlace de compartición, con su propio historial de puntuación. |
| ✍️ | **Más tipos de preguntas** — selección múltiple, escriba la respuesta y deslizador, además de la opción única clásica. |
| 🔌 | **Sistema de complementos** — complementos ZIP instalables por el gerente con su propia pestaña "Complementos". |
| 🧩 | **Complementos del gerente** — cargue, habilite y configure complementos JavaScript desde la consola del gerente (pestaña propia, insignias de capacidad, configuración persistida); incluye un esqueleto de iniciador de copiar y pegar (`examples/plugins/starter/`) con un contrato de autoría. |
| 📦 | **ZIP de tema esqueleto** — descargue/cargue un tema de juego completo como ZIP legible por LLM ("esqueleto": tokens de diseño + CSS + JS + contrato SKELETON.md). |
| 📳 | **Háptica móvil** — retroalimentación de vibración opcional en teléfonos de jugadores (cuenta regresiva, respuestas), consciente del movimiento reducido. |
| 🔗 | **Resultados compartibles** — vistas previas de enlaces por resultado rico (despliegue de Open Graph), una página de resultados con llamadas a la acción "juégalo tú mismo / hospeda el tuyo", y pegatinas de ganador descargables. |
| 🤝 | **Preguntas comunitarias** — una página de envío pública con una cola de moderación del gerente, más un catálogo de preguntas reutilizable y un archivo de cuestionarios. |
| 🖼️ | **Imágenes de IA locales** — genere imágenes de pregunta/tema en el dispositivo a través de ComfyUI (Z-Image), o conecte proveedores en la nube — las claves permanecen en el servidor. |
| 🌍 | **6 idiomas + PWA** — Inglés, alemán, francés, español, italiano, chino; instalable, consciente de sin conexión. |
| 📺 | **Quiosco de proyector + confiabilidad** — una vista de proyector `/display`, modo de baja latencia, recuperación de bloqueos, reconexión, y un servidor MCP para control de herramientas de IA. |

Respaldado por **592+ pruebas automatizadas**, un paso de seguridad de recorrido de ruta + CVE `ws`, una superficie no autenticada endurecida (límites de recursos por juego + desalojo de juego, límites de velocidad por IP, limitación de fuerza bruta de autenticación del gerente, autenticación de token de host acuñada por servidor cerrando IDOR), y un despliegue gestionado por salud en Docker. Probado bajo carga con **600 jugadores concurrentes**.

---

## 📲 Aplicaciones y complementos

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — la primera aplicación de escritorio nativa de **Windows** para Razzoozle. Hospede y gestione juegos desde su máquina, sin necesidad de navegador.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un servicio de cita / descubrimiento ligero que ayuda a los clientes a encontrarse entre sí. Solo descubrimiento — nunca retransmite el juego.

---

## ⚙️ Requisitos previos

**Con Docker (recomendado):** Docker + Docker Compose.
**Sin Docker:** Node.js 22+ y pnpm 11+.

---

## 📖 Comenzando

### 🐳 Docker (recomendado)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

La aplicación se inicia en `http://127.0.0.1:3011` (nginx + servidor Rust en un contenedor de forma predeterminada). La configuración y los datos del usuario viven en el volumen `./config`, creado e inoculado en el primer arranque. Colóquelo detrás de su propio proxy inverso (Caddy, nginx, Traefik…) para TLS y un nombre de host público.

Para usar el servidor Node en su lugar, establezca `VITE_DEFAULT_BACKEND=node` antes de compilar, o cambie en la interfaz del gerente.

### 🛠️ Sin Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # production build
pnpm start        # o: pnpm dev  (web + servidor Rust, recarga en caliente)
```

---

## 🎮 Cómo jugar

1. Abra `/manager` en la máquina del anfitrión e inicie sesión con la contraseña del gerente.
2. Elija un cuestionario e inicie un juego — aparece un PIN (muéstrelo en el proyector a través de `/display`).
3. Los jugadores abren el sitio en sus teléfonos, ingresan el PIN y un nombre.
4. Responda lo más rápido que pueda — las respuestas correctas más rápidas obtienen más puntos.
5. Observe la clasificación, medallas y confeti entre rondas.

¿Prefiere jugar solo? Abra el enlace de compartición **solo** de cualquier cuestionario y practique a su propio ritmo.

---

## ⚙️ Configuración

Los datos en tiempo de ejecución viven en `config/` (ignorado por git, sembrado en el primer arranque).

### Configuración del juego — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CHANGE THIS — the default blocks manager access
  "teamMode": false,             // enable red/blue/green/yellow teams
  "lowLatencyMode": { "enabled": false } // opt-in timing/UX tightening (see docs/LOW-LATENCY-MODE.md)
}
```

### Cuestionarios — `config/quizz/*.json`

Cree cuestionarios en el editor del gerente (recomendado) o como JSON. Una pregunta soporta varios `type`s (`choice`, `boolean`, `slider`, más selección múltiple a través de varios `solutions`, y escriba la respuesta):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // 0-based indices; multiple = multi-select
      "time": 20,                 // seconds to answer (5–120)
      "cooldown": 5,              // seconds before the answer is revealed (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // optional
    }
  ]
}
```

El proveedor de IA (desactivado / ComfyUI local / nube) se configura en la pestaña **IA** del gerente; las claves de API se almacenan en el servidor en `config/` y nunca se envían a los clientes.

---

## 📺 Pantalla de proyector / quiosco

`/display` representa la presentación del anfitrión a pantalla completa para un proyector o TV (tipo escalado vh que se lee en toda una habitación), emparejable desde un teléfono. Una ruta `/satellite/<gameId>` es una vista de quiosco sin control que se autentica con un token (sin contraseña del gerente). Se incluye una imagen opcional de satélite Raspberry-Pi.

---

## 🧱 Pila de tecnología

Un monorepo pnpm — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), un **servidor dual** (Rust `axum` + `socketioxide` de forma predeterminada, o Node + Socket.IO para compatibilidad), **`@razzoozle/common`** (tipos validados por Zod compartidos, generados automáticamente desde Rust a través de `ts-rs`), y **`@razzoozle/mcp`** (un servidor MCP para control de herramientas de IA). Se envía como una única imagen de Docker con un punto final `/healthz` + Docker `HEALTHCHECK`.

**Servidor Rust** (espacio de trabajo `rust/`): `razzoozle-protocol` (tipos de cable), `razzoozle-engine` (lógica del juego), `razzoozle-server` (`axum` + `socketioxide`).

---

## 🤝 Contribuyendo

Los problemas y solicitudes de extracción son bienvenidos. Ejecute `pnpm verify` (verificación de tipo + linting + pruebas) antes de abrir un PR. Para cambios en el servidor Rust, ejecute `cargo test` en `rust/` y verifique que pase la puerta CI (prueba de humo de juego real).

---

## ⭐ Historial de estrellas

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Historial de estrellas" />
</a>

---

## 📝 Créditos y licencia

Razzoozle es una bifurcación de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — muchas gracias a los autores anteriores. Lanzado bajo la **[Licencia MIT](LICENSE)** (© 2024 Ralex, © 2026 Colaboradores de Razzoozle); el aviso de MIT anterior se retiene.
