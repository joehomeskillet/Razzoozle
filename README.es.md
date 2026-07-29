<div align="center">

<img src="docs/screenshots/hero.webp" width="640" alt="Razzoozle" />

# Razzoozle

### Plataforma de cuestionarios en vivo, autoalojada y de código abierto — un presentador estilo Kahoot + juego para móvil.

[English](README.md) · [Deutsch](README.de.md) · 🌐 **Español** · [Français](README.fr.md) · [Italiano](README.it.md) · [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-8B5CF6.svg)](LICENSE)
![Rust](https://img.shields.io/badge/Rust-CE422B?logo=rust&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)

**[▶ Demo en vivo](https://rust.razzoozle.xyz)** · **[📚 Documentación](docs/)** · **[Reportar un problema](https://github.com/joehomeskillet/Razzoozle/issues)** · *fork de [Ralex91/Razzia](https://github.com/Ralex91/Razzia)*

</div>

---

## ¿Qué es Razzoozle?

Una plataforma de cuestionarios en tiempo real autoalojada para aulas y eventos. Un anfitrión abre una partida en la pantalla, los jugadores se unen desde sus móviles con un PIN, y las respuestas correctas más rápidas puntúan más. Dispone de 17 tipos de preguntas (Choice, Boolean, Slider, Poll, MultipleSelect, TypeAnswer, SentenceBuilder, Mathematik, Wortarten, Sequencing, FillBlank, Matching, DropPin, WordCloud, Brainstorm, Confidence, MicroLesson), modos de equipo e individual, una cabina de moderador para temas, gamificación, gestión de clases, y generación local de imágenes con IA.

**Características:** [Demo en vivo](https://rust.razzoozle.xyz) · [Lista completa de funciones](docs/README.md) · 592+ pruebas · Docker + servidor Rust

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

Abre `http://localhost:3000` (cliente web). El servidor se ejecuta en puertos separados (con hot reload habilitado).

### Opción 2: Docker (recomendado para producción)

```bash
git clone https://github.com/joehomeskillet/Razzoozle.git
cd Razzoozle
DOCKER_BUILDKIT=1 docker build -f rust/Dockerfile -t razzoozle:latest .
docker run -d -p 3020:3020 \
  -e DATABASE_URL='postgresql://razzoozle:password@postgres:5432/razzoozle' \
  -e BOOTSTRAP_ADMIN_PASSWORD='change-me' \
  -v razzoozle-config:/config \
  razzoozle:latest
```

La aplicación se ejecuta en `http://localhost:3020`. Ver **[Auto-hospedaje](docs/Self-Hosting.md)** para configurar proxy inverso + TLS.

---

## Próximos pasos

- **Configurar moderador:** Abre `/manager`, inicia sesión con la contraseña de bootstrap y **cámbiala inmediatamente**.
- **Desplegar a producción:** [Guía de auto-hospedaje](docs/Self-Hosting.md)
- **Personalizar apariencia:** [Temas](docs/Theming.md)
- **Configurar gameplay:** [Configuración](docs/Configuration.md)
- **Internos de Rust:** [rust/README.md](rust/README.md)

---

## Contribuir

Los issues y pull requests son bienvenidos. Antes de abrir un PR:

```bash
pnpm verify          # typecheck + lint + tests
bash rust/gate.sh    # Pruebas del backend Rust (si cambió)
```

---

## Licencia y créditos

Licencia MIT (© 2024 Ralex, © 2026 colaboradores de Razzoozle). Fork de [**Ralex91/Razzia**](https://github.com/Ralex91/Razzia).
