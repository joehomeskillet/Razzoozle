# Release Notes v1.1.0

**Release Date:** June 19, 2026

## 🎉 Summary

v1.1.0 brings comprehensive mobile haptics support, refined cream-based UI redesign, animated background customization, avatar improvements, plugin system enhancements, recap/awards screens, and numerous quality-of-life fixes across all platforms.

---

## ✨ Features

- **Animated Backgrounds:** Per-screen animated background colors with wallpaper upload/preview and inline CSS editing
- **Avatar System v2:** DiceBear-powered random avatars per player with configurable display and visual state management
- **Mobile Haptics:** Cross-browser `navigator.vibrate()` support with reduced-motion awareness and configurable haptic patterns
- **Plugin System v1:** In-process server.js execution, ZIP-based storage, manager configuration UI, and pre-installed config-editor plugin
- **Recap & Awards:** Client-side podium medals, manager recap sequences, player recap cards, and superlatives tracking
- **Sound Packs:** Manager-configurable per-slot SFX overrides with theme persistence
- **OG Unfurl:** Per-result OpenGraph preview cards for `/r/:id` sharing
- **D9 Features:** Floating lobby avatars, QR code placement, share CTAs, and backdrop school icons
- **Flat Design Tokens:** Cream-based visual identity with new logo, wordmark, and brand colors

---

## 🎨 Design & Visual Updates

- **Cream Redesign Wave 1:** Front-of-house flat design with single background and new logo icon
- **Cream Redesign Wave 2:** Trophy/awards page styling
- **Cream Redesign Wave 3:** Internationalized tier labels with i18n parity
- **Cream Redesign Wave 4:** Flat Zig mark and manifest brand updates
- **Cream Redesign Wave 5:** In-game player cream via scoped `--game-fg` token
- **Typography & Spacing:** Consistent cream entry screens with mobile-responsive content scrolling
- **Avatar Polish:** Error state handling, race condition fixes, picker UX improvements
- **README Screenshots:** Side-by-side phone+avatar, updated cream UI documentation (EN/DE/ZH)

---

## 🐛 Fixes & Improvements

### Mobile & Touch
- **iOS Scroll Fix:** Restored touch-scroll on body (was blocked by `touch-action:none`)
- **Trophies Scrollability:** Page now scrollable on phones with proper container management
- **Touch Lock:** Scoped body touch lock with internal `h-dvh` scroll container
- **Submit Page:** Removed scroll-fade masks rendering as grey shadow artifacts

### Visual Bugs
- **Glass Removal:** Complete cream sweep removing dark/glass/invisible surfaces
- **Header Border:** Dropped header border reading as grey shadow
- **Avatar Display:** Consistent picker behavior and state reset on image errors
- **Glow Effects:** Removed harsh glows from awarded avatars

### Quality & Security
- **Audit Majors:** Security fixes, plugin correctness, a11y improvements, i18n parity, performance optimization
- **Audit Minors:** Dead-code removal, type-safety improvements, a11y fixes, performance tuning
- **Plugin Security:** Hardened public asset routes against XSS attacks
- **DiceBear SVG:** Accept data-URIs for avatar sources (was rejected with `avatar.invalid`)

---

## 🔧 Infrastructure & Developer Experience

### CI/CD
- **cwebp Installation:** Added webp dependency to verify job for WebP transcode tests
- **Gitea Actions:** Fixed runner configuration, dropped broken setup-node, neutralized redundant deploy
- **Pipeline Re-trigger:** Enhanced runner debugging

### Publishing & Artifacts
- **Git Housekeeping:** Stopped publishing AI/orchestration files (untracked, added to .gitignore)

### Documentation
- **Manager Plugin System:** Full `PLUGINS.md` specification and install/security guide
- **Design Specs:** Trophy-sticker design specification and recap/Firebase research
- **API Docs:** Comprehensive OpenAPI documentation with tagged endpoints

---

## 📦 Dependencies

- Updated TypeScript and lint tooling
- Motion library for animations
- canvas-confetti for celebration effects
- use-sound for audio playback
- jszip for skeleton ZIP export/import

---

## 🚀 Deployment Notes

This release includes:
- **Theme System Evolution:** ZIP-based skeleton export/import with LLM-readable contract
- **Plugin System Foundation:** Secure manager-gated JavaScript execution
- **Mobile-First:** Full haptics, scroll fixes, and responsive improvements for phones

Recommended deployment: Standard multi-stage rollout with monitoring for haptics API coverage.

---

## 🙏 Contributors

Multiple contributors across design, frontend, backend, and DevOps teams.

---

**For detailed commit history, see:** `git log v1.0.0..v1.1.0`
