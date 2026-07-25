# Design Specification: Game UI Slider Input Control

Status: Approved Design Specification
Parent Issue: [#320](https://git.joelduss.xyz/agent-claude/Razzoozle/issues/320)
Child WP: `wp-d4213d11d0dd` (Issue #436)
Primary File: `docs/design/gameui-slider-control.md`

---

## 1. Overview & Objectives

This document specifies the semantic HTML, visual styling, token mapping, interaction behavior, responsive viewports, and accessibility contract for the Slider Question answer component (`SliderInput.tsx`).

The slider allows players to select a numerical answer within a min/max range (e.g. 0 to 100, or custom bounds) with optional step precision and unit label (e.g. `kg`, `%`, `m`, `€`).

---

## 2. Semantic HTML & Component Structure

The component is built using a native HTML `<input type="range">` element to ensure native touch and keyboard accessibility.

```html
<div className="mx-auto mb-4 flex w-full max-w-7xl flex-col items-center gap-6 px-4 lg:max-w-[85vw]">
  <!-- Selected Value & Unit Display -->
  <div 
    data-testid="slider-value-display" 
    aria-live="polite" 
    className="text-center font-bold text-ink text-3xl sm:text-4xl md:text-5xl"
  >
    <span>50</span> <span className="text-xl font-normal text-ink/70">kg</span>
  </div>

  <!-- Native Slider Control Container -->
  <div className="relative w-full max-w-2xl py-4">
    <input
      type="range"
      data-testid="slider-input"
      min={0}
      max={100}
      step={1}
      value={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext="50 kg"
      disabled={disabled}
      className="w-full h-3 cursor-pointer appearance-none rounded-lg bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
    />
    
    <!-- Min / Mid / Max Ticks & Labels -->
    <div className="mt-2 flex w-full justify-between text-xs font-semibold text-ink/60 sm:text-sm">
      <span>0</span>
      <span>50</span>
      <span>100</span>
    </div>
  </div>

  <!-- Submit Button -->
  <button
    type="button"
    data-testid="slider-submit-btn"
    disabled={disabled}
    className="bg-brand-primary text-white rounded-[var(--radius-theme)] px-8 py-3 text-xl font-bold disabled:opacity-50 hover:scale-[1.02] active:scale-[0.97] transition-transform"
  >
    Antwort absenden
  </button>
</div>
```

---

## 3. Clamping & Calculation Math

- **Value Clamping**:
  $$\text{clampedValue} = \max(\text{min}, \min(\text{max}, \text{rawInput}))$$
- **Step Precision**:
  $$\text{steppedValue} = \text{min} + \text{round}\left(\frac{\text{clampedValue} - \text{min}}{\text{step}}\right) \times \text{step}$$
- **Midpoint Calculation**:
  $$\text{midpoint} = \text{min} + \frac{\text{max} - \text{min}}{2}$$

---

## 4. CSS & Design Token Mapping

All colors and geometry MUST map to standard Tailwind v4 theme utility classes:

| Visual Element | Mapped Utility Class / CSS Token | Specification |
| --- | --- | --- |
| **Track Background** | `bg-surface-2` | Hairline border, neutral background. |
| **Track Active Highlight** | `bg-brand-primary` | Primary theme accent color. |
| **Thumb (WebKit/Gecko)** | `[&::-webkit-slider-thumb]` / `[&::-moz-range-thumb]` | Min 32×32px, circular, `bg-white border-2 border-brand-primary shadow-md`. |
| **Value Display Text** | `text-ink` / `text-ink/70` | Primary ink color for number, 70% opacity for unit label. |
| **Focus Indicator** | `focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]` | 2px offset focus ring. |
| **Interaction Target** | Height min 44px on container | 44px minimum touch target for mobile viewports. |

---

## 5. Responsive Viewport Specifications

| Viewport | Bounds (Logical PX) | Adaptation Rules |
| --- | --- | --- |
| **iPhone 8** | 375 × 667 | Value display 2rem, 32px thumb, full width track. |
| **iPhone 13** | 390 × 844 | Value display 2.5rem, 32px thumb. |
| **iPhone 17 Pro Max** | 440 × 956 | Value display 3rem, 36px thumb. |
| **Kiosk Display / Desktop** | 1920 × 1080+ | Max width 42rem, value display 4rem. |

---

## 6. Locale Inventory

Localized submit button text across all 6 supported locales (`quizz:slider.submitButton`):

| Locale (`lang`) | Text |
| --- | --- |
| `de` (German) | `Antwort absenden` |
| `en` (English) | `Submit Answer` |
| `es` (Spanish) | `Enviar respuesta` |
| `fr` (French) | `Soumettre la réponse` |
| `it` (Italian) | `Invia risposta` |
| `zh` (Chinese) | `提交答案` |

---

## 7. Forbidden Patterns

- ❌ Hardcoded hex colors (`#7c3aed`, `#22c55e`, etc.).
- ❌ Custom `<div>`-only non-accessible drag handles without a underlying `<input type="range">`.
- ❌ Thumb targets smaller than 32px.
- ❌ Touch targets smaller than 44px.
