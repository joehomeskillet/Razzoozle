# Third-Party Notices

This document lists all open-source and proprietary software components used in Razzoozle Flower Battle (PixiJS + procedural puppet-rig implementation).

**Status:** ✓ COMPLETE (Spine-free decision, 2026-07-30)

---

## Software Licenses

### PixiJS

- **Name:** PixiJS
- **Version:** ^8.16.0
- **Source:** https://github.com/pixijs/pixijs
- **License:** MIT
- **Copyright:** © PixiJS contributors
- **Used For:** 2D WebGL/Canvas rendering for Flower Battle presenter scene

**License Text:** See `licenses/pixijs-license.txt`

---

### GSAP (Tweening Engine)

- **Name:** GSAP (GreenSock Animation Platform)
- **Version:** ^3.12.0
- **Source:** https://github.com/greensock/GSAP
- **License:** MIT (Community version, free)
- **Copyright:** © GreenSock
- **Used For:** Tween-based animation sequencing for plant puppet-rig (grow, sway, celebrate, etc.)

**Note:** Paid tier (DrawSVG, MorphSVGPlugin) not used; MIT Community version sufficient.

**License Text:** MIT — included in `licenses/pixijs-license.txt` (shared MIT notice)

---

### Motion

- **Name:** Motion
- **Version:** ^12.42.2
- **Source:** https://github.com/framer/motion
- **License:** MIT
- **Copyright:** © Framer
- **Used For:** React component animations (HTML overlay, not PixiJS)

---

### Socket.IO Client

- **Name:** socket.io-client
- **Version:** ^4.8.3
- **Source:** https://github.com/socketio/socket.io-client-js
- **License:** MIT
- **Copyright:** © Socket.IO contributors
- **Used For:** Real-time game state updates

---

### Zustand

- **Name:** Zustand
- **Version:** ^5.0.14
- **Source:** https://github.com/pmndrs/zustand
- **License:** MIT
- **Copyright:** © Paul Henschel & contributors
- **Used For:** State management

---

### Vite

- **Name:** Vite
- **Version:** ^8.1.3
- **Source:** https://github.com/vitejs/vite
- **License:** MIT
- **Copyright:** © 2020-present Evan You and Vite contributors
- **Used For:** Build tool & dev server

---

### React & React DOM

- **Name:** React / React DOM
- **Version:** ^19.2.7
- **Source:** https://github.com/facebook/react
- **License:** MIT
- **Copyright:** © Facebook, Inc.
- **Used For:** Web framework for UI components

---

### TailwindCSS

- **Name:** Tailwind CSS
- **Version:** ^4.3.2
- **Source:** https://github.com/tailwindlabs/tailwindcss
- **License:** MIT
- **Copyright:** © Tailwind Labs
- **Used For:** CSS utility framework

---

### Other Licenses

For a complete list of all dependencies, run:
```bash
pnpm licenses list
```

Licenses of transitive dependencies are included in `node_modules/.pnpm/` and can be audited via `pnpm audit`.

---

## Art Assets

### Plant Illustrations & Animations

**Status:** Procedural implementation (no external assets requiring separate license)

- Ownership: Razzoozle publisher / art team
- Implementation: PixiJS Containers + GSAP tweens (code-based, not editor assets)

---

## Distribution Requirements

This notice must be included in any distributed version of Razzoozle Flower Battle:

1. ✓ PixiJS MIT notice (always)
2. ✓ GSAP MIT notice (always)
3. ✓ All other open-source licenses per the list above

Place visible link in app:
- `/about/licenses` or
- Game credits screen or
- Website footer

---

## Updates

This document will be updated as dependencies are upgraded or new licenses are added. Last updated: **2026-07-30** (Spine-free decision, GSAP added).

For questions, refer to the maintainer.

