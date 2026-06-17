# Design Spec — Shareable Trophy Sticker

> **Status:** spec / proposed — implementation not started.
> **Owner:** design. **Scope:** a static, rasterizable "trophy sticker" PNG for the
> top 1–3 players of a finished multiplayer game, exported for sharing (WhatsApp
> status, feed, story).
>
> **This is a spec only.** No `.tsx` / production code is part of this document.
> Implementation goes to `@css-bugfixer` / `@jinja-template-edit` / `@or-coder-free`
> against the constraints below.

---

## 0. Why this exists

After a game finishes (`Podium`), the top players see a "Sticker teilen" affordance.
Tapping it rasterizes a single themed card to PNG and hands it to the native share
sheet (or download fallback). The card celebrates **one** player's placement and is
designed to look good as a standalone image outside the app — i.e. it carries its
own branding (`logo` / `appTitle`) and a small `Razzoozle` watermark so a re-shared
screenshot is still attributable.

It reuses the visual language of `AchievementMedal.tsx` (tier-gradient disc, ring,
diagonal sheen, centered glyph) and `Podium.tsx` (rank → tier medal, `subject`
headline, points in `tabular-nums`), but **strips all motion** and **resolves all
colors to inline hex/rgb** so it rasterizes deterministically.

---

## 1. Format + aspect ratio (recommended default)

**Default: square `1080 × 1080` (1:1).** This is the recommended export.

Rationale:
- WhatsApp status, WhatsApp "shared image" previews, Instagram feed, and most chat
  thumbnails crop or letterbox toward square. A 1:1 canvas survives every common
  crop without losing the medal, name, or watermark.
- The composition (single centered medal + name + points) is radially balanced, so
  square framing reads as intentional rather than cropped.
- `1080px` is the de-facto social baseline; combined with `pixelRatio: 2` on a
  `540px` logical layout (see §4) the emitted PNG is a crisp 1080².

**Alt: story `1080 × 1920` (9:16).** Offer as a secondary export for WhatsApp /
Instagram Story full-bleed. Same component, taller frame: the medal block stays
centered and the branding header / watermark footer gain breathing room (variant C,
§6). Do not make this the default — it wastes space in feed/status contexts.

**Do not** offer arbitrary sizes. Two fixed presets only (square default, story alt)
keeps the layout testable and the rasterization deterministic (YAGNI).

| Preset | Pixels (emitted) | Logical layout | `pixelRatio` | Use |
| ------ | ---------------- | -------------- | ------------ | --- |
| `square` (default) | 1080 × 1080 | 540 × 540 | 2 | status, feed, chat |
| `story` (alt)      | 1080 × 1920 | 540 × 960 | 2 | full-screen stories |

---

## 2. Visual layout (ASCII mockup — `square` default)

```
┌──────────────────────────────────────────────────┐
│  ░░ background: linear-gradient(135deg,            │  ← colorSecondary → colorPrimary
│         colorSecondary, colorPrimary) ░░           │     (resolved hex, see §3)
│                                                    │
│   [LOGO]  appTitle                       🏆 RANG   │  ← branding header (top-left logo+title)
│  ─────────────────────────────────────  ┌──────┐  │     rank badge top-right
│                                          │  1   │  │  ← rank badge: tierColors[gold|silver|bronze]
│                                          └──────┘  │     pill, big numeral, tier-tinted
│                                                    │
│                  ╭───────────────╮                 │
│                 ╱   tier-gradient  ╲                │  ← AchievementMedal-style DISC
│                │   ┌───────────┐    │               │     (rank-tier gradient + ring + static sheen)
│                │   │     1      │    │  ← rank numeral (or 🏆 glyph) centered, white, drop-shadow
│                │   └───────────┘    │               │
│                 ╲                  ╱                │
│                  ╰───────────────╯                 │
│                                                    │
│                  M a x i m i l i a n               │  ← player name (display font, accentColor underline)
│                                                    │
│                   1 2 . 3 4 0  Pkt.                 │  ← points, tabular-nums, large
│                                                    │
│              „Hauptstädte Europas“                 │  ← quiz subject/title (in quotes, muted)
│                                                    │
│   ⚡ 🔥 🎯  (bis zu 3 achievement-medaillons, sm)    │  ← optional achievements row (if provided)
│                                                    │
│  ─────────────────────────────────────────────    │
│   Gespielt mit Razzoozle               razzoozle   │  ← watermark footer (footerColors)
└──────────────────────────────────────────────────┘
```

Vertical rhythm (top → bottom): branding header → rank badge → medal disc →
name → points → subject → optional achievements → watermark footer.
Everything is **center-aligned on the vertical axis** except the header row
(logo+title left, rank badge right) and the footer row (attribution left,
wordmark right).

---

## 3. Token map + fallback hex

Every sticker element pulls from the **active `Theme` object** (raw hex strings,
already validated by `themeValidator`). The component receives `theme` as a prop and
emits **resolved inline `style={{ … }}` hex/rgb** — it must never reference a CSS
custom property (`var(--…)`), a Tailwind `@theme` utility class (`from-amber-600`,
`text-slate-900`, …), or `color-mix()`. See §4 for why.

| Sticker element | Theme token | Fallback hex (if token missing/invalid) |
| --------------- | ----------- | --------------------------------------- |
| Card background gradient (start) | `theme.colorSecondary` | `#2e1065` |
| Card background gradient (end)   | `theme.colorPrimary`   | `#7c3aed` |
| Rank badge fill — rank 1 | `theme.tierColors.gold`   | `#eab308` |
| Rank badge fill — rank 2 | `theme.tierColors.silver` | `#9ca3af` |
| Rank badge fill — rank 3 | `theme.tierColors.bronze` | `#b45309` |
| Medal disc gradient (rank-tier) | derived from same `tierColors[rank]` (see §3.1) | as above |
| Medal ring / outer stroke | lighten of rank tier (`+ rgba white`) | `rgba(255,255,255,0.55)` |
| Medal sheen overlay | fixed | `rgba(255,255,255,0.30)` (static, no animation) |
| Rank numeral / glyph color | `theme.colorText` | `#ffffff` |
| Player name | `theme.colorText` | `#ffffff` |
| Player name underline / flourish | `theme.accentColor` | `#ff9900` |
| Points number | `theme.colorText` | `#ffffff` |
| "Pkt." unit label | `theme.colorText` @ 70% (pre-mixed rgba) | `rgba(255,255,255,0.70)` |
| Quiz subject text | `theme.colorText` @ 80% (pre-mixed rgba) | `rgba(255,255,255,0.80)` |
| Branding `appTitle` text | `theme.colorText` | `#ffffff` |
| Branding logo image | `theme.logo` (resolved to absolute URL; see §4 note) | bundled default mark |
| Achievement medallions | per-achievement `tier` → `tierColors[tier]` | tier fallbacks above |
| Footer background | `theme.footerColors.bg` | `#ffffff` |
| Footer text + watermark | `theme.footerColors.text` | `#1f2937` |

### 3.1 Tier gradient (resolved, NOT Tailwind classes)

`AchievementMedal` uses Tailwind gradient classes (`from-yellow-400 to-amber-500`,
etc.). Those are **forbidden on the capture node** because they compile to oklch and
do not survive foreignObject rasterization. Instead the sticker builds an inline
linear-gradient per rank tier from the resolved tier hex:

```
discBackground(tierHex) =
  `linear-gradient(135deg,
     ${lighten(tierHex, 18%)} 0%,
     ${tierHex} 55%,
     ${darken(tierHex, 22%)} 100%)`
```

`lighten` / `darken` are computed in JS at render time to literal `#rrggbb` (a tiny
local helper, NOT `color-mix()`), so the emitted DOM contains only static hex stops.
Rank → tier mapping: `1 → gold`, `2 → silver`, `3 → bronze` (matches `Podium` /
`tierColors`). A `diamant` accent variant is out of scope for v1 (podium is 3 tiers).

---

## 4. Component inventory + rasterization constraints

### Build (new)
- **`<TrophySticker>`** — a single static, presentational React component.
  - Props:
    ```ts
    interface TrophyStickerProps {
      rank: 1 | 2 | 3
      name: string
      points: number
      subject: string            // quiz title / subject line
      theme: Theme               // from @razzoozle/common/types/theme
      achievements?: string[]    // optional achievement ids (max 3 shown)
      format?: "square" | "story" // default "square"
    }
    ```
  - Renders the layout in §2 with **all colors resolved to inline hex/rgb** from
    `theme` (+ fallbacks from §3). No store, socket, i18n-runtime, or network reads
    inside the capture subtree — text is passed in already-localized (see §5).
  - Exposes a stable capture root (e.g. `id="trophy-sticker-capture"` or a forwarded
    `ref`) at the exact pixel dimensions of the chosen format.

- **Export hook / handler (thin, separate file — NOT inside the capture component)**:
  orchestrates `modern-screenshot` → `Blob` → `navigator.share({ files })` with a
  download (`<a download>`) fallback. Spec-only here; see constraints below.

### Reuse
- **`AchievementMedal`** — reuse for the optional achievements row **only in a static
  capture-safe wrapper**. The live `AchievementMedal` uses `motion/react` + animated
  rings; for the sticker, render a **non-animated variant** (pass nothing that
  triggers pulse, and ensure the capture path disables motion — see constraint 5).
  If the existing component cannot be made fully static via props, the sticker should
  render its own inline-hex mini-medallion using the same disc/ring/glyph recipe
  rather than mounting the animated one. Reuse the *visual language*, not necessarily
  the live component.

### Rasterization constraints (hard requirements — `modern-screenshot` / foreignObject)

1. **Static only.** The capture subtree must contain **no `motion/react` elements,
   no CSS `@keyframes`/`animation`/`transition`, no `react-confetti`.** foreignObject
   snapshots a single frame; animated nodes capture mid-transition or blank. Render
   the sticker in its resting (visible) state.
2. **Resolved inline colors.** Every color on the capture node is a literal
   `#rrggbb` / `rgb()` / `rgba()` via `style={{ … }}`. **Forbidden:** `var(--…)` CSS
   custom properties, Tailwind v4 `@theme` utility classes (these emit `oklch(…)`),
   and `color-mix(...)`. The app's runtime theme vars (`apply.ts`) and the oklch
   palette do **not** resolve through the SVG foreignObject serializer and produce
   blank or wrong-color output. Pre-compute every gradient stop and tint to hex/rgba
   in JS.
3. **Embedded / system font.** Use a **web-safe system font stack** for the capture
   node (e.g. `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial,
   sans-serif`) **OR** an explicitly embedded font (base64 `@font-face` data URI
   inlined into the capture subtree). **Do not** rely on the app's `Rubik Variable`
   webfont — if the font has not loaded at capture time, foreignObject falls back to
   a default face and the layout shifts. If branded type is required, embed the
   subset as a data URI; otherwise prefer the system stack.
4. **Fixed px dimensions.** The capture root has explicit `width`/`height` in px
   matching the format (540×540 logical for square; 540×960 for story). No `%`,
   `vh`, `dvh`, `clamp()`, or flex-grow on the root — fluid units rasterize
   unpredictably. Internal spacing in px or rem-resolved-to-px.
5. **`pixelRatio: 2`.** Pass `{ pixelRatio: 2 }` to `domToBlob` / `domToPng` so the
   540px logical layout emits at 1080px. Also pass an explicit `backgroundColor`
   fallback (the resolved `colorSecondary`) so transparency never produces a black
   PNG in some share targets.
6. **Images inline/CORS-safe.** `theme.logo` and any avatar must be same-origin (they
   are, served under `/theme/` or `/media/`) and ideally fetched → data-URI before
   capture, or rendered with `crossorigin` so foreignObject can serialize them. A
   missing logo falls back to the text `appTitle` (or the bundled mark) — never a
   broken-image box.
7. **Emoji glyphs.** Achievement icons are emoji. They rasterize via the system emoji
   font; acceptable. If deterministic cross-platform emoji is required later, swap to
   inline SVG glyphs — out of scope for v1.
8. **Off-screen mount.** The capture node may mount off-screen
   (`position: fixed; left: -99999px`) so the user never sees the raw card; only the
   resulting PNG is surfaced. It must still be fully laid out (not `display:none`).

> **New dependency note:** `modern-screenshot` is **not yet in
> `packages/web/package.json`**. Adding it is in-scope for this feature (it is the
> chosen rasterizer named in the task) but flag it explicitly in the implementation
> PR — it is the single new dependency.

---

## 5. Copy / microcopy (German, du-form, warm, no exclamation marks)

All strings are passed into `<TrophySticker>` already-resolved (the capture subtree
must not run i18n at render). These live as `de` i18n keys in the game namespace and
are interpolated by the caller.

### On the sticker
| Slot | Text (de) | Notes |
| ---- | --------- | ----- |
| Rank label (badge) | `Rang {rank}` | e.g. „Rang 1“ |
| Rank 1 honorific (optional, above name) | `Spitzenplatz` | only rank 1 |
| Rank 2 honorific (optional) | `Zweiter Platz` | |
| Rank 3 honorific (optional) | `Dritter Platz` | |
| Points unit | `Pkt.` | after the number, e.g. „12.340 Pkt.“ |
| Subject prefix | `„{subject}“` | quiz title in German quotation marks |
| Branding strip | `{appTitle}` | falls back to `Razzoozle` if `appTitle` null |
| Watermark (footer left) | `Gespielt mit Razzoozle` | warm, plain |
| Watermark wordmark (footer right) | `razzoozle` | lowercase wordmark |

### Share UI (around the sticker, NOT on the capture node — motion allowed here)
| Element | Text (de) |
| ------- | --------- |
| Primary share button | `Sticker teilen` |
| Download fallback button | `Als Bild speichern` |
| Format toggle — square | `Quadrat` |
| Format toggle — story | `Story` |
| Generating state | `Dein Sticker wird erstellt` |
| Success toast | `Sticker ist bereit zum Teilen` |
| Error toast | `Das Teilen hat nicht geklappt, du kannst das Bild stattdessen speichern` |
| Share sheet caption (prefilled text) | `Ich war auf Rang {rank} bei „{subject}“` |

Tone check: du-form throughout, warm and plain, **no exclamation marks**, no English.
„Spitzenplatz / Zweiter Platz / Dritter Platz“ stay neutral-celebratory.

---

## 6. Layout variants (3)

All three share the token map (§3) and constraints (§4); they differ only in framing.

### Variant A — "Medaillon" (recommended default, `square`)
The §2 mockup. Single large centered medal disc, name + points stacked below,
subject as a quiet caption, branding header + watermark footer. Optional achievements
row sits between subject and footer. Best all-rounder for status/feed.

```
[logo title] ............... [Rang 1]
            ( BIG MEDAL )
              Maximilian
            12.340 Pkt.
           „Hauptstädte Europas“
            ⚡ 🔥 🎯
[Gespielt mit Razzoozle] ..... [razzoozle]
```

### Variant B — "Banner" (compact, `square`)
Medal moves left, text block right (two-column body), giving a wider feel for long
names. Rank badge overlaps the medal's top-right corner instead of a separate header
slot. Good when `name` is long or `appTitle` is hidden (`showBranding === false`).

```
[logo title] ......................
 ( MEDAL )   Maximilian
   Rang 1    12.340 Pkt.
             „Hauptstädte Europas“
[Gespielt mit Razzoozle] ... [razzoozle]
```

### Variant C — "Story" (`story`, 1080×1920)
Same vertical order as A but stretched: larger medal, the achievements row expands to
a centered 3-up of `md` medallions, generous top/bottom padding, watermark pinned to
the bottom safe-area. Header logo+title centered at top. For full-screen stories.

```
       [logo]
       appTitle
       [Rang 1]

      ( HUGE MEDAL )

       Maximilian
       12.340 Pkt.
      „Hauptstädte Europas“

     ⚡   🔥   🎯

   Gespielt mit Razzoozle
        razzoozle
```

Recommendation: ship **Variant A** first; B and C are additive and optional.

---

## 7. Acceptance criteria (for implementation)

- [ ] `<TrophySticker>` renders deterministically with `DEFAULT_THEME` and with a
      fully-custom theme — both produce a non-blank PNG.
- [ ] Capture node contains **zero** `var(--…)`, oklch class, `color-mix`, or
      `motion`/`@keyframes` (grep-checkable).
- [ ] Square export is exactly `1080 × 1080` at `pixelRatio: 2`; story is
      `1080 × 1920`.
- [ ] Missing `logo` falls back to `appTitle` text → bundled mark; never a broken
      image.
- [ ] Rank → tier color matches `Podium` (1=gold, 2=silver, 3=bronze).
- [ ] All on-sticker copy is German, du-form, no exclamation marks.
- [ ] `navigator.share` with `files` is attempted; download fallback works when
      `share` is unavailable or rejected.
- [ ] Reduced-motion users are unaffected (capture is static regardless).
