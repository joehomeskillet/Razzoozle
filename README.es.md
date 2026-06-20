<div align="center">

<img src="docs/screenshots/hero.webp" width="680" alt="Razzoozle" />

# Razzoozle

### Una plataforma de cuestionarios en vivo, autoalojada y de código abierto — con un diseño **crema** limpio y plano (y un tema opcional de cristal líquido).

🌐 [English](README.md) · [Deutsch](README.de.md) · **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-149ECA?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-06B6D4?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![Motion](https://img.shields.io/badge/Motion-0055FF?logo=framer&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-433E38)
![Tests](https://img.shields.io/badge/tests-592-3DBFA0)

**[▶ Demo en vivo](https://razzoozle.joelduss.xyz)** · **[🌐 Showcase](https://joehomeskillet.github.io/Razzoozle/)** · **[📚 Docs](docs/)** · **[Informar de un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *bifurcado de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## 🧩 ¿Qué es esto?

Razzoozle es un **juego de cuestionarios** autoalojado y en tiempo real para aulas, eventos y noches de juegos. Un anfitrión abre una partida en la pantalla grande, los jugadores se unen desde sus móviles con un PIN, y todos compiten por responder — las respuestas correctas más rápidas obtienen más puntos. Es un fork amigable de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia), reconstruido en torno a un diseño **crema** limpio y plano (el cristal líquido es ahora un tema opcional) con un sistema de temas controlado por el manager, gamificación, modo por equipos y en solitario, y generación local de imágenes con IA — manteniendo a la vez la clásica experiencia al estilo Kahoot de presentador + móvil (casillas de respuesta de colores con formas, una cuenta atrás y un podio).

> Razzoozle es un proyecto independiente de código abierto. No está afiliado, respaldado ni conectado con Kahoot!® ni con ninguna otra plataforma comercial de cuestionarios.

---

## 📸 Capturas de pantalla

<div align="center">

| Presentador / anfitrión | Cliente de juego de escritorio |
| :---: | :---: |
| <img src="docs/screenshots/presenter.webp" width="420" alt="Presenter screen" /> | <img src="docs/screenshots/desktop.webp" width="420" alt="Desktop game client" /> |

| Móvil del jugador | Selección de avatar |
| :---: | :---: |
| <img src="docs/screenshots/phone.webp" width="240" alt="Player phone" /> | <img src="docs/screenshots/avatar.webp" width="240" alt="Avatar selection" /> |

<img src="docs/screenshots/admin.webp" width="680" alt="Manager theme cockpit" />

<img src="docs/screenshots/start.webp" width="680" alt="Host start screen with the Game PIN" />

</div>

---

## ✦ Lo que Razzoozle añade sobre Razzia

| | Característica |
| --- | --- |
| 🎨 | **Cabina de temas** — una pestaña «Diseño» en vivo del manager: colores, fondos por vista, logo, radio y un conmutador de estilo **Plano ⇄ Cristal**, con presets (un **crema** plano por defecto + un preset opcional violeta de **cristal líquido**) y selectores de color conscientes del contraste. |
| ☕ | **Diseño crema plano** — una interfaz crema plana y cálida con un fondo animado vivo (blobs a la deriva + iconos flotantes de escuela/conocimiento), un logotipo/wordmark plano «Zig» y casillas de respuesta de tinta sobre crema. |
| 🧊 | **Interfaz de cristal líquido** — una variante de tema opcional y heredada de glassmorphism (superficies esmeriladas y difuminadas) que nunca toca la base plana. |
| 🎯 | **Pantallas de juego fieles a Kahoot** — casillas de respuesta con los iconos de formas clásicos (triángulo / rombo / círculo / cuadrado), un temporizador circular de cuenta atrás, un contador de respuestas recibidas y un podio animado. |
| 🧑‍🎨 | **Avatares de jugador** — cada jugador obtiene un avatar DiceBear generado (elige un estilo + vuelve a tirar, o sube el tuyo); los avatares flotan por la sala de espera y aparecen en las clasificaciones, el podio y los premios. |
| 🏆 | **Gamificación** — 15 logros, medallas, rachas, confeti y campanillas de sonido, además de una galería personal de trofeos. |
| 🥇 | **Resumen de premios de fin de partida** — una secuencia animada de superlativos (dedo más rápido, mayor escalador, racha más larga, rey del regreso…) que muestra el avatar + nombre de cada ganador, con ritmo automático en la reproducción. |
| 👥 | **Modo por equipos** — equipos rojo / azul / verde / amarillo con una clasificación de equipos en vivo. |
| 📱 | **Juego en solitario** — practica cualquier cuestionario tú solo mediante un enlace para compartir, con su propio historial de puntuaciones. |
| ✍️ | **Más tipos de pregunta** — selección múltiple, escribe-la-respuesta y deslizador, además de la clásica opción única. |
| 🔌 | **Sistema de plugins** — complementos ZIP instalables por el manager con su propia pestaña «Plugins». |
| 🧩 | **Addons del manager** — sube, activa y configura addons de JavaScript desde la consola del manager (pestaña propia, insignias de capacidad, configuración persistente); incluye un esqueleto inicial de copiar y pegar (`examples/plugins/starter/`) con un contrato de autoría. |
| 📦 | **ZIPs de tema esqueleto** — descarga/sube un tema de juego completo como un ZIP legible por LLM («esqueleto»: tokens de diseño + CSS + JS + un contrato SKELETON.md). |
| 📳 | **Háptica móvil** — respuesta de vibración opcional en los móviles de los jugadores (cuenta atrás, respuestas), consciente de reduced-motion. |
| 🔗 | **Resultados compartibles** — vistas previas de enlace ricas por resultado (despliegue Open Graph), una página de resultados con llamadas a la acción «juégalo tú mismo / aloja el tuyo» y pegatinas de ganador descargables. |
| 🤝 | **Preguntas de la comunidad** — una página pública de envíos con una cola de moderación en el manager, además de un catálogo de preguntas reutilizable y un archivo de cuestionarios. |
| 🖼️ | **Imágenes de IA locales** — genera imágenes para preguntas/temas en el dispositivo mediante ComfyUI (Z-Image), o conecta proveedores en la nube — las claves permanecen en el servidor. |
| 🌍 | **6 idiomas + PWA** — inglés, alemán, francés, español, italiano, chino; instalable, consciente del modo sin conexión. |
| 📺 | **Kiosco de proyector + fiabilidad** — una vista de proyector `/display`, modo de baja latencia, recuperación ante caídas, reconexión y un servidor MCP para el control mediante herramientas de IA. |

Respaldado por **592 pruebas automatizadas**, un repaso de seguridad contra path-traversal y la CVE de `ws`, una superficie no autenticada endurecida (límites de jugadores por partida y de partidas activas, endpoints públicos con límite de tasa, estrangulamiento por fuerza bruta de la autenticación del manager) y un despliegue Docker con comprobación de salud. Probado bajo carga con **600 jugadores simultáneos**.

---

## 📲 Apps y complementos

- **[Razzoozle Desktop](https://github.com/joehomeskillet/razzoozle-desktop) (Beta)** — la primera app de escritorio nativa para **Windows** de Razzoozle. Aloja y gestiona partidas desde tu equipo, sin necesidad de navegador.
- **[Razzoozle Gateway](https://github.com/joehomeskillet/razzloo-gateway)** — un ligero servicio de encuentro / descubrimiento que ayuda a los clientes a encontrarse entre sí. Solo descubrimiento — nunca retransmite el juego.

---

## ⚙️ Requisitos previos

**Con Docker (recomendado):** Docker + Docker Compose.
**Sin Docker:** Node.js 22+ y pnpm 11+.

---

## 📖 Primeros pasos

### 🐳 Docker (recomendado)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
docker compose up -d
```

La aplicación se inicia en `http://127.0.0.1:3011` (nginx + el servidor de sockets en un único contenedor). La configuración y los datos de usuario residen en el volumen `./config`, creado y poblado en el primer arranque. Colócalo detrás de tu propio proxy inverso (Caddy, nginx, Traefik…) para TLS y un nombre de host público.

### 🛠️ Sin Docker

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
pnpm install
pnpm build        # build de producción
pnpm start        # o: pnpm dev  (web + socket, recarga en caliente)
```

---

## 🎮 Cómo jugar

1. Abre `/manager` en la máquina anfitriona e inicia sesión con la contraseña del manager.
2. Elige un cuestionario e inicia una partida — aparece un PIN (muéstralo en el proyector mediante `/display`).
3. Los jugadores abren el sitio en sus móviles, introducen el PIN y un nombre.
4. Responde tan rápido como puedas — las respuestas correctas más rápidas obtienen más puntos.
5. Observa la clasificación, las medallas y el confeti entre rondas.

¿Prefieres jugar solo? Abre el enlace para compartir **en solitario** de cualquier cuestionario y practica a tu propio ritmo.

---

## ⚙️ Configuración

Los datos de tiempo de ejecución residen en `config/` (ignorado por git, poblado en el primer arranque).

### Ajustes del juego — `config/game.json`

```jsonc
{
  "managerPassword": "PASSWORD", // CAMBIA ESTO — el valor por defecto bloquea el acceso del manager
  "teamMode": false,             // activar equipos rojo/azul/verde/amarillo
  "lowLatencyMode": { "enabled": false } // ajuste opcional de timing/UX (ver docs/LOW-LATENCY-MODE.md)
}
```

### Cuestionarios — `config/quizz/*.json`

Crea cuestionarios en el editor del manager (recomendado) o como JSON. Una pregunta admite varios `type` (`choice`, `boolean`, `slider`, además de selección múltiple mediante varios `solutions`, y escribe-la-respuesta):

```jsonc
{
  "subject": "Python Basics",
  "questions": [
    {
      "question": "Which keyword defines a function in Python?",
      "type": "choice",
      "answers": ["func", "def", "function", "fun"],
      "solutions": [1],          // índices basados en 0; varios = selección múltiple
      "time": 20,                 // segundos para responder (5–120)
      "cooldown": 5,              // segundos antes de revelar la respuesta (3–15)
      "media": { "type": "image", "url": "https://placehold.co/600x400.png" } // opcional
    }
  ]
}
```

El proveedor de IA (apagado / ComfyUI local / nube) se configura en la pestaña **IA** del manager; las claves de API se almacenan en el lado del servidor en `config/` y nunca se envían a los clientes.

---

## 📺 Pantalla de proyector / kiosco

`/display` renderiza la presentación del anfitrión a pantalla completa para un proyector o televisor (tipografía escalada en vh que se lee de un extremo a otro de la sala), emparejable desde un móvil. La ruta `/satellite/<gameId>` es una vista de kiosco sin controles que se autentica con un token (sin contraseña del manager). Se incluye una imagen opcional de satélite para Raspberry Pi.

---

## 🧱 Stack tecnológico

Un monorepo de pnpm — **`@razzoozle/web`** (React + Vite + Tailwind v4, TanStack Router, PWA), **`@razzoozle/socket`** (Node + Socket.IO + Express, snapshots de recuperación ante caídas), **`@razzoozle/common`** (tipos compartidos validados con Zod) y **`@razzoozle/mcp`** (un servidor MCP para el control mediante herramientas de IA). Se entrega como una única imagen Docker (nginx + node vía supervisord) con un endpoint `/healthz` + `HEALTHCHECK` de Docker.

---

## 🤝 Contribuir

Los issues y pull requests son bienvenidos. Ejecuta `pnpm verify` (typecheck + lint + tests) antes de abrir un PR.

---

## ⭐ Historial de estrellas

<a href="https://star-history.com/#joehomeskillet/Razzoozle&Date">
  <img src="https://api.star-history.com/svg?repos=joehomeskillet/Razzoozle&type=Date" width="600" alt="Star history" />
</a>

---

## 📝 Créditos y licencia

Razzoozle es un fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia) — un enorme agradecimiento a los autores originales. Publicado bajo la **[Licencia MIT](LICENSE)** (© 2024 Ralex, © 2026 colaboradores de Razzoozle); se conserva el aviso MIT original.
</content>
</invoke>
