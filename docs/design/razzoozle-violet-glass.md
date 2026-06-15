# Razzoozle Violet Liquid-Glass — Frontend Design Spec

**Status:** ready-to-implement
**Type:** theme VARIANT (glassmorphism) layered on the existing theming engine
**Date:** 2026-06-15
**Author:** design spec for direct coder implementation

> **One-line goal.** Add a second, opt-in visual mode — *Razzoozle Violet Liquid-Glass* — alongside the
> existing flat "Südhang" default. Südhang must render **byte-for-byte identical** to today; the glass
> look is reached only when a theme sets the new `style: "glass"`.

---

## 0. Codebase contract (exact, do not paraphrase)

These are the real integration points. Implement against them verbatim.

| Concern | File | Fact |
| --- | --- | --- |
| Theme type | `packages/common/src/types/theme.ts` | `interface ThemeBackgrounds`, `type Theme = z.infer<typeof themeValidator>`, `DEFAULT_THEME` literal. |
| Theme schema (single source of truth) | `packages/common/src/validators/theme.ts` | `themeValidator = z.object({...})`. Type is **inferred** from this — add fields **here first**, the type follows. |
| Runtime apply | `packages/web/src/features/theme/apply.ts` | `applyTheme(theme)` sets CSS custom props on `document.documentElement`; `fetchTheme()` falls back to `DEFAULT_THEME`. |
| Global CSS | `packages/web/src/index.css` | Tailwind v4 `@theme {}` block + `:root {}` token defaults. Font `--font-display: "Rubik Variable"`. |
| Existing glass reference | `packages/web/src/pages/quizz/$id/solo.tsx` | `bg-white/10 backdrop-blur-xl border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] rounded-3xl`. This is the *visual target* the token system below generalises. |

**Custom properties already emitted by `applyTheme`:** `--color-primary`, `--color-secondary`,
`--color-text`, `--color-accent`, `--answer-text`, `--answer-1..4`, `--radius-theme`, `--bg-scrim`.

**Naming note (scope rename in flight).** The npm scope is currently `@razzia` and `document.title`
falls back to `"Razzia"`. Task #1 renames `@razzia` → `@razzoozle`. This spec uses **`@razzia` import
paths as they exist today**; after the rename they become `@razzoozle/...` mechanically. The default
`appTitle` fallback in `apply.ts` should change `"Razzia"` → `"Razzoozle"` as part of the rebrand
(line 21 of `apply.ts`).

**Hard invariant.** Flat is the default. A theme with no `style` field, or `style: "flat"`, must produce
exactly the current Südhang rendering. Every glass rule below is scoped under
`[data-theme-style="glass"]` and can only ever *add*, never alter the flat baseline.

---

## 1. Palette — Razzoozle Violet

A deeper, cooler, more saturated violet than Südhang's `#7c3aed / #2e1065`, pushed toward indigo-magenta
so the two themes read as clearly distinct presets in the picker. Designed so white UI text and frosted
surfaces sit on a dark violet base.

### 1.1 Theme fields

| Theme field | Value | Role |
| --- | --- | --- |
| `colorPrimary` | `#8B5CF6` | Primary violet — buttons, accents, slider thumb, focus ring. Slightly lighter/cleaner than Südhang `#7c3aed` so it pops on the dark glass base. |
| `colorSecondary` | `#1E0B3B` | Deep indigo-violet — page base / gradient floor. Darker + cooler than Südhang `#2e1065`. |
| `colorText` | `#F5F3FF` | Near-white violet-tinted text (not pure `#fff`) — softer on the eye over frost, still high-contrast. |
| `accentColor` | `#22D3EE` | **Cyan** accent — the deliberate complementary pop against violet (timers, streak fire, highlights). Replaces Südhang's orange `#ff9900`; cyan is the canonical "liquid-glass" highlight and is unmistakably not Südhang. |
| `answerTextColor` | `#0B0B12` | Near-black text on the answer tiles (see 1.3 — answers are light, saturated fills, so dark text wins on contrast). |
| `radius` | `20` | See §4. |
| `scrim` | `48` | Slightly heavier than Südhang's 40 so the violet AI imagery sits darker behind white text. |

> `colorText: #F5F3FF` on `colorSecondary: #1E0B3B` → WCAG contrast ≈ **15.8:1** (APCA Lc ≈ +106).
> Far above the AAA 7:1 / APCA |60| floor for body text. Headings safe at any weight.

### 1.2 Derived glass-base gradient

The page background floor (behind any AI image, and the solid fallback when no image is set) is a
two-stop violet gradient built from the theme tokens — no new field required:

```css
/* applied to the <Background> base layer under data-theme-style="glass" */
background:
  radial-gradient(120% 120% at 50% 0%,
    color-mix(in oklab, var(--color-primary) 22%, var(--color-secondary)) 0%,
    var(--color-secondary) 55%,
    #0A0418 100%);
```

This guarantees a dark-enough violet field even before imagery loads, so white text never lands on a
light surface during the image fetch.

### 1.3 Answer colours — colorblind-safe, mutually distinct

Kahoot's four answer tiles must stay distinguishable for deuteranopia/protanopia/tritanopia **and**
must not collapse into the violet palette. We keep the **Okabe-Ito** accessible set already used by the
flat default (proven, validated), but re-order so the four hues maximise mutual separation against a
violet backdrop and over frost.

| Slot | Hex | Okabe-Ito name | On-tile text |
| --- | --- | --- | --- |
| `answer-1` | `#E69F00` | Orange | `answerTextColor` `#0B0B12` |
| `answer-2` | `#56B4E9` | Sky blue | `#0B0B12` |
| `answer-3` | `#009E73` | Bluish green | `#0B0B12` |
| `answer-4` | `#CC79A7` | Reddish purple | `#0B0B12` |

```jsonc
"answerColors": ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"]
```

**Why dark text (`#0B0B12`) not white:** these four fills are mid-to-light saturated. Contrast of
`#0B0B12` on each:

| Tile | Contrast vs `#0B0B12` | APCA Lc | Verdict |
| --- | --- | --- | --- |
| `#E69F00` orange | ≈ 9.6:1 | ≈ +88 | AAA |
| `#56B4E9` sky | ≈ 9.1:1 | ≈ +85 | AAA |
| `#009E73` green | ≈ 6.0:1 | ≈ +72 | AA (large/bold OK; answer labels are bold ≥18px) |
| `#CC79A7` purple | ≈ 6.9:1 | ≈ +75 | AA+ |

White text on these tiles would fail (`#fff` on `#56B4E9` ≈ 1.9:1). **Dark answer text is mandatory for
this palette.** The shapes/icons on each tile (triangle/diamond/circle/square in `AnswerButton.tsx`)
remain the non-colour redundancy channel — keep them; never rely on hue alone.

> **Distinctness from theme:** none of the four answer hues is a violet/cyan, so an answer tile can never
> be confused with primary/accent chrome.

### 1.4 Full preset JSON (drop into `config/theme-templates/razzoozle-violet-glass.json`)

```jsonc
{
  "id": "razzoozle-violet-glass",
  "name": "Razzoozle — Violet Liquid-Glass",
  "theme": {
    "style": "glass",
    "colorPrimary": "#8B5CF6",
    "colorSecondary": "#1E0B3B",
    "colorText": "#F5F3FF",
    "answerColors": ["#E69F00", "#56B4E9", "#009E73", "#CC79A7"],
    "answerTextColor": "#0B0B12",
    "accentColor": "#22D3EE",
    "radius": 20,
    "scrim": 48,
    "appTitle": "Razzoozle",
    "logo": "/theme/razzoozle-logo.svg",
    "showBranding": true,
    "backgrounds": {
      "auth": "/media/backgrounds/razzoozle-auth.webp",
      "managerGame": "/media/backgrounds/razzoozle-projector.webp",
      "playerGame": "/media/backgrounds/razzoozle-phone.webp"
    }
  }
}
```

Also ship a **flat Südhang** preset unchanged (`style: "flat"`, current `DEFAULT_THEME` values) so the
picker offers both side by side.

---

## 2. Glass surface system

### 2.1 Schema + type change (the only new field)

Add `style` to `themeValidator` in `packages/common/src/validators/theme.ts`. The `Theme` type and
`DEFAULT_THEME` follow automatically (type is inferred; only `DEFAULT_THEME` literal needs the field).

```ts
// packages/common/src/validators/theme.ts — inside z.object({ ... })
style: z.enum(["flat", "glass"]).default("flat"),
```

```ts
// packages/common/src/types/theme.ts — DEFAULT_THEME literal, add as FIRST field
style: "flat",
```

`.default("flat")` means every existing on-disk theme (no `style` key) parses to flat → **Südhang is
untouched**, including any saved revisions/templates already on disk.

### 2.2 `applyTheme` change

Set a data attribute on `<html>` so CSS can branch with zero new JS in components. Add to
`packages/web/src/features/theme/apply.ts` (after the existing `setProperty` calls):

```ts
// data-theme-style drives all glass CSS in index.css. "flat" is the default and
// is a no-op (no glass rules match), so the Südhang look is preserved exactly.
document.documentElement.dataset.themeStyle = t.style ?? "flat"
```

Because `t = { ...DEFAULT_THEME, ...theme }`, `t.style` is always defined; the `?? "flat"` is belt-and-
braces. No component reads `style` directly — everything keys off `[data-theme-style="glass"]` in CSS.

### 2.3 Glass tokens (add to `packages/web/src/index.css`)

Define the frost system as custom properties **scoped to glass mode**, then build elevation levels and
utility classes from them. All values are tuned for the violet base.

```css
/* ==========================================================================
   Razzoozle Violet Liquid-Glass — scoped surface system.
   Everything here is gated on [data-theme-style="glass"]; flat themes never
   match these rules, so the Südhang baseline is unchanged.
   ========================================================================== */
[data-theme-style="glass"] {
  /* Frost fills — violet-tinted white so glass reads "violet glass", not grey. */
  --glass-fill-1: rgba(245, 243, 255, 0.06);   /* low elevation  */
  --glass-fill-2: rgba(245, 243, 255, 0.10);   /* mid elevation  */
  --glass-fill-3: rgba(245, 243, 255, 0.16);   /* high elevation */

  /* Blur + saturation. Saturate >1 makes the violet behind the glass bloom. */
  --glass-blur-1: 12px;
  --glass-blur-2: 18px;
  --glass-blur-3: 26px;
  --glass-saturate: 1.6;

  /* Hairline borders + the top inner highlight that sells the "liquid" edge. */
  --glass-border: 1px solid rgba(245, 243, 255, 0.22);
  --glass-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.35);

  /* Layered drop shadows per elevation (ambient + key). */
  --glass-shadow-1: 0 2px 10px -2px rgba(10, 4, 24, 0.45);
  --glass-shadow-2: 0 8px 32px -4px rgba(10, 4, 24, 0.55),
                    0 2px 8px -2px rgba(10, 4, 24, 0.40);
  --glass-shadow-3: 0 16px 48px -8px rgba(10, 4, 24, 0.62),
                    0 4px 12px -2px rgba(10, 4, 24, 0.45);

  /* Accent-tinted ring for interactive glass (cyan accent). */
  --glass-ring: 0 0 0 3px color-mix(in srgb, var(--color-accent) 45%, transparent);
}
```

### 2.4 Glass utility classes (the surfaces components opt into)

Components add a class — they do **not** inline blur. This keeps fallbacks centralised.

```css
/* Base frosted panel — three elevation variants. radius tracks the theme. */
[data-theme-style="glass"] .glass,
[data-theme-style="glass"] .glass-1 {
  background: var(--glass-fill-1);
  backdrop-filter: blur(var(--glass-blur-1)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-1)) saturate(var(--glass-saturate));
  border: var(--glass-border);
  border-radius: var(--radius-theme);
  box-shadow: var(--glass-highlight), var(--glass-shadow-1);
}
[data-theme-style="glass"] .glass-2 {
  background: var(--glass-fill-2);
  backdrop-filter: blur(var(--glass-blur-2)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-2)) saturate(var(--glass-saturate));
  border: var(--glass-border);
  border-radius: var(--radius-theme);
  box-shadow: var(--glass-highlight), var(--glass-shadow-2);
}
[data-theme-style="glass"] .glass-3 {
  background: var(--glass-fill-3);
  backdrop-filter: blur(var(--glass-blur-3)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur-3)) saturate(var(--glass-saturate));
  border: var(--glass-border);
  border-radius: var(--radius-theme);
  box-shadow: var(--glass-highlight), var(--glass-shadow-3);
}

/* Interactive glass (buttons, answer tiles, leaderboard rows). */
[data-theme-style="glass"] .glass-interactive {
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
              box-shadow 160ms ease,
              background-color 160ms ease;
}
[data-theme-style="glass"] .glass-interactive:hover {
  background: var(--glass-fill-3);
  box-shadow: var(--glass-highlight), var(--glass-shadow-3);
  transform: translateY(-2px);
}
[data-theme-style="glass"] .glass-interactive:active {
  transform: translateY(0) scale(0.985);
  box-shadow: var(--glass-highlight), var(--glass-shadow-1);
}
[data-theme-style="glass"] .glass-interactive:focus-visible {
  outline: none;
  box-shadow: var(--glass-highlight), var(--glass-shadow-2), var(--glass-ring);
}
```

### 2.5 Fallbacks (mandatory)

```css
/* 1. No backdrop-filter support (old Firefox/WebView): solid translucent panel,
      darker so white text still passes contrast without the blur compositing. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  [data-theme-style="glass"] .glass,
  [data-theme-style="glass"] .glass-1 { background: rgba(30, 11, 59, 0.82); }
  [data-theme-style="glass"] .glass-2 { background: rgba(30, 11, 59, 0.88); }
  [data-theme-style="glass"] .glass-3 { background: rgba(30, 11, 59, 0.92); }
}

/* 2. User asked the OS to reduce transparency (Windows/macOS a11y setting):
      drop the blur entirely, use a near-opaque violet so legibility is maximal. */
@media (prefers-reduced-transparency: reduce) {
  [data-theme-style="glass"] .glass,
  [data-theme-style="glass"] .glass-1,
  [data-theme-style="glass"] .glass-2,
  [data-theme-style="glass"] .glass-3 {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: rgba(30, 11, 59, 0.92);
  }
}

/* 3. Reduced motion: the global rule in index.css already neutralises
      transitions/animations app-wide. The glass-interactive transform hovers
      are covered by it; no extra rule needed. (Confetti is JS-gated separately.) */
```

> **Why not blur on huge surfaces:** `backdrop-filter` is GPU-expensive at full-viewport size and on the
> Raspberry-Pi `/display` kiosk. Never apply `.glass` to the full-page `<Background>` — only to the
> bounded cards/rows enumerated in §3. The display kiosk already sets `contain: layout paint`.

---

## 3. Component coverage

Glass is for **bounded, elevated containers floating over imagery**. Dense text and data tables stay
solid. Rule of thumb: *one frosted layer between the eye and the background — never frost-on-frost on
frost.*

### 3.1 Gets glass

| Surface | Component | Class | Notes |
| --- | --- | --- | --- |
| Lobby / room card | `features/game/components/states/Room.tsx` | `glass-2` | The central join/lobby panel. PIN + player grid sit inside it (no nested glass on the grid). |
| Player join card | `features/game/components/join/Room.tsx`, `Username.tsx` | `glass-2` | Mirrors the proven `solo.tsx` join card; migrate its inline `bg-white/10 backdrop-blur-xl…` to `.glass-2`. |
| Avatar picker | `features/game/components/join/AvatarPicker.tsx` | `glass-2` (container only) | Avatar swatches stay solid for tap clarity. |
| Question prompt card | `features/game/components/states/Question.tsx` | `glass-3` | Highest elevation — the focal element. Question text uses `--color-text`; see §3.3 safeguard. |
| Answer buttons | `features/game/components/AnswerButton.tsx` | `glass-interactive` **+ solid fill** | **Tiles keep their solid `--answer-N` fill** (NOT frosted) so answer colours stay saturated + colorblind-safe; glass treatment is limited to the border highlight + hover/active/focus motion + radius. |
| Result screen | `features/game/components/states/Result.tsx` | `glass-3` | Correct/incorrect verdict card. Achievement medals (`AchievementMedal.tsx`) render on top, solid. |
| Leaderboard rows | `features/game/components/states/Leaderboard.tsx`, `SoloLeaderboard.tsx`, `TeamLeaderboard.tsx` | `glass-1` per row, `glass-2` wrapper | Rows are low-elevation frost; the wrapper one step up. Rank number + name use `--color-text`. |
| Podium | `features/game/components/states/Podium.tsx` | `glass-2` per plinth | Frosted plinths; medal/crown on top solid. |
| Manager console cards | `features/manager/.../console/*` (`SectionCard`, `ListRow`, `BadgeRow`, `ActionFooter`) | `glass-2` cards, `glass-1` rows | The console shell background stays the solid themed panel (see `tokens.css`). Frost only the cards so form labels/inputs stay crisp. |
| Toaster | `components/Toaster.tsx` | `glass-2` | Transient, small — cheap to blur. |
| Dialogs / popovers | `components/AlertDialog.tsx` | `glass-3` + scrim | Modal surface frosted; the backdrop is the existing dim scrim. |

### 3.2 Stays solid (never glass)

| Surface | Why |
| --- | --- |
| Full-page `<Background>` (`components/Background.tsx`) | Perf + it *is* the imagery layer; frosting it is meaningless and expensive. |
| Form inputs / textareas (`components/Input.tsx`, `ui/ColorPickerField.tsx`) | Editing fields need an opaque, calm surface — use solid `rgba(245,243,255,0.10)` fill with a crisp border, no blur. |
| Answer **fill** colours | Must stay saturated for colorblind safety (see §3.1 AnswerButton note). |
| Achievement medals, podium medals, QR code (`QRCode.tsx`) | Need maximum legibility/scannability; a blurred QR can fail to scan. |
| `/display` kiosk full-stage chrome | GPU budget on Raspberry Pi; only the inner question/answer cards may frost. |
| Tables / dense catalog & submission lists | Many small rows → frost-on-frost mush; keep solid themed rows. |
| Markdown body text blocks (`components/Markdown.tsx`) | Long-form reading needs an opaque calm panel. |

### 3.3 Text-contrast safeguards over glass + violet imagery

Glass reduces contrast because background luminance leaks through. Three required guards:

1. **Scrim floor.** The `<Background>` already paints a black layer at `opacity: var(--bg-scrim)`
   (=`0.48` for this preset). This is the primary guarantee that imagery is dark behind white text.
   Do **not** lower scrim below 40 for glass themes.
2. **Text shadow on glass headings.** Any heading/important text rendered *directly on a glass surface*
   (question prompt, result verdict) gets a subtle legibility shadow:
   ```css
   [data-theme-style="glass"] .glass-3 :is(h1,h2,.prompt-text) {
     text-shadow: 0 1px 8px rgba(10, 4, 24, 0.55);
   }
   ```
3. **Minimum fill on focal cards.** The question card uses `glass-3` (16% fill), not `glass-1`, so even
   over a bright patch of imagery the white text retains ≥ APCA Lc 75. If QA finds a bright AI image
   defeating this, raise that image's darkness in the brief (§5), not the fill.

---

## 4. Typography / radius / motion

### 4.1 Typography — keep Rubik

- Font stays `--font-display: "Rubik Variable", sans-serif` (`@fontsource-variable/rubik`). No new font.
- Glass surfaces favour Rubik's heavier weights for legibility over frost:
  - Question prompt: **700**, tracking `-0.01em`.
  - Answer tile labels: **700** (already), keep.
  - Body / meta on glass: **500** minimum (avoid 400 over frost).
- `colorText: #F5F3FF` (not `#fff`) reduces halation/glow on the violet base.

### 4.2 Radius

- `radius: 20` (theme field) → `--radius-theme: 20px`. Larger than Südhang's 16 to read as soft, modern,
  "liquid". Within the validator's `max(40)`. Pills/avatars keep their own `9999px` (unchanged).
- All glass utilities pull `border-radius: var(--radius-theme)` so a manager changing the slider re-rounds
  every frosted surface consistently.

### 4.3 Motion — subtle, tasteful, GPU-only

- Reuse the existing `framer-motion` spring already proven in `solo.tsx`:
  `{ type: "spring", stiffness: 300, damping: 30 }` for card mount (opacity + y:24→0).
- Glass interactive hover/active: the CSS transitions in §2.4 (`transform` + `box-shadow` only — no
  layout props, GPU-friendly). Hover lift = `translateY(-2px)`; press = `scale(0.985)`.
- **No** continuous/looping glass animations (no shimmer/sheen loops) — they fight readability and burn
  battery on phones / GPU on the kiosk.
- `prefers-reduced-motion`: fully covered by the global rule in `index.css` (springs collapse to fades,
  transitions neutralised). Confetti remains JS-gated per existing components.
- Leaderboard reordering keeps its existing `framer-motion` layout animation; over glass it reads as
  rows "sliding under frost" — desirable, no change needed.

---

## 5. AI imagery brief

All backgrounds: **violet liquid-glass, abstract, dark, non-distracting behind text.** No literal
objects, no faces, no text, no logos in the image. Must be dark enough that the `0.48` black scrim + white
UI is always legible — i.e. **mid-tones dark, highlights confined to small areas**. Output **WebP**
(project convention) placed under `/media/backgrounds/` (auth/projector/manager) and `/theme/` (og).

Pipeline: route through `@image-prompt-enhancer` → `@image-zturbo` (ComfyUI Z-Image-Turbo). Never call
ComfyUI directly.

### 5.1 Auth background — 16:9 (`razzoozle-auth.webp`)

> Abstract liquid-glass background, deep violet and indigo, dark moody base #1E0B3B, fluid translucent
> frosted-glass ribbons and soft refracted light bending through, subtle cyan #22D3EE rim-light accents,
> smooth bokeh depth, gaussian soft focus, cinematic, very dark in the centre and lower third so white
> text stays readable, elegant, premium, no text, no logos, no objects, 16:9, high detail edges only,
> dark negative space dominant.

### 5.2 Player phone background — 9:16 (`razzoozle-phone.webp`)

> Vertical abstract violet liquid-glass wallpaper for a phone, deep indigo-violet #1E0B3B to near-black
> #0A0418 gradient, flowing translucent glass droplets and frosted waves, faint cyan #22D3EE highlights
> at the edges, very dark and calm in the central vertical band where a card and buttons sit, soft
> defocused, premium minimal, no text no objects, 9:16 portrait, dark dominant.

### 5.3 Manager / projector background — 16:9 (`razzoozle-projector.webp`)

> Wide abstract violet liquid-glass stage backdrop for a projector / big screen, ultra-dark violet base
> #160828, large smooth frosted-glass curved planes catching cool cyan #22D3EE light, generous dark
> empty space across the full frame for overlaid white question text and answer tiles, low contrast,
> non-distracting, even darkness, no hotspots, cinematic premium, no text no logos, 16:9, optimised to
> not wash out under projector brightness.

### 5.4 OG / share image — 1200×630 (`razzoozle-og.webp` → also export PNG for crawlers)

> Branded share card background, deep violet liquid-glass, centered dark calm region for an overlaid
> "Razzoozle" wordmark, frosted glass facets with cyan #22D3EE edge glow radiating from center, premium,
> dark, 1200x630, room for centered logo, no existing text in image.

After generation: composite the SVG wordmark (§6) centered onto the og image to produce the final
`og-image.png`.

---

## 6. Logo / icon brief

A clean **vector** wordmark + monogram, violet, that reads on the dark glass base. Deliver as
hand-authored SVG (not AI raster). Files: `/theme/razzoozle-logo.svg` (wordmark), `/theme/razzoozle-mark.svg`
(monogram), plus `favicon.svg` / `apple-touch-icon.png` from the monogram.

### 6.1 Wordmark — "Razzoozle"

- Lettering: Rubik-family feel (geometric, rounded, friendly) — set in Rubik Bold/Black and convert to
  paths so it's font-independent, or trace a custom geometric face. Lowercase or title-case "Razzoozle".
- Treatment: the double-`zz` and double-`oo` are the brand's signature — give the `zz` a subtle lightning
  / fast-quiz energy (angled crossbars) without going gimmicky.
- Fill: violet gradient `#8B5CF6 → #6D28D9` (top-left to bottom-right), with a thin cyan `#22D3EE`
  bottom edge-highlight on each glyph to echo the liquid-glass rim-light. One-colour fallback:
  flat `#8B5CF6` for tiny sizes and monochrome contexts.
- Must remain legible reversed (white `#F5F3FF`) on light surfaces too — ship a `currentColor` variant.

### 6.2 Monogram — "R"

- A single rounded `R` inside a `radius: 20`-style superellipse / squircle tile.
- Tile fill: frosted-violet — `rgba(139,92,246,0.18)` over a `#1E0B3B` plate, 1px `rgba(245,243,255,0.35)`
  top-inner highlight stroke (the glass edge), to mirror `--glass-highlight`.
- The `R` itself: solid `#F5F3FF` with a cyan `#22D3EE` 1px under-stroke.
- Sizes: must read at 16px (favicon) — keep the `R` heavy, the squircle simple, no fine detail.

### 6.3 SVG authoring notes

- `viewBox` based, no fixed px width/height on the root (responsive).
- Gradients via `<linearGradient>`; do not bake blur into the SVG (it costs paint) — the glass *feel* is
  the gradient + highlight stroke, not a real backdrop blur.
- Provide `role="img"` + `<title>Razzoozle</title>` for a11y when inlined.
- Keep total path count low; target < 6 KB for the wordmark.

---

## 7. Implementation checklist (for the coder)

1. **Schema:** add `style: z.enum(["flat","glass"]).default("flat")` to `themeValidator`
   (`packages/common/src/validators/theme.ts`). Add `style: "flat"` to `DEFAULT_THEME`
   (`packages/common/src/types/theme.ts`).
2. **Apply:** in `apply.ts`, set `document.documentElement.dataset.themeStyle = t.style ?? "flat"`;
   change the title fallback `"Razzia"` → `"Razzoozle"`.
3. **CSS:** append the §2.3–2.5 glass blocks + §3.3 text-shadow rule to `index.css`. Update the four
   `:root` `--answer-*` defaults only if you also change `DEFAULT_THEME` (keep them in sync; flat default
   stays Okabe-Ito).
4. **Components:** add `.glass-*` / `.glass-interactive` classes to the surfaces in §3.1; migrate
   `solo.tsx`'s inline frost to `.glass-2`/`.glass-3` so there's one source of truth.
5. **Presets:** ship `config/theme-templates/razzoozle-violet-glass.json` (§1.4) and a flat Südhang
   preset; surface both in the design-tab picker. Expose a `style` toggle (Flat / Glass) in the design tab.
6. **Assets:** generate the four images (§5) via the image pipeline; author the SVGs (§6); drop into
   `/media/backgrounds/` and `/theme/`.
7. **Verify:** flat Südhang renders pixel-identical to `main` (diff a screenshot); glass preset legible
   over each background; test `@supports not (backdrop-filter)`, `prefers-reduced-transparency`,
   `prefers-reduced-motion`; QR still scans; answer tiles pass the §1.3 contrast table; kiosk `/display`
   stays smooth.

---

## 8. Acceptance criteria

- [ ] A theme with no `style` field still parses and renders **exactly** as today (Südhang unchanged).
- [ ] `style: "glass"` sets `data-theme-style="glass"` on `<html>`; flat sets `"flat"`.
- [ ] Frosted surfaces show blur + saturate + 1px border + top highlight + layered shadow at 3 elevations.
- [ ] Hover lifts, active presses, focus shows the cyan ring — all GPU-only (transform/opacity/shadow).
- [ ] All three fallbacks (`@supports`, reduced-transparency, reduced-motion) verified to degrade safely.
- [ ] Answer tiles keep saturated Okabe-Ito fills with dark `#0B0B12` text; all four ≥ AA, shapes kept.
- [ ] White/`#F5F3FF` UI text legible over all four AI backgrounds with scrim `0.48`.
- [ ] Razzoozle wordmark + monogram SVGs render crisp at 16px → projector size.
```
